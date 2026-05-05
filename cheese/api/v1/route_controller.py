# Copyright (c) 2024
# License: MIT

import json

import frappe
from frappe import _
from frappe.utils import add_to_date, cint, now_datetime

from cheese.api.common.responses import (
	created,
	error,
	not_found,
	paginated_response,
	success,
	validation_error,
)
from cheese.api.v1.bank_account_controller import get_active_bank_account_doc
from cheese.api.v1.deposit_controller import _amount_remaining_for_deposit, _select_open_deposit
from cheese.api.v1.route_booking_controller import _check_experiences_combinable
from cheese.api.v1.user_controller import _get_current_user_company


def _duration_to_seconds(duration_value):
	if duration_value is None:
		return 0
	if isinstance(duration_value, (int, float)):
		return int(duration_value)
	value = str(duration_value).strip()
	if not value:
		return 0
	if value.isdigit():
		return int(value)
	parts = value.split(":")
	try:
		if len(parts) == 3:
			hours, minutes, seconds = [int(p) for p in parts]
			return (hours * 3600) + (minutes * 60) + seconds
		if len(parts) == 2:
			hours, minutes = [int(p) for p in parts]
			return (hours * 3600) + (minutes * 60)
	except Exception:
		return 0
	return 0


def _time_to_seconds(time_value):
	if not time_value:
		return None
	value = str(time_value).strip()
	parts = value.split(":")
	try:
		hours = int(parts[0])
		minutes = int(parts[1]) if len(parts) > 1 else 0
		seconds = int(parts[2]) if len(parts) > 2 else 0
		return (hours * 3600) + (minutes * 60) + seconds
	except Exception:
		return None


