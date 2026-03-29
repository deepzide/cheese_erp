# Copyright (c) 2024
# License: MIT

import frappe
from frappe import _
from frappe.utils import getdate, get_time, cint, get_datetime, get_url, add_days, add_months
from cheese.api.common.responses import success, created, error, not_found, validation_error, paginated_response
from cheese.api.v1.bank_account_controller import (
	get_active_company_bank_accounts_list,
	get_active_company_bank_accounts_map,
)
from cheese.cheese.utils.capacity import get_available_capacity


@frappe.whitelist()
def list_experiences(page=1, page_size=20, status=None, company=None, establishment_id=None, package_mode=None, search=None, date=None):
	"""
	List experiences - canonical, filterable catalog
	
	Args:
		page: Page number
		page_size: Items per page
		status: Filter by status (ONLINE/OFFLINE)
		company: Filter by company
		establishment_id: Filter by establishment (alias for company)
		package_mode: Filter by package mode (Establishment/Route/Both)
		search: Search term (searches name and description)
		date: Filter by availability date (YYYY-MM-DD)
		
	Returns:
		Paginated response with experiences list
	"""
	try:
		page = cint(page) or 1
		page_size = cint(page_size) or 20
		
		filters = {}
		if status:
			filters["status"] = status
		if company or establishment_id:
			filters["company"] = company or establishment_id
		if package_mode:
			filters["package_mode"] = package_mode
		
		or_filters = []
		if search:
			or_filters.append(["name", "like", f"%{search}%"])
			or_filters.append(["description", "like", f"%{search}%"])

		if date:
			date_obj = getdate(date)
			slots = frappe.get_all(
				"Cheese Experience Slot",
				filters={"date_from": date_obj, "slot_status": "OPEN"},
				fields=["name", "experience"]
			)

			available_experiences = set()
			for slot in slots:
				available = get_available_capacity(slot.name)
				if available > 0:
					available_experiences.add(slot.experience)

			if not available_experiences:
				return paginated_response(
					[],
					"No experiences available for this date",
					page=page,
					page_size=page_size,
					total=0
				)

			filters["name"] = ["in", list(available_experiences)]
		
		experiences = frappe.get_all(
			"Cheese Experience",
			filters=filters,
			or_filters=or_filters if or_filters else None,
			fields=["name", "name as id", "name as experience_name", "company", "company as establishment", "description", "status", "package_mode", 
				"individual_price", "route_price", "deposit_required"],
			limit_start=(page - 1) * page_size,
			limit_page_length=page_size,
			order_by="name asc"
		)
		
		total = frappe.db.count("Cheese Experience", filters=filters)

		company_ids = list({e.get("company") for e in experiences if e.get("company")})
		bank_map = get_active_company_bank_accounts_map(company_ids)
		for row in experiences:
			row["bank_account"] = bank_map.get(row.get("company"), [])

		return paginated_response(
			experiences,
			"Experiences retrieved successfully",
			page=page,
			page_size=page_size,
			total=total
		)
	except Exception as e:
		frappe.log_error(f"Error in list_experiences: {str(e)}")
		return error("Failed to list experiences", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def get_experience_detail(experience_id, include_next_availability=True):
	"""
	Get experience details - full details + policies
	
	Args:
		experience_id: Experience ID
		include_next_availability: Include next available slot info
		
	Returns:
		Success response with experience details including policies
	"""
	try:
		if not experience_id:
			return validation_error("experience_id is required")
		
		if not frappe.db.exists("Cheese Experience", experience_id):
			return not_found("Experience", experience_id)
		
		experience = frappe.get_doc("Cheese Experience", experience_id)
		
		# Get booking policy
		policy = None
		policy_name = frappe.db.get_value(
			"Cheese Booking Policy",
			{"experience": experience_id},
			"name"
		)
		
		if policy_name:
			policy_doc = frappe.get_doc("Cheese Booking Policy", policy_name)
			policy = {
				"cancel_until_hours_before": policy_doc.cancel_until_hours_before,
				"modify_until_hours_before": policy_doc.modify_until_hours_before,
				"min_hours_before_booking": policy_doc.min_hours_before_booking
			}
		
		# Get establishment image and details
		establishment_google_maps_link = None
		establishment_name = None
		if experience.company:
			company_details = frappe.db.get_value("Company", experience.company, ["company_name"], as_dict=True)
			if company_details:
				establishment_name = company_details.company_name
				# Use custom google_maps_link field from Experience if available
				if hasattr(experience, "google_maps_link") and experience.google_maps_link:
					establishment_google_maps_link = experience.google_maps_link

		next_availability = None
		include_next = True
		if include_next_availability is not None:
			if isinstance(include_next_availability, str):
				include_next = include_next_availability.lower() in ["1", "true", "yes"]
			else:
				include_next = bool(include_next_availability)

		if include_next:
			today = getdate()
			slots = frappe.get_all(
				"Cheese Experience Slot",
				filters={
					"experience": experience_id,
					"date_from": [">=", today],
					"slot_status": "OPEN"
				},
				fields=["name", "date_from", "time_from"],
				order_by="date_from asc, time_from asc",
				limit=50
			)

			for slot in slots:
				available = get_available_capacity(slot.name)
				if available > 0:
					next_availability = {
						"slot_id": slot.name,
						"date": str(slot.date_from),
						"time": str(slot.time_from),
						"available_capacity": available
					}
					break

		bank_account = (
			get_active_company_bank_accounts_list(experience.company) if experience.company else []
		)

		return success(
			"Experience details retrieved successfully",
			{
				"experience_id": experience.name,
				"name": experience.name,
				"event_duration": experience.event_duration,
				"company": experience.company,
				"establishment": {
					"id": experience.company,
					"name": establishment_name
				},
				"establishment_google_maps_link": establishment_google_maps_link,
				"description": experience.description,
				"status": experience.status,
				"package_mode": experience.package_mode,
				"next_availability": next_availability,
				"pricing": {
					"individual_price": experience.individual_price,
					"route_price": experience.route_price
				},
				"deposit": {
					"deposit_required": experience.deposit_required,
					"deposit_type": experience.deposit_type,
					"deposit_value": experience.deposit_value,
					"deposit_ttl_hours": experience.deposit_ttl_hours
				},
				"settings": {
					"manual_confirmation": experience.manual_confirmation
				},
				"booking_policy": policy,
				"bank_account": bank_account,
			}
		)
	except Exception as e:
		frappe.log_error(f"Error in get_experience_detail: {str(e)}")
		return error("Failed to get experience detail", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def update_experience_pricing(experience_id, individual_price=None, route_price=None, package_mode=None):
	"""
	Update experience pricing (US-09)
	
	Args:
		experience_id: Experience ID
		individual_price: Individual price
		route_price: Route price
		package_mode: Package mode (Establishment/Route/Both)
		
	Returns:
		Success response
	"""
	try:
		if not experience_id:
			return validation_error("experience_id is required")
		
		if not frappe.db.exists("Cheese Experience", experience_id):
			return not_found("Experience", experience_id)
		
		experience = frappe.get_doc("Cheese Experience", experience_id)
		
		if individual_price is not None:
			if individual_price < 0:
				return validation_error("individual_price must be >= 0")
			experience.individual_price = individual_price
		
		if route_price is not None:
			if route_price < 0:
				return validation_error("route_price must be >= 0")
			experience.route_price = route_price
		
		if package_mode is not None:
			if package_mode not in ["Establishment", "Route", "Both"]:
				return validation_error(f"Invalid package_mode: {package_mode}")
			experience.package_mode = package_mode
			
			# Validate route_price if package_mode is Route
			if package_mode == "Route" and not experience.route_price:
				return validation_error("route_price is required when package_mode is Route")
		
		experience.save()
		frappe.db.commit()
		
		return success(
			"Experience pricing updated successfully",
			{
				"experience_id": experience.name,
				"individual_price": experience.individual_price,
				"route_price": experience.route_price,
				"package_mode": experience.package_mode
			}
		)
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except Exception as e:
		frappe.log_error(f"Error in update_experience_pricing: {str(e)}")
		return error("Failed to update experience pricing", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def create_time_slot(experience_id, date, time, max_capacity, slot_status="OPEN"):
	"""
	Create a time slot for an experience (US-10)
	
	Args:
		experience_id: Experience ID
		date: Date (YYYY-MM-DD)
		time: Time (HH:MM:SS)
		max_capacity: Maximum capacity
		slot_status: Slot status (OPEN/CLOSED/BLOCKED)
		
	Returns:
		Created response with slot data
	"""
	try:
		if not experience_id:
			return validation_error("experience_id is required")
		if not date:
			return validation_error("date is required")
		if not time:
			return validation_error("time is required")
		if not max_capacity or max_capacity < 1:
			return validation_error("max_capacity must be at least 1")
		
		if slot_status not in ["OPEN", "CLOSED", "BLOCKED"]:
			return validation_error(f"Invalid slot_status: {slot_status}")
		
		if not frappe.db.exists("Cheese Experience", experience_id):
			return not_found("Experience", experience_id)

		if getdate(date) < getdate(now_datetime()):
			return validation_error("Cannot create a slot on an expired date")
		
		slot = frappe.get_doc({
			"doctype": "Cheese Experience Slot",
			"experience": experience_id,
			"date_from": getdate(date),
			"time_from": get_time(time),
			"max_capacity": max_capacity,
			"slot_status": slot_status,
			"reserved_capacity": 0
		})
		slot.insert()
		frappe.db.commit()
		
		return created(
			"Time slot created successfully",
			{
				"slot_id": slot.name,
				"experience_id": experience_id,
				"date": str(slot.date_from),
				"time": str(slot.time_from),
				"max_capacity": slot.max_capacity,
				"slot_status": slot.slot_status
			}
		)
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except Exception as e:
		frappe.log_error(f"Error in create_time_slot: {str(e)}")
		return error("Failed to create time slot", "SERVER_ERROR", {"error": str(e)}, 500)


def calculate_recurrence_dates(start_date, end_date, recurrence_config):
	"""
	Calculate all occurrence dates based on recurrence configuration.
	
	Args:
		start_date: Start date (date object)
		end_date: End date (date object) - maximum date to generate occurrences
		recurrence_config: Dictionary with recurrence settings
		
	Returns:
		List of date objects representing all valid occurrence dates
	"""
	from datetime import timedelta
	
	if not recurrence_config or recurrence_config.get("type") == "none":
		return [start_date]
	
	recurrence_type = recurrence_config.get("type")
	dates = []
	current_date = start_date
	
	# Day name to weekday number mapping (Monday=0, Sunday=6)
	day_name_to_weekday = {
		"monday": 0,
		"tuesday": 1,
		"wednesday": 2,
		"thursday": 3,
		"friday": 4,
		"saturday": 5,
		"sunday": 6,
	}
	
	if recurrence_type == "daily":
		# Every day from start to end
		while current_date <= end_date:
			dates.append(current_date)
			current_date = add_days(current_date, 1)
	
	elif recurrence_type == "weekdays":
		# Monday to Friday only
		while current_date <= end_date:
			weekday = current_date.weekday()  # Monday=0, Sunday=6
			if weekday < 5:  # Monday to Friday
				dates.append(current_date)
			current_date = add_days(current_date, 1)
	
	elif recurrence_type == "weekly":
		# Every week on the same weekday as start_date
		start_weekday = start_date.weekday()
		current_date = start_date
		while current_date <= end_date:
			dates.append(current_date)
			current_date = add_days(current_date, 7)  # Add 1 week
	
	elif recurrence_type == "custom":
		repeat_every = recurrence_config.get("repeat_every", 1)
		frequency = recurrence_config.get("frequency", "week")
		selected_days = recurrence_config.get("days", [])
		end_type = recurrence_config.get("end_type", "never")
		end_date_limit = recurrence_config.get("end_date")
		end_occurrences = recurrence_config.get("end_occurrences")
		
		if frequency == "day":
			# Every N days
			occurrence_count = 0
			while current_date <= end_date:
				dates.append(current_date)
				occurrence_count += 1
				
				# Check end conditions
				if end_type == "occurrences" and end_occurrences and occurrence_count >= end_occurrences:
					break
				if end_type == "date" and end_date_limit:
					limit_date = getdate(end_date_limit)
					if current_date >= limit_date:
						break
				
				current_date = add_days(current_date, repeat_every)
		
		elif frequency == "week":
			# Every N weeks on selected days
			if not selected_days:
				# If no days selected, use the start date's weekday
				selected_days = [list(day_name_to_weekday.keys())[start_date.weekday()]]
			
			week_count = 0
			occurrence_count = 0
			
			# Start from the beginning of the week containing start_date
			days_since_monday = start_date.weekday()
			week_start = add_days(start_date, -days_since_monday)
			
			while week_start <= end_date:
				# Check each selected day in this week
				for day_name in selected_days:
					day_offset = day_name_to_weekday.get(day_name)
					if day_offset is None:
						continue
					
					occurrence_date = add_days(week_start, day_offset)
					
					# Only include dates >= start_date and <= end_date
					if occurrence_date < start_date:
						continue
					if occurrence_date > end_date:
						continue
					
					dates.append(occurrence_date)
					occurrence_count += 1
					
					# Check end conditions
					if end_type == "occurrences" and end_occurrences and occurrence_count >= end_occurrences:
						return sorted(set(dates))
					if end_type == "date" and end_date_limit:
						limit_date = getdate(end_date_limit)
						if occurrence_date >= limit_date:
							return sorted(set(dates))
				
				# Move to next week interval
				week_count += 1
				week_start = add_days(week_start, repeat_every * 7)
		
		elif frequency == "month":
			# Every N months on the same day
			occurrence_count = 0
			while current_date <= end_date:
				dates.append(current_date)
				occurrence_count += 1
				
				# Check end conditions
				if end_type == "occurrences" and end_occurrences and occurrence_count >= end_occurrences:
					break
				if end_type == "date" and end_date_limit:
					limit_date = getdate(end_date_limit)
					if current_date >= limit_date:
						break
				
				current_date = add_months(current_date, repeat_every)
	
	# Remove duplicates and sort
	return sorted(set(dates))


@frappe.whitelist()
def create_recurring_slots(experience_id, date_from, date_to, time_from=None, time_to=None, max_capacity=10, slot_status="OPEN", recurrence_config=None):
	"""
	Create recurring time slots for an experience based on recurrence configuration.
	
	Args:
		experience_id: Experience ID
		date_from: Start date (YYYY-MM-DD)
		date_to: End date (YYYY-MM-DD) - maximum date for occurrences
		time_from: Start time (HH:MM:SS) - optional
		time_to: End time (HH:MM:SS) - optional
		max_capacity: Maximum capacity for each slot
		slot_status: Slot status (OPEN/CLOSED/BLOCKED)
		recurrence_config: Dictionary with recurrence settings
		
	Returns:
		Created response with count of created slots
	"""
	try:
		if not experience_id:
			return validation_error("experience_id is required")
		if not date_from:
			return validation_error("date_from is required")
		if not date_to:
			return validation_error("date_to is required")
		if not max_capacity or max_capacity < 1:
			return validation_error("max_capacity must be at least 1")
		
		if slot_status not in ["OPEN", "CLOSED", "BLOCKED"]:
			return validation_error(f"Invalid slot_status: {slot_status}")
		
		if not frappe.db.exists("Cheese Experience", experience_id):
			return not_found("Experience", experience_id)
		
		start_date = getdate(date_from)
		end_date = getdate(date_to)
		today_date = getdate(now_datetime())
		
		if start_date > end_date:
			return validation_error("date_from must be before or equal to date_to")
		if start_date < today_date or end_date < today_date:
			return validation_error("Cannot create recurring slots on expired dates")
		
		# Parse recurrence config if it's a string (JSON)
		if isinstance(recurrence_config, str):
			import json
			recurrence_config = json.loads(recurrence_config)
		
		# Calculate all occurrence dates
		occurrence_dates = calculate_recurrence_dates(start_date, end_date, recurrence_config or {})
		
		if not occurrence_dates:
			return validation_error("No valid occurrence dates found for the given recurrence pattern")
		
		# Create slots for each occurrence date
		created_slots = []
		time_from_obj = get_time(time_from) if time_from else None
		time_to_obj = get_time(time_to) if time_to else None
		
		for occurrence_date in occurrence_dates:
			slot = frappe.get_doc({
				"doctype": "Cheese Experience Slot",
				"experience": experience_id,
				"date_from": occurrence_date,
				"date_to": occurrence_date,
				"time_from": time_from_obj,
				"time_to": time_to_obj,
				"max_capacity": max_capacity,
				"slot_status": slot_status,
				"reserved_capacity": 0
			})
			slot.insert()
			created_slots.append(slot.name)
		
		frappe.db.commit()
		
		return created(
			f"Created {len(created_slots)} recurring slot(s) successfully",
			{
				"slots_created": len(created_slots),
				"slot_ids": created_slots,
				"experience_id": experience_id,
				"date_range": {
					"from": str(start_date),
					"to": str(end_date)
				}
			}
		)
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except Exception as e:
		frappe.log_error(f"Error in create_recurring_slots: {str(e)}")
		return error("Failed to create recurring slots", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def update_time_slot(slot_id, max_capacity=None, slot_status=None, date_from=None, date_to=None, time_from=None, time_to=None):
	"""
	Update time slot capacity, status, or schedule

	Args:
		slot_id: Slot ID
		max_capacity: New maximum capacity
		slot_status: New slot status
		date_from: New start date
		date_to: New end date
		time_from: New start time
		time_to: New end time

	Returns:
		Success response
	"""
	try:
		if not slot_id:
			return validation_error("slot_id is required")

		if not frappe.db.exists("Cheese Experience Slot", slot_id):
			return not_found("Slot", slot_id)

		slot = frappe.get_doc("Cheese Experience Slot", slot_id)

		if max_capacity is not None:
			max_capacity = int(max_capacity)
			reserved = slot.reserved_capacity or 0
			if max_capacity < reserved:
				return validation_error(
					f"Cannot reduce capacity below reserved amount ({reserved})"
				)
			slot.max_capacity = max_capacity

		if slot_status is not None:
			if slot_status not in ["OPEN", "CLOSED", "BLOCKED"]:
				return validation_error(f"Invalid slot_status: {slot_status}")
			slot.slot_status = slot_status

		if date_from is not None:
			slot.date_from = getdate(date_from)
			# Also set date_to to date_from if date_to not explicitly provided
			if date_to is None:
				slot.date_to = getdate(date_from)

		if date_to is not None:
			slot.date_to = getdate(date_to)

		# Assign time values as strings to avoid timedelta/time type mismatch
		if time_from is not None:
			slot.time_from = str(time_from)

		if time_to is not None:
			slot.time_to = str(time_to)

		slot.save()
		frappe.db.commit()

		return success(
			"Time slot updated successfully",
			{
				"slot_id": slot.name,
				"max_capacity": slot.max_capacity,
				"slot_status": slot.slot_status,
				"date_from": str(slot.date_from),
				"date_to": str(slot.date_to) if slot.date_to else None,
				"time_from": str(slot.time_from) if slot.time_from else None,
				"time_to": str(slot.time_to) if slot.time_to else None,
			}
		)
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except Exception as e:
		frappe.log_error(f"Error in update_time_slot: {str(e)}")
		return error("Failed to update time slot", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def list_time_slots(experience_id, date_from=None, date_to=None, slot_status=None, page=1, page_size=20):
	"""
	List time slots for an experience (US-10)
	
	Args:
		experience_id: Experience ID
		date_from: Start date filter
		date_to: End date filter
		slot_status: Filter by status
		page: Page number
		page_size: Items per page
		
	Returns:
		Paginated response with slots list
	"""
	try:
		if not experience_id:
			return validation_error("experience_id is required")
		
		if not frappe.db.exists("Cheese Experience", experience_id):
			return not_found("Experience", experience_id)
		
		page = cint(page) or 1
		page_size = cint(page_size) or 20
		
		filters = {"experience": experience_id}
		
		date_from_obj = getdate(date_from) if date_from else None
		date_to_obj = getdate(date_to) if date_to else None
		if date_from_obj and date_to_obj:
			filters["date_from"] = ["between", [date_from_obj, date_to_obj]]
		elif date_from_obj:
			filters["date_from"] = [">=", date_from_obj]
		elif date_to_obj:
			filters["date_from"] = ["<=", date_to_obj]
		if slot_status:
			filters["slot_status"] = slot_status
		
		slots = frappe.get_all(
			"Cheese Experience Slot",
			filters=filters,
			fields=["name", "date_from", "time_from", "max_capacity", "reserved_capacity", "slot_status"],
			limit_start=(page - 1) * page_size,
			limit_page_length=page_size,
			order_by="date_from asc, time_from asc"
		)
		
		# Calculate available capacity
		for slot in slots:
			available = get_available_capacity(slot.name)
			slot["available_capacity"] = available
		
		total = frappe.db.count("Cheese Experience Slot", filters=filters)
		
		return paginated_response(
			slots,
			"Time slots retrieved successfully",
			page=page,
			page_size=page_size,
			total=total
		)
	except Exception as e:
		frappe.log_error(f"Error in list_time_slots: {str(e)}")
		return error("Failed to list time slots", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def block_time_slot(slot_id):
	"""
	Block a time slot (US-10)
	
	Args:
		slot_id: Slot ID
		
	Returns:
		Success response
	"""
	try:
		if not slot_id:
			return validation_error("slot_id is required")
		
		if not frappe.db.exists("Cheese Experience Slot", slot_id):
			return not_found("Slot", slot_id)
		
		slot = frappe.get_doc("Cheese Experience Slot", slot_id)
		slot.slot_status = "BLOCKED"
		slot.save()
		frappe.db.commit()
		
		return success(
			"Time slot blocked successfully",
			{
				"slot_id": slot.name,
				"slot_status": slot.slot_status
			}
		)
	except Exception as e:
		frappe.log_error(f"Error in block_time_slot: {str(e)}")
		return error("Failed to block time slot", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def update_booking_policy(experience_id, cancel_until_hours_before=None, modify_until_hours_before=None, min_hours_before_booking=None):
	"""
	Update booking policy for an experience (US-11)
	
	Args:
		experience_id: Experience ID
		cancel_until_hours_before: Hours before for cancellation
		modify_until_hours_before: Hours before for modification
		min_hours_before_booking: Minimum hours before booking
		
	Returns:
		Success response
	"""
	try:
		if not experience_id:
			return validation_error("experience_id is required")
		
		if not frappe.db.exists("Cheese Experience", experience_id):
			return not_found("Experience", experience_id)
		
		# Get or create booking policy
		policy_name = frappe.db.get_value(
			"Cheese Booking Policy",
			{"experience": experience_id},
			"name"
		)
		
		if policy_name:
			policy = frappe.get_doc("Cheese Booking Policy", policy_name)
		else:
			policy = frappe.get_doc({
				"doctype": "Cheese Booking Policy",
				"experience": experience_id
			})
		
		if cancel_until_hours_before is not None:
			if cancel_until_hours_before < 0:
				return validation_error("cancel_until_hours_before must be >= 0")
			policy.cancel_until_hours_before = cancel_until_hours_before
		
		if modify_until_hours_before is not None:
			if modify_until_hours_before < 0:
				return validation_error("modify_until_hours_before must be >= 0")
			policy.modify_until_hours_before = modify_until_hours_before
		
		if min_hours_before_booking is not None:
			if min_hours_before_booking < 0:
				return validation_error("min_hours_before_booking must be >= 0")
			policy.min_hours_before_booking = min_hours_before_booking
		
		if policy_name:
			policy.save()
		else:
			policy.insert()
		
		frappe.db.commit()
		
		return success(
			"Booking policy updated successfully",
			{
				"policy_id": policy.name,
				"experience_id": experience_id,
				"cancel_until_hours_before": policy.cancel_until_hours_before,
				"modify_until_hours_before": policy.modify_until_hours_before,
				"min_hours_before_booking": policy.min_hours_before_booking
			}
		)
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except Exception as e:
		frappe.log_error(f"Error in update_booking_policy: {str(e)}")
		return error("Failed to update booking policy", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def delete_time_slot(slot_id):
	"""
	Delete a time slot after checking for dependencies.

	Args:
		slot_id: Slot ID

	Returns:
		Success response
	"""
	try:
		if not slot_id:
			return validation_error("slot_id is required")

		if not frappe.db.exists("Cheese Experience Slot", slot_id):
			return not_found("Slot", slot_id)

		# Check for active tickets on this slot
		active_tickets = frappe.db.count(
			"Cheese Ticket",
			filters={"slot": slot_id, "status": ["in", ["PENDING", "CONFIRMED", "CHECKED_IN"]]}
		)
		if active_tickets > 0:
			return validation_error(
				f"Cannot delete slot with {active_tickets} active ticket(s). Cancel them first."
			)

		frappe.delete_doc("Cheese Experience Slot", slot_id, force=True)
		frappe.db.commit()

		return success("Time slot deleted successfully", {"slot_id": slot_id})
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except Exception as e:
		frappe.log_error(f"Error in delete_time_slot: {str(e)}")
		return error("Failed to delete time slot", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def delete_experience(experience_id):
	"""
	Delete an experience after checking for dependencies (active tickets, routes).

	Args:
		experience_id: Experience ID

	Returns:
		Success response
	"""
	try:
		if not experience_id:
			return validation_error("experience_id is required")

		if not frappe.db.exists("Cheese Experience", experience_id):
			return not_found("Experience", experience_id)

		# Check for active tickets
		active_tickets = frappe.db.count(
			"Cheese Ticket",
			filters={"experience": experience_id, "status": ["in", ["PENDING", "CONFIRMED", "CHECKED_IN"]]}
		)
		if active_tickets > 0:
			return validation_error(
				f"Cannot delete experience with {active_tickets} active ticket(s). Cancel them first."
			)

		# Check for route references
		route_refs = frappe.db.count(
			"Cheese Route Experience",
			filters={"experience": experience_id}
		)
		if route_refs > 0:
			return validation_error(
				f"Cannot delete experience referenced by {route_refs} route(s). Remove from routes first."
			)

		# Delete related slots first
		slots = frappe.get_all("Cheese Experience Slot", filters={"experience": experience_id}, pluck="name")
		for slot_name in slots:
			frappe.delete_doc("Cheese Experience Slot", slot_name, force=True)

		frappe.delete_doc("Cheese Experience", experience_id, force=True)
		frappe.db.commit()

		return success("Experience deleted successfully", {"experience_id": experience_id})
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except Exception as e:
		frappe.log_error(f"Error in delete_experience: {str(e)}")
		return error("Failed to delete experience", "SERVER_ERROR", {"error": str(e)}, 500)
