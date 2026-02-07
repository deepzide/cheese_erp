# Copyright (c) 2024
# License: MIT

import frappe
from frappe import _
from frappe.utils import now_datetime
from cheese.api.common.responses import success, created, error, not_found, validation_error


@frappe.whitelist()
def create_complaint(contact_id, description, ticket_id=None, route_booking_id=None, complaint_type=None):
	"""
	Create complaint - creates support case/complaint
	
	Args:
		contact_id: Contact ID
		description: Complaint description
		ticket_id: Related ticket ID (optional)
		route_booking_id: Related route booking ID (optional)
		complaint_type: Complaint type (optional)
		
	Returns:
		Created response with complaint data
	"""
	try:
		if not contact_id:
			return validation_error("contact_id is required")
		if not description:
			return validation_error("description is required")
		
		if not frappe.db.exists("Cheese Contact", contact_id):
			return not_found("Contact", contact_id)
		
		# Validate ticket if provided
		if ticket_id:
			if not frappe.db.exists("Cheese Ticket", ticket_id):
				return not_found("Ticket", ticket_id)
		
		# Create support case
		support_case = frappe.get_doc({
			"doctype": "Cheese Support Case",
			"contact": contact_id,
			"ticket": ticket_id,
			"description": description,
			"status": "OPEN"
		})
		support_case.insert()
		frappe.db.commit()
		
		return created(
			"Complaint created successfully",
			{
				"complaint_id": support_case.name,
				"support_case_id": support_case.name,
				"contact_id": contact_id,
				"ticket_id": ticket_id,
				"route_booking_id": route_booking_id,
				"status": support_case.status,
				"created_at": str(support_case.creation) if support_case.creation else None
			}
		)
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except Exception as e:
		frappe.log_error(f"Error in create_complaint: {str(e)}")
		return error("Failed to create complaint", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def update_support_case_status(support_case_id, status, notes=None, assigned_to=None):
	"""
	Update support case status and assignment (US-SUR-02)
	
	Args:
		support_case_id: Support case ID
		status: New status (OPEN/IN_PROGRESS/RESOLVED/CLOSED)
		notes: Optional notes
		assigned_to: Optional user to assign to
		
	Returns:
		Success response
	"""
	try:
		if not support_case_id:
			return validation_error("support_case_id is required")
		if not status:
			return validation_error("status is required")
		
		if status not in ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]:
			return validation_error(f"Invalid status: {status}")
		
		if not frappe.db.exists("Cheese Support Case", support_case_id):
			return not_found("Support Case", support_case_id)
		
		support_case = frappe.get_doc("Cheese Support Case", support_case_id)
		old_status = support_case.status
		
		support_case.status = status
		if assigned_to:
			if frappe.db.exists("User", assigned_to):
				support_case.assigned_to = assigned_to
			else:
				return not_found("User", assigned_to)
		
		# Add notes to description if provided
		if notes:
			support_case.description = f"{support_case.description}\n\n--- Update ---\n{notes}"
		
		support_case.save()
		frappe.db.commit()
		
		return success(
			"Support case updated successfully",
			{
				"support_case_id": support_case.name,
				"old_status": old_status,
				"new_status": support_case.status,
				"assigned_to": support_case.assigned_to,
				"updated_at": str(support_case.modified)
			}
		)
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except Exception as e:
		frappe.log_error(f"Error in update_support_case_status: {str(e)}")
		return error("Failed to update support case", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def list_support_cases(status=None, contact_id=None, assigned_to=None, page=1, page_size=20):
	"""
	List support cases with filters (US-SUR-02)
	
	Args:
		status: Filter by status
		contact_id: Filter by contact
		assigned_to: Filter by assigned user
		page: Page number
		page_size: Page size
		
	Returns:
		Success response with support cases
	"""
	try:
		filters = {}
		if status:
			filters["status"] = status
		if contact_id:
			filters["contact"] = contact_id
		if assigned_to:
			filters["assigned_to"] = assigned_to
		
		support_cases = frappe.get_all(
			"Cheese Support Case",
			filters=filters,
			fields=["name", "contact", "ticket", "status", "priority", "assigned_to", "creation", "modified"],
			limit_start=(page - 1) * page_size,
			limit_page_length=page_size,
			order_by="modified desc"
		)
		
		total = frappe.db.count("Cheese Support Case", filters=filters)
		
		from cheese.api.common.responses import paginated_response
		return paginated_response(
			support_cases,
			"Support cases retrieved successfully",
			page=page,
			page_size=page_size,
			total=total
		)
	except Exception as e:
		frappe.log_error(f"Error in list_support_cases: {str(e)}")
		return error("Failed to list support cases", "SERVER_ERROR", {"error": str(e)}, 500)
