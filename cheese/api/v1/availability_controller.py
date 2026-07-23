# Copyright (c) 2024
# License: MIT

import frappe
from frappe import _
from frappe.utils import add_days, getdate, cint
from cheese.cheese.utils.capacity import get_available_capacity, slot_calendar_days_in_range
from cheese.api.common.responses import success, error, not_found, validation_error
from cheese.api.v1.user_controller import _get_current_user_company


def _hotel_nightly_availability(experience_id, date_from_obj, date_to_obj):
	"""Room-derived availability per day for a HOTEL experience.

	Hotel capacity comes from physical rooms (ACTIVE Cheese Hotel Rooms minus
	rooms taken by an active stay that night) — Cheese Experience Slots are
	never consulted. Returns (rows, total_active_rooms) where each row is
	{"date": "YYYY-MM-DD", "available": int}.
	"""
	from cheese.cheese.utils.room_assignment import ACTIVE_STAY_STATUSES

	active_rooms = frappe.get_all(
		"Cheese Hotel Room",
		filters={"room_type": experience_id, "status": "ACTIVE"},
		pluck="name",
	)
	total = len(active_rooms)
	end_excl = add_days(date_to_obj, 1)
	stays = (
		frappe.get_all(
			"Cheese Room Stay",
			filters={
				"room": ["in", active_rooms],
				"status": ["in", list(ACTIVE_STAY_STATUSES)],
				"check_in": ["<", str(end_excl)],
				"check_out": [">", str(date_from_obj)],
			},
			fields=["room", "check_in", "check_out"],
		)
		if active_rooms
		else []
	)
	rows = []
	cal_day = date_from_obj
	while cal_day <= date_to_obj:
		d = str(cal_day)
		busy = {s.room for s in stays if str(s.check_in) <= d < str(s.check_out)}
		rows.append({"date": d, "available": max(0, total - len(busy))})
		cal_day = add_days(cal_day, 1)
	return rows, total


def _hotel_slot_rows(experience_doc, date_from_obj, date_to_obj, rooms_requested=1, guests=None, include_experience_cols=False):
	"""Room-derived rows shaped like get_available_slots slot entries."""
	rooms_requested = cint(rooms_requested) or 1
	guests = cint(guests) if guests is not None else None
	room_size = cint(
		getattr(experience_doc, "room_size", 0) or getattr(experience_doc, "max_occupancy_per_unit", 0) or 0
	)
	nightly, total = _hotel_nightly_availability(experience_doc.name, date_from_obj, date_to_obj)
	rows = []
	for entry in nightly:
		available = entry["available"]
		fits_guests = True
		if guests:
			fits_guests = room_size > 0 and guests <= room_size * rooms_requested
		is_available = available >= rooms_requested and fits_guests
		row = {
			# Always a string id: bot-side TimeSlot requires slot_id even for
			# full nights (is_available already carries the availability).
			"slot_id": f"NIGHT-{entry['date']}",
			"selected_date": entry["date"],
			"calendar_date": entry["date"],
			"date_from": entry["date"],
			"date_to": entry["date"],
			"time_from": None,
			"time_to": None,
			"max_capacity": total,
			"available_capacity": available,
			"available_rooms": available,
			"room_size": room_size or None,
			"max_guests_available": available * room_size,
			"requested_rooms": rooms_requested,
			"requested_guests": guests,
			"experience_type": "HOTEL",
			"is_room": True,
			"slot_status": "OPEN" if is_available else "CLOSED",
			"is_available": is_available,
			"date": entry["date"],
			"time": None,
		}
		if include_experience_cols:
			row["experience_id"] = experience_doc.name
			row["experience_name"] = experience_doc.name
		rows.append(row)
	return rows


