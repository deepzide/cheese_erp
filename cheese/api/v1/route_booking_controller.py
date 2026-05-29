# Copyright (c) 2024
# License: MIT

import base64
import json
from datetime import timedelta

import frappe
from frappe import _
from frappe.utils import add_to_date, get_datetime, getdate, now_datetime

from cheese.api.common.responses import created, error, not_found, success, validation_error
from cheese.api.v1.ticket_controller import create_pending_ticket
from cheese.api.v1.user_controller import _get_current_user_company
from cheese.cheese.utils.access import assert_route_access, assert_record_access
from cheese.cheese.utils.capacity import (
	get_available_capacity,
	slot_calendar_days_in_range,
	update_slot_capacity,
)
from cheese.cheese.utils.pricing import calculate_deposit_amount, calculate_ticket_price


def _permission_denied(message="Not permitted"):
	return error(message, "PERMISSION_DENIED", {}, 403)


def _has_route_booking_company_access(route_booking) -> bool:
	"""Establishment users can only access bookings containing their company tickets."""
	user_company = _get_current_user_company()
	if not user_company:
		return True

	ticket_ids = [row.ticket for row in (route_booking.tickets or []) if row.ticket]
	if not ticket_ids:
		return False

	companies = set(
		frappe.get_all(
			"Cheese Ticket",
			filters={"name": ["in", ticket_ids]},
			pluck="company",
		)
	)
	return user_company in companies


def _normalize_time_filter(time_value):
	"""Normalize client and DB time values to HH:MM:SS for comparisons."""
	if not time_value:
		return None
	time_part = str(time_value).strip().split(".")[0]
	parts = time_part.split(":")
	try:
		hour = int(parts[0]) if len(parts) > 0 and parts[0] != "" else 0
		minute = int(parts[1]) if len(parts) > 1 and parts[1] != "" else 0
		second = int(parts[2]) if len(parts) > 2 and parts[2] != "" else 0
		return f"{hour:02d}:{minute:02d}:{second:02d}"
	except Exception:
		return time_part


def _time_to_seconds(time_value) -> int | None:
	"""Convert a HH:MM:SS time string to total seconds for numeric comparison."""
	normalized = _normalize_time_filter(time_value)
	if not normalized:
		return None
	parts = normalized.split(":")
	try:
		h = int(parts[0]) if len(parts) > 0 else 0
		m = int(parts[1]) if len(parts) > 1 else 0
		s = int(parts[2]) if len(parts) > 2 else 0
		return h * 3600 + m * 60 + s
	except Exception:
		return None


def _slots_compatible(t1_from, t1_to, t2_from, t2_to) -> bool:
	"""Return True if two time ranges do not overlap.

	Non-overlapping condition: (t1_to <= t2_from) OR (t2_to <= t1_from).
	If any time cannot be parsed, returns True (allow by default).
	"""
	s1_from = _time_to_seconds(t1_from)
	s1_to = _time_to_seconds(t1_to)
	s2_from = _time_to_seconds(t2_from)
	s2_to = _time_to_seconds(t2_to)
	if any(v is None for v in (s1_from, s1_to, s2_from, s2_to)):
		return True
	return s1_to <= s2_from or s2_to <= s1_from


def _has_valid_combination(exp_slot_lists: list) -> bool:
	"""Return True if any non-overlapping combination can be formed from the given per-experience slot lists."""

	def backtrack(idx: int, selected: list) -> bool:
		if idx == len(exp_slot_lists):
			return True
		for slot_entry in exp_slot_lists[idx]:
			if all(
				_slots_compatible(
					ex["time_from"],
					ex["time_to"],
					slot_entry["time_from"],
					slot_entry["time_to"],
				)
				for ex in selected
			):
				selected.append(slot_entry)
				if backtrack(idx + 1, selected):
					return True
				selected.pop()
		return False

	return backtrack(0, [])


def _find_valid_combinations_for_date(
	experience_rows, target_date, party_size: int = 1, max_results: int = 20
) -> list:
	"""Find valid slot combinations for a list of experiences on a specific date.

	Returns combinations where all slots share target_date, have sufficient
	available capacity, and no two slots overlap in time.
	"""
	date_obj = getdate(target_date)
	exp_slot_lists: list = []

	for exp_row in experience_rows:
		experience_id = exp_row.experience if hasattr(exp_row, "experience") else exp_row.get("experience")
		sequence = exp_row.sequence if hasattr(exp_row, "sequence") else exp_row.get("sequence", 0)

		slots = frappe.get_all(
			"Cheese Experience Slot",
			filters={
				"experience": experience_id,
				"slot_status": ["in", ["OPEN", "CLOSED"]],
				"date_from": ["<=", date_obj],
				"date_to": [">=", date_obj],
			},
			fields=["name", "time_from", "time_to", "max_capacity"],
			order_by="time_from asc",
		)

		available: list = []
		for slot in slots:
			cap = get_available_capacity(slot.name, selected_date=date_obj)
			if cap >= party_size:
				available.append(
					{
						"experience_id": experience_id,
						"slot_id": slot.name,
						"selected_date": str(date_obj),
						"time_from": str(slot.time_from) if slot.time_from else None,
						"time_to": str(slot.time_to) if slot.time_to else None,
						"available_capacity": cap,
						"sequence": sequence,
					}
				)
		exp_slot_lists.append(available)

	if any(len(s) == 0 for s in exp_slot_lists):
		return []

	results: list = []

	def backtrack(idx: int, selected: list) -> None:
		if len(results) >= max_results:
			return
		if idx == len(exp_slot_lists):
			results.append(list(selected))
			return
		for slot_entry in exp_slot_lists[idx]:
			if all(
				_slots_compatible(
					ex["time_from"],
					ex["time_to"],
					slot_entry["time_from"],
					slot_entry["time_to"],
				)
				for ex in selected
			):
				selected.append(slot_entry)
				backtrack(idx + 1, selected)
				selected.pop()

	backtrack(0, [])
	return results


def _encode_combination_id(combination: list) -> str:
	"""Encode a combination (list of slot entries) as a base64 string."""
	payload = sorted(
		[
			{
				"experience_id": s["experience_id"],
				"slot_id": s["slot_id"],
				"selected_date": s["selected_date"],
			}
			for s in combination
		],
		key=lambda x: x["experience_id"],
	)
	return base64.b64encode(json.dumps(payload, separators=(",", ":")).encode()).decode()


def _decode_combination_id(combination_id: str) -> list | None:
	"""Decode a combination_id string back to a list of slot entries, or None if invalid."""
	try:
		decoded = base64.b64decode(combination_id.encode()).decode()
		data = json.loads(decoded)
		if not isinstance(data, list):
			return None
		for item in data:
			if not all(k in item for k in ("experience_id", "slot_id", "selected_date")):
				return None
		return data
	except Exception:
		return None


