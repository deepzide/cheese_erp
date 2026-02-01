# Copyright (c) 2024
# License: MIT

import frappe
from frappe import _
from frappe.utils import add_to_date, now_datetime, cint, get_datetime
from cheese.api.common.responses import success, created, error, not_found, validation_error, paginated_response
from cheese.cheese.utils.pricing import calculate_ticket_price, calculate_deposit_amount
import json


@frappe.whitelist()
def create_quotation(lead_id, conversation_id=None, route_id=None, experiences=None, dates=None, party_size=1, valid_until_hours=24):
	"""
	Create a quotation with options and total price
	
	Args:
		lead_id: Lead ID
		conversation_id: Conversation ID (optional)
		route_id: Route ID (if quoting a route)
		experiences: JSON array of experience IDs [{"experience": "EXP-001", "date": "2024-12-31", "slot_id": "SLOT-001"}]
		dates: Proposed dates (if not in experiences)
		party_size: Number of people
		valid_until_hours: Validity in hours (default: 24)
		
	Returns:
		Created response with quotation data
	"""
	try:
		if not lead_id:
			return validation_error("lead_id is required")
		
		if not frappe.db.exists("Cheese Lead", lead_id):
			return not_found("Lead", lead_id)
		
		# Validate route or experiences
		if route_id:
			if not frappe.db.exists("Cheese Route", route_id):
				return not_found("Route", route_id)
		elif not experiences:
			return validation_error("Either route_id or experiences must be provided")
		
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
		
		# Calculate total price
		total_price = 0
		deposit_amount = 0
		snapshot_data = {
			"route_id": route_id,
			"experiences": [],
			"party_size": party_size,
			"pricing_rules": {}
		}
		
		if route_id:
			route = frappe.get_doc("Cheese Route", route_id)
			if route.price_mode == "Manual" and route.price:
				total_price = route.price * party_size
			elif route.price_mode == "Sum":
				# Sum up route experiences
				for exp_row in route.experiences:
					exp = frappe.get_doc("Cheese Experience", exp_row.experience)
					if exp.route_price:
						total_price += exp.route_price * party_size
					elif exp.individual_price:
						total_price += exp.individual_price * party_size
			
			# Calculate deposit if route has deposit policy
			if route.deposit_required:
				if route.deposit_type == "Amount":
					deposit_amount = route.deposit_value
				elif route.deposit_type == "%":
					deposit_amount = (total_price * route.deposit_value) / 100
			
			snapshot_data["route"] = {
				"route_id": route.name,
				"name": route.name,
				"price_mode": route.price_mode,
				"price": route.price
			}
		else:
			# Calculate from individual experiences
			for exp_item in experiences_list:
				exp_id = exp_item.get("experience")
				if not frappe.db.exists("Cheese Experience", exp_id):
					return not_found("Experience", exp_id)
				
				exp = frappe.get_doc("Cheese Experience", exp_id)
				price_data = calculate_ticket_price(exp_id, party_size)
				total_price += price_data.get("total_price", 0)
				
				# Calculate deposit
				deposit = calculate_deposit_amount(exp_id, price_data.get("total_price", 0))
				deposit_amount += deposit
				
				snapshot_data["experiences"].append({
					"experience_id": exp_id,
					"experience_name": exp.name,
					"date": exp_item.get("date"),
					"slot_id": exp_item.get("slot_id"),
					"price": price_data.get("total_price", 0),
					"deposit": deposit
				})
		
		# Calculate valid_until
		valid_until = add_to_date(now_datetime(), hours=valid_until_hours, as_string=False)
		
		# Create quotation
		quotation = frappe.get_doc({
			"doctype": "Cheese Quotation",
			"lead": lead_id,
			"conversation": conversation_id,
			"total_price": total_price,
			"deposit_amount": deposit_amount,
			"status": "DRAFT",
			"valid_until": valid_until,
			"snapshot_json": json.dumps(snapshot_data)
		})
		quotation.insert()
		frappe.db.commit()
		
		return created(
			"Quotation created successfully",
			{
				"quotation_id": quotation.name,
				"lead_id": lead_id,
				"total_price": total_price,
				"deposit_amount": deposit_amount,
				"valid_until": str(valid_until),
				"status": quotation.status
			}
		)
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except Exception as e:
		frappe.log_error(f"Error in create_quotation: {str(e)}")
		return error("Failed to create quotation", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def get_quotation_details(quotation_id):
	"""
	Get quotation details with items and pricing
	
	Args:
		quotation_id: Quotation ID
		
	Returns:
		Success response with quotation details
	"""
	try:
		if not quotation_id:
			return validation_error("quotation_id is required")
		
		if not frappe.db.exists("Cheese Quotation", quotation_id):
			return not_found("Quotation", quotation_id)
		
		quotation = frappe.get_doc("Cheese Quotation", quotation_id)
		
		# Parse snapshot
		snapshot = {}
		if quotation.snapshot_json:
			try:
				snapshot = json.loads(quotation.snapshot_json)
			except Exception:
				pass
		
		return success(
			"Quotation details retrieved successfully",
			{
				"quotation_id": quotation.name,
				"lead_id": quotation.lead,
				"conversation_id": quotation.conversation,
				"total_price": quotation.total_price,
				"deposit_amount": quotation.deposit_amount,
				"status": quotation.status,
				"valid_until": str(quotation.valid_until) if quotation.valid_until else None,
				"snapshot": snapshot,
				"is_expired": quotation.valid_until and quotation.valid_until < now_datetime() if quotation.valid_until else False
			}
		)
	except Exception as e:
		frappe.log_error(f"Error in get_quotation_details: {str(e)}")
		return error("Failed to get quotation details", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def update_quotation_status(quotation_id, status):
	"""
	Update quotation status
	
	Args:
		quotation_id: Quotation ID
		status: New status (DRAFT/SENT/ACCEPTED/EXPIRED)
		
	Returns:
		Success response
	"""
	try:
		if not quotation_id:
			return validation_error("quotation_id is required")
		if not status:
			return validation_error("status is required")
		
		if status not in ["DRAFT", "SENT", "ACCEPTED", "EXPIRED"]:
			return validation_error(f"Invalid status: {status}")
		
		if not frappe.db.exists("Cheese Quotation", quotation_id):
			return not_found("Quotation", quotation_id)
		
		quotation = frappe.get_doc("Cheese Quotation", quotation_id)
		old_status = quotation.status
		quotation.status = status
		quotation.save()
		frappe.db.commit()
		
		return success(
			"Quotation status updated successfully",
			{
				"quotation_id": quotation.name,
				"old_status": old_status,
				"new_status": quotation.status
			}
		)
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except Exception as e:
		frappe.log_error(f"Error in update_quotation_status: {str(e)}")
		return error("Failed to update quotation status", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def accept_quotation(quotation_id):
	"""
	Accept quotation and convert to reservation
	
	Args:
		quotation_id: Quotation ID
		
	Returns:
		Success response with ticket data
	"""
	try:
		if not quotation_id:
			return validation_error("quotation_id is required")
		
		if not frappe.db.exists("Cheese Quotation", quotation_id):
			return not_found("Quotation", quotation_id)
		
		quotation = frappe.get_doc("Cheese Quotation", quotation_id)
		
		# Validate quotation is not expired
		if quotation.valid_until and quotation.valid_until < now_datetime():
			return validation_error("Quotation has expired")
		
		# Validate availability before converting
		validation_result = validate_quotation_availability(quotation_id)
		if not validation_result.get("success"):
			return validation_result
		
		# Get lead and contact
		if not quotation.lead:
			return validation_error("Quotation has no associated lead")
		
		lead = frappe.get_doc("Cheese Lead", quotation.lead)
		contact_id = lead.contact
		
		# Parse snapshot to get experiences
		snapshot = {}
		if quotation.snapshot_json:
			try:
				snapshot = json.loads(quotation.snapshot_json)
			except Exception:
				pass
		
		# Create tickets for each experience
		tickets = []
		experiences_list = snapshot.get("experiences", [])
		party_size = snapshot.get("party_size", 1)
		
		for exp_item in experiences_list:
			exp_id = exp_item.get("experience_id")
			slot_id = exp_item.get("slot_id")
			
			if exp_id and slot_id:
				from cheese.api.v1.ticket_controller import create_pending_ticket
				ticket_result = create_pending_ticket(contact_id, exp_id, slot_id, party_size)
				
				if ticket_result.get("success"):
					tickets.append(ticket_result.get("data", {}).get("ticket_id"))
		
		# Update quotation status
		quotation.status = "ACCEPTED"
		quotation.save()
		
		# Update lead status
		lead.status = "CONVERTED"
		lead.save()
		
		frappe.db.commit()
		
		return success(
			"Quotation accepted and converted to reservation",
			{
				"quotation_id": quotation.name,
				"tickets": tickets,
				"tickets_count": len(tickets)
			}
		)
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except Exception as e:
		frappe.log_error(f"Error in accept_quotation: {str(e)}")
		return error("Failed to accept quotation", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def list_quotations(page=1, page_size=20, lead_id=None, status=None):
	"""
	List quotations with filters
	
	Args:
		page: Page number
		page_size: Items per page
		lead_id: Filter by lead
		status: Filter by status
		
	Returns:
		Paginated response with quotations list
	"""
	try:
		page = cint(page) or 1
		page_size = cint(page_size) or 20
		
		filters = {}
		if lead_id:
			filters["lead"] = lead_id
		if status:
			filters["status"] = status
		
		quotations = frappe.get_all(
			"Cheese Quotation",
			filters=filters,
			fields=["name", "lead", "conversation", "total_price", "deposit_amount", "status", "valid_until", "modified"],
			limit_start=(page - 1) * page_size,
			limit_page_length=page_size,
			order_by="modified desc"
		)
		
		# Check expiration
		for quote in quotations:
			if quote.valid_until:
				quote["is_expired"] = get_datetime(quote.valid_until) < now_datetime()
			else:
				quote["is_expired"] = False
		
		total = frappe.db.count("Cheese Quotation", filters=filters)
		
		return paginated_response(
			quotations,
			"Quotations retrieved successfully",
			page=page,
			page_size=page_size,
			total=total
		)
	except Exception as e:
		frappe.log_error(f"Error in list_quotations: {str(e)}")
		return error("Failed to list quotations", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def validate_quotation_availability(quotation_id):
	"""
	Revalidate quotation availability before conversion
	
	Args:
		quotation_id: Quotation ID
		
	Returns:
		Success response with validation result
	"""
	try:
		if not quotation_id:
			return validation_error("quotation_id is required")
		
		if not frappe.db.exists("Cheese Quotation", quotation_id):
			return not_found("Quotation", quotation_id)
		
		quotation = frappe.get_doc("Cheese Quotation", quotation_id)
		
		# Parse snapshot
		snapshot = {}
		if quotation.snapshot_json:
			try:
				snapshot = json.loads(quotation.snapshot_json)
			except Exception:
				pass
		
		# Validate each experience/slot
		experiences_list = snapshot.get("experiences", [])
		validation_results = []
		all_available = True
		
		for exp_item in experiences_list:
			exp_id = exp_item.get("experience_id")
			slot_id = exp_item.get("slot_id")
			
			if exp_id and slot_id:
				# Check if slot exists and has capacity
				if not frappe.db.exists("Cheese Experience Slot", slot_id):
					validation_results.append({
						"experience_id": exp_id,
						"slot_id": slot_id,
						"available": False,
						"reason": "Slot does not exist"
					})
					all_available = False
					continue
				
				slot = frappe.get_doc("Cheese Experience Slot", slot_id)
				if slot.slot_status != "OPEN":
					validation_results.append({
						"experience_id": exp_id,
						"slot_id": slot_id,
						"available": False,
						"reason": f"Slot is {slot.slot_status}"
					})
					all_available = False
					continue
				
				# Check capacity
				from cheese.cheese.utils.capacity import get_available_capacity
				available = get_available_capacity(slot_id)
				party_size = snapshot.get("party_size", 1)
				
				if available < party_size:
					validation_results.append({
						"experience_id": exp_id,
						"slot_id": slot_id,
						"available": False,
						"reason": f"Insufficient capacity. Available: {available}, Required: {party_size}"
					})
					all_available = False
				else:
					validation_results.append({
						"experience_id": exp_id,
						"slot_id": slot_id,
						"available": True
					})
		
		if not all_available:
			return validation_error(
				"Some experiences are no longer available",
				{"validation_results": validation_results}
			)
		
		return success(
			"Quotation availability validated successfully",
			{
				"quotation_id": quotation_id,
				"all_available": True,
				"validation_results": validation_results
			}
		)
	except Exception as e:
		frappe.log_error(f"Error in validate_quotation_availability: {str(e)}")
		return error("Failed to validate quotation availability", "SERVER_ERROR", {"error": str(e)}, 500)
