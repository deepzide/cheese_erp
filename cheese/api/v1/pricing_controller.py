# Copyright (c) 2024
# License: MIT

import frappe
from frappe import _
from frappe.utils import cint, flt, get_datetime, now_datetime
from cheese.api.common.responses import success, error, not_found, validation_error
from cheese.cheese.utils.pricing import calculate_ticket_price, calculate_deposit_amount, calculate_route_price, get_deposit_basis, build_price_summary
from cheese.cheese.utils.validation import validate_booking_policy
from cheese.cheese.utils.access import assert_record_access
import json


@frappe.whitelist()
def get_pricing_preview(items, party_size=1):
	"""
	Pricing preview (individual / route / mixed)
	Calculates final price + deposit + breakdown
	
	Args:
		items: JSON array of items [{"type": "experience", "experience_id": "EXP-001", "slot_id": "SLOT-001"}, 
		       {"type": "route", "route_id": "ROUTE-001"}]
		party_size: Number of people
		
	Returns:
		Success response with pricing breakdown
	"""
	try:
		if not items:
			return validation_error("items is required")
		
		# Parse items if string
		if isinstance(items, str):
			try:
				items = json.loads(items)
			except Exception as e:
				return validation_error(f"Invalid items format: {str(e)}")
		
		if not isinstance(items, list):
			return validation_error("items must be an array")
		
		if not party_size or party_size < 1:
			return validation_error("party_size must be at least 1")
		
		total_price = 0
		total_deposit = 0
		breakdown = []
		
		for item in items:
			item_type = item.get("type")
			
			if item_type == "experience":
				experience_id = item.get("experience_id")
				slot_id = item.get("slot_id")
				
				if not experience_id:
					return validation_error("experience_id is required for experience items")
				
				if not frappe.db.exists("Cheese Experience", experience_id):
					return not_found("Experience", experience_id)
				
				experience = frappe.get_doc("Cheese Experience", experience_id)
				
				# Calculate price
				price_data = calculate_ticket_price(experience_id, party_size)
				item_price = price_data.get("total_price", 0)
				
				# Calculate deposit
				deposit = calculate_deposit_amount(experience_id, item_price)
				
				total_price += item_price
				total_deposit += deposit
				
				breakdown.append({
					"type": "experience",
					"experience_id": experience_id,
					"experience_name": experience.name,
					"slot_id": slot_id,
					"unit_price": price_data.get("individual_price", 0),
					"price": item_price,
					"deposit": deposit,
					"party_size": party_size
				})
				
			elif item_type == "route":
				route_id = item.get("route_id")
				
				if not route_id:
					return validation_error("route_id is required for route items")
				
				if not frappe.db.exists("Cheese Route", route_id):
					return not_found("Route", route_id)
				
				route = frappe.get_doc("Cheese Route", route_id)
				
				# Route price (Manual per-person, or the converted sum of each
				# experience's route price) — delegate to the single source of
				# truth so previews match the actual booking total.
				route_price = calculate_route_price(route_id, party_size)
				
				# Calculate deposit
				deposit = 0
				if route.deposit_required:
					if route.deposit_type == "Amount":
						deposit = route.deposit_value
					elif route.deposit_type == "%":
						deposit = (route_price * route.deposit_value) / 100
				
				total_price += route_price
				total_deposit += deposit
				
				breakdown.append({
					"type": "route",
					"route_id": route_id,
					"route_name": route.name,
					"price_mode": route.price_mode,
					"price": route_price,
					"deposit": deposit,
					"party_size": party_size
				})
			else:
				return validation_error(f"Invalid item type: {item_type}. Must be 'experience' or 'route'")
		
		return success(
			"Pricing preview calculated successfully",
			{
				"total_price": total_price,
				"total_deposit": total_deposit,
				"final_price": total_price,
				"breakdown": breakdown,
				"party_size": party_size,
				"items_count": len(items)
			}
		)
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except Exception as e:
		frappe.log_error(f"Error in get_pricing_preview: {str(e)}")
		return error("Failed to calculate pricing preview", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def get_route_price_preview(experience_ids, party_size=1):
	"""Converted route price preview for a set of experiences.

	Route-detail edit mode needs the price of an unsaved experience selection,
	so this takes a raw experience-id list (not a saved route). Each experience
	route unit price is converted from the experience currency to that
	experience's establishment currency before summing — mirroring the actual
	booking total. Returns the summed total, the shared currency when every
	experience resolves to the same establishment currency, and a `mixed` flag
	for cross-establishment routes that span more than one currency.
	"""
	try:
		from cheese.cheese.utils.currency_rates import convert_amount, get_company_currency

		if isinstance(experience_ids, str):
			try:
				experience_ids = json.loads(experience_ids)
			except Exception:
				experience_ids = [e.strip() for e in experience_ids.split(",") if e.strip()]
		if not isinstance(experience_ids, list):
			return validation_error("experience_ids must be a list")

		party_size = cint(party_size) or 1
		total = 0.0
		currencies = set()

		for exp_id in experience_ids:
			exp = frappe.db.get_value(
				"Cheese Experience",
				exp_id,
				["company", "currency", "experience_type", "route_price", "individual_price", "price_per_night"],
				as_dict=True,
			)
			if not exp:
				continue
			fallback = exp.price_per_night if exp.experience_type == "HOTEL" else exp.individual_price
			unit = exp.route_price if exp.route_price is not None else (fallback or 0)
			company_currency = get_company_currency(exp.company)
			source_currency = (exp.currency or company_currency or "UYU").upper()
			if unit and source_currency != company_currency:
				unit = convert_amount(unit, source_currency, company_currency)["converted_amount"]
			currencies.add(company_currency)
			total += flt(unit) * party_size

		return success(
			"Route price preview calculated successfully",
			{
				"total": flt(total, 2),
				"currency": next(iter(currencies)) if len(currencies) == 1 else None,
				"mixed": len(currencies) > 1,
				"party_size": party_size,
			},
		)
	except Exception as e:
		frappe.log_error(f"Error in get_route_price_preview: {str(e)}")
		return error("Failed to compute route price preview", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def get_modification_policy(reservation_id=None, experience_id=None):
	"""
	Modification policies - defines what can be modified and cost
	
	Args:
		reservation_id: Reservation ID (ticket_id) - if provided, checks specific reservation
		experience_id: Experience ID - if provided, returns general policy
		
	Returns:
		Success response with modification policy
	"""
	try:
		if not reservation_id and not experience_id:
			return validation_error("Either reservation_id or experience_id must be provided")
		
		experience_id_to_check = experience_id
		
		# If reservation_id provided, get experience from reservation
		if reservation_id:
			if not frappe.db.exists("Cheese Ticket", reservation_id):
				return not_found("Reservation", reservation_id)

			try:
				assert_record_access("Cheese Ticket", reservation_id)
			except frappe.PermissionError:
				return error("Unauthorized", "UNAUTHORIZED", {}, 403)

			ticket = frappe.get_doc("Cheese Ticket", reservation_id)
			experience_id_to_check = ticket.experience
			
			# Check if modification is allowed for this reservation
			if ticket.status not in ["PENDING", "CONFIRMED"]:
				return success(
					"Modification not allowed",
					{
						"reservation_id": reservation_id,
						"can_modify": False,
						"reason": f"Reservation status is {ticket.status}. Only PENDING or CONFIRMED reservations can be modified."
					}
				)
		
		if not experience_id_to_check:
			return validation_error("Could not determine experience_id")
		
		if not frappe.db.exists("Cheese Experience", experience_id_to_check):
			return not_found("Experience", experience_id_to_check)
		
		experience = frappe.get_doc("Cheese Experience", experience_id_to_check)
		
		# Get booking policy via shared resolver (supports many experiences -> one policy)
		from cheese.cheese.utils.validation import get_booking_policy_for_experience
		policy = None
		policy_data = get_booking_policy_for_experience(
			experience_id_to_check,
			fields=["name", "modify_until_hours_before"],
		)
		if policy_data:
			policy = {
				"modify_until_hours_before": policy_data.modify_until_hours_before,
				"modification_allowed": True,
			}
		else:
			policy = {
				"modify_until_hours_before": None,
				"modification_allowed": True,
			}
		
		return success(
			"Modification policy retrieved successfully",
			{
				"experience_id": experience_id_to_check,
				"can_modify": True,
				"allowed_changes": ["slot", "party_size"],
				"modification_policy": policy,
				"modification_cost": 0,  # Could be enhanced to calculate actual cost
				"note": "Modifications may be subject to availability"
			}
		)
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except Exception as e:
		frappe.log_error(f"Error in get_modification_policy: {str(e)}")
		return error("Failed to get modification policy", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def get_cancellation_impact(reservation_id=None, experience_id=None, slot_datetime=None):
	"""
	Cancellation impact - calculates penalties and consequences
	
	Args:
		reservation_id: Reservation ID (ticket_id) - if provided, checks specific reservation
		experience_id: Experience ID
		slot_datetime: Slot datetime (YYYY-MM-DD HH:MM:SS) - required if reservation_id not provided
		
	Returns:
		Success response with cancellation impact
	"""
	try:
		if not reservation_id and not experience_id:
			return validation_error("Either reservation_id or experience_id must be provided")
		
		experience_id_to_check = experience_id
		slot_dt = None
		
		# If reservation_id provided, get experience and slot from reservation
		if reservation_id:
			if not frappe.db.exists("Cheese Ticket", reservation_id):
				return not_found("Reservation", reservation_id)

			try:
				assert_record_access("Cheese Ticket", reservation_id)
			except frappe.PermissionError:
				return error("Unauthorized", "UNAUTHORIZED", {}, 403)

			ticket = frappe.get_doc("Cheese Ticket", reservation_id)
			experience_id_to_check = ticket.experience
			
			# Get slot datetime
			if ticket.slot:
				slot = frappe.get_doc("Cheese Experience Slot", ticket.slot)
				slot_dt = get_datetime(f"{slot.date_from} {slot.time_from}")
			
			# Check if cancellation is allowed
			if ticket.status not in ["PENDING", "CONFIRMED"]:
				return success(
					"Cancellation not allowed",
					{
						"reservation_id": reservation_id,
						"can_cancel": False,
						"reason": f"Reservation status is {ticket.status}. Only PENDING or CONFIRMED reservations can be cancelled."
					}
				)
		else:
			if not slot_datetime:
				return validation_error("slot_datetime is required when reservation_id is not provided")
			slot_dt = get_datetime(slot_datetime)
		
		if not experience_id_to_check:
			return validation_error("Could not determine experience_id")
		
		if not frappe.db.exists("Cheese Experience", experience_id_to_check):
			return not_found("Experience", experience_id_to_check)
		
		# Get booking policy via shared resolver (many experiences -> one policy)
		from cheese.cheese.utils.validation import get_booking_policy_for_experience
		policy_data = get_booking_policy_for_experience(
			experience_id_to_check,
			fields=["name", "cancel_until_hours_before"],
		)

		cancellation_allowed = True
		penalty = 0
		refund_amount = 0

		if policy_data:
			if slot_dt and policy_data.cancel_until_hours_before is not None:
				hours_until_slot = (slot_dt - now_datetime()).total_seconds() / 3600

				if hours_until_slot < policy_data.cancel_until_hours_before:
					cancellation_allowed = False
					penalty = 100  # Could be calculated based on policy
		
		# Calculate refund (simplified - would need actual ticket price)
		if cancellation_allowed:
			refund_amount = 100  # Would be calculated from actual reservation price
		
		return success(
			"Cancellation impact calculated successfully",
			{
				"experience_id": experience_id_to_check,
				"reservation_id": reservation_id,
				"can_cancel": cancellation_allowed,
				"penalty": penalty,
				"refund_amount": refund_amount,
				"cancellation_policy": {
					"cancel_until_hours_before": policy_doc.cancel_until_hours_before if policy_name else None
				} if policy_name else None,
				"consequences": "Reservation will be cancelled and capacity released" if cancellation_allowed else "Cancellation not allowed within policy window"
			}
		)
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except Exception as e:
		frappe.log_error(f"Error in get_cancellation_impact: {str(e)}")
		return error("Failed to get cancellation impact", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def get_active_season_for_experience(experience_id, date=None):
	"""Active season applying to the experience on the date (default: today).

	Lets the experience detail view show the season-adjusted effective prices.
	"""
	try:
		if not experience_id:
			return validation_error("experience_id is required")
		if not frappe.db.exists("Cheese Experience", experience_id):
			return not_found("Experience", experience_id)
		if not frappe.has_permission("Cheese Experience", "read", experience_id):
			return error("Not permitted to access this experience", "PERMISSION_DENIED", {}, 403)

		from frappe.utils import nowdate
		from cheese.cheese.utils.seasonal_pricing import get_active_season

		company = frappe.db.get_value("Cheese Experience", experience_id, "company")
		season = get_active_season(company, experience_id, date or nowdate())
		if season:
			season = dict(season)
			dates = frappe.db.get_value(
				"Cheese Season", season["name"], ["date_from", "date_to"], as_dict=True
			) or {}
			season["date_from"] = str(dates.get("date_from") or "")
			season["date_to"] = str(dates.get("date_to") or "")
		return success("Active season resolved", {"season": season})
	except Exception as e:
		frappe.log_error(f"Error in get_active_season_for_experience: {str(e)}")
		return error("Failed to resolve active season", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def get_experience_price_calendar(experience_id, month=None, date_from=None, date_to=None):
	"""Per-day price calendar for an experience (default: the current month).

	Feeds the experience-detail and seasons price-calendar views: for each day
	it returns the resolved prices (per age group + base), the active season and
	the promotions covering that day. Read-only.

	Args:
		experience_id: Cheese Experience
		month: "YYYY-MM" (whole month). Overrides date_from/date_to when given.
		date_from / date_to: explicit range (ISO). Capped at 62 days.
	"""
	try:
		if not experience_id:
			return validation_error("experience_id is required")
		if not frappe.db.exists("Cheese Experience", experience_id):
			return not_found("Experience", experience_id)
		if not frappe.has_permission("Cheese Experience", "read", experience_id):
			return error("Not permitted to access this experience", "PERMISSION_DENIED", {}, 403)

		from frappe.utils import getdate, get_first_day, get_last_day, nowdate, add_days
		from cheese.cheese.utils.seasonal_pricing import get_experience_price_calendar as _calendar

		if month:
			try:
				anchor = getdate(f"{month}-01")
			except Exception:
				return validation_error("month must be in YYYY-MM format")
			d_from = get_first_day(anchor)
			d_to = get_last_day(anchor)
		elif date_from and date_to:
			d_from, d_to = getdate(date_from), getdate(date_to)
			if d_to < d_from:
				return validation_error("date_to must be on or after date_from")
			if (d_to - d_from).days > 62:
				d_to = add_days(d_from, 62)
		else:
			anchor = getdate(nowdate())
			d_from = get_first_day(anchor)
			d_to = get_last_day(anchor)

		experience = frappe.get_doc("Cheese Experience", experience_id)
		data = _calendar(experience, d_from, d_to)
		return success("Price calendar resolved", data)
	except Exception as e:
		frappe.log_error(f"Error in get_experience_price_calendar: {str(e)}")
		return error("Failed to resolve price calendar", "SERVER_ERROR", {"error": str(e)}, 500)


def _sim_activity_availability(experience_id, date_value, needed):
	"""Best slot availability for an activity on a date (no tenant guard: the
	simulator is a read-only price/availability preview, and routes legitimately
	span establishments)."""
	from frappe.utils import getdate
	from cheese.cheese.utils.capacity import get_available_capacity

	if not date_value:
		return {"checked": False, "slots": [], "best_available": None, "enough": None}
	day = getdate(date_value)
	slots = frappe.get_all(
		"Cheese Experience Slot",
		filters={
			"experience": experience_id,
			"date_from": ["<=", day],
			"date_to": [">=", day],
			"slot_status": ["in", ["OPEN", "CLOSED"]],
		},
		fields=["name", "time_from", "max_capacity"],
		order_by="time_from asc",
	)
	details = []
	best = 0
	for s in slots:
		avail = get_available_capacity(s.name, selected_date=day)
		details.append({"slot_id": s.name, "time": str(s.time_from) if s.time_from else None, "available": avail})
		best = max(best, avail)
	return {
		"checked": True,
		"slots": details,
		"best_available": best if slots else 0,
		"enough": (best >= needed) if slots else False,
		"has_slots": bool(slots),
	}


def _sim_hotel_availability(experience_id, check_in, check_out, rooms_needed):
	"""Bottleneck room availability across the nights of a stay.

	Derived 100% from physical rooms (Cheese Hotel Room + active stays) —
	legacy Cheese Experience Slots are never consulted for hotels.
	"""
	from frappe.utils import getdate, add_days
	from cheese.api.v1.availability_controller import _hotel_nightly_availability

	ci, co = getdate(check_in), getdate(check_out)
	# Nights of a stay are [check_in, check_out); the helper's range is inclusive.
	rows, total_rooms = _hotel_nightly_availability(experience_id, ci, add_days(co, -1))
	nights = []
	bottleneck = None
	for row in rows:
		avail = row.get("available") or 0
		nights.append({"date": row.get("date"), "available_rooms": avail, "has_slot": total_rooms > 0})
		bottleneck = avail if bottleneck is None else min(bottleneck, avail)
	bottleneck = bottleneck or 0
	return {"checked": True, "nights": nights, "available_rooms": bottleneck, "enough": bottleneck >= rooms_needed}


@frappe.whitelist()
def simulate_booking(
	booking_type,
	experience_id=None,
	route_id=None,
	selected_date=None,
	check_in_date=None,
	check_out_date=None,
	party_size=1,
	rooms_requested=1,
	guest_ages=None,
):
	"""Reservation price simulator — returns the price a ticket WOULD have,
	applying the same engine as a real booking (weekday/weekend x age-group
	matrix, active season, automatic promotions and per-establishment currency)
	plus a slot-availability check. It never creates tickets.

	Args:
		booking_type: ACTIVITY | HOTEL | ROUTE
		experience_id: activity or hotel-room experience (ACTIVITY/HOTEL)
		route_id: package (ROUTE)
		selected_date: visit date (ACTIVITY/ROUTE)
		check_in_date / check_out_date: stay dates (HOTEL)
		party_size: people (ACTIVITY/ROUTE) — for HOTEL it's the guest count
		rooms_requested: rooms (HOTEL)
		guest_ages: JSON list / comma string of ages (drives the age-group matrix)
	"""
	try:
		from frappe.utils import getdate
		from cheese.cheese.utils.seasonal_pricing import parse_guest_ages

		booking_type = (booking_type or "").upper()
		if booking_type not in ("ACTIVITY", "HOTEL", "ROUTE"):
			return validation_error("booking_type must be ACTIVITY, HOTEL or ROUTE")

		ages = parse_guest_ages(guest_ages)
		party_size = cint(party_size) or (len(ages) or 1)

		if booking_type == "HOTEL":
			if not experience_id:
				return validation_error("experience_id is required for HOTEL")
			if not check_in_date or not check_out_date:
				return validation_error("check_in_date and check_out_date are required for HOTEL")
			ci, co = getdate(check_in_date), getdate(check_out_date)
			if co <= ci:
				return validation_error("check_out_date must be after check_in_date")
			if not frappe.db.exists("Cheese Experience", experience_id):
				return not_found("Experience", experience_id)
			nights = (co - ci).days
			rooms = cint(rooms_requested) or 1
			price = calculate_ticket_price(
				experience_id,
				rooms,
				ticket=frappe._dict({"nights": nights, "check_in_date": str(ci), "guest_ages": ages}),
				selected_date=str(ci),
				guest_ages=ages,
			)
			deposit = calculate_deposit_amount(experience_id, price.get("total_price", 0))
			availability = _sim_hotel_availability(experience_id, ci, co, rooms)
			return success(
				"Simulation complete",
				{
					"booking_type": "HOTEL",
					"experience_id": experience_id,
					"check_in_date": str(ci),
					"check_out_date": str(co),
					"nights": nights,
					"rooms": rooms,
					"guests": party_size,
					"pricing": price,
					"deposit": deposit,
					"currency": price.get("currency"),
					"total_price": price.get("total_price", 0),
					"availability": availability,
					"applied_factors": ["season"],
				},
			)

		if booking_type == "ACTIVITY":
			if not experience_id:
				return validation_error("experience_id is required for ACTIVITY")
			if not frappe.db.exists("Cheese Experience", experience_id):
				return not_found("Experience", experience_id)
			price = calculate_ticket_price(
				experience_id, party_size, selected_date=selected_date, guest_ages=ages
			)
			deposit = calculate_deposit_amount(experience_id, price.get("total_price", 0))
			deposit_basis = get_deposit_basis(experience_id)
			price_summary = build_price_summary(
				price, party_size, deposit_amount=deposit, deposit_basis=deposit_basis
			)
			availability = _sim_activity_availability(experience_id, selected_date, party_size)
			return success(
				"Simulation complete",
				{
					"booking_type": "ACTIVITY",
					"experience_id": experience_id,
					"selected_date": selected_date,
					"party_size": party_size,
					"guest_ages": ages,
					"pricing": price,
					"price_summary": price_summary,
					"deposit": deposit,
					"deposit_basis": deposit_basis,
					"currency": price.get("currency"),
					"total_price": price.get("total_price", 0),
					"availability": availability,
					"applied_factors": ["weekday_weekend", "age_groups", "season", "promotions"],
				},
			)

		# ROUTE: sum each stop's ticket price (in_route) applying the full engine
		if not route_id:
			return validation_error("route_id is required for ROUTE")
		if not frappe.db.exists("Cheese Route", route_id):
			return not_found("Route", route_id)
		route = frappe.get_doc("Cheese Route", route_id)
		stops = []
		totals_by_currency = {}
		all_available = True
		for row in route.experiences:
			exp_id = row.experience
			price = calculate_ticket_price(
				exp_id, party_size, route_id=route_id, selected_date=selected_date, guest_ages=ages
			)
			exp = frappe.get_doc("Cheese Experience", exp_id)
			if exp.experience_type == "HOTEL":
				avail = {"checked": False, "note": "hotel-in-route: check dates on the room"}
			else:
				avail = _sim_activity_availability(exp_id, selected_date, party_size)
				if avail.get("checked") and not avail.get("enough"):
					all_available = False
			cur = price.get("currency") or "UYU"
			totals_by_currency[cur] = flt(totals_by_currency.get(cur, 0) + price.get("total_price", 0), 2)
			stops.append(
				{
					"experience_id": exp_id,
					"experience_type": exp.experience_type,
					"pricing": price,
					"currency": cur,
					"total_price": price.get("total_price", 0),
					"availability": avail,
				}
			)
		mixed = len(totals_by_currency) > 1
		total = None if mixed else (list(totals_by_currency.values())[0] if totals_by_currency else 0)
		deposit = 0
		if route.experiences:
			deposit = calculate_deposit_amount(
				route.experiences[0].experience, total or 0, route_id=route_id
			)
		return success(
			"Simulation complete",
			{
				"booking_type": "ROUTE",
				"route_id": route_id,
				"selected_date": selected_date,
				"party_size": party_size,
				"guest_ages": ages,
				"stops": stops,
				"totals_by_currency": totals_by_currency,
				"total_price": total,
				"mixed_currencies": mixed,
				"currency": None if mixed else (list(totals_by_currency)[0] if totals_by_currency else None),
				"deposit": deposit,
				"availability": {"all_available": all_available},
				"applied_factors": ["weekday_weekend", "age_groups", "season", "promotions"],
			},
		)
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except Exception as e:
		frappe.log_error(f"Error in simulate_booking: {str(e)}")
		return error("Failed to simulate booking", "SERVER_ERROR", {"error": str(e)}, 500)