@frappe.whitelist()
def get_available_slots(experience_id=None, date=None, date_from=None, date_to=None, guests=None, rooms_requested=1):
	"""
	Get available slots for an experience or all experiences within a date range
	
	Args:
		experience_id: ID of the experience (optional)
		date: Date string (YYYY-MM-DD) - deprecated, use date_from and date_to instead
		date_from: Start date string (YYYY-MM-DD) - required if date not provided
		date_to: End date string (YYYY-MM-DD) - required if date not provided
		
	Returns:
		Success response with list of available slots, grouped by experience if experience_id not provided
	"""
	try:
		# Validate date inputs - support both old (date) and new (date_from/date_to) formats
		if date:
			# Legacy support: single date
			date_from = date
			date_to = date
		
		if not date_from or not date_to:
			return validation_error("date_from and date_to are required (or use date for single day)")
		
		date_from_obj = getdate(date_from)
		date_to_obj = getdate(date_to)
		
		if date_from_obj > date_to_obj:
			return validation_error("date_from must be before or equal to date_to")

		from frappe.utils import today
		today_obj = getdate(today())
		
		# Prevent querying past dates
		if date_to_obj < today_obj:
			# If the whole range is in the past, return empty early
			slots = []
			date_from_obj = date_to_obj # Just to bypass logic, the query will return [] anyway
		elif date_from_obj < today_obj:
			date_from_obj = today_obj

		# Build filters for slots
		# Slots have date_from and date_to fields, so we need to check for overlap
		# A slot overlaps if: slot.date_from <= date_to AND slot.date_to >= date_from
		slot_filters = {
			"slot_status": ["in", ["OPEN", "CLOSED"]]
		}
		
		# Filter slots that overlap with the requested date range
		# Using OR conditions to find slots that overlap
		slot_filters["date_from"] = ["<=", date_to_obj]
		slot_filters["date_to"] = [">=", date_from_obj]

		user_company = _get_current_user_company()

		# If experience_id provided, validate and filter
		experience = None
		if experience_id:
			if not frappe.db.exists("Cheese Experience", experience_id):
				return not_found("Experience", experience_id)
			if user_company:
				exp_company = frappe.db.get_value("Cheese Experience", experience_id, "company")
				if exp_company != user_company:
					return error("Unauthorized", "UNAUTHORIZED", {}, 403)
			slot_filters["experience"] = experience_id
			experience = frappe.get_doc("Cheese Experience", experience_id)
			# Hotels never use slots: availability derives from physical rooms.
			if experience.experience_type == "HOTEL":
				hotel_rows = (
					_hotel_slot_rows(experience, date_from_obj, date_to_obj, rooms_requested, guests)
					if date_to_obj >= today_obj
					else []
				)
				return success(
					f"Found {len(hotel_rows)} nights for {experience.name} from {date_from} to {date_to}",
					{
						"experience_id": experience_id,
						"experience_name": experience.name,
						"date_from": date_from,
						"date_to": date_to,
						"slots": hotel_rows,
						"total_slots": len(hotel_rows),
						"available_slots": len([s for s in hotel_rows if s["is_available"]]),
					},
				)
		elif user_company:
			allowed_experience_ids = frappe.get_all(
				"Cheese Experience",
				filters={"company": user_company},
				pluck="name",
			)
			if not allowed_experience_ids:
				return success(
					"No slots found for this company",
					{
						"date_from": date_from,
						"date_to": date_to,
						"experiences": [],
						"total_experiences": 0,
						"total_slots": 0,
						"total_available_slots": 0,
					},
				)
			slot_filters["experience"] = ["in", allowed_experience_ids]
		rooms_requested = cint(rooms_requested) or 1
		guests = cint(guests) if guests is not None else None

		# Hotels never use slots: exclude their (legacy) slots from the listing;
		# room-derived rows are appended per hotel experience further below.
		hotel_scope_filters = {"experience_type": "HOTEL"}
		if user_company:
			hotel_scope_filters["company"] = user_company
		hotel_ids = [] if experience_id else frappe.get_all(
			"Cheese Experience", filters=hotel_scope_filters, pluck="name"
		)
		if hotel_ids:
			current = slot_filters.get("experience")
			if isinstance(current, list) and current and current[0] == "in":
				slot_filters["experience"] = ["in", [x for x in current[1] if x not in hotel_ids] or ["__none__"]]
			else:
				slot_filters["experience"] = ["not in", hotel_ids]

		# Get slots
		slots = frappe.get_all(
			"Cheese Experience Slot",
			filters=slot_filters,
			fields=["name", "experience", "date_from", "date_to", "time_from", "time_to", "max_capacity", "slot_status"],
			order_by="date_from asc, time_from asc"
		)

		# One row per (slot × calendar day) in the overlap with the query range — capacity is per day.
		slots_with_availability = []
		for slot in slots:
			slot_experience = experience or frappe.get_doc("Cheese Experience", slot.experience)
			is_hotel = slot_experience.experience_type == "HOTEL"
			room_size = cint(getattr(slot_experience, "room_size", 0) or getattr(slot_experience, "max_occupancy_per_unit", 0) or 0)
			days = slot_calendar_days_in_range(slot.date_from, slot.date_to, date_from_obj, date_to_obj)
			for cal_day in days:
				available = get_available_capacity(slot.name, selected_date=cal_day)
				fits_guests = True
				if is_hotel:
					fits_guests = room_size > 0 and (guests or 1) <= room_size * rooms_requested
				live_status = "OPEN" if available >= rooms_requested and fits_guests else "CLOSED"
				slot_data = {
					"slot_id": slot.name,
					"selected_date": str(cal_day),
					"calendar_date": str(cal_day),
					"date_from": str(slot.date_from) if slot.date_from is not None else None,
					"date_to": str(slot.date_to) if slot.date_to is not None else None,
					"time_from": str(slot.time_from) if slot.time_from is not None else None,
					"time_to": str(slot.time_to) if slot.time_to is not None else None,
					"max_capacity": slot.max_capacity,
					"available_capacity": available,
					"available_rooms": available if is_hotel else None,
					"room_size": room_size if is_hotel else None,
					"max_guests_available": available * room_size if is_hotel else None,
					"requested_rooms": rooms_requested if is_hotel else None,
					"requested_guests": guests if is_hotel else None,
					"experience_type": slot_experience.experience_type,
					"is_room": bool(getattr(slot_experience, "is_room", 0)),
					"slot_status": live_status,
					"is_available": available >= rooms_requested and fits_guests,
				}
				# Backward compatibility: `date` is the occurrence day for this row
				slot_data["date"] = str(cal_day)
				slot_data["time"] = str(slot.time_from) if slot.time_from is not None else None

				if not experience_id:
					slot_data["experience_id"] = slot.experience
					exp_name = frappe.db.get_value("Cheese Experience", slot.experience, "name")
					slot_data["experience_name"] = exp_name

				slots_with_availability.append(slot_data)

		# Append room-derived nightly rows for the hotel experiences in scope
		# (multi-experience listing only; single hotel returns above).
		if not experience_id and date_to_obj >= today_obj:
			online_hotels = frappe.get_all(
				"Cheese Experience",
				filters={**hotel_scope_filters, "status": "ONLINE"},
				pluck="name",
			)
			for hotel_exp_id in online_hotels:
				hotel_doc = frappe.get_doc("Cheese Experience", hotel_exp_id)
				slots_with_availability.extend(
					_hotel_slot_rows(
						hotel_doc, date_from_obj, date_to_obj, rooms_requested, guests,
						include_experience_cols=True,
					)
				)

		# Build response
		if experience_id:
			# Single experience response
			return success(
				f"Found {len(slots_with_availability)} slots for {experience.name} from {date_from} to {date_to}",
				{
					"experience_id": experience_id,
					"experience_name": experience.name,
					"date_from": date_from,
					"date_to": date_to,
					"slots": slots_with_availability,
					"total_slots": len(slots_with_availability),
					"available_slots": len([s for s in slots_with_availability if s["is_available"]])
				}
			)
		else:
			# Multiple experiences - group by experience
			experiences_dict = {}
			for slot in slots_with_availability:
				exp_id = slot["experience_id"]
				if exp_id not in experiences_dict:
					experiences_dict[exp_id] = {
						"experience_id": exp_id,
						"experience_name": slot["experience_name"],
						"slots": []
					}
				experiences_dict[exp_id]["slots"].append(slot)
			
			# Convert to list and add summary
			experiences_list = []
			total_slots = 0
			total_available = 0
			for exp_id, exp_data in experiences_dict.items():
				exp_data["total_slots"] = len(exp_data["slots"])
				exp_data["available_slots"] = len([s for s in exp_data["slots"] if s["is_available"]])
				total_slots += exp_data["total_slots"]
				total_available += exp_data["available_slots"]
				experiences_list.append(exp_data)
			
			return success(
				f"Found {total_slots} slots across {len(experiences_list)} experiences from {date_from} to {date_to}",
				{
					"date_from": date_from,
					"date_to": date_to,
					"experiences": experiences_list,
					"total_experiences": len(experiences_list),
					"total_slots": total_slots,
					"total_available_slots": total_available
				}
			)
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except Exception as e:
		frappe.log_error(f"Error in get_available_slots: {str(e)}")
		return error("Failed to get available slots", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def get_hotel_availability(experience_id, check_in_date, check_out_date, guests=None, rooms_requested=1):
	"""
	Get bottleneck availability for a hotel experience over a date range.
	
	Args:
		experience_id: ID of the hotel experience
		check_in_date: Check-in date (YYYY-MM-DD)
		check_out_date: Check-out date (YYYY-MM-DD)
		
	Returns:
		Success response with bottleneck availability
	"""
	try:
		if not experience_id:
			return validation_error("experience_id is required")
		if not check_in_date or not check_out_date:
			return validation_error("check_in_date and check_out_date are required")
			
		check_in_obj = getdate(check_in_date)
		check_out_obj = getdate(check_out_date)
		
		if check_in_obj >= check_out_obj:
			return validation_error("check_in_date must be before check_out_date")
			
		from frappe.utils import today, add_days
		today_obj = getdate(today())
		
		if check_in_obj < today_obj:
			return validation_error("check_in_date cannot be in the past")
			
		if not frappe.db.exists("Cheese Experience", experience_id):
			return not_found("Experience", experience_id)

		user_company = _get_current_user_company()
		if user_company:
			exp_company = frappe.db.get_value("Cheese Experience", experience_id, "company")
			if exp_company != user_company:
				return error("Unauthorized", "UNAUTHORIZED", {}, 403)
			
		experience = frappe.get_doc("Cheese Experience", experience_id)
		if experience.experience_type != "HOTEL":
			return validation_error("Experience is not a hotel")
		rooms_requested = cint(rooms_requested) or 1
		guests = cint(guests) if guests is not None else None
		room_size = cint(getattr(experience, "room_size", 0) or getattr(experience, "max_occupancy_per_unit", 0) or 0)
		if room_size < 1:
			return validation_error("room_size must be configured for hotel availability")
		if guests and guests > room_size * rooms_requested:
			return validation_error(
				f"Cannot book {guests} guests. This room allows {room_size} guests per room ({room_size * rooms_requested} total for {rooms_requested} rooms)."
			)
			
		# Check availability for each night from check_in to check_out - 1.
		# Derived from physical rooms — Cheese Experience Slots are not used.
		current_date = check_in_obj
		bottleneck_capacity = float("inf")
		daily_availability = []

		nightly, _total_rooms = _hotel_nightly_availability(
			experience_id, check_in_obj, add_days(check_out_obj, -1)
		)
		nightly_by_date = {row["date"]: row["available"] for row in nightly}

		while current_date < check_out_obj:
			available = nightly_by_date.get(str(current_date), 0)
			slot_id = f"NIGHT-{current_date}" if available > 0 else None

			daily_availability.append({
				"date": str(current_date),
				"available_capacity": available,
				"available_rooms": available,
				"room_size": room_size,
				"max_guests_available": available * room_size,
				"slot_id": slot_id,
				"is_available": available >= rooms_requested,
			})
			
			if available < bottleneck_capacity:
				bottleneck_capacity = available
				
			current_date = add_days(current_date, 1)
			
		if bottleneck_capacity == float("inf"):
			bottleneck_capacity = 0
			
		return success(
			"Hotel availability retrieved successfully",
			{
				"experience_id": experience_id,
				"check_in_date": check_in_date,
				"check_out_date": check_out_date,
				"bottleneck_capacity": bottleneck_capacity,
				"bottleneck_rooms": bottleneck_capacity,
				"room_size": room_size,
				"requested_rooms": rooms_requested,
				"requested_guests": guests,
				"max_guests_available": bottleneck_capacity * room_size,
				"is_available": bottleneck_capacity >= rooms_requested,
				"daily_availability": daily_availability
			}
		)
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except Exception as e:
		frappe.log_error(f"Error in get_hotel_availability: {str(e)}")
		return error("Failed to get hotel availability", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def get_availability(experience_id=None, date=None, date_from=None, date_to=None, guests=None, rooms_requested=1):
	"""
	Get availability by experience - alias for get_available_slots
	
	Args:
		experience_id: ID of the experience (optional)
		date: Date string (YYYY-MM-DD) - deprecated, use date_from and date_to instead
		date_from: Start date string (YYYY-MM-DD)
		date_to: End date string (YYYY-MM-DD)
		
	Returns:
		Success response with list of available slots
	"""
	return get_available_slots(
		experience_id=experience_id,
		date=date,
		date_from=date_from,
		date_to=date_to,
		guests=guests,
		rooms_requested=rooms_requested,
	)


@frappe.whitelist()
def get_route_availability(route_id, date=None, date_from=None, date_to=None, party_size=1):
	"""
	Get availability by route - returns aggregated availability or rules to build it
	
	Args:
		route_id: Route ID
		date: Date string (YYYY-MM-DD) - deprecated, use date_from and date_to instead
		date_from: Start date string (YYYY-MM-DD) - required if date not provided
		date_to: End date string (YYYY-MM-DD) - required if date not provided
		party_size: Party size for capacity checks
		
	Returns:
		Success response with route availability information
	"""
	try:
		if not route_id:
			return validation_error("route_id is required")
		
		if not frappe.db.exists("Cheese Route", route_id):
			return not_found("Route", route_id)
		
		route = frappe.get_doc("Cheese Route", route_id)
		user_company = _get_current_user_company()
		
		if route.status != "ONLINE":
			return success(
				"Route is not online",
				{
					"route_id": route_id,
					"status": route.status,
					"available": False,
					"reason": f"Route status is {route.status}"
				}
			)
		
		# Get route experiences
		experiences = []
		for exp_row in route.experiences:
			exp_doc = frappe.get_doc("Cheese Experience", exp_row.experience)
			if user_company and exp_doc.company != user_company:
				# Hide cross-company route segments from establishment users.
				continue
			experiences.append({
				"experience_id": exp_row.experience,
				"experience_name": exp_doc.name,
				"sequence": exp_row.sequence,
				"status": exp_doc.status
			})

		if user_company and not experiences:
			return success(
				"Route availability retrieved successfully",
				{
					"route_id": route_id,
					"available": False,
					"reason": "No experiences in this route belong to your establishment",
					"experiences": [],
				},
			)
		
		# Validate date inputs - support both old (date) and new (date_from/date_to) formats
		if date:
			# Legacy support: single date
			date_from = date
			date_to = date
		
		# If date range is provided, check actual availability
		try:
			party_size = cint(party_size) or 1
		except Exception:
			return validation_error("party_size must be a number")

		if date_from and date_to:
			date_from_obj = getdate(date_from)
			date_to_obj = getdate(date_to)
			
			if date_from_obj > date_to_obj:
				return validation_error("date_from must be before or equal to date_to")
			
			from frappe.utils import today
			today_obj = getdate(today())
			if date_to_obj < today_obj:
				date_from_obj = date_to_obj  # Let it fail to find slots
			elif date_from_obj < today_obj:
				date_from_obj = today_obj
			
			availability_by_experience = []
			all_available = True
			
			for exp in experiences:
				if exp["status"] != "ONLINE":
					all_available = False
					availability_by_experience.append({
						"experience_id": exp["experience_id"],
						"available": False,
						"reason": f"Experience status is {exp['status']}"
					})
					continue

				# Hotel segments derive availability from physical rooms.
				exp_type = frappe.db.get_value(
					"Cheese Experience", exp["experience_id"], "experience_type"
				)
				if exp_type == "HOTEL":
					nightly, _total = _hotel_nightly_availability(
						exp["experience_id"], date_from_obj, date_to_obj
					)
					available_slots = [
						{
							"slot_id": f"NIGHT-{row['date']}",
							"selected_date": row["date"],
							"calendar_date": row["date"],
							"date_from": row["date"],
							"date_to": row["date"],
							"time_from": None,
							"time_to": None,
							"available_capacity": row["available"],
							"date": row["date"],
							"time": None,
						}
						for row in nightly
						if row["available"] >= party_size
					]
					if not available_slots:
						all_available = False
					availability_by_experience.append({
						"experience_id": exp["experience_id"],
						"experience_name": exp["experience_name"],
						"sequence": exp["sequence"],
						"available": bool(available_slots),
						"available_slots": available_slots,
						"available_slots_count": len(available_slots),
					})
					continue

				# Get slots for this experience that overlap with the date range
				# Slots have date_from and date_to fields, so we need to check for overlap
				# A slot overlaps if: slot.date_from <= date_to AND slot.date_to >= date_from
				slots = frappe.get_all(
					"Cheese Experience Slot",
					filters={
						"experience": exp["experience_id"],
						"date_from": ["<=", date_to_obj],
						"date_to": [">=", date_from_obj],
						"slot_status": ["in", ["OPEN", "CLOSED"]],
					},
					fields=["name", "date_from", "date_to", "time_from", "time_to", "max_capacity"]
				)
				
				available_slots = []
				for slot in slots:
					days = slot_calendar_days_in_range(
						slot.date_from, slot.date_to, date_from_obj, date_to_obj
					)
					for cal_day in days:
						available = get_available_capacity(slot.name, selected_date=cal_day)
						if available < party_size:
							continue
						slot_data = {
							"slot_id": slot.name,
							"selected_date": str(cal_day),
							"calendar_date": str(cal_day),
							"date_from": str(slot.date_from) if slot.date_from else None,
							"date_to": str(slot.date_to) if slot.date_to else None,
							"time_from": str(slot.time_from) if slot.time_from else None,
							"time_to": str(slot.time_to) if slot.time_to else None,
							"available_capacity": available,
						}
						slot_data["date"] = str(cal_day)
						slot_data["time"] = str(slot.time_from) if slot.time_from else None
						available_slots.append(slot_data)
				
				if not available_slots:
					all_available = False
				
				availability_by_experience.append({
					"experience_id": exp["experience_id"],
					"experience_name": exp["experience_name"],
					"sequence": exp["sequence"],
					"available": len(available_slots) > 0,
					"available_slots": available_slots,
					"available_slots_count": len(available_slots)
				})
			
			return success(
				"Route availability retrieved successfully",
				{
					"route_id": route_id,
					"date_from": str(date_from_obj),
					"date_to": str(date_to_obj),
					"party_size": party_size,
					"available": all_available,
					"experiences": availability_by_experience
				}
			)
		else:
			# Return general availability rules
			return success(
				"Route availability rules retrieved successfully",
				{
					"route_id": route_id,
					"status": route.status,
					"experiences_count": len(experiences),
					"experiences": experiences,
					"note": "Provide date_from and date_to (or date) to check actual slot availability"
				}
			)
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except Exception as e:
		frappe.log_error(f"Error in get_route_availability: {str(e)}")
		return error("Failed to get route availability", "SERVER_ERROR", {"error": str(e)}, 500)
