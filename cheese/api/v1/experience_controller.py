# Copyright (c) 2024
# License: MIT

import frappe
from frappe.model.rename_doc import rename_doc
from frappe import _
from frappe.utils import today, getdate, get_time, cint, get_datetime, get_url, add_days, add_months
from cheese.api.common.responses import success, created, error, not_found, validation_error, paginated_response
from cheese.api.v1.user_controller import _get_current_user_company
from cheese.cheese.utils.access import assert_slot_access, assert_experience_access
from cheese.api.v1.bank_account_controller import (
	get_active_company_bank_accounts_list,
	get_active_company_bank_accounts_map,
)
from cheese.cheese.utils.capacity import get_available_capacity, slot_calendar_days_in_range
from cheese.cheese.utils.documents import get_published_documents_grouped


@frappe.whitelist()
def rename_experience(old_name, new_name):
	"""Rename a Cheese Experience through an app-whitelisted endpoint."""
	try:
		if not old_name:
			return validation_error("old_name is required")
		if not new_name:
			return validation_error("new_name is required")

		old_name = str(old_name).strip()
		new_name = str(new_name).strip()
		if old_name == new_name:
			return validation_error("new_name must be different from old_name")

		if not frappe.db.exists("Cheese Experience", old_name):
			return not_found("Experience", old_name)

		if not frappe.has_permission("Cheese Experience", "write", old_name):
			return error("Not permitted to rename this experience", "FORBIDDEN", {}, 403)

		renamed = rename_doc("Cheese Experience", old_name, new_name, force=True, merge=False)
		frappe.db.commit()
		return success("Experience renamed successfully", {"old_name": old_name, "new_name": renamed})
	except frappe.DuplicateEntryError:
		return validation_error("A document with this ID already exists")
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except Exception as e:
		frappe.log_error(f"Error in rename_experience: {str(e)}")
		return error("Failed to rename experience", "SERVER_ERROR", {"error": str(e)}, 500)


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
		
		user_company = _get_current_user_company()
		if user_company:
			company = user_company

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
			slot_filters = {
				"date_from": ["<=", date_obj],
				"date_to": [">=", date_obj],
				"slot_status": ["in", ["OPEN", "CLOSED"]],
			}
			# Tenant isolation: only consider the user's own slots.
			if user_company:
				slot_filters["company"] = user_company
			slots = frappe.get_all(
				"Cheese Experience Slot",
				filters=slot_filters,
				fields=["name", "experience"],
			)

			available_experiences = set()
			for slot in slots:
				available = get_available_capacity(slot.name, selected_date=date_obj)
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
				"individual_price", "route_price", "price_per_night", "currency", "deposit_required", "is_room", "room_size", "experience_type",
				"differentiate_by_weekday", "differentiate_by_age_group"],
			limit_start=(page - 1) * page_size,
			limit_page_length=page_size,
			order_by="name asc"
		)
		
		total = frappe.db.count("Cheese Experience", filters=filters)

		company_ids = list({e.get("company") for e in experiences if e.get("company")})
		bank_map = get_active_company_bank_accounts_map(company_ids)
		for row in experiences:
			# HOTEL experiences must be represented as room inventory in API payloads.
			if row.get("experience_type") == "HOTEL":
				row["is_room"] = 1
			else:
				row["is_room"] = 1 if row.get("is_room") else 0
			row["bank_account"] = bank_map.get(row.get("company"), [])
			# Base prices are not the whole story when the matrix / a season /
			# a promotion applies — consumers should fetch the detail then.
			row["has_price_variants"] = bool(
				row.get("differentiate_by_weekday") or row.get("differentiate_by_age_group")
			)

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

		if not frappe.has_permission("Cheese Experience", "read", experience_id):
			return error("Not permitted to access this experience", "PERMISSION_DENIED", {}, 403)
		
		experience = frappe.get_doc("Cheese Experience", experience_id)
		
		# Get booking policy (supports new shared-policy model on Experience.booking_policy
		# with fallback to legacy Cheese Booking Policy.experience back-reference)
		from cheese.cheese.utils.validation import get_booking_policy_for_experience
		policy = None
		policy_data = get_booking_policy_for_experience(
			experience_id,
			fields=[
				"name",
				"cancel_until_hours_before",
				"modify_until_hours_before",
				"min_hours_before_booking",
			],
		)
		if policy_data:
			policy = {
				"policy_id": policy_data.name,
				"cancel_until_hours_before": policy_data.cancel_until_hours_before,
				"modify_until_hours_before": policy_data.modify_until_hours_before,
				"min_hours_before_booking": policy_data.min_hours_before_booking,
			}
		
		# Get establishment image and details
		establishment_google_maps_link = None
		establishment_name = None
		establishment_description = None
		if experience.company:
			company_details = frappe.db.get_value(
				"Company",
				experience.company,
				["company_name", "company_description"],
				as_dict=True,
			)
			if company_details:
				establishment_name = company_details.company_name
				establishment_description = company_details.company_description
				# Use custom google_maps_link field from Experience if available
				if hasattr(experience, "google_maps_link") and experience.google_maps_link:
					establishment_google_maps_link = experience.google_maps_link

		description = experience.description
		if experience.experience_type == "HOTEL" and experience.company:
			hotel_description = establishment_description or ""
			description = hotel_description or description

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
					"date_to": [">=", today],
					"slot_status": ["in", ["OPEN", "CLOSED"]],
				},
				fields=["name", "date_from", "date_to", "time_from"],
				order_by="date_from asc, time_from asc",
				limit=50,
			)

			for slot in slots:
				df, dt = getdate(slot.date_from), getdate(slot.date_to)
				cd = max(today, df)
				while cd <= dt:
					available = get_available_capacity(slot.name, selected_date=cd)
					if available > 0:
						next_availability = {
							"slot_id": slot.name,
							"date": str(cd),
							"selected_date": str(cd),
							"time": str(slot.time_from),
							"available_capacity": available,
						}
						break
					cd = add_days(cd, 1)
				if next_availability:
					break

		bank_account = (
			get_active_company_bank_accounts_list(experience.company) if experience.company else []
		)

		# Published multimedia: experience documents + owning company documents
		entity_specs = [("Cheese Experience", experience.name)]
		if experience.company:
			entity_specs.append(("Company", experience.company))
		media = get_published_documents_grouped(entity_specs)
		links_data = [
			{
				"title": link["title"],
				"url": link["url"],
				"tags": link["tags"],
				"language": link["language"],
			}
			for link in media["links"]
		]

		# Full price-variant knowledge (matrix, seasons, promotions) so
		# catalog consumers — the chatbot in particular — can explain every
		# price without extra round-trips.
		from cheese.cheese.utils.seasonal_pricing import get_pricing_catalog

		pricing_block = {
			"individual_price": experience.individual_price,
			"route_price": experience.route_price,
			"price_per_night": experience.get("price_per_night"),
			"currency": experience.get("currency"),
		}
		pricing_block.update(get_pricing_catalog(experience))

		return success(
			"Experience details retrieved successfully",
			{
				"experience_id": experience.name,
				"name": experience.name,
				"event_duration": experience.event_duration,
				"company": experience.company,
				"establishment": {
					"id": experience.company,
					"name": establishment_name,
					"description": establishment_description,
				},
				"establishment_google_maps_link": establishment_google_maps_link,
				"description": description,
				"experience_type": experience.experience_type,
				"status": experience.status,
				"package_mode": experience.package_mode,
				"next_availability": next_availability,
				"pricing": pricing_block,
				"is_room": 1 if experience.experience_type == "HOTEL" else (1 if experience.is_room else 0),
				"room_size": experience.room_size,
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
				"links": links_data,
				"documents": media["documents"],
				"photos": media["photos"],
				"pdfs": media["pdfs"],
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

		try:
			assert_experience_access(experience_id)
		except frappe.PermissionError:
			return error("Unauthorized", "UNAUTHORIZED", {}, 403)

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

		try:
			assert_experience_access(experience_id)
		except frappe.PermissionError:
			return error("Unauthorized", "UNAUTHORIZED", {}, 403)

		if getdate(date) < getdate(today()):
			return validation_error("Cannot create a slot on an expired date")
		
		slot = frappe.get_doc({
			"doctype": "Cheese Experience Slot",
			"experience": experience_id,
			"date_from": getdate(date),
			"date_to": getdate(date),
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

		try:
			assert_experience_access(experience_id)
		except frappe.PermissionError:
			return error("Unauthorized", "UNAUTHORIZED", {}, 403)

		start_date = getdate(date_from)
		end_date = getdate(date_to)
		today_date = getdate(today())
		
		if start_date > end_date:
			return validation_error("date_from must be before or equal to date_to")
		if start_date < today_date or end_date < today_date:
			return validation_error("Cannot create recurring slots on expired dates")
		
		# Parse recurrence config if it's a string (JSON)
		import json as _json
		if isinstance(recurrence_config, str):
			recurrence_config = _json.loads(recurrence_config)
		
		# Calculate all occurrence dates
		occurrence_dates = calculate_recurrence_dates(start_date, end_date, recurrence_config or {})
		
		if not occurrence_dates:
			return validation_error("No valid occurrence dates found for the given recurrence pattern")
		
		# Create slots for each occurrence date. We tag every slot with the
		# same `recurrence_group_id` so the edit/delete UX (issues #260 and
		# #269) can apply scoped operations à la Google Calendar.
		import uuid
		recurrence_group_id = uuid.uuid4().hex
		serialized_config = _json.dumps(recurrence_config or {})

		created_slots = []
		time_from_obj = get_time(time_from) if time_from else None
		time_to_obj = get_time(time_to) if time_to else None

		for idx, occurrence_date in enumerate(occurrence_dates):
			slot = frappe.get_doc({
				"doctype": "Cheese Experience Slot",
				"experience": experience_id,
				"date_from": occurrence_date,
				"date_to": occurrence_date,
				"time_from": time_from_obj,
				"time_to": time_to_obj,
				"max_capacity": max_capacity,
				"slot_status": slot_status,
				"reserved_capacity": 0,
				"recurrence_group_id": recurrence_group_id,
				"is_recurring_master": 1 if idx == 0 else 0,
				"recurrence_config_json": serialized_config,
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
				"recurrence_group_id": recurrence_group_id,
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


_SLOT_RECURRENCE_SCOPES = ("this", "following", "all")


def _resolve_slot_recurrence_scope(slot, scope):
	"""Return the list of slot names that fall under ``scope``.

	* ``this``      → just ``slot.name``
	* ``following`` → every slot in the same recurrence_group_id with
	                   ``date_from >= slot.date_from`` (matches Google
	                   Calendar's "this and following events").
	* ``all``       → every slot in the same recurrence_group_id.

	A slot without a recurrence_group_id is always treated as ``this``.
	"""
	scope = (scope or "this").strip().lower()
	if scope not in _SLOT_RECURRENCE_SCOPES:
		frappe.throw(_(f"Invalid scope '{scope}'. Expected one of: this, following, all."))

	if not slot.recurrence_group_id or scope == "this":
		return [slot.name]

	filters = {"recurrence_group_id": slot.recurrence_group_id}
	if scope == "following":
		filters["date_from"] = [">=", slot.date_from]

	return frappe.get_all(
		"Cheese Experience Slot",
		filters=filters,
		pluck="name",
		order_by="date_from asc, time_from asc",
	)


def _confirmed_tickets_on_slots(slot_names):
	"""Return number of CONFIRMED / CHECKED_IN tickets attached to any of the given slots."""
	if not slot_names:
		return 0
	return frappe.db.count(
		"Cheese Ticket",
		filters={"slot": ["in", slot_names], "status": ["in", ["CONFIRMED", "CHECKED_IN"]]},
	)


@frappe.whitelist()
def get_slot_recurrence_info(slot_id):
	"""Return information the UI needs to render the 3-option edit/delete modal.

	Tells the caller whether the slot belongs to a recurrence group, how many
	siblings it has (and how many are still in the future), and how many
	CONFIRMED reservations would be affected by a "this and following" /
	"all" operation.

	The frontend uses this to decide whether to render the Google-Calendar-style
	modal or just an inline confirm.
	"""
	try:
		if not slot_id:
			return validation_error("slot_id is required")
		if not frappe.db.exists("Cheese Experience Slot", slot_id):
			return not_found("Slot", slot_id)

		slot = frappe.get_doc("Cheese Experience Slot", slot_id)

		if not slot.recurrence_group_id:
			confirmed = _confirmed_tickets_on_slots([slot.name])
			return success(
				"Slot recurrence info",
				{
					"slot_id": slot.name,
					"is_recurring": False,
					"recurrence_group_id": None,
					"sibling_count": 0,
					"following_count": 0,
					"total_count": 1,
					"confirmed_tickets_this": confirmed,
					"confirmed_tickets_following": confirmed,
					"confirmed_tickets_all": confirmed,
				},
			)

		total = frappe.db.count(
			"Cheese Experience Slot",
			filters={"recurrence_group_id": slot.recurrence_group_id},
		)
		following = _resolve_slot_recurrence_scope(slot, "following")
		all_slots = _resolve_slot_recurrence_scope(slot, "all")

		return success(
			"Slot recurrence info",
			{
				"slot_id": slot.name,
				"is_recurring": True,
				"recurrence_group_id": slot.recurrence_group_id,
				"is_recurring_master": bool(slot.is_recurring_master),
				"sibling_count": total - 1,
				"following_count": len(following),
				"total_count": total,
				"confirmed_tickets_this": _confirmed_tickets_on_slots([slot.name]),
				"confirmed_tickets_following": _confirmed_tickets_on_slots(following),
				"confirmed_tickets_all": _confirmed_tickets_on_slots(all_slots),
			},
		)
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except Exception as e:
		frappe.log_error(f"Error in get_slot_recurrence_info: {str(e)}")
		return error("Failed to get slot recurrence info", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def update_time_slot(
	slot_id,
	max_capacity=None,
	slot_status=None,
	date_from=None,
	date_to=None,
	time_from=None,
	time_to=None,
	scope="this",
	confirm_active_tickets=False,
):
	"""
	Update time slot capacity, status, or schedule.

	When ``scope`` is "following" or "all" and the slot belongs to a recurrence
	group, the same change is applied atomically to every other slot in scope
	(see Google-Calendar-style recurring edit in issues #260 and #269).

	Args:
		slot_id: Slot ID
		max_capacity: New maximum capacity
		slot_status: New slot status (OPEN / CLOSED / BLOCKED)
		date_from: New start date (only applied to ``scope="this"``)
		date_to: New end date (only applied to ``scope="this"``)
		time_from: New start time (applied to every slot in scope)
		time_to: New end time (applied to every slot in scope)
		scope: One of "this", "following", "all"
		confirm_active_tickets: When True, allows mutating slots that still
			carry CONFIRMED / CHECKED_IN reservations; without this flag the
			operation is rejected with an explicit error so the operator can
			be warned (issue #269 acceptance criteria).

	Returns:
		Success response
	"""
	try:
		if not slot_id:
			return validation_error("slot_id is required")

		if not frappe.db.exists("Cheese Experience Slot", slot_id):
			return not_found("Slot", slot_id)

		try:
			base_slot = assert_slot_access(slot_id)
		except frappe.PermissionError:
			return error("Unauthorized", "UNAUTHORIZED", {}, 403)

		target_names = _resolve_slot_recurrence_scope(base_slot, scope)

		# Sanitize / pre-validate scalar inputs once so we fail before opening
		# the transaction.
		if max_capacity is not None:
			try:
				max_capacity = int(max_capacity)
			except (TypeError, ValueError):
				return validation_error("max_capacity must be an integer")

		if slot_status is not None and slot_status not in ["OPEN", "CLOSED", "BLOCKED"]:
			return validation_error(f"Invalid slot_status: {slot_status}")

		# Issue #269: warn the operator before editing a slot that still has
		# confirmed reservations. The frontend can re-call with
		# confirm_active_tickets=true once the user explicitly approves.
		if not confirm_active_tickets:
			confirmed = _confirmed_tickets_on_slots(target_names)
			if confirmed > 0:
				return validation_error(
					f"This change affects {confirmed} CONFIRMED reservation(s). "
					"Re-submit with confirm_active_tickets=true to proceed.",
					{
						"confirmed_tickets": confirmed,
						"target_slot_count": len(target_names),
					},
				)

		# Atomic rollback if any single slot update fails.
		results = []
		savepoint = "cheese_slot_bulk_update"
		frappe.db.savepoint(savepoint)
		try:
			for name in target_names:
				slot = frappe.get_doc("Cheese Experience Slot", name)

				if max_capacity is not None:
					reserved = slot.reserved_capacity or 0
					if max_capacity < reserved:
						frappe.throw(
							_(
								"Cannot reduce capacity below reserved amount ({0}) on slot {1}"
							).format(reserved, name)
						)
					slot.max_capacity = max_capacity

				if slot_status is not None:
					slot.slot_status = slot_status

				# Date changes are intentionally scoped to the "this" target only.
				# Applying the same calendar date to every slot in a series would
				# collapse them onto a single day which is never what the user wants.
				if name == base_slot.name:
					if date_from is not None:
						slot.date_from = getdate(date_from)
						if date_to is None:
							slot.date_to = getdate(date_from)
					if date_to is not None:
						slot.date_to = getdate(date_to)

				if time_from is not None:
					slot.time_from = str(time_from)
				if time_to is not None:
					slot.time_to = str(time_to)

				slot.save(ignore_permissions=True)
				results.append({
					"slot_id": slot.name,
					"max_capacity": slot.max_capacity,
					"slot_status": slot.slot_status,
					"date_from": str(slot.date_from),
					"date_to": str(slot.date_to) if slot.date_to else None,
					"time_from": str(slot.time_from) if slot.time_from else None,
					"time_to": str(slot.time_to) if slot.time_to else None,
				})
		except Exception:
			frappe.db.rollback(save_point=savepoint)
			raise

		frappe.db.commit()

		return success(
			f"Updated {len(results)} slot(s) successfully",
			{
				"scope": (scope or "this").lower(),
				"updated_count": len(results),
				"slots": results,
				"slot_id": base_slot.name,
				"max_capacity": results[0]["max_capacity"] if results else None,
				"slot_status": results[0]["slot_status"] if results else None,
				"date_from": results[0]["date_from"] if results else None,
				"date_to": results[0]["date_to"] if results else None,
				"time_from": results[0]["time_from"] if results else None,
				"time_to": results[0]["time_to"] if results else None,
			},
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

	Returns one row per (slot × calendar day) in the requested window. Capacity is per day.
	If date_from/date_to are omitted, defaults to today through today + 60 days.
	"""
	try:
		if not experience_id:
			return validation_error("experience_id is required")
		
		if not frappe.db.exists("Cheese Experience", experience_id):
			return not_found("Experience", experience_id)
		
		page = cint(page) or 1
		page_size = cint(page_size) or 20
		
		user_company = _get_current_user_company()
		if user_company:
			experience_doc = frappe.db.get_value("Cheese Experience", experience_id, "company")
			if experience_doc != user_company:
				return paginated_response([], "Unauthorized to view slots for this experience", page=1, page_size=20, total=0)
		
		filters = {"experience": experience_id}

		date_from_obj = getdate(date_from) if date_from else None
		date_to_obj = getdate(date_to) if date_to else None
		if not date_from_obj and not date_to_obj:
			date_from_obj = getdate(today_str())
			date_to_obj = add_days(date_from_obj, 60)
		elif date_from_obj and not date_to_obj:
			date_to_obj = add_days(date_from_obj, 60)
		elif date_to_obj and not date_from_obj:
			date_from_obj = getdate(today_str())
			if date_from_obj > date_to_obj:
				date_from_obj = date_to_obj
		if date_from_obj and date_to_obj:
			filters["date_from"] = ["<=", date_to_obj]
			filters["date_to"] = [">=", date_from_obj]
		elif date_from_obj:
			filters["date_to"] = [">=", date_from_obj]
		elif date_to_obj:
			filters["date_from"] = ["<=", date_to_obj]
		if slot_status:
			filters["slot_status"] = slot_status
		
		slots = frappe.get_all(
			"Cheese Experience Slot",
			filters=filters,
			fields=[
				"name",
				"date_from",
				"date_to",
				"time_from",
				"max_capacity",
				"reserved_capacity",
				"slot_status",
			],
			order_by="date_from asc, time_from asc",
		)

		expanded = []
		for slot in slots:
			days = slot_calendar_days_in_range(
				slot.date_from, slot.date_to, date_from_obj, date_to_obj
			)
			for cal_day in days:
				available = get_available_capacity(slot.name, cal_day)
				expanded.append(
					{
						"name": slot.name,
						"slot_id": slot.name,
						"calendar_date": str(cal_day),
						"date": str(cal_day),
						"date_from": str(slot.date_from),
						"date_to": str(slot.date_to) if slot.date_to else None,
						"time_from": str(slot.time_from) if slot.time_from else None,
						"max_capacity": slot.max_capacity,
						"reserved_capacity": slot.reserved_capacity,
						"slot_status": slot.slot_status,
						"available_capacity": available,
					}
				)

		total = len(expanded)
		start = (page - 1) * page_size
		page_rows = expanded[start : start + page_size]
		
		return paginated_response(
			page_rows,
			"Time slots retrieved successfully",
			page=page,
			page_size=page_size,
			total=total
		)
	except Exception as e:
		frappe.log_error(f"Error in list_time_slots: {str(e)}")
		return error("Failed to list time slots", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def block_time_slot(slot_id, scope="this"):
	"""
	Block a time slot (US-10).

	Setting slot_status="BLOCKED" disables further bookings on that slot while
	keeping existing reservations intact. With ``scope="following"`` or
	``scope="all"`` the block is applied atomically to every slot in the same
	recurrence group, matching the Google-Calendar-style operations required
	by issues #260 and #269.
	"""
	return update_time_slot(slot_id, slot_status="BLOCKED", scope=scope, confirm_active_tickets=True)


@frappe.whitelist()
def link_booking_policy(experience_id, policy_id):
	"""
	Assign an existing shared booking policy to an experience (many-to-one).

	Args:
		experience_id: Cheese Experience name
		policy_id: Cheese Booking Policy name

	Returns:
		Success response
	"""
	try:
		if not experience_id:
			return validation_error("experience_id is required")
		if not policy_id:
			return validation_error("policy_id is required")

		if not frappe.db.exists("Cheese Experience", experience_id):
			return not_found("Experience", experience_id)
		if not frappe.db.exists("Cheese Booking Policy", policy_id):
			return not_found("Booking Policy", policy_id)

		try:
			assert_experience_access(experience_id)
		except frappe.PermissionError:
			return error("Unauthorized", "UNAUTHORIZED", {}, 403)

		frappe.db.set_value(
			"Cheese Experience",
			experience_id,
			"booking_policy",
			policy_id,
			update_modified=False,
		)
		frappe.db.commit()

		return success(
			"Booking policy linked successfully",
			{"experience_id": experience_id, "policy_id": policy_id},
		)
	except Exception as e:
		frappe.log_error(f"Error in link_booking_policy: {str(e)}")
		return error("Failed to link booking policy", "SERVER_ERROR", {"error": str(e)}, 500)


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

		try:
			assert_experience_access(experience_id)
		except frappe.PermissionError:
			return error("Unauthorized", "UNAUTHORIZED", {}, 403)

		# Resolve the policy currently in use by this experience
		# (new model: Experience.booking_policy; legacy: Booking Policy.experience back-ref)
		from cheese.cheese.utils.validation import get_booking_policy_for_experience
		policy_name = get_booking_policy_for_experience(experience_id, as_dict=False)

		if policy_name:
			policy = frappe.get_doc("Cheese Booking Policy", policy_name)
		else:
			policy = frappe.get_doc({
				"doctype": "Cheese Booking Policy",
				"policy_name": f"Policy for {experience_id}",
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
			policy.save(ignore_permissions=True)
		else:
			policy.insert(ignore_permissions=True)

		# Link policy on the experience (many experiences can share one policy).
		frappe.db.set_value(
			"Cheese Experience",
			experience_id,
			"booking_policy",
			policy.name,
			update_modified=False,
		)

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
def delete_time_slot(slot_id, scope="this"):
	"""
	Delete a time slot after checking for dependencies.

	When ``scope`` is "following" or "all" and the slot is part of a recurrence
	group, every slot in scope is deleted atomically: if any deletion fails
	(e.g. an active ticket on one of them), nothing is removed (issue #269).

	Args:
		slot_id: Slot ID to anchor the operation on.
		scope: One of "this", "following", "all".

	Returns:
		Success response with the list of deleted slot IDs.
	"""
	try:
		if not slot_id:
			return validation_error("slot_id is required")

		if not frappe.db.exists("Cheese Experience Slot", slot_id):
			return not_found("Slot", slot_id)

		try:
			base_slot = assert_slot_access(slot_id)
		except frappe.PermissionError:
			return error("Unauthorized", "UNAUTHORIZED", {}, 403)

		target_names = _resolve_slot_recurrence_scope(base_slot, scope)

		blocking = frappe.get_all(
			"Cheese Ticket",
			filters={
				"slot": ["in", target_names],
				"status": ["in", ["PENDING", "CONFIRMED", "CHECKED_IN"]],
			},
			fields=["name", "slot", "status"],
		)
		if blocking:
			# Group by slot so the operator sees which slot(s) are blocked.
			blocked_slots = sorted({b.slot for b in blocking})
			return validation_error(
				f"Cannot delete {len(blocked_slots)} slot(s) with active ticket(s); "
				"cancel them first.",
				{
					"blocked_slots": blocked_slots,
					"active_tickets": [b.name for b in blocking],
				},
			)

		deleted = []
		savepoint = "cheese_slot_bulk_delete"
		frappe.db.savepoint(savepoint)
		try:
			for name in target_names:
				frappe.delete_doc("Cheese Experience Slot", name, force=True, ignore_permissions=True)
				deleted.append(name)
		except Exception:
			frappe.db.rollback(save_point=savepoint)
			raise

		frappe.db.commit()

		return success(
			f"Deleted {len(deleted)} slot(s) successfully",
			{
				"scope": (scope or "this").lower(),
				"deleted_count": len(deleted),
				"deleted_slot_ids": deleted,
				"slot_id": slot_id,
			},
		)
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except Exception as e:
		frappe.log_error(f"Error in delete_time_slot: {str(e)}")
		return error("Failed to delete time slot", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def trim_recurrence_series(slot_id, new_end_date, confirm_active_tickets=False):
	"""Shorten a recurring slot series so it ends on ``new_end_date``.

	Mirrors Google Calendar's "change end date for this series" UX from
	issue #260: the user opens any slot in the series, picks a new series end
	date, and every sibling occurrence with ``date_from > new_end_date`` is
	removed atomically. Slots on or before the new end date are kept untouched.

	Args:
		slot_id: Any slot in the target recurrence group.
		new_end_date: Inclusive new series end date (YYYY-MM-DD).
		confirm_active_tickets: When False the call is rejected if any of the
			slots that would be deleted still has a non-terminal ticket. The
			frontend can re-call with this flag once the operator confirms.

	Returns:
		Success response with the list of trimmed slot IDs.
	"""
	try:
		if not slot_id:
			return validation_error("slot_id is required")
		if not new_end_date:
			return validation_error("new_end_date is required")

		try:
			new_end = getdate(new_end_date)
		except Exception:
			return validation_error("new_end_date must be a valid date (YYYY-MM-DD)")

		if not frappe.db.exists("Cheese Experience Slot", slot_id):
			return not_found("Slot", slot_id)

		try:
			base_slot = assert_slot_access(slot_id)
		except frappe.PermissionError:
			return error("Unauthorized", "UNAUTHORIZED", {}, 403)

		if not base_slot.recurrence_group_id:
			return validation_error(
				"This slot is not part of a recurring series. "
				"Use delete_time_slot or update_time_slot for individual slots."
			)

		# Pick every sibling whose start date falls AFTER the new series end.
		# Slots on the new end date are kept so the operator can pick the new
		# end date by clicking any slot in the series.
		trailing = frappe.get_all(
			"Cheese Experience Slot",
			filters={
				"recurrence_group_id": base_slot.recurrence_group_id,
				"date_from": [">", new_end],
			},
			pluck="name",
		)

		if not trailing:
			return success(
				"Series already ends on or before this date — nothing to trim",
				{
					"slot_id": base_slot.name,
					"new_end_date": str(new_end),
					"trimmed_count": 0,
					"trimmed_slot_ids": [],
				},
			)

		if not confirm_active_tickets:
			confirmed = _confirmed_tickets_on_slots(trailing)
			if confirmed > 0:
				return validation_error(
					f"Trimming the series removes {len(trailing)} slot(s) "
					f"holding {confirmed} CONFIRMED reservation(s). "
					"Re-submit with confirm_active_tickets=true to proceed.",
					{
						"trailing_slots": trailing,
						"confirmed_tickets": confirmed,
					},
				)

		blocking = frappe.get_all(
			"Cheese Ticket",
			filters={
				"slot": ["in", trailing],
				"status": ["in", ["PENDING", "CONFIRMED", "CHECKED_IN"]],
			},
			fields=["name", "slot", "status"],
		)
		if blocking and not confirm_active_tickets:
			return validation_error(
				f"Cannot trim series: {len(blocking)} active ticket(s) still attached. "
				"Cancel them first or pass confirm_active_tickets=true.",
				{
					"blocked_slots": sorted({b.slot for b in blocking}),
					"active_tickets": [b.name for b in blocking],
				},
			)

		deleted = []
		savepoint = "cheese_slot_series_trim"
		frappe.db.savepoint(savepoint)
		try:
			for name in trailing:
				frappe.delete_doc(
					"Cheese Experience Slot", name, force=True, ignore_permissions=True
				)
				deleted.append(name)
		except Exception:
			frappe.db.rollback(save_point=savepoint)
			raise

		frappe.db.commit()

		return success(
			f"Trimmed series — removed {len(deleted)} trailing slot(s)",
			{
				"slot_id": base_slot.name,
				"recurrence_group_id": base_slot.recurrence_group_id,
				"new_end_date": str(new_end),
				"trimmed_count": len(deleted),
				"trimmed_slot_ids": deleted,
			},
		)
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except Exception as e:
		frappe.log_error(f"Error in trim_recurrence_series: {str(e)}")
		return error("Failed to trim recurrence series", "SERVER_ERROR", {"error": str(e)}, 500)


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

		try:
			assert_experience_access(experience_id)
		except frappe.PermissionError:
			return error("Unauthorized", "UNAUTHORIZED", {}, 403)

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
