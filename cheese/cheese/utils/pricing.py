# Copyright (c) 2024
# License: MIT

import frappe


def _localize_price_result(result, experience, log_context=None):
	"""Convert a computed price into the establishment currency (snapshot).

	log_context, when given ({"trigger", "reference_doctype", "reference_name"}),
	records the conversion in the audit log — pass it only from real booking
	commits, never from price previews.
	"""
	from frappe.utils import flt

	from cheese.cheese.utils.currency_rates import convert_amount, get_company_currency, log_conversion

	company_currency = get_company_currency(experience.company)
	source_currency = (getattr(experience, "currency", None) or company_currency or "UYU").upper()
	result["currency"] = company_currency
	result["source_currency"] = source_currency
	if result.get("total_price") and source_currency != company_currency:
		snap = convert_amount(result["total_price"], source_currency, company_currency)
		result["total_price_original"] = flt(result["total_price"])
		result["total_price"] = snap["converted_amount"]
		result["exchange_rate"] = snap["exchange_rate"]
		result["rate_date"] = snap["rate_date"]
		if log_context:
			log_conversion(
				snap,
				trigger=log_context["trigger"],
				reference_doctype=log_context.get("reference_doctype"),
				reference_name=log_context.get("reference_name"),
				company=experience.company,
			)
	return result


def _fixed_amount_in_company_currency(value, experience, log_context=None):
	"""Fixed deposit amounts are expressed in the experience currency."""
	from cheese.cheese.utils.currency_rates import convert_amount, get_company_currency, log_conversion

	company_currency = get_company_currency(experience.company)
	source_currency = (getattr(experience, "currency", None) or company_currency or "UYU").upper()
	if not value or source_currency == company_currency:
		return value
	snap = convert_amount(value, source_currency, company_currency)
	if log_context:
		log_conversion(
			snap,
			trigger=log_context["trigger"],
			reference_doctype=log_context.get("reference_doctype"),
			reference_name=log_context.get("reference_name"),
			company=experience.company,
		)
	return snap["converted_amount"]


