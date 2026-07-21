# Copyright (c) 2024
# License: MIT

import frappe
from frappe import _
from frappe.utils import now_datetime, cint
from cheese.api.common.responses import success, created, error, not_found, validation_error, paginated_response
from cheese.cheese.utils.access import (
	assert_lead_access,
	assert_contact_access,
	assert_company_value,
	scope_filters,
	current_scope_company,
)
from cheese.cheese.utils.permissions import _is_super_admin
from cheese.cheese.utils.lead_company import (
	enrich_lead_dict_for_company,
	get_company_row_status,
	set_company_row_status,
)


def _resolve_lead_company(company_id=None):
	company = company_id
	if company:
		assert_company_value(company)
		return company
	if _is_super_admin(frappe.session.user):
		return None
	return current_scope_company()


def _find_lead_for_contact(contact_id):
	return frappe.db.get_value(
		"Cheese Lead",
		{"contact": contact_id},
		"name",
		order_by="modified desc",
	)


def _ensure_contact_company(contact_id, company):
	"""Idempotently link a contact to a company (Cheese Contact Company) so the
	contact and its global transcripts/conversations become visible to that
	establishment's users. No-op when company is falsy. This is what makes
	upsert_lead / append_company_to_lead the owners of contact->company assignment."""
	if not contact_id or not company:
		return
	if frappe.db.exists(
		"Cheese Contact Company",
		{"parent": contact_id, "parenttype": "Cheese Contact", "company": company},
	):
		return
	contact = frappe.get_doc("Cheese Contact", contact_id)
	contact.append("companies", {"company": company, "linked_at": now_datetime()})
	contact.save(ignore_permissions=True)


