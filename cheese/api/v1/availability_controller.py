# Copyright (c) 2024
# License: MIT

import frappe
from frappe import _
from frappe.utils import getdate
from cheese.cheese.utils.capacity import get_available_capacity, slot_calendar_days_in_range
from cheese.api.common.responses import success, error, not_found, validation_error


@frappe.whitelist()
def get_available_slots(experience_id=None, date=None, date_from=None, date_to=None):
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

		# If experience_id provided, validate and filter
		if experience_id:
			if not frappe.db.exists("Cheese Experience", experience_id):
				return not_found("Experience", experience_id)
			slot_filters["experience"] = experience_id
			experience = frappe.get_doc("Cheese Experience", experience_id)
		
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
			days = slot_calendar_days_in_range(slot.date_from, slot.date_to, date_from_obj, date_to_obj)
			for cal_day in days:
				available = get_available_capacity(slot.name, selected_date=cal_day)
				live_status = "OPEN" if available > 0 else "CLOSED"
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
					"slot_status": live_status,
					"is_available": available > 0,
				}
				# Backward compatibility: `date` is the occurrence day for this row
				slot_data["date"] = str(cal_day)
				slot_data["time"] = str(slot.time_from) if slot.time_from is not None else None

				if not experience_id:
					slot_data["experience_id"] = slot.experience
					exp_name = frappe.db.get_value("Cheese Experience", slot.experience, "name")
					slot_data["experience_name"] = exp_name

				slots_with_availability.append(slot_data)

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
def get_hotel_availability(experience_id, check_in_date, check_out_date):
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
			
		experience = frappe.get_doc("Cheese Experience", experience_id)
		if experience.experience_type != "HOTEL":
			return validation_error("Experience is not a hotel")
			
		# Check availability for each night from check_in to check_out - 1
		current_date = check_in_obj
		bottleneck_capacity = float("inf")
		daily_availability = []
		
		# Get slots for the date range
		slots = frappe.get_all(
			"Cheese Experience Slot",
			filters={
				"experience": experience_id,
				"date_from": ["<", check_out_obj],
				"date_to": [">=", check_in_obj],
				"slot_status": ["in", ["OPEN", "CLOSED"]]
			},
			fields=["name", "date_from", "date_to", "max_capacity"]
		)
		
		# Map slot date to slot id
		slot_map = {getdate(s.date_from): s.name for s in slots if getdate(s.date_from) == getdate(s.date_to)}
		
		while current_date < check_out_obj:
			slot_id = slot_map.get(current_date)
			
			if not slot_id:
				# No slot defined for this night
				available = 0
			else:
				available = get_available_capacity(slot_id, selected_date=current_date)
				
			daily_availability.append({
				"date": str(current_date),
				"available_capacity": available,
				"slot_id": slot_id
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
				"is_available": bottleneck_capacity > 0,
				"daily_availability": daily_availability
			}
		)
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except Exception as e:
		frappe.log_error(f"Error in get_hotel_availability: {str(e)}")
		return error("Failed to get hotel availability", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def get_availability(experience_id=None, date=None, date_from=None, date_to=None):
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
	return get_available_slots(experience_id=experience_id, date=date, date_from=date_from, date_to=date_to)


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
			experiences.append({
				"experience_id": exp_row.experience,
				"experience_name": exp_doc.name,
				"sequence": exp_row.sequence,
				"status": exp_doc.status
			})
		
		# Validate date inputs - support both old (date) and new (date_from/date_to) formats
		if date:
			# Legacy support: single date
			date_from = date
			date_to = date
		
		# If date range is provided, check actual availability
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
