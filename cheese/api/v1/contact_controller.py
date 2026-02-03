# Copyright (c) 2024
# License: MIT

import frappe
from frappe import _
from cheese.api.common.responses import success, created, validation_error, error, not_found


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


@frappe.whitelist()
def resolve_or_create_contact(phone=None, email=None, name=None):
	"""
	Resolve or create a unique contact (deduplication by phone/email)
	Alias for find_or_create_contact to match ERP specification
	
	Args:
		phone: Phone number (optional)
		email: Email address (optional)
		name: Full name (optional)
		
	Returns:
		Success response with contact_id
	"""
	return find_or_create_contact(phone=phone, email=email, name=name)


@frappe.whitelist()
def update_contact(contact_id, name=None, phone=None, email=None, preferred_language=None, notes=None, preferred_channel=None, idempotency_key=None):
	"""
	Update contact fields
	
	Args:
		contact_id: Contact ID
		name: Full name
		phone: Phone number
		email: Email address
		preferred_language: Preferred language
		notes: Notes (privacy_notes field)
		preferred_channel: Preferred channel
		
	Returns:
		Success response with updated contact data
	"""
	try:
		if not contact_id:
			return validation_error("contact_id is required")
		
		if not frappe.db.exists("Cheese Contact", contact_id):
			return not_found("Contact", contact_id)
		
		contact = frappe.get_doc("Cheese Contact", contact_id)
		
		# Track changed fields
		changed_fields = []
		old_values = {}
		
		# Whitelist of allowed fields
		allowed_fields = {
			"name": "full_name",
			"phone": "phone",
			"email": "email",
			"preferred_language": "preferred_language",
			"notes": "privacy_notes",
			"preferred_channel": "preferred_channel"
		}
		
		# Update fields if provided
		if name is not None:
			old_values["full_name"] = contact.full_name
			contact.full_name = name
			changed_fields.append("full_name")
		if phone is not None:
			old_values["phone"] = contact.phone
			contact.phone = phone
			changed_fields.append("phone")
		if email is not None:
			old_values["email"] = contact.email
			contact.email = email
			changed_fields.append("email")
		if preferred_language is not None:
			old_values["preferred_language"] = contact.preferred_language
			contact.preferred_language = preferred_language
			changed_fields.append("preferred_language")
		if notes is not None:
			old_values["privacy_notes"] = contact.privacy_notes
			contact.privacy_notes = notes
			changed_fields.append("privacy_notes")
		if preferred_channel is not None:
			old_values["preferred_channel"] = contact.preferred_channel
			contact.preferred_channel = preferred_channel
			changed_fields.append("preferred_channel")
		
		if not changed_fields:
			return validation_error("No fields to update provided")
		
		# Create audit event
		audit_event_id = None
		try:
			# Log change event
			from frappe.utils import now_datetime
			audit_data = {
				"doctype": "Cheese System Event",
				"event_type": "CONTACT_UPDATED",
				"entity_type": "Cheese Contact",
				"entity_id": contact_id,
				"changed_fields": ", ".join(changed_fields),
				"old_values": str(old_values),
				"idempotency_key": idempotency_key,
				"timestamp": now_datetime()
			}
			audit_event = frappe.get_doc(audit_data)
			audit_event.insert(ignore_permissions=True)
			audit_event_id = audit_event.name
		except Exception as audit_error:
			frappe.log_error(f"Failed to create audit event: {str(audit_error)}")
		
		contact.save()
		frappe.db.commit()
		
		return success(
			"Contact updated successfully",
			{
				"contact": {
					"contact_id": contact.name,
					"full_name": contact.full_name,
					"phone": contact.phone,
					"email": contact.email,
					"preferred_language": contact.preferred_language,
					"preferred_channel": contact.preferred_channel
				},
				"changed_fields": changed_fields,
				"audit_event_id": audit_event_id
			}
		)
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except Exception as e:
		frappe.log_error(f"Error in update_contact: {str(e)}")
		return error("Failed to update contact", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def get_contact_profile(contact_id):
	"""
	Get contact profile with linked leads, conversations, and reservations
	
	Args:
		contact_id: Contact ID
		
	Returns:
		Success response with contact profile
	"""
	try:
		if not contact_id:
			return validation_error("contact_id is required")
		
		if not frappe.db.exists("Cheese Contact", contact_id):
			return not_found("Contact", contact_id)
		
		contact = frappe.get_doc("Cheese Contact", contact_id)
		
		# Get leads
		leads = frappe.get_all(
			"Cheese Lead",
			filters={"contact": contact_id},
			fields=["name", "status", "interest_type", "last_interaction_at", "lost_reason"],
			order_by="modified desc",
			limit=10
		)
		
		# Get conversations
		conversations = frappe.get_all(
			"Conversation",
			filters={"contact": contact_id},
			fields=["name", "channel", "status", "summary", "modified"],
			order_by="modified desc",
			limit=10
		)
		
		# Get reservations/tickets
		reservations = frappe.get_all(
			"Cheese Ticket",
			filters={"contact": contact_id},
			fields=["name", "status", "experience", "slot", "party_size", "created", "modified"],
			order_by="modified desc",
			limit=10
		)
		
		# Get quotations
		quotations = frappe.get_all(
			"Cheese Quotation",
			filters={"lead": ["in", [lead.name for lead in leads]]},
			fields=["name", "status", "total_price", "deposit_amount", "valid_until"],
			order_by="modified desc",
			limit=5
		)
		
		return success(
			"Contact profile retrieved successfully",
			{
				"contact_id": contact.name,
				"full_name": contact.full_name,
				"phone": contact.phone,
				"email": contact.email,
				"preferred_language": contact.preferred_language,
				"preferred_channel": contact.preferred_channel,
				"opt_in_status": contact.opt_in_status,
				"do_not_contact": contact.do_not_contact,
				"leads": leads,
				"leads_count": len(leads),
				"conversations": conversations,
				"conversations_count": len(conversations),
				"reservations": reservations,
				"reservations_count": len(reservations),
				"quotations": quotations,
				"quotations_count": len(quotations)
			}
		)
	except Exception as e:
		frappe.log_error(f"Error in get_contact_profile: {str(e)}")
		return error("Failed to get contact profile", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def get_contact_leads(contact_id, page=1, page_size=20):
	"""
	Get all leads for a contact
	
	Args:
		contact_id: Contact ID
		page: Page number
		page_size: Items per page
		
	Returns:
		Paginated response with leads
	"""
	try:
		from frappe.utils import cint
		from cheese.api.common.responses import paginated_response
		
		if not contact_id:
			return validation_error("contact_id is required")
		
		if not frappe.db.exists("Cheese Contact", contact_id):
			return not_found("Contact", contact_id)
		
		page = cint(page) or 1
		page_size = cint(page_size) or 20
		
		leads = frappe.get_all(
			"Cheese Lead",
			filters={"contact": contact_id},
			fields=["name", "status", "interest_type", "last_interaction_at", "lost_reason", "conversation", "modified"],
			limit_start=(page - 1) * page_size,
			limit_page_length=page_size,
			order_by="modified desc"
		)
		
		total = frappe.db.count("Cheese Lead", {"contact": contact_id})
		
		return paginated_response(
			leads,
			"Contact leads retrieved successfully",
			page=page,
			page_size=page_size,
			total=total
		)
	except Exception as e:
		frappe.log_error(f"Error in get_contact_leads: {str(e)}")
		return error("Failed to get contact leads", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def get_contact_conversations(contact_id, page=1, page_size=20):
	"""
	Get all conversations for a contact
	
	Args:
		contact_id: Contact ID
		page: Page number
		page_size: Items per page
		
	Returns:
		Paginated response with conversations
	"""
	try:
		from frappe.utils import cint
		from cheese.api.common.responses import paginated_response
		
		if not contact_id:
			return validation_error("contact_id is required")
		
		if not frappe.db.exists("Cheese Contact", contact_id):
			return not_found("Contact", contact_id)
		
		page = cint(page) or 1
		page_size = cint(page_size) or 20
		
		conversations = frappe.get_all(
			"Conversation",
			filters={"contact": contact_id},
			fields=["name", "channel", "status", "summary", "lead", "ticket", "route_booking", "modified"],
			limit_start=(page - 1) * page_size,
			limit_page_length=page_size,
			order_by="modified desc"
		)
		
		total = frappe.db.count("Conversation", {"contact": contact_id})
		
		return paginated_response(
			conversations,
			"Contact conversations retrieved successfully",
			page=page,
			page_size=page_size,
			total=total
		)
	except Exception as e:
		frappe.log_error(f"Error in get_contact_conversations: {str(e)}")
		return error("Failed to get contact conversations", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def get_contact_reservations(contact_id, page=1, page_size=20):
	"""
	Get all reservations for a contact
	
	Args:
		contact_id: Contact ID
		page: Page number
		page_size: Items per page
		
	Returns:
		Paginated response with reservations
	"""
	try:
		from frappe.utils import cint
		from cheese.api.common.responses import paginated_response
		
		if not contact_id:
			return validation_error("contact_id is required")
		
		if not frappe.db.exists("Cheese Contact", contact_id):
			return not_found("Contact", contact_id)
		
		page = cint(page) or 1
		page_size = cint(page_size) or 20
		
		reservations = frappe.get_all(
			"Cheese Ticket",
			filters={"contact": contact_id},
			fields=["name", "status", "experience", "slot", "party_size", "company", "route", "created", "modified"],
			limit_start=(page - 1) * page_size,
			limit_page_length=page_size,
			order_by="modified desc"
		)
		
		# Enrich with experience names
		for reservation in reservations:
			if reservation.experience:
				exp = frappe.db.get_value("Cheese Experience", reservation.experience, "name", as_dict=True)
				reservation["experience_name"] = exp.name if exp else None
		
		total = frappe.db.count("Cheese Ticket", {"contact": contact_id})
		
		return paginated_response(
			reservations,
			"Contact reservations retrieved successfully",
			page=page,
			page_size=page_size,
			total=total
		)
	except Exception as e:
		frappe.log_error(f"Error in get_contact_reservations: {str(e)}")
		return error("Failed to get contact reservations", "SERVER_ERROR", {"error": str(e)}, 500)