def calculate_ticket_price(experience_id, party_size, route_id=None, ticket=None, selected_date=None, guest_ages=None, log_context=None):
	"""
	Calculate price for a ticket.

	- Individual ticket (no route): per-person price * party_size
	- Route ticket: per-person route price * party_size
	- HOTEL: price_per_night * nights * rooms (route_price per night in routes)

	Per-person prices come from the experience price matrix (weekday/weekend
	x age group, entry date decides the day type) with fallback to the base
	prices; an active season percent adjusts them, and an active matching
	promotion discounts the total automatically.
	"""
	from frappe.utils import flt

	from frappe.utils import cint

	from cheese.cheese.utils.seasonal_pricing import (
		apply_promotion,
		compute_party_prices,
		find_matching_promotion,
		get_active_custom_price,
		get_active_season,
	)

	experience = frappe.get_doc("Cheese Experience", experience_id)

	if ticket is not None:
		selected_date = selected_date or ticket.get("selected_date") or ticket.get("check_in_date")
		guest_ages = guest_ages or ticket.get("guest_ages")

	def _convert_extras(result):
		rate = result.get("exchange_rate")
		if rate:
			for key in ("promotion_discount", "price_before_discount", "price_before_season"):
				if result.get(key):
					result[key] = flt(result[key] * rate, 2)
		return result

	if experience.experience_type == "HOTEL":
		from cheese.cheese.utils.seasonal_pricing import compute_night_prices

		nights = cint(ticket.nights) if ticket and ticket.get("nights") else 1
		rooms = party_size  # For HOTEL, party_size passed is actually rooms_requested
		# Each night is priced by its own date (day matrix / custom price /
		# season per night), then summed — never flat rate x nights.
		night = compute_night_prices(
			experience, selected_date, nights, in_route=bool(route_id)
		)
		night_prices = night["night_prices"]
		nightly_sum = flt(sum(night_prices), 2)
		distinct_rates = {flt(r) for r in night_prices}
		result = {
			"total_price": flt(nightly_sum * rooms, 2),
			# Uniform stays keep the single nightly rate; mixed stays carry the
			# average (the true detail lives in night_breakdown).
			"price_per_night": (
				night_prices[0]
				if len(distinct_rates) == 1 and night_prices
				else (flt(nightly_sum / nights, 2) if nights else 0)
			),
			"night_breakdown": night["breakdown"],
			"nights": nights,
			"rooms": rooms,
			"individual_price": experience.get("price_per_night"),
			"route_price": experience.route_price,
			"custom_price": night["custom_price"],
		}
		if night["season"]:
			base_total = flt(
				sum(e.get("base_rate", e["rate"]) for e in night["breakdown"]) * rooms, 2
			)
			if base_total != result["total_price"]:
				result["price_before_season"] = base_total
			result["season"] = night["season"]
		result = _convert_extras(_localize_price_result(result, experience, log_context=log_context))
		rate = result.get("exchange_rate")
		if rate:
			result["price_per_night"] = flt(result["price_per_night"] * rate, 2)
			for entry in result.get("night_breakdown") or []:
				entry["rate"] = flt(entry["rate"] * rate, 2)
				entry["base_rate"] = flt(entry["base_rate"] * rate, 2)
		return result

	party = compute_party_prices(
		experience,
		party_size,
		selected_date=selected_date,
		guest_ages=guest_ages,
		in_route=bool(route_id),
	)
	subtotal = flt(sum(party["unit_prices"]), 2)
	result = {
		"total_price": subtotal,
		"individual_price": experience.individual_price,
		"route_price": experience.route_price if route_id else None,
		"day_type": party["day_type"],
		"season": party["season"],
		"custom_price": party.get("custom_price"),
		# Per-person detail in the experience currency (before conversion)
		"price_breakdown": party["breakdown"],
	}

	# Layer 4 can opt out of promotions (participates_in_promotions=0).
	promo = None
	if party.get("allow_promotions", True):
		promo = find_matching_promotion(
			experience.company, experience_id, selected_date, guest_ages, party_size,
			unit_prices=party["unit_prices"],
		)
	if promo:
		discount = apply_promotion(promo, party["unit_prices"])
		if discount > 0:
			result["price_before_discount"] = subtotal
			result["promotion"] = promo.name
			result["promotion_name"] = promo.promo_name
			result["promotion_discount"] = discount
			result["total_price"] = flt(max(0, subtotal - discount), 2)

	return _convert_extras(_localize_price_result(result, experience, log_context=log_context))


def calculate_deposit_amount(experience_id, total_price, route_id=None, log_context=None):
	"""
	Calculate deposit amount
	
	Args:
		experience_id: ID of the experience
		total_price: Total ticket price
		route_id: Optional route ID
		
	Returns:
		Deposit amount
	"""
	# Check route deposit first
	if route_id:
		route = frappe.get_doc("Cheese Route", route_id)
		if route.deposit_required:
			if route.deposit_type == "Amount":
				return _fixed_amount_in_company_currency(
					route.deposit_value, frappe.get_doc("Cheese Experience", experience_id), log_context=log_context
				)
			elif route.deposit_type == "%":
				return (total_price * route.deposit_value) / 100
	
	# Check experience deposit
	experience = frappe.get_doc("Cheese Experience", experience_id)
	if experience.deposit_required:
		if experience.deposit_type == "Amount":
			return _fixed_amount_in_company_currency(experience.deposit_value, experience, log_context=log_context)
		elif experience.deposit_type == "%":
			return (total_price * experience.deposit_value) / 100
	
	return 0


def get_deposit_basis(experience_id, route_id=None):
	"""Basis of the deposit that ``calculate_deposit_amount`` applies, so callers
	can render a truthful label instead of guessing a percentage.

	Mirrors the precedence in ``calculate_deposit_amount``: an active route
	deposit wins over the experience deposit. Returns ``{"type", "value"}`` with
	type in {"%", "Amount", None}; type None means no deposit is configured.
	"""
	if route_id:
		route = frappe.get_doc("Cheese Route", route_id)
		if route.deposit_required:
			return {"type": route.deposit_type, "value": route.deposit_value}
	experience = frappe.get_doc("Cheese Experience", experience_id)
	if experience.deposit_required:
		return {"type": experience.deposit_type, "value": experience.deposit_value}
	return {"type": None, "value": None}


