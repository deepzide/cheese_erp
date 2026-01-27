# Copyright (c) 2024
# License: MIT

import frappe
from frappe import _
from cheese.api.common.responses import success, created, validation_error, error


@frappe.whitelist()
def find_or_create_contact(phone=None, email=None, name=None):
	"""
	Find or create a contact (idempotent)
	
	Args:
		phone: Phone number (optional)
		email: Email address (optional)
		name: Full name (optional)
		
	Returns:
		Success response with contact data
	"""
	try:
		# Validate inputs
		if not phone and not email:
			return validation_error("Either phone or email must be provided")

		# Search for existing contact using OR logic (phone OR email)
		or_filters = []
		if phone:
			or_filters.append(["phone", "=", phone])
		if email:
			or_filters.append(["email", "=", email])

		existing = frappe.get_all(
			"Cheese Contact",
			or_filters=or_filters,
			fields=["name", "full_name", "phone", "email"],
			limit=1
		)

		if existing:
			contact = existing[0]
			return success(
				"Contact found",
				{
					"contact_id": contact.name,
					"full_name": contact.full_name,
					"phone": contact.phone,
					"email": contact.email,
					"is_new": False
				}
			)

		# Create new contact
		contact_data = {
			"doctype": "Cheese Contact",
			"phone": phone,
			"email": email
		}
		
		# Set full name - prioritize provided name, otherwise use phone or email
		if name:
			contact_data["full_name"] = name
		elif phone:
			contact_data["full_name"] = phone
		elif email:
			contact_data["full_name"] = email
		
		contact = frappe.get_doc(contact_data)
		contact.insert()
		frappe.db.commit()

		return created(
			"Contact created successfully",
			{
				"contact_id": contact.name,
				"full_name": contact.full_name,
				"phone": contact.phone,
				"email": contact.email,
				"is_new": True
			}
		)
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except Exception as e:
		frappe.log_error(f"Error in find_or_create_contact: {str(e)}")
		return error("Failed to create contact", "SERVER_ERROR", {"error": str(e)}, 500)