@frappe.whitelist()
def upsert_lead(contact_id, conversation_id=None, interest_type=None, status=None, company_id=None):
	"""
	Create or consolidate lead per contact; status "not converted/converted"
	Detects intent and records it. Creates/consolidates lead per contact.
	
	Args:
		contact_id: Contact ID (required)
		conversation_id: Conversation ID (optional)
		interest_type: Interest type (Route/Experience)
		status: Status for the scoped establishment (defaults to OPEN for new rows)
		company_id: Establishment scope (optional; defaults to the user's company)
		
	Returns:
		Success response with lead data
	"""
	try:
		if not contact_id:
			return validation_error("contact_id is required")
		
		if not frappe.db.exists("Cheese Contact", contact_id):
			return not_found("Contact", contact_id)

		assert_contact_access(contact_id)
		company = _resolve_lead_company(company_id)
		lead_status = status or "OPEN"

		# Owning the contact->company assignment: a lead for a company means that
		# company's users can see the contact, its leads and its transcripts.
		_ensure_contact_company(contact_id, company)

		existing_lead = _find_lead_for_contact(contact_id)
		
		if existing_lead:
			lead = frappe.get_doc("Cheese Lead", existing_lead)
			if conversation_id:
				lead.conversation = conversation_id
			if interest_type:
				lead.interest_type = interest_type
			if company:
				set_company_row_status(lead, company, lead_status)
			elif status:
				lead.status = status
			lead.last_interaction_at = now_datetime()
			lead.save()
			frappe.db.commit()

			response_status = (
				get_company_row_status(lead.name, company) if company else lead.status
			)
			
			return success(
				"Lead consolidated successfully",
				{
					"lead_id": lead.name,
					"contact_id": contact_id,
					"company_id": company,
					"status": response_status,
					"is_new": False
				}
			)
		
		lead = frappe.get_doc({
			"doctype": "Cheese Lead",
			"contact": contact_id,
			"conversation": conversation_id,
			"interest_type": interest_type,
			"status": lead_status,
			"company": company,
			"last_interaction_at": now_datetime()
		})
		if company:
			set_company_row_status(lead, company, lead_status)
		lead.insert()
		frappe.db.commit()
		
		return created(
			"Lead created successfully",
			{
				"lead_id": lead.name,
				"contact_id": contact_id,
				"company_id": company,
				"status": get_company_row_status(lead.name, company) if company else lead.status,
				"is_new": True
			}
		)
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except Exception as e:
		frappe.log_error(f"Error in upsert_lead: {str(e)}")
		return error("Failed to upsert lead", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def create_lead(contact_id, conversation_id=None, interest_type=None, status="OPEN"):
	"""
	Create or update a lead (idempotent - reuses existing active lead)
	Legacy endpoint - use upsert_lead instead
	
	Args:
		contact_id: Contact ID (required)
		conversation_id: Conversation ID (optional)
		interest_type: Interest type (Route/Experience)
		status: Status (OPEN/IN_PROGRESS/CONVERTED/LOST/DISCARDED)
		
	Returns:
		Success response with lead data
	"""
	return upsert_lead(contact_id, conversation_id, interest_type, status)


@frappe.whitelist()
def append_company_to_lead(lead_id=None, company_id=None, notes=None, status="OPEN"):
	"""
	Append a company/establishment link to a Cheese Lead (idempotent).

	Args:
		lead_id: Cheese Lead name
		company_id: Company name to link
		notes: Optional note for the relation row
		status: Initial status for this establishment (default OPEN)

	Returns:
		Success response with link status
	"""
	try:
		if not lead_id:
			return validation_error("lead_id is required")
		if not company_id:
			return validation_error("company_id is required")
		if status not in ["OPEN", "IN_PROGRESS", "CONVERTED", "LOST", "DISCARDED"]:
			return validation_error(f"Invalid status: {status}")

		if not frappe.db.exists("Cheese Lead", lead_id):
			return not_found("Lead", lead_id)
		if not frappe.db.exists("Company", company_id):
			return not_found("Company", company_id)

		assert_lead_access(lead_id)
		assert_company_value(company_id)

		lead = frappe.get_doc("Cheese Lead", lead_id)
		existing = {row.company for row in (lead.get("companies") or [])}

		if company_id in existing:
			return success(
				"Company already linked to lead",
				{
					"lead_id": lead_id,
					"company_id": company_id,
					"status": get_company_row_status(lead_id, company_id),
					"linked": False,
				},
			)

		set_company_row_status(lead, company_id, status)
		_ensure_contact_company(lead.contact, company_id)
		if notes is not None:
			row = next((r for r in lead.companies if r.company == company_id), None)
			if row:
				row.notes = notes
		if not lead.get("company"):
			lead.company = company_id
		lead.save(ignore_permissions=True)
		frappe.db.commit()

		return created(
			"Company linked to lead successfully",
			{
				"lead_id": lead_id,
				"company_id": company_id,
				"status": status,
				"linked": True,
			},
		)
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except frappe.PermissionError:
		return error("Unauthorized", "FORBIDDEN", {}, 403)
	except Exception as e:
		frappe.log_error(f"Error in append_company_to_lead: {str(e)}")
		return error("Failed to append company to lead", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def update_lead_status(lead_id, status, lost_reason=None, company_id=None):
	"""
	Update lead status for a specific establishment
	
	Args:
		lead_id: Lead ID
		status: New status (OPEN/IN_PROGRESS/CONVERTED/LOST/DISCARDED)
		lost_reason: Lost reason (required if status is LOST)
		company_id: Establishment scope (optional; defaults to the user's company)
		
	Returns:
		Success response with updated lead data
	"""
	try:
		if not lead_id:
			return validation_error("lead_id is required")
		if not status:
			return validation_error("status is required")
		
		if status not in ["OPEN", "IN_PROGRESS", "CONVERTED", "LOST", "DISCARDED"]:
			return validation_error(f"Invalid status: {status}")
		
		if not frappe.db.exists("Cheese Lead", lead_id):
			return not_found("Lead", lead_id)

		assert_lead_access(lead_id)
		company = _resolve_lead_company(company_id) or frappe.db.get_value(
			"Cheese Lead", lead_id, "company"
		)
		if not company:
			return validation_error("company_id is required for this lead")

		lead = frappe.get_doc("Cheese Lead", lead_id)
		old_status = get_company_row_status(lead.name, company) or lead.status

		set_company_row_status(lead, company, status, lost_reason=lost_reason)
		lead.save()
		frappe.db.commit()
		
		return success(
			"Lead status updated successfully",
			{
				"lead_id": lead.name,
				"company_id": company,
				"old_status": old_status,
				"new_status": get_company_row_status(lead.name, company),
				"lost_reason": lead.lost_reason
			}
		)
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except Exception as e:
		frappe.log_error(f"Error in update_lead_status: {str(e)}")
		return error("Failed to update lead status", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def get_lead_details(lead_id):
	"""
	Get lead details with contact and conversation info
	
	Args:
		lead_id: Lead ID
		
	Returns:
		Success response with lead details
	"""
	try:
		if not lead_id:
			return validation_error("lead_id is required")
		
		if not frappe.db.exists("Cheese Lead", lead_id):
			return not_found("Lead", lead_id)

		assert_lead_access(lead_id)

		lead = frappe.get_doc("Cheese Lead", lead_id)
		
		# Get contact details
		contact = None
		if lead.contact:
			contact = frappe.get_doc("Cheese Contact", lead.contact)
		
		# Get conversation details
		conversation = None
		if lead.conversation:
			conversation = frappe.get_doc("Conversation", lead.conversation)
		
		# Get quotations
		quotations = frappe.get_all(
			"Cheese Quotation",
			filters={"lead": lead_id},
			fields=["name", "status", "total_price", "deposit_amount", "valid_until"],
			order_by="modified desc"
		)
		
		return success(
			"Lead details retrieved successfully",
			{
				"lead_id": lead.name,
				"contact": {
					"contact_id": contact.name if contact else None,
					"full_name": contact.full_name if contact else None,
					"phone": contact.phone if contact else None,
					"email": contact.email if contact else None
				} if contact else None,
				"conversation": {
					"conversation_id": conversation.name if conversation else None,
					"channel": conversation.channel if conversation else None,
					"status": conversation.status if conversation else None,
					"summary": conversation.summary if conversation else None
				} if conversation else None,
				"status": lead.status,
				"company_id": lead.company,
				"companies": [
					{
						"company_id": row.company,
						"status": row.status,
						"lost_reason": row.lost_reason,
						"last_interaction_at": str(row.last_interaction_at) if row.last_interaction_at else None,
						"linked_at": str(row.linked_at) if row.linked_at else None,
						"notes": row.notes,
					}
					for row in (lead.get("companies") or [])
				],
				"interest_type": lead.interest_type,
				"lost_reason": lead.lost_reason,
				"last_interaction_at": str(lead.last_interaction_at) if lead.last_interaction_at else None,
				"quotations": quotations,
				"quotations_count": len(quotations)
			}
		)
	except Exception as e:
		frappe.log_error(f"Error in get_lead_details: {str(e)}")
		return error("Failed to get lead details", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def list_leads(page=1, page_size=20, status=None, contact_id=None, interest_type=None):
	"""
	List leads with filters
	
	Args:
		page: Page number
		page_size: Items per page
		status: Filter by status
		contact_id: Filter by contact
		interest_type: Filter by interest type
		
	Returns:
		Paginated response with leads list
	"""
	try:
		page = cint(page) or 1
		page_size = cint(page_size) or 20
		scoped_company = _resolve_lead_company()

		if scoped_company and status and frappe.db.has_table("tabCheese Lead Company"):
			conditions = [
				"lc.parenttype = 'Cheese Lead'",
				"lc.company = %(company)s",
				"lc.status = %(status)s",
			]
			params = {"company": scoped_company, "status": status}
			if contact_id:
				conditions.append("l.contact = %(contact_id)s")
				params["contact_id"] = contact_id
			if interest_type:
				conditions.append("l.interest_type = %(interest_type)s")
				params["interest_type"] = interest_type
			where = " AND ".join(conditions)
			leads = frappe.db.sql(
				f"""
				SELECT l.name, l.contact, l.conversation, lc.status, l.interest_type,
				       lc.lost_reason, lc.last_interaction_at, l.modified, l.company
				FROM `tabCheese Lead Company` lc
				INNER JOIN `tabCheese Lead` l ON l.name = lc.parent
				WHERE {where}
				ORDER BY l.modified DESC
				LIMIT %(limit)s OFFSET %(offset)s
				""",
				{
					**params,
					"limit": page_size,
					"offset": (page - 1) * page_size,
				},
				as_dict=True,
			)
			total = frappe.db.sql(
				f"""
				SELECT COUNT(*)
				FROM `tabCheese Lead Company` lc
				INNER JOIN `tabCheese Lead` l ON l.name = lc.parent
				WHERE {where}
				""",
				params,
			)[0][0]
		else:
			filters = scope_filters({})
			if status and not scoped_company:
				filters["status"] = status
			if contact_id:
				filters["contact"] = contact_id
			if interest_type:
				filters["interest_type"] = interest_type

			leads = frappe.get_all(
				"Cheese Lead",
				filters=filters,
				fields=[
					"name", "contact", "conversation", "status", "company",
					"interest_type", "lost_reason", "last_interaction_at", "modified",
				],
				limit_start=(page - 1) * page_size,
				limit_page_length=page_size,
				order_by="modified desc",
			)
			total = frappe.db.count("Cheese Lead", filters=filters)

		for lead in leads:
			if lead.contact:
				contact = frappe.db.get_value("Cheese Contact", lead.contact, "full_name", as_dict=True)
				lead["contact_name"] = contact.full_name if contact else None
			enrich_lead_dict_for_company(lead, scoped_company or lead.get("company"))
		
		return paginated_response(
			leads,
			"Leads retrieved successfully",
			page=page,
			page_size=page_size,
			total=total
		)
	except Exception as e:
		frappe.log_error(f"Error in list_leads: {str(e)}")
		return error("Failed to list leads", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def convert_lead_to_reservation(lead_id, experience_id, slot_id, party_size):
	"""
	Convert lead to reservation (mark as CONVERTED and create ticket)
	
	Args:
		lead_id: Lead ID
		experience_id: Experience ID
		slot_id: Slot ID
		party_size: Party size
		
	Returns:
		Success response with ticket and lead data
	"""
	try:
		if not lead_id:
			return validation_error("lead_id is required")
		if not experience_id:
			return validation_error("experience_id is required")
		if not slot_id:
			return validation_error("slot_id is required")
		if not party_size or party_size < 1:
			return validation_error("party_size must be at least 1")
		
		if not frappe.db.exists("Cheese Lead", lead_id):
			return not_found("Lead", lead_id)

		assert_lead_access(lead_id)

		lead = frappe.get_doc("Cheese Lead", lead_id)
		
		# Get contact from lead
		contact_id = lead.contact
		if not contact_id:
			return validation_error("Lead has no associated contact")
		
		# Create ticket using existing endpoint logic
		from cheese.api.v1.ticket_controller import create_pending_ticket
		ticket_result = create_pending_ticket(contact_id, experience_id, slot_id, party_size)
		
		# If ticket creation failed, return error
		if not ticket_result.get("success"):
			return ticket_result
		
		ticket_id = ticket_result.get("data", {}).get("ticket_id")
		
		ticket_company = frappe.db.get_value("Cheese Experience", experience_id, "company")
		if ticket_company:
			set_company_row_status(lead, ticket_company, "CONVERTED")
		else:
			lead.status = "CONVERTED"
			lead.last_interaction_at = now_datetime()
		lead.save()
		frappe.db.commit()
		
		return success(
			"Lead converted to reservation successfully",
			{
				"lead_id": lead.name,
				"lead_status": lead.status,
				"ticket_id": ticket_id,
				"ticket_data": ticket_result.get("data")
			}
		)
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except Exception as e:
		frappe.log_error(f"Error in convert_lead_to_reservation: {str(e)}")
		return error("Failed to convert lead to reservation", "SERVER_ERROR", {"error": str(e)}, 500)
