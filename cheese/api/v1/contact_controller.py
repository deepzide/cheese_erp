# Copyright (c) 2024
# License: MIT

import frappe
import json
from frappe import _
from frappe.utils import cint
from cheese.api.common.responses import success, created, validation_error, error, not_found, paginated_response
from cheese.api.v1.user_controller import _get_current_user_company


@frappe.whitelist()
def list_contacts(page=1, page_size=100, search=None):
	"""
	List contacts with optional company scoping.
	Non-admin users only see contacts that have tickets in their company.

	Args:
		page: Page number
		page_size: Items per page
		search: Search term (searches full_name, phone, email)

	Returns:
		Paginated response with contacts list
	"""
	try:
		page = cint(page) or 1
		page_size = cint(page_size) or 100

		filters = {}
		or_filters = []
		if search:
			or_filters = [
				["full_name", "like", f"%{search}%"],
				["phone", "like", f"%{search}%"],
				["email", "like", f"%{search}%"],
			]

		# Company scoping: restrict contacts to those that have tickets in the user's company
		user_company = _get_current_user_company()
		if user_company:
			company_contacts = frappe.get_all(
				"Cheese Ticket",
				filters={"company": user_company},
				pluck="contact",
				distinct=True,
			)
			company_contacts = list(set(c for c in company_contacts if c))
			if company_contacts:
				filters["name"] = ["in", company_contacts]
			else:
				return paginated_response([], "Contacts retrieved successfully", page=page, page_size=page_size, total=0)

		contacts = frappe.get_all(
			"Cheese Contact",
			filters=filters,
			or_filters=or_filters if or_filters else None,
			fields=["name", "full_name", "phone", "email", "creation", "modified"],
			limit_start=(page - 1) * page_size,
			limit_page_length=page_size,
			order_by="modified desc",
		)

		total = frappe.db.count("Cheese Contact", filters=filters)

		return paginated_response(
			contacts,
			"Contacts retrieved successfully",
			page=page,
			page_size=page_size,
			total=total,
		)
	except Exception as e:
		frappe.log_error(f"Error in list_contacts: {str(e)}")
		return error("Failed to list contacts", "SERVER_ERROR", {"error": str(e)}, 500)

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
		# Validate inputs - phone is mandatory
		if not phone:
			return validation_error("phone is required")

		# Search for existing contact by phone
		existing = frappe.get_all(
			"Cheese Contact",
			filters={"phone": phone},
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
		
		# Set full name only if name is explicitly provided, otherwise leave it empty
		if name:
			contact_data["full_name"] = name
		
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
	Update contact fields.

	Document primary key (contact_id) is the phone number. full_name may duplicate;
	updating name does not change contact_id. contact_id changes only when phone is updated.

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
		# Allow name to be set to empty string (None check allows empty strings)
		new_phone = None
		if name is not None:
			old_values["full_name"] = contact.full_name
			contact.full_name = name if name else ""  # Ensure empty string if name is empty
			changed_fields.append("full_name")
		if phone is not None:
			old_values["phone"] = contact.phone
			new_phone = phone
			contact.phone = new_phone
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
			# Combine audit data into payload_json
			payload = {
				"changed_fields": changed_fields,
				"old_values": old_values
			}
			if idempotency_key:
				payload["idempotency_key"] = idempotency_key
			
			audit_data = {
				"doctype": "Cheese System Event",
				"event_type": "CONTACT_UPDATED",
				"entity_type": "Cheese Contact",
				"entity_id": contact_id,
				"payload_json": json.dumps(payload),
				"created_at": now_datetime()
			}
			audit_event = frappe.get_doc(audit_data)
			audit_event.insert(ignore_permissions=True)
			audit_event_id = audit_event.name
		except Exception as audit_error:
			frappe.log_error(f"Failed to create audit event: {str(audit_error)}")
		
		# Check for duplicates before renaming if phone was updated
		# Since phone is the autoname field, we need to ensure no other contact has this phone
		if new_phone is not None and new_phone and new_phone != contact.name:
			# Check if another contact already exists with this phone number
			existing_contact = frappe.db.get_value("Cheese Contact", new_phone, "name")
			if existing_contact and existing_contact != contact.name:
				return validation_error(f"Contact with phone number {new_phone} already exists: {existing_contact}")
			
			# Also check by phone field (in case the name doesn't match the phone yet)
			existing_by_phone = frappe.get_all(
				"Cheese Contact",
				filters={"phone": new_phone, "name": ["!=", contact.name]},
				limit=1
			)
			if existing_by_phone:
				return validation_error(f"Contact with phone number {new_phone} already exists: {existing_by_phone[0].name}")
		
		# Save triggers CheeseContact.on_update to sync document name with phone only (not full_name).
		# Preserve original contact_id — it must stay immutable unless phone is explicitly changed.
		original_contact_id = contact_id
		contact.save()
		frappe.db.commit()
		contact.reload()

		# contact_id only changes when phone changes (name is keyed to phone).
		# Name-only updates keep the same id.
		final_contact_id = contact.name if new_phone else original_contact_id
		
		return success(
			"Contact updated successfully",
			{
				"contact": {
					"contact_id": final_contact_id,
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