def _seconds_to_time_label(total_seconds):
	if total_seconds is None:
		return None
	total = max(int(total_seconds), 0)
	hours = (total // 3600) % 24
	minutes = (total % 3600) // 60
	seconds = total % 60
	return f"{hours:02d}:{minutes:02d}:{seconds:02d}"


def _validate_route_experiences_no_overlap(experiences_list):
	scheduled = []
	for exp in experiences_list:
		exp_id = exp.get("experience")
		start_time = exp.get("start_time")
		if not exp_id or not start_time:
			continue
		start_seconds = _time_to_seconds(start_time)
		if start_seconds is None:
			return f"Invalid start_time format for experience {exp_id}"
		exp_doc = frappe.get_doc("Cheese Experience", exp_id)
		duration_seconds = _duration_to_seconds(exp_doc.event_duration)
		end_seconds = start_seconds + max(duration_seconds, 0)
		scheduled.append({
			"experience": exp_id,
			"start_seconds": start_seconds,
			"end_seconds": end_seconds,
		})

	scheduled.sort(key=lambda row: row["start_seconds"])
	for idx in range(1, len(scheduled)):
		prev = scheduled[idx - 1]
		current = scheduled[idx]
		if prev["end_seconds"] > current["start_seconds"]:
			return (
				f"Experience {prev['experience']} ({_seconds_to_time_label(prev['start_seconds'])}-{_seconds_to_time_label(prev['end_seconds'])}) "
				f"overlaps with {current['experience']} ({_seconds_to_time_label(current['start_seconds'])}-...)"
			)
	return None


@frappe.whitelist()
def create_route(
	name,
	description=None,
	status="OFFLINE",
	experiences=None,
	price_mode=None,
	price=None,
	short_description=None,
	google_maps_link=None
):
	"""
	Create a new route with experiences
	
	Args:
		name: Route name
		description: Route description
		status: Status (ONLINE/OFFLINE/ARCHIVED)
		experiences: JSON array of experience IDs with sequence [{"experience": "EXP-001", "sequence": 1}, ...]
		price_mode: Price mode (Manual/Sum)
		price: Manual price (if price_mode is Manual)
		
	Returns:
		Created response with route data
	"""
	try:
		if not name:
			return validation_error("name is required")

		# Validate status
		if status not in ["ONLINE", "OFFLINE", "ARCHIVED"]:
			return validation_error(f"Invalid status: {status}. Must be ONLINE, OFFLINE, or ARCHIVED")

		# Parse experiences if provided
		experiences_list = []
		if experiences:
			try:
				if isinstance(experiences, str):
					experiences_list = json.loads(experiences)
				else:
					experiences_list = experiences
			except Exception as e:
				return validation_error(f"Invalid experiences format: {e!s}")

		# Validate experiences exist and are eligible
		# If simple list of strings, convert to proper format
		normalized_experiences = []
		for idx, exp in enumerate(experiences_list):
			if isinstance(exp, str):
				normalized_experiences.append({
					"experience": exp,
					"sequence": idx + 1
				})
			elif isinstance(exp, dict):
				normalized_experiences.append(exp)
			else:
				return validation_error(f"Invalid experience format at index {idx}")

		experiences_list = normalized_experiences

		for exp in experiences_list:
			if not frappe.db.exists("Cheese Experience", exp.get("experience")):
				return not_found("Experience", exp.get("experience"))

			# Check if experience is eligible for routes
			exp_doc = frappe.get_doc("Cheese Experience", exp.get("experience"))
			if exp_doc.package_mode not in ["Route", "Both"]:
				return validation_error(
					f"Experience {exp.get('experience')} is not eligible for routes. "
					f"Package mode: {exp_doc.package_mode}"
				)

		# Create route
		route = frappe.get_doc({
			"doctype": "Cheese Route",
			"name": name,
			"description": description,
			# `Cheese Route.short_description` is required in the doctype schema.
			# The frontend currently sends the route "Name" as `name`, so we map it here.
			"short_description": short_description or name,
			"google_maps_link": google_maps_link,
			"status": status,
			"price_mode": price_mode,
			"price": price
		})

		# Add experiences
		for exp in experiences_list:
			route.append("experiences", {
				"experience": exp.get("experience"),
				"sequence": exp.get("sequence", 0),
				"start_time": exp.get("start_time"),
			})

		# Validate slot combinability when multiple experiences are present
		if len(experiences_list) >= 2:
			exp_ids = [exp.get("experience") for exp in experiences_list]
			combinable = _check_experiences_combinable(exp_ids)
			if combinable is False:
				return validation_error(
					"The experiences in this route have no valid slot combinations within the next 180 days. "
					"All their existing slots overlap in time. Please review the slot schedules before creating this route."
				)

		overlap_error = _validate_route_experiences_no_overlap(experiences_list)
		if overlap_error:
			return validation_error(overlap_error)

		route.insert()
		frappe.db.commit()

		return created(
			"Route created successfully",
			{
				"route_id": route.name,
				"name": route.name,
				"status": route.status,
				"experiences_count": len(experiences_list)
			}
		)
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except Exception as e:
		frappe.log_error(f"Error in create_route: {e!s}")
		return error("Failed to create route", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def update_route(
	route_id,
	name=None,
	description=None,
	status=None,
	experiences=None,
	price_mode=None,
	price=None,
	short_description=None,
	google_maps_link=None
):
	"""
	Update route details
	
	Args:
		route_id: Route ID
		name: Route name
		description: Route description
		status: Status
		experiences: JSON array of experiences
		price_mode: Price mode
		price: Price
		
	Returns:
		Success response with updated route data
	"""
	try:
		if not route_id:
			return validation_error("route_id is required")

		if not frappe.db.exists("Cheese Route", route_id):
			return not_found("Route", route_id)

		route = frappe.get_doc("Cheese Route", route_id)

		# Update fields
		if name is not None:
			route.name = name
		if description is not None:
			route.description = description
		if short_description is not None:
			route.short_description = short_description
		if google_maps_link is not None:
			route.google_maps_link = google_maps_link
		if status is not None:
			if status not in ["ONLINE", "OFFLINE", "ARCHIVED"]:
				return validation_error(f"Invalid status: {status}")
			route.status = status
		if price_mode is not None:
			route.price_mode = price_mode
		if price is not None:
			route.price = price

		# Update experiences if provided
		if experiences is not None:
			route.experiences = []
			try:
				if isinstance(experiences, str):
					experiences_list = json.loads(experiences)
				else:
					experiences_list = experiences

				for exp in experiences_list:
					if not frappe.db.exists("Cheese Experience", exp.get("experience")):
						return not_found("Experience", exp.get("experience"))

					route.append("experiences", {
						"experience": exp.get("experience"),
						"sequence": exp.get("sequence", 0),
						"start_time": exp.get("start_time"),
					})
			except Exception as e:
				return validation_error(f"Invalid experiences format: {e!s}")

		# Validate slot combinability when multiple experiences are present
		current_exp_ids = [row.experience for row in route.experiences]
		if len(current_exp_ids) >= 2:
			combinable = _check_experiences_combinable(current_exp_ids)
			if combinable is False:
				return validation_error(
					"The experiences in this route have no valid slot combinations within the next 180 days. "
					"All their existing slots overlap in time. Please review the slot schedules before saving this route."
				)

		current_experiences = [{"experience": row.experience, "start_time": row.start_time} for row in route.experiences]
		overlap_error = _validate_route_experiences_no_overlap(current_experiences)
		if overlap_error:
			return validation_error(overlap_error)

		route.save()
		frappe.db.commit()

		return success(
			"Route updated successfully",
			{
				"route_id": route.name,
				"name": route.name,
				"status": route.status
			}
		)
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except Exception as e:
		frappe.log_error(f"Error in update_route: {e!s}")
		return error("Failed to update route", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def get_route_detail(route_id):
	"""
	Get route details - composition, rules, conditions
	Alias for get_route_details to match ERP specification
	
	Args:
		route_id: Route ID
		
	Returns:
		Success response with route details
	"""
	return get_route_details(route_id)


@frappe.whitelist()
def get_route_details(route_id):
	"""
	Get route details with experiences
	
	Args:
		route_id: Route ID
		
	Returns:
		Success response with route details
	"""
	try:
		if not route_id:
			return validation_error("route_id is required")

		if not frappe.db.exists("Cheese Route", route_id):
			return not_found("Route", route_id)

		route = frappe.get_doc("Cheese Route", route_id)

		# Get experiences with details
		experiences = []
		for exp_row in route.experiences:
			exp_doc = frappe.get_doc("Cheese Experience", exp_row.experience)
			experiences.append({
				"experience_id": exp_row.experience,
				"experience_name": exp_doc.name,
				"description": exp_doc.description,
				"sequence": exp_row.sequence,
				"start_time": exp_row.start_time,
				"event_duration": exp_doc.event_duration,
				"end_time": _seconds_to_time_label(
					(_time_to_seconds(exp_row.start_time) or 0) + _duration_to_seconds(exp_doc.event_duration)
				) if exp_row.start_time else None,
				"status": exp_doc.status,
				"company": exp_doc.company
			})

		return success(
			"Route details retrieved successfully",
			{
				"route_id": route.name,
				"name": route.name,
				"description": route.description,
				"status": route.status,
				"google_maps_link": getattr(route, "google_maps_link", None),
				"price_mode": route.price_mode,
				"price": route.price,
				"deposit_required": route.deposit_required,
				"deposit_type": route.deposit_type,
				"deposit_value": route.deposit_value,
				"deposit_ttl_hours": route.deposit_ttl_hours,
				"experiences": experiences,
				"experiences_count": len(experiences)
			}
		)
	except Exception as e:
		frappe.log_error(f"Error in get_route_details: {e!s}")
		return error("Failed to get route details", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def list_routes(page=1, page_size=20, status=None, search=None, experiences=None):
	"""
	List routes with filters
	
	Args:
		page: Page number
		page_size: Items per page
		status: Filter by status
		search: Search term
		experiences: JSON array or comma-separated list of experience IDs (must include all)
		
	Returns:
		Paginated response with routes list
	"""
	try:
		page = cint(page) or 1
		page_size = cint(page_size) or 20

		filters = {}
		if status:
			filters["status"] = status

		user_company = _get_current_user_company()
		if user_company:
			company_exps = frappe.get_all("Cheese Experience", filters={"company": user_company}, pluck="name")
			if not company_exps:
				return paginated_response([], "No routes", page=page, page_size=page_size, total=0)

			user_route_rows = frappe.db.sql(
				"SELECT DISTINCT parent FROM `tabCheese Route Experience` WHERE experience IN %(exps)s",
				{"exps": tuple(company_exps)},
				as_dict=True
			)
			if not user_route_rows:
				return paginated_response([], "No routes", page=page, page_size=page_size, total=0)

			filters["name"] = ["in", [r.parent for r in user_route_rows]]

		if experiences:
			try:
				if isinstance(experiences, str):
					try:
						experience_ids = json.loads(experiences)
					except Exception:
						experience_ids = [e.strip() for e in experiences.split(",") if e.strip()]
				else:
					experience_ids = experiences
			except Exception as e:
				return validation_error(f"Invalid experiences format: {e!s}")

			if not isinstance(experience_ids, list) or not experience_ids:
				return validation_error("experiences must be a non-empty list")

			route_rows = frappe.db.sql(
				"""
				SELECT parent
				FROM `tabCheese Route Experience`
				WHERE experience IN %(experience_ids)s
				GROUP BY parent
				HAVING COUNT(DISTINCT experience) = %(experience_count)s
				""",
				{
					"experience_ids": tuple(experience_ids),
					"experience_count": len(set(experience_ids))
				},
				as_dict=True
			)

			if not route_rows:
				return paginated_response(
					[],
					"No routes found for these experiences",
					page=page,
					page_size=page_size,
					total=0
				)

			if "name" in filters:
				allowed_routes = set(filters["name"][1])
				matched_routes = set([row.parent for row in route_rows])
				final_routes = list(allowed_routes & matched_routes)
				if not final_routes:
					return paginated_response([], "No routes found for these experiences", page=page, page_size=page_size, total=0)
				filters["name"] = ["in", final_routes]
			else:
				filters["name"] = ["in", [row.parent for row in route_rows]]

		or_filters = []
		if search:
			or_filters.append(["name", "like", f"%{search}%"])

		routes = frappe.get_all(
			"Cheese Route",
			filters=filters,
			or_filters=or_filters if or_filters else None,
			fields=["name", "short_description", "google_maps_link", "name as route_id", "name as route_name", "description", "status", "price_mode", "price"],
			limit_start=(page - 1) * page_size,
			limit_page_length=page_size,
			order_by="name asc"
		)

		# Get experiences for each route
		for route in routes:
			experiences = frappe.get_all(
				"Cheese Route Experience",
				filters={"parent": route.name},
				fields=["experience", "sequence", "start_time"],
				order_by="sequence asc"
			)

			route["experiences"] = []
			for exp in experiences:
				# Get establishment and ID
				exp_details = frappe.get_value(
					"Cheese Experience",
					exp.experience,
					["name", "company"],
					as_dict=True
				)
				if exp_details:
					duration_value = frappe.db.get_value("Cheese Experience", exp.experience, "event_duration")
					end_time = None
					if exp.start_time:
						end_time = _seconds_to_time_label(
							(_time_to_seconds(exp.start_time) or 0) + _duration_to_seconds(duration_value)
						)
					route["experiences"].append({
						"id": exp_details.name,
						"experience": exp_details.name,
						"establishment": exp_details.company,
						"sequence": exp.sequence,
						"start_time": exp.start_time,
						"end_time": end_time,
					})

			route["experiences_count"] = len(route["experiences"])

		total = frappe.db.count("Cheese Route", filters=filters)

		return paginated_response(
			routes,
			"Routes retrieved successfully",
			page=page,
			page_size=page_size,
			total=total
		)
	except Exception as e:
		frappe.log_error(f"Error in list_routes: {e!s}")
		return error("Failed to list routes", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def publish_route(route_id):
	"""
	Publish route (set status to ONLINE)
	
	Args:
		route_id: Route ID
		
	Returns:
		Success response
	"""
	try:
		if not route_id:
			return validation_error("route_id is required")

		if not frappe.db.exists("Cheese Route", route_id):
			return not_found("Route", route_id)

		route = frappe.get_doc("Cheese Route", route_id)

		# Validate route has experiences
		if not route.experiences or len(route.experiences) == 0:
			return validation_error("Cannot publish route without experiences")

		route.status = "ONLINE"
		route.save()
		frappe.db.commit()

		return success("Route published successfully", {"route_id": route.name, "status": route.status})
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except Exception as e:
		frappe.log_error(f"Error in publish_route: {e!s}")
		return error("Failed to publish route", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def unpublish_route(route_id):
	"""
	Unpublish route (set status to OFFLINE)
	
	Args:
		route_id: Route ID
		
	Returns:
		Success response
	"""
	try:
		if not route_id:
			return validation_error("route_id is required")

		if not frappe.db.exists("Cheese Route", route_id):
			return not_found("Route", route_id)

		route = frappe.get_doc("Cheese Route", route_id)
		route.status = "OFFLINE"
		route.save()
		frappe.db.commit()

		return success("Route unpublished successfully", {"route_id": route.name, "status": route.status})
	except Exception as e:
		frappe.log_error(f"Error in unpublish_route: {e!s}")
		return error("Failed to unpublish route", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def archive_route(route_id):
	"""
	Archive route (set status to ARCHIVED)
	
	Args:
		route_id: Route ID
		
	Returns:
		Success response
	"""
	try:
		if not route_id:
			return validation_error("route_id is required")

		if not frappe.db.exists("Cheese Route", route_id):
			return not_found("Route", route_id)

		route = frappe.get_doc("Cheese Route", route_id)
		route.status = "ARCHIVED"
		route.save()
		frappe.db.commit()

		return success("Route archived successfully", {"route_id": route.name, "status": route.status})
	except Exception as e:
		frappe.log_error(f"Error in archive_route: {e!s}")
		return error("Failed to archive route", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def configure_route_deposit(route_id, deposit_required=None, deposit_type=None, deposit_value=None, deposit_ttl_hours=None):
	"""
	Configure deposit settings for a route (US-03)
	
	Args:
		route_id: Route ID
		deposit_required: Whether deposit is required
		deposit_type: Deposit type (Amount/%)
		deposit_value: Deposit value
		deposit_ttl_hours: Deposit TTL in hours
		
	Returns:
		Success response
	"""
	try:
		if not route_id:
			return validation_error("route_id is required")

		if not frappe.db.exists("Cheese Route", route_id):
			return not_found("Route", route_id)

		route = frappe.get_doc("Cheese Route", route_id)

		if deposit_required is not None:
			route.deposit_required = bool(deposit_required)

		if route.deposit_required:
			if deposit_type is not None:
				if deposit_type not in ["Amount", "%"]:
					return validation_error("deposit_type must be 'Amount' or '%'")
				route.deposit_type = deposit_type

			if deposit_value is not None:
				if deposit_value <= 0:
					return validation_error("deposit_value must be greater than 0")
				route.deposit_value = deposit_value

			if deposit_ttl_hours is not None:
				if deposit_ttl_hours <= 0:
					return validation_error("deposit_ttl_hours must be greater than 0")
				route.deposit_ttl_hours = deposit_ttl_hours

			# Validate all required fields are set
			if not route.deposit_type or not route.deposit_value or not route.deposit_ttl_hours:
				return validation_error("When deposit_required is true, deposit_type, deposit_value, and deposit_ttl_hours are required")

		route.save()
		frappe.db.commit()

		return success(
			"Route deposit configured successfully",
			{
				"route_id": route.name,
				"deposit_required": route.deposit_required,
				"deposit_type": route.deposit_type,
				"deposit_value": route.deposit_value,
				"deposit_ttl_hours": route.deposit_ttl_hours
			}
		)
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except Exception as e:
		frappe.log_error(f"Error in configure_route_deposit: {e!s}")
		return error("Failed to configure route deposit", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def configure_route_bank_account(route_id, bank_account_data):
	"""
	Configure bank account for route deposits (US-03)
	
	Args:
		route_id: Route ID
		bank_account_data: JSON with bank account details (holder, bank, account/IBAN, currency)
		
	Returns:
		Success response
	"""
	try:
		if not route_id:
			return validation_error("route_id is required")

		if not frappe.db.exists("Cheese Route", route_id):
			return not_found("Route", route_id)

		# Parse bank account data
		if isinstance(bank_account_data, str):
			bank_data = json.loads(bank_account_data)
		else:
			bank_data = bank_account_data

		# Validate required fields
		required_fields = ["holder", "bank", "account", "currency"]
		for field in required_fields:
			if field not in bank_data:
				return validation_error(f"Missing required field: {field}")

		# Create or update bank account record using Cheese Bank Account doctype
		bank_account_name = frappe.db.get_value(
			"Cheese Bank Account",
			{"route": route_id},
			"name"
		)

		if bank_account_name:
			bank_account = frappe.get_doc("Cheese Bank Account", bank_account_name)
		else:
			bank_account = frappe.get_doc({
				"doctype": "Cheese Bank Account",
				"route": route_id,
				"status": "ACTIVE"
			})

		bank_account.holder = bank_data.get("holder")
		bank_account.bank = bank_data.get("bank")
		bank_account.account = bank_data.get("account")
		bank_account.iban = bank_data.get("iban")
		bank_account.currency = bank_data.get("currency")
		bank_account.status = "ACTIVE"

		if bank_account_name:
			bank_account.save()
		else:
			bank_account.insert()

		frappe.db.commit()

		return success(
			"Bank account configured successfully",
			{
				"route_id": route_id,
				"bank_account": bank_data
			}
		)
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except Exception as e:
		frappe.log_error(f"Error in configure_route_bank_account: {e!s}")
		return error("Failed to configure bank account", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def get_route_deposit_instructions(route_booking_id):
	"""
	Get deposit payment instructions for a route booking (US-03)
	
	Args:
		route_booking_id: Route booking ID
		
	Returns:
		Success response with deposit instructions
	"""
	try:
		if not route_booking_id:
			return validation_error("route_booking_id is required")

		if not frappe.db.exists("Cheese Route Booking", route_booking_id):
			return not_found("Route Booking", route_booking_id)

		route_booking = frappe.get_doc("Cheese Route Booking", route_booking_id)
		route = frappe.get_doc("Cheese Route", route_booking.route)

		if not route_booking.deposit_required:
			return success(
				"No deposit required for this route booking",
				{
					"deposit_required": False,
					"route_booking_id": route_booking_id
				}
			)

		# Resolve bank account with route-level precedence.
		bank_account = get_active_bank_account_doc("Cheese Route", route.name)

		if not bank_account:
			return error(
				"Bank account not configured for this route",
				"CONFIGURATION_ERROR",
				{"route_id": route.name},
				400
			)

		# Get or create deposit
		deposit_name = _select_open_deposit("Cheese Route Booking", route_booking_id)
		if not deposit_name:
			existing_deposits = frappe.get_all(
				"Cheese Deposit",
				filters={"entity_type": "Cheese Route Booking", "entity_id": route_booking_id},
				fields=["name"],
				order_by="creation asc",
				limit=1,
			)
			if existing_deposits:
				deposit_name = existing_deposits[0].name

		if not deposit_name:
			# Create deposit
			from frappe.utils import add_to_date, now_datetime
			reservation_now = now_datetime()
			deposit_due_candidates = []
			for exp_row in route.experiences:
				exp_doc = frappe.get_doc("Cheese Experience", exp_row.experience)
				if exp_doc.deposit_required:
					deposit_due_candidates.append(
						add_to_date(
							reservation_now,
							hours=exp_doc.deposit_ttl_hours or 24,
							as_string=False,
						)
					)

			due_at = (
				min(deposit_due_candidates)
				if deposit_due_candidates
				else add_to_date(reservation_now, hours=route.deposit_ttl_hours or 24, as_string=False)
			)

			deposit = frappe.get_doc({
				"doctype": "Cheese Deposit",
				"entity_type": "Cheese Route Booking",
				"entity_id": route_booking_id,
				"amount_required": route_booking.deposit_amount,
				"status": "PENDING",
				"due_at": due_at
			})
			deposit.insert()
			deposit_name = deposit.name
			frappe.db.commit()
		else:
			deposit = frappe.get_doc("Cheese Deposit", deposit_name)

		return success(
			"Deposit instructions retrieved successfully",
			{
				"deposit_required": True,
				"deposit_id": deposit_name,
				"route_booking_id": route_booking_id,
				"amount_required": deposit.amount_required,
				"amount_paid": deposit.amount_paid or 0,
				"amount_remaining": _amount_remaining_for_deposit(deposit),
				"due_at": str(deposit.due_at) if deposit.due_at else None,
				"status": deposit.status,
				"bank_account": {
					"holder": bank_account.holder,
					"bank": bank_account.bank,
					"account": bank_account.account,
					"iban": bank_account.iban,
					"currency": bank_account.currency
				},
				"instructions": f"Please transfer {deposit.amount_required} {bank_account.currency} to account {bank_account.account} ({bank_account.bank})"
			}
		)
	except Exception as e:
		frappe.log_error(f"Error in get_route_deposit_instructions: {e!s}")
		return error("Failed to get deposit instructions", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def record_route_deposit_payment(route_booking_id, amount, verification_method="Manual", ocr_payload=None):
	"""
	Record deposit payment for a route booking (US-03)
	
	Args:
		route_booking_id: Route booking ID
		amount: Payment amount
		verification_method: Verification method (Manual/OCR)
		ocr_payload: Optional OCR payload JSON
		
	Returns:
		Success response
	"""
	try:
		if not route_booking_id:
			return validation_error("route_booking_id is required")
		if not amount or amount <= 0:
			return validation_error("amount must be greater than 0")

		if not frappe.db.exists("Cheese Route Booking", route_booking_id):
			return not_found("Route Booking", route_booking_id)

		# Get deposit
		deposit_name = _select_open_deposit("Cheese Route Booking", route_booking_id)

		if not deposit_name:
			return not_found("Deposit", f"for route booking {route_booking_id}")

		deposit = frappe.get_doc("Cheese Deposit", deposit_name)
		old_status = deposit.status
		old_amount_paid = deposit.amount_paid or 0

		deposit.record_payment(amount, verification_method, ocr_payload)
		frappe.db.commit()

		return success(
			"Route deposit payment recorded successfully",
			{
				"deposit_id": deposit.name,
				"route_booking_id": route_booking_id,
				"amount_paid": amount,
				"total_amount_paid": deposit.amount_paid or 0,
				"amount_required": deposit.amount_required,
				"amount_remaining": _amount_remaining_for_deposit(deposit),
				"old_status": old_status,
				"new_status": deposit.status,
				"verification_method": verification_method,
				"is_complete": deposit.status == "PAID"
			}
		)
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except Exception as e:
		frappe.log_error(f"Error in record_route_deposit_payment: {e!s}")
		return error("Failed to record route deposit payment", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def get_route_bank_account(route_id):
	"""
	Get bank account details for a route (US-03)
	
	Args:
		route_id: Route ID
		
	Returns:
		Success response with bank account details
	"""
	try:
		if not route_id:
			return validation_error("route_id is required")

		if not frappe.db.exists("Cheese Route", route_id):
			return not_found("Route", route_id)

		bank_account = get_active_bank_account_doc("Cheese Route", route_id)
		if not bank_account:
			return not_found("Bank Account", f"for route {route_id}")

		return success(
			"Bank account retrieved successfully",
			{
				"route_id": route_id,
				"bank_account_id": bank_account.name,
				"holder": bank_account.holder,
				"bank": bank_account.bank,
				"account": bank_account.account,
				"iban": bank_account.iban,
				"currency": bank_account.currency,
				"status": bank_account.status
			}
		)
	except Exception as e:
		frappe.log_error(f"Error in get_route_bank_account: {e!s}")
		return error("Failed to get route bank account", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def get_experiences_by_route(route_id):
	"""
	Get the list of experience IDs belonging to a route.
	Used by the frontend for cascading/dependent filters.

	Args:
		route_id: Route ID

	Returns:
		Success response with list of experience IDs
	"""
	try:
		if not route_id:
			return validation_error("route_id is required")

		if not frappe.db.exists("Cheese Route", route_id):
			return not_found("Route", route_id)

		experiences = frappe.get_all(
			"Cheese Route Experience",
			filters={"parent": route_id},
			fields=["experience", "sequence", "start_time"],
			order_by="sequence asc"
		)

		experience_ids = [e.experience for e in experiences]
		enhanced_experiences = []
		for row in experiences:
			duration_value = frappe.db.get_value("Cheese Experience", row.experience, "event_duration")
			end_time = None
			if row.start_time:
				end_time = _seconds_to_time_label(
					(_time_to_seconds(row.start_time) or 0) + _duration_to_seconds(duration_value)
				)
			enhanced_experiences.append({
				"experience": row.experience,
				"sequence": row.sequence,
				"start_time": row.start_time,
				"event_duration": duration_value,
				"end_time": end_time,
			})

		return success(
			"Route experiences retrieved successfully",
			{
				"route_id": route_id,
				"experience_ids": experience_ids,
				"experiences": enhanced_experiences,
				"count": len(experience_ids)
			}
		)
	except Exception as e:
		frappe.log_error(f"Error in get_experiences_by_route: {e!s}")
		return error("Failed to get route experiences", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def delete_route(route_id):
	"""
	Delete a route after checking for active bookings.

	Args:
		route_id: Route ID

	Returns:
		Success response
	"""
	try:
		if not route_id:
			return validation_error("route_id is required")

		if not frappe.db.exists("Cheese Route", route_id):
			return not_found("Route", route_id)

		# Check for active bookings
		active_bookings = frappe.db.count(
			"Cheese Route Booking",
			filters={"route": route_id, "status": ["in", ["PENDING", "CONFIRMED"]]}
		)
		if active_bookings > 0:
			return validation_error(
				f"Cannot delete route with {active_bookings} active booking(s). Cancel them first."
			)

		frappe.delete_doc("Cheese Route", route_id, force=True)
		frappe.db.commit()

		return success("Route deleted successfully", {"route_id": route_id})
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except Exception as e:
		frappe.log_error(f"Error in delete_route: {e!s}")
		return error("Failed to delete route", "SERVER_ERROR", {"error": str(e)}, 500)

