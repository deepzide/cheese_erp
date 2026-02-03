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