def _check_experiences_combinable(experience_ids: list) -> bool | None:
	"""Check if a list of experiences can form at least one valid slot combination within 180 days.

	Returns:
		True  — at least one valid combination exists.
		None  — some experiences have no slots yet (undetermined).
		False — all experiences have slots but no valid combination was found.
	"""
	from frappe.utils import today

	if not experience_ids or len(experience_ids) < 2:
		return True

	today_date = getdate(today())
	horizon = today_date + timedelta(days=180)

	all_slots: dict = {}
	for exp_id in experience_ids:
		slots = frappe.get_all(
			"Cheese Experience Slot",
			filters={
				"experience": exp_id,
				"slot_status": ["in", ["OPEN", "CLOSED"]],
				"date_from": ["<=", horizon],
				"date_to": [">=", today_date],
			},
			fields=["name", "date_from", "date_to", "time_from", "time_to"],
		)
		all_slots[exp_id] = slots

	if any(len(all_slots[exp_id]) == 0 for exp_id in experience_ids):
		return None

	current = today_date
	while current <= horizon:
		exp_slot_lists: list = []
		all_covered = True
		for exp_id in experience_ids:
			day_slots = [
				{
					"experience_id": exp_id,
					"slot_id": s.name,
					"time_from": str(s.time_from) if s.time_from else None,
					"time_to": str(s.time_to) if s.time_to else None,
				}
				for s in all_slots[exp_id]
				if getdate(s.date_from) <= current <= getdate(s.date_to)
			]
			if not day_slots:
				all_covered = False
				break
			exp_slot_lists.append(day_slots)

		if all_covered and _has_valid_combination(exp_slot_lists):
			return True

		current += timedelta(days=1)

	return False


