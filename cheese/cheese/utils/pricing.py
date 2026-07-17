# Copyright (c) 2024
# License: MIT

import frappe


def _localize_price_result(result, experience):
	"""Convert a computed price into the establishment currency (snapshot)."""
	from frappe.utils import flt

	from cheese.cheese.utils.currency_rates import convert_amount, get_company_currency

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
	return result


def _fixed_amount_in_company_currency(value, experience):
	"""Fixed deposit amounts are expressed in the experience currency."""
	from cheese.cheese.utils.currency_rates import convert_amount, get_company_currency

	company_currency = get_company_currency(experience.company)
	source_currency = (getattr(experience, "currency", None) or company_currency or "UYU").upper()
	if not value or source_currency == company_currency:
		return value
	return convert_amount(value, source_currency, company_currency)["converted_amount"]


def calculate_ticket_price(experience_id, party_size, route_id=None, ticket=None, selected_date=None, guest_ages=None):
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

	from cheese.cheese.utils.seasonal_pricing import (
		apply_promotion,
		compute_party_prices,
		find_matching_promotion,
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
		nights = ticket.nights if ticket else 1
		rooms = party_size  # For HOTEL, party_size passed is actually rooms_requested
		if route_id:
			per_night = experience.route_price if experience.route_price is not None else 0
		else:
			per_night = experience.price_per_night or 0
		result = {
			"total_price": per_night * nights * rooms,
			"price_per_night": per_night,
			"nights": nights,
			"rooms": rooms,
			"individual_price": experience.price_per_night,
			"route_price": experience.route_price,
		}
		season = get_active_season(experience.company, experience_id, selected_date)
		if season and season.percent:
			result["price_before_season"] = result["total_price"]
			result["season"] = dict(season)
			result["total_price"] = flt(result["total_price"] * (1 + flt(season.percent) / 100.0), 2)
		return _convert_extras(_localize_price_result(result, experience))

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
		# Per-person detail in the experience currency (before conversion)
		"price_breakdown": party["breakdown"],
	}

	promo = find_matching_promotion(
		experience.company, experience_id, selected_date, guest_ages, party_size
	)
	if promo:
		discount = apply_promotion(promo, party["unit_prices"])
		if discount > 0:
			result["price_before_discount"] = subtotal
			result["promotion"] = promo.name
			result["promotion_name"] = promo.promo_name
			result["promotion_discount"] = discount
			result["total_price"] = flt(max(0, subtotal - discount), 2)

	return _convert_extras(_localize_price_result(result, experience))


def calculate_deposit_amount(experience_id, total_price, route_id=None):
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
					route.deposit_value, frappe.get_doc("Cheese Experience", experience_id)
				)
			elif route.deposit_type == "%":
				return (total_price * route.deposit_value) / 100
	
	# Check experience deposit
	experience = frappe.get_doc("Cheese Experience", experience_id)
	if experience.deposit_required:
		if experience.deposit_type == "Amount":
			return _fixed_amount_in_company_currency(experience.deposit_value, experience)
		elif experience.deposit_type == "%":
			return (total_price * experience.deposit_value) / 100
	
	return 0


def calculate_route_price(route_id, party_size):
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
	from cheese.cheese.utils.currency_rates import convert_amount, get_company_currency

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
			unit = convert_amount(unit, source_currency, company_currency)["converted_amount"]
		total += unit * party_size
	return total
