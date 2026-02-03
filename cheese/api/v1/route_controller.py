# Copyright (c) 2024
# License: MIT

import frappe
from frappe import _
from frappe.utils import add_to_date, now_datetime, cint
from cheese.api.common.responses import success, created, error, not_found, validation_error, paginated_response
import json


@frappe.whitelist()
def create_route(name, description=None, status="OFFLINE", experiences=None, price_mode=None, price=None):
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
				return validation_error(f"Invalid experiences format: {str(e)}")
		
		# Validate experiences exist and are eligible
		for exp in experiences_list:
			if not frappe.db.exists("Cheese Experience", exp.get("experience")):
				return not_found("Experience", exp.get("experience"))
			
			# Check if experience is eligible for packages
			exp_doc = frappe.get_doc("Cheese Experience", exp.get("experience"))
			if exp_doc.package_mode not in ["Package", "Both"]:
				return validation_error(
					f"Experience {exp.get('experience')} is not eligible for packages. "
					f"Package mode: {exp_doc.package_mode}"
				)
		
		# Create route
		route = frappe.get_doc({
			"doctype": "Cheese Route",
			"name": name,
			"description": description,
			"status": status,
			"price_mode": price_mode,
			"price": price
		})
		
		# Add experiences
		for exp in experiences_list:
			route.append("experiences", {
				"experience": exp.get("experience"),
				"sequence": exp.get("sequence", 0)
			})
		
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
		frappe.log_error(f"Error in create_route: {str(e)}")
		return error("Failed to create route", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def update_route(route_id, name=None, description=None, status=None, experiences=None, price_mode=None, price=None):
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
						"sequence": exp.get("sequence", 0)
					})
			except Exception as e:
				return validation_error(f"Invalid experiences format: {str(e)}")
		
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
		frappe.log_error(f"Error in update_route: {str(e)}")
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
		frappe.log_error(f"Error in get_route_details: {str(e)}")
		return error("Failed to get route details", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def list_routes(page=1, page_size=20, status=None, search=None):
	"""
	List routes with filters
	
	Args:
		page: Page number
		page_size: Items per page
		status: Filter by status
		search: Search term
		
	Returns:
		Paginated response with routes list
	"""
	try:
		page = cint(page) or 1
		page_size = cint(page_size) or 20
		
		filters = {}
		if status:
			filters["status"] = status
		
		or_filters = []
		if search:
			or_filters.append(["name", "like", f"%{search}%"])
		
		routes = frappe.get_all(
			"Cheese Route",
			filters=filters,
			or_filters=or_filters if or_filters else None,
			fields=["name", "name as route_name", "description", "status", "price_mode", "price"],
			limit_start=(page - 1) * page_size,
			limit_page_length=page_size,
			order_by="name asc"
		)
		
		# Get experiences count for each route
		for route in routes:
			route["experiences_count"] = frappe.db.count(
				"Cheese Route Experience",
				{"parent": route.name}
			)
		
		total = frappe.db.count("Cheese Route", filters=filters)
		
		return paginated_response(
			routes,
			"Routes retrieved successfully",
			page=page,
			page_size=page_size,
			total=total
		)
	except Exception as e:
		frappe.log_error(f"Error in list_routes: {str(e)}")
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
		frappe.log_error(f"Error in publish_route: {str(e)}")
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
		frappe.log_error(f"Error in unpublish_route: {str(e)}")
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
		frappe.log_error(f"Error in archive_route: {str(e)}")
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
		frappe.log_error(f"Error in configure_route_deposit: {str(e)}")
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
		
		# Store bank account data (could be in a custom field or separate doctype)
		# For now, we'll store as JSON in a custom field or create a Bank Account doctype
		# This is a placeholder - actual implementation would depend on data model
		route = frappe.get_doc("Cheese Route", route_id)
		
		# If there's a custom field for bank account, use it
		# Otherwise, this would need a Cheese Bank Account doctype
		if hasattr(route, "bank_account_json"):
			route.bank_account_json = json.dumps(bank_data)
		else:
			# Create or update bank account record if doctype exists
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
					"route": route_id
				})
			
			bank_account.holder = bank_data.get("holder")
			bank_account.bank = bank_data.get("bank")
			bank_account.account = bank_data.get("account")
			bank_account.iban = bank_data.get("iban")
			bank_account.currency = bank_data.get("currency")
			
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
		frappe.log_error(f"Error in configure_route_bank_account: {str(e)}")
		return error("Failed to configure bank account", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def get_route_deposit_instructions(route_booking_id):
	"""
	Get deposit payment instructions for a route booking (US-03)
	
	Args:
		route_booking_id: Route booking ID (would need RouteBooking doctype)
		
	Returns:
		Success response with deposit instructions
	"""
	try:
		if not route_booking_id:
			return validation_error("route_booking_id is required")
		
		# This would work with a RouteBooking doctype
		# For now, return a placeholder response
		# In actual implementation, this would:
		# 1. Get route booking
		# 2. Get route deposit policy
		# 3. Calculate deposit amount
		# 4. Get bank account details
		# 5. Return payment instructions
		
		return success(
			"Deposit instructions retrieved successfully",
			{
				"route_booking_id": route_booking_id,
				"note": "This endpoint requires RouteBooking doctype implementation"
			}
		)
	except Exception as e:
		frappe.log_error(f"Error in get_route_deposit_instructions: {str(e)}")
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
		
		# This would work with RouteBooking and Deposit doctypes
		# Similar to record_deposit_payment in deposit_controller.py
		
		return success(
			"Route deposit payment recorded successfully",
			{
				"route_booking_id": route_booking_id,
				"amount": amount,
				"verification_method": verification_method,
				"note": "This endpoint requires RouteBooking doctype implementation"
			}
		)
	except Exception as e:
		frappe.log_error(f"Error in record_route_deposit_payment: {str(e)}")
		return error("Failed to record route deposit payment", "SERVER_ERROR", {"error": str(e)}, 500)