@frappe.whitelist()
def get_route_combinations(route_id, date=None, date_from=None, date_to=None, party_size=1):
	"""
	Get valid pre-elaborated slot combinations for a route.

	Returns combinations where: all slots share the same date, no two slots
	overlap in time, and each slot has enough capacity for party_size.

	Args:
		route_id: Cheese Route ID
		date: Single date (YYYY-MM-DD), alias for date_from = date_to = date
		date_from: Start date (YYYY-MM-DD)
		date_to: End date (YYYY-MM-DD), defaults to date_from
		party_size: Minimum required capacity per slot (default 1)

	Returns:
		Success response with list of valid combinations and their combination_id values
	"""
	try:
		if not route_id:
			return validation_error("route_id is required")

		if not frappe.db.exists("Cheese Route", route_id):
			return not_found("Route", route_id)

		try:
			assert_route_access(route_id)
		except frappe.PermissionError:
			return _permission_denied("Not permitted to access this route")

		route = frappe.get_doc("Cheese Route", route_id)

		if route.status != "ONLINE":
			return success(
				"Route is not available",
				{
					"route_id": route_id,
					"status": route.status,
					"available": False,
					"combinations": [],
					"total": 0,
				},
			)

		if date:
			date_from = date
			date_to = date

		if not date_from:
			return validation_error("date (or date_from) is required")

		from frappe.utils import today

		start_date = getdate(date_from)
		end_date = getdate(date_to) if date_to else start_date
		today_obj = getdate(today())

		if end_date < today_obj:
			return success(
				"Requested date range is in the past",
				{"route_id": route_id, "combinations": [], "total": 0},
			)
		if start_date < today_obj:
			start_date = today_obj

		try:
			party_size = int(party_size)
		except (ValueError, TypeError):
			return validation_error("party_size must be a number")
		if party_size < 1:
			return validation_error("party_size must be at least 1")

		# All experiences must be ONLINE for the route to have available combinations
		offline_experiences = []
		for exp_row in route.experiences:
			exp_status = frappe.db.get_value("Cheese Experience", exp_row.experience, "status")
			if exp_status != "ONLINE":
				offline_experiences.append(exp_row.experience)
		if offline_experiences:
			return success(
				"Route has offline experiences",
				{
					"route_id": route_id,
					"available": False,
					"offline_experiences": offline_experiences,
					"combinations": [],
					"total": 0,
				},
			)

		all_combinations = []
		current_date = start_date
		while current_date <= end_date and len(all_combinations) < 50:
			day_combos = _find_valid_combinations_for_date(route.experiences, current_date, party_size)
			for combo in day_combos:
				all_combinations.append(
					{
						"combination_id": _encode_combination_id(combo),
						"date": str(current_date),
						"party_size": party_size,
						"slots": combo,
					}
				)
			current_date += timedelta(days=1)

		return success(
			"Route combinations retrieved successfully",
			{
				"route_id": route_id,
				"date_from": str(start_date),
				"date_to": str(end_date),
				"party_size": party_size,
				"combinations": all_combinations,
				"total": len(all_combinations),
			},
		)
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except Exception as e:
		frappe.log_error(f"Error in get_route_combinations: {e!s}")
		return error("Failed to get route combinations", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def create_route_reservation(
	contact_id=None,
	route_id=None,
	experiences_with_slots=None,
	preferred_dates=None,
	party_size=1,
	conversation_id=None,
	notes=None,
	date_from=None,
	date_to=None,
	date=None,
	time_from=None,
	time_to=None,
	combination_id=None,
):
	"""
	Create pending route reservation.
	Creates RouteBooking = PENDING + internal reservations, locks capacity.

	Args:
		contact_id: Contact ID
		route_id: Route ID
		experiences_with_slots: JSON array of {"experience_id": "EXP-001", "slot_id": "SLOT-001"}
		preferred_dates: Alias for experiences_with_slots
		party_size: Party size (default: 1)
		conversation_id: Conversation ID (optional)
		notes: Optional guest notes copied to all tickets created for this route booking
		date_from: Start date to auto-select slots (optional, YYYY-MM-DD)
		date_to: End date to auto-select slots (optional, YYYY-MM-DD). If not provided, uses date_from
		date: Synonym for date_from when date_from is not set (optional, YYYY-MM-DD)
		time_from: Preferred slot start time in HH:MM[:SS] for auto slot selection (optional)
		time_to: Preferred slot end time in HH:MM[:SS] for auto slot selection (optional)
		combination_id: Pre-validated combination identifier from get_route_combinations (optional)

	Returns:
		Created response with route booking data
	"""
	try:
		if preferred_dates and not experiences_with_slots:
			experiences_with_slots = preferred_dates

		if date and not date_from:
			date_from = date

		if not contact_id:
			return validation_error("contact_id is required")
		if not route_id:
			return validation_error("route_id is required")

		try:
			party_size = int(party_size)
		except (ValueError, TypeError):
			return validation_error("party_size must be a number")

		if party_size < 1:
			return validation_error("party_size must be at least 1")

		if not frappe.db.exists("Cheese Contact", contact_id):
			return not_found("Contact", contact_id)

		if not frappe.db.exists("Cheese Route", route_id):
			return not_found("Route", route_id)

		try:
			assert_route_access(route_id)
		except frappe.PermissionError:
			return _permission_denied("Not permitted to access this route")

		route = frappe.get_doc("Cheese Route", route_id)

		if route.status != "ONLINE":
			return validation_error(f"Route {route_id} is not ONLINE. Current status: {route.status}")

		# Resolve combination_id → experiences_with_slots when provided
		if combination_id and not experiences_with_slots:
			decoded = _decode_combination_id(combination_id)
			if not decoded:
				return validation_error("Invalid or corrupted combination_id")
			experiences_with_slots = [
				{
					"experience_id": item["experience_id"],
					"slot_id": item["slot_id"],
					"selected_date": item["selected_date"],
				}
				for item in decoded
			]

		# Auto-select slots if date_from is provided and explicit slots are missing
		selected_date_for_tickets = None
		start_date = None
		end_date = None
		normalized_time_from = None
		normalized_time_to = None
		if time_from:
			normalized_time_from = _normalize_time_filter(time_from)
		if time_to:
			normalized_time_to = _normalize_time_filter(time_to)
		if date_from:
			try:
				start_date = getdate(date_from)
				end_date = getdate(date_to) if date_to else start_date
				if end_date < start_date:
					return validation_error("date_to must be greater than or equal to date_from")
				selected_date_for_tickets = start_date
			except Exception as e:
				return validation_error(f"Invalid date format: {e!s}")
		if not experiences_with_slots and date_from:
			# Find the first valid combination (same date, non-overlapping, capacity OK)
			current_date = start_date
			found_combination = None
			while current_date <= end_date:
				candidates = _find_valid_combinations_for_date(route.experiences, current_date, party_size)
				if normalized_time_from or normalized_time_to:
					# Filter by time window: earliest slot must start >= time_from
					# and latest slot must end <= time_to (range, not exact match)
					window_from = _time_to_seconds(normalized_time_from)
					window_to = _time_to_seconds(normalized_time_to)
					filtered_candidates = []
					for combo in candidates:
						if not combo:
							continue
						seconds_starts = [
							_time_to_seconds(s["time_from"])
							for s in combo
							if _time_to_seconds(s["time_from"]) is not None
						]
						seconds_ends = [
							_time_to_seconds(s["time_to"])
							for s in combo
							if _time_to_seconds(s["time_to"]) is not None
						]
						min_start = min(seconds_starts) if seconds_starts else None
						max_end = max(seconds_ends) if seconds_ends else None
						if normalized_time_from and (min_start is None or min_start < window_from):
							continue
						if normalized_time_to and (max_end is None or max_end > window_to):
							continue
						filtered_candidates.append(combo)
					candidates = filtered_candidates
				if candidates:
					found_combination = candidates[0]
					break
				current_date += timedelta(days=1)

			if not found_combination:
				date_range_str = f"{start_date}" if start_date == end_date else f"{start_date} to {end_date}"
				time_hint = ""
				if normalized_time_from and normalized_time_to:
					time_hint = f" at {normalized_time_from} - {normalized_time_to}"
				elif normalized_time_from:
					time_hint = f" at {normalized_time_from}"
				elif normalized_time_to:
					time_hint = f" ending at {normalized_time_to}"
				return validation_error(
					f"No valid slot combination found for route {route_id} between {date_range_str}{time_hint}"
				)

			experiences_with_slots = [
				{
					"experience_id": s["experience_id"],
					"slot_id": s["slot_id"],
					"selected_date": s["selected_date"],
				}
				for s in found_combination
			]
			selected_date_for_tickets = getdate(found_combination[0]["selected_date"])

		if not experiences_with_slots:
			return validation_error("experiences_with_slots (or date_from/date_to) is required")

		# Parse experiences_with_slots
		if isinstance(experiences_with_slots, str):
			try:
				experiences_with_slots = json.loads(experiences_with_slots)
			except Exception as e:
				return validation_error(f"Invalid experiences_with_slots format: {e!s}")

		if not isinstance(experiences_with_slots, list):
			return validation_error("experiences_with_slots must be an array")

		# Validate all experiences and slots
		slot_map = {}
		selected_date_map = {}
		for item in experiences_with_slots:
			exp_id = item.get("experience_id")
			slot_id = item.get("slot_id")
			item_selected_date = (
				item.get("selected_date")
				or item.get("calendar_date")
				or item.get("date")
				or (str(selected_date_for_tickets) if selected_date_for_tickets else None)
			)
			if not exp_id:
				return validation_error("Each item must have 'experience_id'")
			if not frappe.db.exists("Cheese Experience", exp_id):
				return not_found("Experience", exp_id)
			exp_type = frappe.db.get_value("Cheese Experience", exp_id, "experience_type")
			is_hotel_item = exp_type == "HOTEL"
			if not is_hotel_item:
				# Non-hotel experiences require an explicit slot_id
				if not slot_id:
					return validation_error(f"'slot_id' is required for non-hotel experience {exp_id}")
				if not frappe.db.exists("Cheese Experience Slot", slot_id):
					return not_found("Slot", slot_id)
				slot_experience = frappe.db.get_value("Cheese Experience Slot", slot_id, "experience")
				if slot_experience != exp_id:
					return validation_error(
						f"Slot {slot_id} belongs to experience {slot_experience}, not {exp_id}"
					)
				slot_map[exp_id] = slot_id
			else:
				# Hotel experiences: slot is resolved automatically from check_in date at ticket creation.
				# Use start_date (check_in) as the reference date for the same-date validation.
				if start_date:
					item_selected_date = str(start_date)
				# slot_map entry deliberately omitted — resolved later
			if item_selected_date:
				try:
					selected_date_map[exp_id] = str(getdate(item_selected_date))
				except Exception:
					return validation_error("selected_date must be a valid date")

		# Reject duplicate experience entries (hotel experiences are excluded from slot_map but still count)
		non_hotel_items = [
			item
			for item in experiences_with_slots
			if frappe.db.get_value("Cheese Experience", item.get("experience_id"), "experience_type")
			!= "HOTEL"
		]
		if len(slot_map) < len(non_hotel_items):
			return validation_error(
				"Duplicate experience entries: each experience can only contribute one slot to a route"
			)

		# All selected dates must match
		if selected_date_map:
			unique_dates = set(selected_date_map.values())
			if len(unique_dates) > 1:
				return validation_error(
					f"All slots must be on the same date. Found multiple dates: {', '.join(sorted(unique_dates))}"
				)

			# Selected date cannot be in the past
			from frappe.utils import today

			today_date = getdate(today())
			for exp_id, sel_date in selected_date_map.items():
				if getdate(sel_date) < today_date:
					return validation_error(f"Slot date {sel_date} for experience {exp_id} is in the past")

		# All experiences must be ONLINE (includes hotel experiences)
		all_exp_ids = [
			item.get("experience_id") for item in experiences_with_slots if item.get("experience_id")
		]
		for exp_id in all_exp_ids:
			exp_status = frappe.db.get_value("Cheese Experience", exp_id, "status")
			if exp_status != "ONLINE":
				return validation_error(f"Experience {exp_id} is not ONLINE (status: {exp_status})")

		# Slots must not overlap in time + build slot_time_data for time window validation
		# Only non-hotel slots participate in overlap checks (hotels have no fixed time_from/time_to)
		slot_time_data: dict = {}
		for sl_id in slot_map.values():
			t_from, t_to = frappe.db.get_value("Cheese Experience Slot", sl_id, ["time_from", "time_to"])
			slot_time_data[sl_id] = {
				"time_from": str(t_from) if t_from else None,
				"time_to": str(t_to) if t_to else None,
			}

		if len(slot_map) > 1:
			slot_ids = list(slot_time_data.keys())
			for i in range(len(slot_ids)):
				for j in range(i + 1, len(slot_ids)):
					s1 = slot_time_data[slot_ids[i]]
					s2 = slot_time_data[slot_ids[j]]
					if not _slots_compatible(
						s1["time_from"],
						s1["time_to"],
						s2["time_from"],
						s2["time_to"],
					):
						return validation_error(
							f"Slots overlap: {slot_ids[i]} ({s1['time_from']}-{s1['time_to']}) "
							f"and {slot_ids[j]} ({s2['time_from']}-{s2['time_to']})"
						)

		# Validate explicit slots fall within requested time window (if time_from/time_to provided)
		if (normalized_time_from or normalized_time_to) and slot_time_data:
			all_times = list(slot_time_data.values())
			seconds_starts = [
				_time_to_seconds(s["time_from"])
				for s in all_times
				if _time_to_seconds(s["time_from"]) is not None
			]
			seconds_ends = [
				_time_to_seconds(s["time_to"])
				for s in all_times
				if _time_to_seconds(s["time_to"]) is not None
			]
			min_start = min(seconds_starts) if seconds_starts else None
			max_end = max(seconds_ends) if seconds_ends else None
			window_from = _time_to_seconds(normalized_time_from)
			window_to = _time_to_seconds(normalized_time_to)
			if normalized_time_from and min_start is not None and min_start < window_from:
				return validation_error(
					f"The earliest slot starts before the requested time_from ({normalized_time_from})"
				)
			if normalized_time_to and max_end is not None and max_end > window_to:
				return validation_error(
					f"The latest slot ends after the requested time_to ({normalized_time_to})"
				)

		# If the route includes hotel experiences, date_to must be after date_from (minimum 1 night)
		if start_date and end_date and end_date <= start_date:
			route_has_hotel = any(
				frappe.db.get_value("Cheese Experience", exp_row.experience, "experience_type") == "HOTEL"
				for exp_row in route.experiences
			)
			if route_has_hotel:
				return validation_error(
					"Route includes hotel experiences: date_to must be after date_from (minimum 1 night)"
				)

		# Verify all route experiences have slots
		route_experiences = route.experiences
		if not route_experiences or len(route_experiences) == 0:
			return validation_error("Route has no experiences")

		# Final total will be derived from created ticket totals.
		total_price = 0
		deposit_amount = 0
		deposit_required = False

		# Create RouteBooking doctype
		route_booking = frappe.get_doc(
			{
				"doctype": "Cheese Route Booking",
				"contact": contact_id,
				"route": route_id,
				"status": "PENDING",
				"total_price": total_price,
				"deposit_required": deposit_required,
				"deposit_amount": deposit_amount,
				"conversation": conversation_id,
			}
		)
		route_booking.insert()

		# Create tickets for each experience in the route
		tickets = []
		creation_times = []

		for exp_row in route.experiences:
			experience_id = exp_row.experience
			ticket_selected_date = selected_date_map.get(experience_id)

			experience_doc = frappe.get_doc("Cheese Experience", experience_id)
			is_hotel = experience_doc.experience_type == "HOTEL"
			check_in = str(start_date) if is_hotel and start_date else None
			check_out = str(end_date) if is_hotel and end_date else None
			rooms = party_size if is_hotel else None

			if is_hotel:
				# Auto-resolve the slot for the check_in night
				if not start_date:
					route_booking.delete()
					frappe.db.rollback()
					return validation_error(
						"date_from (check-in) is required when the route includes hotel experiences"
					)
				night_slots = frappe.get_all(
					"Cheese Experience Slot",
					filters={
						"experience": experience_id,
						"date_from": ["<=", start_date],
						"date_to": [">=", start_date],
						"slot_status": ["in", ["OPEN", "CLOSED"]],
					},
					fields=["name"],
					order_by="date_from asc",
					limit=1,
				)
				if not night_slots:
					route_booking.delete()
					frappe.db.rollback()
					return validation_error(
						f"No available slot found for hotel {experience_id} on check-in date {start_date}"
					)
				slot_id = night_slots[0].name
			else:
				slot_id = slot_map.get(experience_id)
				if not slot_id:
					route_booking.delete()
					frappe.db.rollback()
					return validation_error(
						f"No slot provided for experience {experience_id} at sequence {exp_row.sequence}"
					)

			ticket_result = create_pending_ticket(
				contact_id,
				experience_id,
				slot_id,
				party_size,
				selected_date=ticket_selected_date,
				route_id=route_id,
				check_in_date=check_in,
				check_out_date=check_out,
				rooms_requested=rooms,
				notes=notes,
			)

			if not ticket_result.get("success"):
				# Rollback created tickets and route booking
				for ticket in tickets:
					try:
						ticket_doc = frappe.get_doc("Cheese Ticket", ticket)
						ticket_doc.status = "CANCELLED"
						ticket_doc.save()
						update_slot_capacity(ticket_doc.slot)
					except Exception:
						pass
				route_booking.delete()
				frappe.db.rollback()
				return ticket_result

			ticket_id = ticket_result.get("data", {}).get("ticket_id")
			ticket_doc = frappe.get_doc("Cheese Ticket", ticket_id)
			creation_times.append(ticket_doc.creation)

			# Link ticket to route and route booking
			ticket_doc.route = route_id
			if conversation_id:
				ticket_doc.conversation = conversation_id
			ticket_doc.save()

			# Add ticket to route booking child table
			route_booking.append(
				"tickets",
				{
					"ticket": ticket_id,
					"experience": experience_id,
					"slot": slot_id,
					"party_size": party_size,
					"status": ticket_doc.status,
				},
			)

			tickets.append(ticket_id)

		# Calculate deposit required/amount based on included experiences (ticket deposits).
		# Route-level deposit fields should not override experience deposit rules here.
		deposit_amount = 0
		deposit_due_candidates = []
		reservation_now = now_datetime()
		for ticket_id in tickets:
			ticket_doc = frappe.get_doc("Cheese Ticket", ticket_id)
			deposit_amount += ticket_doc.deposit_amount or 0
			if ticket_doc.deposit_required and (ticket_doc.deposit_amount or 0) > 0:
				exp_doc = frappe.get_doc("Cheese Experience", ticket_doc.experience)
				hours = exp_doc.deposit_ttl_hours or 24
				deposit_due_candidates.append(add_to_date(reservation_now, hours=hours, as_string=False))

		deposit_required = deposit_amount > 0
		deposit_due_at = (
			min(deposit_due_candidates)
			if deposit_due_candidates
			else add_to_date(reservation_now, hours=route.deposit_ttl_hours or 24, as_string=False)
		)

		route_booking.deposit_required = deposit_required
		route_booking.deposit_amount = deposit_amount

		# Calculate status and save route booking
		route_booking.calculate_status()
		route_booking.save()
		total_price = route_booking.total_price or 0

		# Create deposit if required
		if deposit_required and deposit_amount > 0:
			due_at = deposit_due_at
			deposit = frappe.get_doc(
				{
					"doctype": "Cheese Deposit",
					"entity_type": "Cheese Route Booking",
					"entity_id": route_booking.name,
					"amount_required": deposit_amount,
					"status": "PENDING",
					"due_at": due_at,
				}
			)
			deposit.insert()

		frappe.db.commit()

		booked_schedule = []
		for ticket_id in tickets:
			ticket_doc = frappe.get_doc("Cheese Ticket", ticket_id)
			slot_doc = frappe.get_doc("Cheese Experience Slot", ticket_doc.slot)
			schedule_date = (
				str(ticket_doc.selected_date) if ticket_doc.selected_date else str(slot_doc.date_from)
			)
			time_from_value = str(slot_doc.time_from) if slot_doc.time_from else None
			time_to_value = str(slot_doc.time_to) if slot_doc.time_to else None
			booked_schedule.append(
				{
					"ticket_id": ticket_doc.name,
					"experience_id": ticket_doc.experience,
					"slot_id": ticket_doc.slot,
					"selected_date": schedule_date,
					"time_from": time_from_value,
					"time_to": time_to_value,
					"scheduled_start": f"{schedule_date} {time_from_value}"
					if time_from_value
					else schedule_date,
					"scheduled_end": f"{schedule_date} {time_to_value}" if time_to_value else None,
					# Backward-compatible field for clients that still consume a single time value.
					"time": time_from_value,
					"notes": ticket_doc.notes if ticket_doc.notes else None,
				}
			)

		return created(
			"Route reservation created successfully",
			{
				"route_booking_id": route_booking.name,
				"route_id": route_id,
				"contact_id": contact_id,
				"party_size": party_size,
				"status": route_booking.status,
				"total_price": route_booking.total_price or total_price,
				"deposit_required": deposit_required,
				"deposit_amount": deposit_amount,
				"tickets": tickets,
				"tickets_count": len(tickets),
				"booked_schedule": booked_schedule,
				"requested_time_from": normalized_time_from,
				"requested_time_to": normalized_time_to,
				"conversation_id": conversation_id,
			},
		)
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except Exception as e:
		frappe.log_error(f"Error in create_route_reservation: {e!s}")
		return error("Failed to create route reservation", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def get_route_status(route_booking_id):
	"""
	Get route status - returns PENDING / PARTIALLY_CONFIRMED / CONFIRMED

	Args:
		route_booking_id: Route booking ID

	Returns:
		Success response with route status
	"""
	try:
		if not route_booking_id:
			return validation_error("route_booking_id is required")

		# Check if it's a RouteBooking doctype name
		if not frappe.db.exists("Cheese Route Booking", route_booking_id):
			# Try legacy format (RB-ticket_id)
			if route_booking_id.startswith("RB-"):
				ticket_id = route_booking_id.replace("RB-", "")
				# Try to find route booking by ticket
				route_booking_name = frappe.db.get_value(
					"Cheese Route Booking Ticket", {"ticket": ticket_id}, "parent"
				)
				if route_booking_name:
					route_booking_id = route_booking_name
				else:
					return not_found("Route Booking", route_booking_id)
			else:
				return not_found("Route Booking", route_booking_id)

		route_booking = frappe.get_doc("Cheese Route Booking", route_booking_id)
		if not frappe.has_permission("Cheese Route Booking", "read", route_booking):
			return _permission_denied("Not permitted to access this route booking")
		if not _has_route_booking_company_access(route_booking):
			return _permission_denied("Not permitted to access this route booking")

		# Refresh status from tickets
		route_booking.calculate_status()
		if route_booking.has_value_changed("status"):
			route_booking.save()

		# Get ticket details
		tickets = []
		for ticket_row in route_booking.tickets:
			if ticket_row.ticket:
				ticket = frappe.get_doc("Cheese Ticket", ticket_row.ticket)
				slot = frappe.get_doc("Cheese Experience Slot", ticket.slot)

				# Use selected_date if available, otherwise fall back to slot.date_from
				display_date = str(ticket.selected_date) if ticket.selected_date else str(slot.date_from)

				tickets.append(
					{
						"ticket_id": ticket.name,
						"status": ticket.status,
						"experience": ticket.experience,
						"slot": ticket.slot,
						"party_size": ticket.party_size,
						"slot_date": display_date,
					}
				)

		return success(
			"Route status retrieved successfully",
			{
				"route_booking_id": route_booking.name,
				"route_id": route_booking.route,
				"status": route_booking.status,
				"tickets": tickets,
				"tickets_count": len(tickets),
				"confirmed_count": len([t for t in tickets if t["status"] == "CONFIRMED"]),
				"pending_count": len([t for t in tickets if t["status"] == "PENDING"]),
				"total_price": route_booking.total_price,
				"deposit_required": route_booking.deposit_required,
				"deposit_amount": route_booking.deposit_amount,
			},
		)
	except Exception as e:
		frappe.log_error(f"Error in get_route_status: {e!s}")
		return error("Failed to get route status", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def get_route_summary(route_booking_id):
	"""
	Get route summary / itinerary - user-friendly summary

	Args:
		route_booking_id: Route booking ID

	Returns:
		Success response with route summary
	"""
	try:
		if not route_booking_id:
			return validation_error("route_booking_id is required")

		if not frappe.db.exists("Cheese Route Booking", route_booking_id):
			# Try legacy format
			if route_booking_id.startswith("RB-"):
				ticket_id = route_booking_id.replace("RB-", "")
				route_booking_name = frappe.db.get_value(
					"Cheese Route Booking Ticket", {"ticket": ticket_id}, "parent"
				)
				if route_booking_name:
					route_booking_id = route_booking_name
				else:
					return not_found("Route Booking", route_booking_id)
			else:
				return not_found("Route Booking", route_booking_id)

		route_booking = frappe.get_doc("Cheese Route Booking", route_booking_id)
		if not frappe.has_permission("Cheese Route Booking", "read", route_booking):
			return _permission_denied("Not permitted to access this route booking")
		if not _has_route_booking_company_access(route_booking):
			return _permission_denied("Not permitted to access this route booking")
		route = frappe.get_doc("Cheese Route", route_booking.route)

		# Build itinerary from tickets with financial data
		itinerary = []
		total_advance_paid = 0
		total_advance_required = 0
		total_all_paid = 0
		grand_total = 0

		for ticket_row in route_booking.tickets:
			if ticket_row.ticket:
				ticket = frappe.get_doc("Cheese Ticket", ticket_row.ticket)
				slot = frappe.get_doc("Cheese Experience Slot", ticket.slot)
				experience = frappe.get_doc("Cheese Experience", ticket.experience)

				# Use selected_date if available, otherwise fall back to slot.date_from
				display_date = str(ticket.selected_date) if ticket.selected_date else str(slot.date_from)
				display_time = str(slot.time_from) if slot.time_from else None
				display_time_to = str(slot.time_to) if slot.time_to else None

				# Financial data: rely on ticket total so HOTEL/nightly pricing is preserved.
				total_per_ticket = ticket.total_price or 0
				unit_cost = (
					(total_per_ticket / (ticket.party_size or 1))
					if (ticket.party_size or 1) > 0
					else total_per_ticket
				)
				deposit_amount = ticket.deposit_amount or 0

				# Fetch deposit records for this ticket
				deposits = frappe.get_all(
					"Cheese Deposit",
					filters={
						"entity_type": "Cheese Ticket",
						"entity_id": ticket.name,
						"status": ["not in", ["CANCELLED", "REFUNDED"]],
					},
					fields=["name", "status", "amount_required", "amount_paid"],
					order_by="creation asc",
				)
				deposit_paid = sum(d.amount_paid or 0 for d in deposits)
				remaining_balance = total_per_ticket - deposit_paid
				advance_paid = min(deposit_paid, deposit_amount)
				if deposit_amount <= 0:
					deposit_status = "NONE"
				elif advance_paid >= deposit_amount:
					deposit_status = "PAID"
				elif any(d.status in ("PENDING", "OVERDUE") for d in deposits):
					deposit_status = "PENDING"
				elif deposits:
					deposit_status = deposits[-1].status
				else:
					deposit_status = "NONE"
				balance_status = "PAID" if remaining_balance <= 0 else "PENDING"

				total_advance_required += deposit_amount
				total_advance_paid += advance_paid
				total_all_paid += deposit_paid
				grand_total += total_per_ticket

				itinerary.append(
					{
						"ticket_id": ticket.name,
						"experience_id": experience.name,
						"experience_name": experience.name,
						"date": display_date,
						"time": display_time,
						"time_from": display_time,
						"time_to": display_time_to,
						"scheduled_start": f"{display_date} {display_time}" if display_time else display_date,
						"scheduled_end": f"{display_date} {display_time_to}" if display_time_to else None,
						"status": ticket.status,
						"party_size": ticket.party_size,
						"notes": ticket.notes if ticket.notes else None,
						# Financial fields
						"unit_cost": unit_cost,
						"total_per_ticket": total_per_ticket,
						"deposit_amount": deposit_amount,
						"deposit_status": deposit_status,
						"deposit_paid": deposit_paid,
						"remaining_balance": max(remaining_balance, 0),
						"balance_status": balance_status,
					}
				)

		# Sort by date/time
		itinerary.sort(key=lambda x: (x["date"], x["time"]))

		# Booking-level payment summary
		payment_summary = {
			"grand_total": grand_total,
			"total_advance_required": total_advance_required,
			"total_advance_paid": total_advance_paid,
			"advance_pending": max(0, total_advance_required - total_advance_paid),
			"total_paid": total_all_paid,
			"total_pending": max(0, grand_total - total_all_paid),
			"remaining_balance": max(0, grand_total - total_all_paid),
		}

		return success(
			"Route summary retrieved successfully",
			{
				"route_booking_id": route_booking.name,
				"route_id": route_booking.route,
				"route_name": route.name,
				"status": route_booking.status,
				"party_size": itinerary[0]["party_size"] if itinerary else 0,
				"total_price": route_booking.total_price,
				"deposit_required": route_booking.deposit_required,
				"deposit_amount": route_booking.deposit_amount,
				"itinerary": itinerary,
				"total_experiences": len(itinerary),
				"payment_summary": payment_summary,
			},
		)
	except Exception as e:
		frappe.log_error(f"Error in get_route_summary: {e!s}")
		return error("Failed to get route summary", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def modify_route_booking_preview(route_booking_id, changes):
	"""
	Modify route booking preview - preview changes

	Args:
		route_booking_id: Route booking ID
		changes: JSON object with changes {"ticket_id": "TICKET-001", "new_slot": "SLOT-002", "party_size": 3}

	Returns:
		Success response with preview of changes
	"""
	try:
		if not route_booking_id:
			return validation_error("route_booking_id is required")
		if not changes:
			return validation_error("changes is required")

		# Parse changes
		if isinstance(changes, str):
			try:
				changes = json.loads(changes)
			except Exception as e:
				return validation_error(f"Invalid changes format: {e!s}")

		# Get route status
		status_result = get_route_status(route_booking_id)
		if not status_result.get("success"):
			return status_result

		status_data = status_result.get("data", {})
		tickets = status_result.get("data", {}).get("tickets", [])

		# Preview changes
		preview_changes = []
		for change in changes if isinstance(changes, list) else [changes]:
			ticket_id = change.get("ticket_id")
			if not ticket_id:
				return validation_error("ticket_id is required in changes")

			ticket = frappe.get_doc("Cheese Ticket", ticket_id)

			preview = {
				"ticket_id": ticket_id,
				"current_slot": ticket.slot,
				"current_party_size": ticket.party_size,
			}

			if "new_slot" in change:
				preview["new_slot"] = change["new_slot"]
				preview["slot_changed"] = True

			if "party_size" in change:
				preview["new_party_size"] = change["party_size"]
				preview["party_size_changed"] = True

			preview_changes.append(preview)

		return success(
			"Route booking modification preview",
			{
				"route_booking_id": route_booking_id,
				"changes": preview_changes,
				"note": "Call confirm_route_modification to apply changes",
			},
		)
	except Exception as e:
		frappe.log_error(f"Error in modify_route_booking_preview: {e!s}")
		return error("Failed to preview route booking modification", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def confirm_route_modification(route_booking_id, changes):
	"""
	Confirm route modification - apply changes

	Args:
		route_booking_id: Route booking ID
		changes: JSON object with changes (same format as preview)

	Returns:
		Success response with updated route booking
	"""
	try:
		if not route_booking_id:
			return validation_error("route_booking_id is required")
		if not changes:
			return validation_error("changes is required")

		# Parse changes
		if isinstance(changes, str):
			try:
				changes = json.loads(changes)
			except Exception as e:
				return validation_error(f"Invalid changes format: {e!s}")

		# Tenant isolation: scoped users may only modify their own bookings.
		if frappe.db.exists("Cheese Route Booking", route_booking_id):
			try:
				assert_record_access("Cheese Route Booking", route_booking_id)
			except frappe.PermissionError:
				return _permission_denied("Not permitted to modify this route booking")

		# Apply changes using ticket modification
		from cheese.api.v1.ticket_controller import modify_ticket

		modified_tickets = []
		for change in changes if isinstance(changes, list) else [changes]:
			ticket_id = change.get("ticket_id")
			new_slot = change.get("new_slot")
			party_size = change.get("party_size")

			result = modify_ticket(ticket_id, new_slot=new_slot, party_size=party_size)
			if result.get("success"):
				modified_tickets.append(ticket_id)
			else:
				return result

		frappe.db.commit()

		# Get updated route status
		status_result = get_route_status(route_booking_id)

		return success(
			"Route booking modified successfully",
			{
				"route_booking_id": route_booking_id,
				"modified_tickets": modified_tickets,
				"updated_status": status_result.get("data", {}) if status_result.get("success") else None,
			},
		)
	except Exception as e:
		frappe.log_error(f"Error in confirm_route_modification: {e!s}")
		return error("Failed to confirm route modification", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def add_activities_to_route_preview(route_booking_id, activities):
	"""
	Add activities to route preview - preview add-ons

	Args:
		route_booking_id: Route booking ID
		activities: JSON array of activities to add [{"experience_id": "EXP-001", "slot_id": "SLOT-001"}]

	Returns:
		Success response with preview
	"""
	try:
		if not route_booking_id:
			return validation_error("route_booking_id is required")
		if not activities:
			return validation_error("activities is required")

		# Parse activities
		if isinstance(activities, str):
			try:
				activities = json.loads(activities)
			except Exception as e:
				return validation_error(f"Invalid activities format: {e!s}")

		# Get route status
		status_result = get_route_status(route_booking_id)
		if not status_result.get("success"):
			return status_result

		status_data = status_result.get("data", {})
		party_size = (
			status_data.get("tickets", [{}])[0].get("party_size", 1) if status_data.get("tickets") else 1
		)

		# Preview new activities
		preview_activities = []
		for activity in activities:
			experience_id = activity.get("experience_id")
			slot_id = activity.get("slot_id")

			if not experience_id or not slot_id:
				return validation_error("experience_id and slot_id are required for each activity")

			if not frappe.db.exists("Cheese Experience", experience_id):
				return not_found("Experience", experience_id)

			if not frappe.db.exists("Cheese Experience Slot", slot_id):
				return not_found("Slot", slot_id)

			experience = frappe.get_doc("Cheese Experience", experience_id)
			slot = frappe.get_doc("Cheese Experience Slot", slot_id)
			selected_date = (
				activity.get("selected_date") or activity.get("calendar_date") or activity.get("date")
			)

			# Calculate price
			from cheese.cheese.utils.pricing import calculate_deposit_amount, calculate_ticket_price

			price_data = calculate_ticket_price(experience_id, party_size)
			deposit = calculate_deposit_amount(experience_id, price_data.get("total_price", 0))

			preview_activities.append(
				{
					"experience_id": experience_id,
					"experience_name": experience.name,
					"slot_id": slot_id,
					"selected_date": str(selected_date) if selected_date else str(slot.date_from),
					"date": str(selected_date) if selected_date else str(slot.date_from),
					"date_from": str(slot.date_from),
					"date_to": str(slot.date_to),
					"time_from": str(slot.time_from) if slot.time_from else None,
					"time_to": str(slot.time_to) if slot.time_to else None,
					"time": str(slot.time_from) if slot.time_from else None,
					"price": price_data.get("total_price", 0),
					"deposit": deposit,
					"party_size": party_size,
				}
			)

		# Calculate total additional cost
		total_additional_price = sum(a["price"] for a in preview_activities)
		total_additional_deposit = sum(a["deposit"] for a in preview_activities)

		return success(
			"Add activities preview",
			{
				"route_booking_id": route_booking_id,
				"activities_to_add": preview_activities,
				"total_additional_price": total_additional_price,
				"total_additional_deposit": total_additional_deposit,
				"note": "Call confirm_add_activities_to_route to apply",
			},
		)
	except Exception as e:
		frappe.log_error(f"Error in add_activities_to_route_preview: {e!s}")
		return error("Failed to preview add activities", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def confirm_add_activities_to_route(route_booking_id, activities):
	"""
	Confirm add activities to route - apply add-ons

	Args:
		route_booking_id: Route booking ID
		activities: JSON array of activities to add

	Returns:
		Success response with updated route booking
	"""
	try:
		if not route_booking_id:
			return validation_error("route_booking_id is required")
		if not activities:
			return validation_error("activities is required")

		# Parse activities
		if isinstance(activities, str):
			try:
				activities = json.loads(activities)
			except Exception as e:
				return validation_error(f"Invalid activities format: {e!s}")

		# Get route booking
		if not frappe.db.exists("Cheese Route Booking", route_booking_id):
			if route_booking_id.startswith("RB-"):
				ticket_id = route_booking_id.replace("RB-", "")
				route_booking_name = frappe.db.get_value(
					"Cheese Route Booking Ticket", {"ticket": ticket_id}, "parent"
				)
				if route_booking_name:
					route_booking_id = route_booking_name
				else:
					return not_found("Route Booking", route_booking_id)
			else:
				return not_found("Route Booking", route_booking_id)

		route_booking = frappe.get_doc("Cheese Route Booking", route_booking_id)
		if not frappe.has_permission("Cheese Route Booking", "write", route_booking):
			return _permission_denied("Not permitted to modify this route booking")
		if not _has_route_booking_company_access(route_booking):
			return _permission_denied("Not permitted to modify this route booking")

		if not route_booking.tickets or len(route_booking.tickets) == 0:
			return not_found("Route Booking", route_booking_id)

		first_ticket = frappe.get_doc("Cheese Ticket", route_booking.tickets[0].ticket)
		contact_id = route_booking.contact
		route_id = route_booking.route
		party_size = first_ticket.party_size

		# Create tickets for new activities
		new_tickets = []
		for activity in activities:
			experience_id = activity.get("experience_id")
			slot_id = activity.get("slot_id")
			selected_date = (
				activity.get("selected_date") or activity.get("calendar_date") or activity.get("date")
			)

			ticket_result = create_pending_ticket(
				contact_id,
				experience_id,
				slot_id,
				party_size,
				selected_date=selected_date,
				route_id=route_id,
				notes=activity.get("notes"),
			)
			if not ticket_result.get("success"):
				# Rollback
				for ticket_id in new_tickets:
					try:
						ticket_doc = frappe.get_doc("Cheese Ticket", ticket_id)
						ticket_doc.status = "CANCELLED"
						ticket_doc.save()
						update_slot_capacity(ticket_doc.slot)
					except Exception:
						pass
				return ticket_result

			ticket_id = ticket_result.get("data", {}).get("ticket_id")

			# Link to route and route booking
			ticket_doc = frappe.get_doc("Cheese Ticket", ticket_id)
			ticket_doc.route = route_id
			ticket_doc.save()

			# Add to route booking
			route_booking.append(
				"tickets",
				{
					"ticket": ticket_id,
					"experience": experience_id,
					"slot": slot_id,
					"party_size": party_size,
					"status": ticket_doc.status,
				},
			)

			new_tickets.append(ticket_id)

		# Recalculate status and save
		route_booking.calculate_status()
		route_booking.save()

		frappe.db.commit()

		return success(
			"Activities added to route successfully",
			{
				"route_booking_id": route_booking.name,
				"new_tickets": new_tickets,
				"status": route_booking.status,
				"tickets_count": len(route_booking.tickets),
			},
		)
	except Exception as e:
		frappe.log_error(f"Error in confirm_add_activities_to_route: {e!s}")
		return error("Failed to add activities to route", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def cancel_route_booking(route_booking_id, reason=None):
	"""
	Cancel route booking

	Args:
		route_booking_id: Route booking ID
		reason: Cancellation reason (optional)

	Returns:
		Success response
	"""
	try:
		if not route_booking_id:
			return validation_error("route_booking_id is required")

		# Handle legacy format
		if not frappe.db.exists("Cheese Route Booking", route_booking_id):
			if route_booking_id.startswith("RB-"):
				ticket_id = route_booking_id.replace("RB-", "")
				route_booking_name = frappe.db.get_value(
					"Cheese Route Booking Ticket", {"ticket": ticket_id}, "parent"
				)
				if route_booking_name:
					route_booking_id = route_booking_name
				else:
					return not_found("Route Booking", route_booking_id)
			else:
				return not_found("Route Booking", route_booking_id)

		route_booking = frappe.get_doc("Cheese Route Booking", route_booking_id)
		if not frappe.has_permission("Cheese Route Booking", "write", route_booking):
			return _permission_denied("Not permitted to cancel this route booking")
		if not _has_route_booking_company_access(route_booking):
			return _permission_denied("Not permitted to cancel this route booking")

		if route_booking.status == "CANCELLED":
			return success(
				"Route booking is already cancelled",
				{"route_booking_id": route_booking_id, "status": route_booking.status},
			)

		# Cancel all tickets
		from cheese.api.v1.ticket_controller import cancel_ticket

		cancelled_tickets = []
		for ticket_row in route_booking.tickets:
			if ticket_row.ticket:
				ticket = frappe.get_doc("Cheese Ticket", ticket_row.ticket)
				if ticket.status in ["PENDING", "CONFIRMED"]:
					result = cancel_ticket(ticket.name)
					if result.get("success"):
						cancelled_tickets.append(ticket.name)
					else:
						return result

		# Update route booking status
		route_booking.calculate_status()
		route_booking.save()

		frappe.db.commit()

		return success(
			"Route booking cancelled successfully",
			{
				"route_booking_id": route_booking.name,
				"cancelled_tickets": cancelled_tickets,
				"status": route_booking.status,
				"reason": reason,
			},
		)
	except Exception as e:
		frappe.log_error(f"Error in cancel_route_booking: {e!s}")
		return error("Failed to cancel route booking", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def get_available_slots_for_route(route_id, selected_date=None, date_from=None, date_to=None, party_size=1):
	"""
	Get available time slots for each experience in a route, given a selected date.

	The bot calls this so the customer can pick a specific date/time.

	Args:
		route_id: Cheese Route ID
		selected_date: The date the customer selected (YYYY-MM-DD). Takes priority over date_from/date_to.
		date_from: Start date (YYYY-MM-DD) — fallback if selected_date not provided
		date_to: End date (YYYY-MM-DD) — fallback, defaults to date_from
		party_size: Minimum available capacity required (default 1)

	Returns:
		Success response with available slots grouped by experience
	"""
	try:
		if not route_id:
			return validation_error("route_id is required")

		# Resolve the effective date range
		if selected_date:
			date_from = selected_date
			date_to = selected_date
		elif not date_from:
			return validation_error("selected_date (or date_from) is required")

		if not frappe.db.exists("Cheese Route", route_id):
			return not_found("Route", route_id)

		try:
			assert_route_access(route_id)
		except frappe.PermissionError:
			return _permission_denied("Not permitted to access this route")

		route = frappe.get_doc("Cheese Route", route_id)
		if route.status != "ONLINE":
			return validation_error(f"Route {route_id} is not ONLINE. Current status: {route.status}")

		try:
			party_size = int(party_size)
		except (ValueError, TypeError):
			return validation_error("party_size must be a number")

		start_date = getdate(date_from)
		end_date = getdate(date_to) if date_to else start_date

		if end_date < start_date:
			return validation_error("date_to must be >= date_from")

		experiences_result = []
		for exp_row in route.experiences:
			experience_id = exp_row.experience
			if not frappe.db.exists("Cheese Experience", experience_id):
				continue

			experience = frappe.get_doc("Cheese Experience", experience_id)

			slot_filters = {
				"experience": experience_id,
				"slot_status": ["in", ["OPEN", "CLOSED"]],
				"date_from": ["<=", end_date],
				"date_to": [">=", start_date],
			}

			slots = frappe.get_all(
				"Cheese Experience Slot",
				filters=slot_filters,
				fields=["name", "date_from", "date_to", "time_from", "time_to", "max_capacity"],
				order_by="date_from asc, time_from asc",
			)

			available_slots = []
			for slot in slots:
				days = slot_calendar_days_in_range(slot.date_from, slot.date_to, start_date, end_date)
				for cal_day in days:
					available = get_available_capacity(slot.name, cal_day)
					if available < party_size:
						continue
					available_slots.append(
						{
							"slot_id": slot.name,
							"selected_date": str(cal_day),
							"calendar_date": str(cal_day),
							"date_from": str(slot.date_from),
							"date_to": str(slot.date_to),
							"time_from": str(slot.time_from) if slot.time_from else None,
							"time_to": str(slot.time_to) if slot.time_to else None,
							"max_capacity": slot.max_capacity,
							"available_capacity": available,
						}
					)

			experiences_result.append(
				{
					"experience_id": experience_id,
					"experience_name": experience.name,
					"sequence": exp_row.sequence if hasattr(exp_row, "sequence") else exp_row.idx,
					"available_slots": available_slots,
					"available_count": len(available_slots),
				}
			)

		return success(
			"Available slots retrieved successfully",
			{
				"route_id": route_id,
				"selected_date": str(start_date),
				"date_from": str(start_date),
				"date_to": str(end_date),
				"party_size": party_size,
				"experiences": experiences_result,
				"all_available": all(e["available_count"] > 0 for e in experiences_result),
			},
		)
	except Exception as e:
		frappe.log_error(f"Error in get_available_slots_for_route: {e!s}")
		return error("Failed to get available slots", "SERVER_ERROR", {"error": str(e)}, 500)
