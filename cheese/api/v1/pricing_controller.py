# Copyright (c) 2024
# License: MIT

import frappe
from frappe import _
from frappe.utils import cint, flt, get_datetime, now_datetime
from cheese.api.common.responses import success, error, not_found, validation_error
from cheese.cheese.utils.pricing import calculate_ticket_price, calculate_deposit_amount, calculate_route_price
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