def build_price_summary(price_result, quantity, deposit_amount=None, deposit_basis=None):
	"""Explicit, presentation-ready price breakdown for the chatbot/UI.

	Built entirely from an already-computed ``calculate_ticket_price`` result so
	consumers never re-derive (and never dilute) the unit price. When every
	person pays the same the per-person value is exposed as ``unit_price``;
	otherwise it is left ``None`` and callers should show ``price_breakdown``.
	All amounts are in the result's (post-conversion) currency.
	"""
	from frappe.utils import flt

	breakdown = price_result.get("price_breakdown") or []
	unit_values = [b.get("unit_price") for b in breakdown if b.get("unit_price") is not None]
	uniform_unit = unit_values[0] if unit_values and len(set(unit_values)) == 1 else None
	subtotal = price_result.get("price_before_discount")
	if subtotal is None:
		subtotal = price_result.get("total_price")

	summary = {
		"currency": price_result.get("currency"),
		"unit_price": flt(uniform_unit, 2) if uniform_unit is not None else price_result.get("individual_price"),
		"uniform_unit_price": uniform_unit is not None,
		"quantity": quantity,
		"subtotal": flt(subtotal, 2) if subtotal is not None else None,
		"promotion_name": price_result.get("promotion_name"),
		"promotion_discount": flt(price_result.get("promotion_discount") or 0, 2),
		"total": price_result.get("total_price"),
	}
	if deposit_amount is not None:
		summary["deposit_amount"] = flt(deposit_amount, 2)
		basis = deposit_basis or {}
		summary["deposit_type"] = basis.get("type")
		summary["deposit_value"] = basis.get("value")
		if basis.get("type") == "%":
			summary["deposit_label"] = f"{flt(basis.get('value'), 2):g}%"
		elif basis.get("type") == "Amount":
			summary["deposit_label"] = f"{flt(deposit_amount, 2):g} {price_result.get('currency') or ''}".strip()
		else:
			summary["deposit_label"] = None
	return summary


def calculate_route_price(route_id, party_size, log_context=None):
	"""
	Calculate total price for a route booking.

	- Manual mode: route.price is the per-person price for the whole route.
	- Sum mode: sum each experience's route_price (with sensible fallbacks) * party_size.

	HOTEL experiences expose two prices:
		- price_per_night: individual booking price (per night, per room).
		- route_price: per-person price contributed when this hotel is part of a route.
	When summing a route, we use route_price for both ACTIVITY and HOTEL experiences,
	falling back to the per-type individual price if route_price is not set.
	"""
	from cheese.cheese.utils.currency_rates import convert_amount, get_company_currency, log_conversion

	route = frappe.get_doc("Cheese Route", route_id)

	if route.price_mode == "Manual" and route.price:
		return route.price * party_size

	# Sum mode: each experience's route unit price is defined in its own
	# experience currency; convert it to that experience's establishment
	# currency before summing, mirroring what the booking total does (the
	# route booking total is the sum of per-establishment converted tickets).
	total = 0
	for exp_row in route.experiences:
		experience = frappe.get_doc("Cheese Experience", exp_row.experience)
		unit = experience.route_price if experience.route_price is not None else 0
		company_currency = get_company_currency(experience.company)
		source_currency = (getattr(experience, "currency", None) or company_currency or "UYU").upper()
		if unit and source_currency != company_currency:
			snap = convert_amount(unit, source_currency, company_currency)
			unit = snap["converted_amount"]
			if log_context:
				log_conversion(
					snap,
					trigger=log_context["trigger"],
					reference_doctype=log_context.get("reference_doctype"),
					reference_name=log_context.get("reference_name"),
					company=experience.company,
				)
		total += unit * party_size
	return total
