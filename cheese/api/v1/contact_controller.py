# Copyright (c) 2024
# License: MIT

import frappe
import json
from frappe import _
from cheese.api.common.responses import success, created, validation_error, error, not_found
from cheese.cheese.utils.access import assert_contact_access, assert_company_value, scope_filters


@frappe.whitelist()
def find_or_create_contact(phone=None, email=None, name=None, **_ignored):
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
		phone = str(phone).strip() if phone is not None else None
		email = str(email).strip() if email is not None else None
		name = str(name).strip() if name is not None else None
		phone = phone or None
		email = email or None
		name = name or None

		# Keep current schema constraints explicit for API callers.
		if not phone:
			return validation_error("phone is required")

		# Search for existing contacts by both identifiers.
		contact_by_phone = frappe.get_all(
			"Cheese Contact",
			filters={"phone": phone},
			fields=["name", "full_name", "phone", "email"],
			limit=1,
		)
		contact_by_email = []
		if email:
			contact_by_email = frappe.get_all(
				"Cheese Contact",
				filters={"email": email},
				fields=["name", "full_name", "phone", "email"],
				limit=1,
			)

		by_phone = contact_by_phone[0] if contact_by_phone else None
		by_email = contact_by_email[0] if contact_by_email else None

		# If phone and email match different contacts, stop to avoid accidental merge.
		if by_phone and by_email and by_phone.name != by_email.name:
			return validation_error(
				f"phone ({phone}) and email ({email}) belong to different contacts: "
				f"{by_phone.name} vs {by_email.name}"
			)

		existing_contact = by_phone or by_email
		if existing_contact:
			contact_doc = frappe.get_doc("Cheese Contact", existing_contact.name)
			updated_fields = []

			# Story requirement: update missing fields without losing history.
			if name and not (contact_doc.full_name or "").strip():
				contact_doc.full_name = name
				updated_fields.append("full_name")
			if email and not (contact_doc.email or "").strip():
				contact_doc.email = email
				updated_fields.append("email")

			if updated_fields:
				contact_doc.save()
				frappe.db.commit()

			return success(
				"Contact found and updated" if updated_fields else "Contact found",
				{
					"contact_id": contact_doc.name,
					"full_name": contact_doc.full_name,
					"phone": contact_doc.phone,
					"email": contact_doc.email,
					"is_new": False,
					"updated_fields": updated_fields,
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
def resolve_or_create_contact(phone=None, email=None, name=None, **_ignored):
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
def append_company_to_contact(contact_id=None, company_id=None, notes=None):
	"""
	Append a company/business link to a Cheese Contact (idempotent).

	Args:
		contact_id: Cheese Contact name
		company_id: Company name to link
		notes: Optional note for the relation row

	Returns:
		Success response with link status
	"""
	try:
		from frappe.utils import now_datetime

		if not contact_id:
			return validation_error("contact_id is required")
		if not company_id:
			return validation_error("company_id is required")

		if not frappe.db.exists("Cheese Contact", contact_id):
			return not_found("Contact", contact_id)
		if not frappe.db.exists("Company", company_id):
			return not_found("Company", company_id)

		# Tenant isolation: scoped users may only act on their own contacts and
		# may only link their own company.
		assert_contact_access(contact_id)
		assert_company_value(company_id)

		contact = frappe.get_doc("Cheese Contact", contact_id)
		existing = {row.company for row in (contact.get("companies") or [])}

		# Idempotent behavior: linking an already-linked company is a no-op.
		if company_id in existing:
			return success(
				"Company already linked to contact",
				{
					"contact_id": contact_id,
					"company_id": company_id,
					"linked": False,
				},
			)

		row = {"company": company_id, "linked_at": now_datetime()}
		if notes is not None:
			row["notes"] = notes

		contact.append("companies", row)
		contact.save(ignore_permissions=True)
		frappe.db.commit()

		return created(
			"Company linked to contact successfully",
			{
				"contact_id": contact_id,
				"company_id": company_id,
				"linked": True,
			},
		)
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except Exception as e:
		frappe.log_error(f"Error in append_company_to_contact: {str(e)}")
		return error("Failed to append company to contact", "SERVER_ERROR", {"error": str(e)}, 500)


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

		assert_contact_access(contact_id)

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

		assert_contact_access(contact_id)

		contact = frappe.get_doc("Cheese Contact", contact_id)
		
		# Get leads (scoped to the user's company)
		leads = frappe.get_all(
			"Cheese Lead",
			filters=scope_filters({"contact": contact_id}),
			fields=["name", "status", "interest_type", "last_interaction_at", "lost_reason"],
			order_by="modified desc",
			limit=10
		)
		
		# Get conversations (scoped to the user's company)
		conversations = frappe.get_all(
			"Conversation",
			filters=scope_filters({"contact": contact_id}),
			fields=["name", "channel", "status", "summary", "modified"],
			order_by="modified desc",
			limit=10
		)
		
		# Get reservations/tickets (scoped to the user's company)
		reservations = frappe.get_all(
			"Cheese Ticket",
			filters=scope_filters({"contact": contact_id}),
			fields=["name", "status", "experience", "slot", "party_size", "created", "modified"],
			order_by="modified desc",
			limit=10
		)
		
		# Get quotations (constrained to the scoped leads above)
		quotations = frappe.get_all(
			"Cheese Quotation",
			filters={"lead": ["in", [lead.name for lead in leads] or [""]]},
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

		assert_contact_access(contact_id)

		page = cint(page) or 1
		page_size = cint(page_size) or 20

		lead_filters = scope_filters({"contact": contact_id})
		leads = frappe.get_all(
			"Cheese Lead",
			filters=lead_filters,
			fields=["name", "status", "interest_type", "last_interaction_at", "lost_reason", "conversation", "modified"],
			limit_start=(page - 1) * page_size,
			limit_page_length=page_size,
			order_by="modified desc"
		)
		
		total = frappe.db.count("Cheese Lead", lead_filters)
		
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

		assert_contact_access(contact_id)

		page = cint(page) or 1
		page_size = cint(page_size) or 20

		conv_filters = scope_filters({"contact": contact_id})
		conversations = frappe.get_all(
			"Conversation",
			filters=conv_filters,
			fields=["name", "channel", "status", "summary", "lead", "ticket", "route_booking", "modified"],
			limit_start=(page - 1) * page_size,
			limit_page_length=page_size,
			order_by="modified desc"
		)
		
		total = frappe.db.count("Conversation", conv_filters)
		
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

		assert_contact_access(contact_id)

		page = cint(page) or 1
		page_size = cint(page_size) or 20

		ticket_filters = scope_filters({"contact": contact_id})
		reservations = frappe.get_all(
			"Cheese Ticket",
			filters=ticket_filters,
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
		
		total = frappe.db.count("Cheese Ticket", ticket_filters)
		
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
