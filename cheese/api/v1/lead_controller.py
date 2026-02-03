# Copyright (c) 2024
# License: MIT

import frappe
from frappe import _
from frappe.utils import now_datetime, cint
from cheese.api.common.responses import success, created, error, not_found, validation_error, paginated_response


@frappe.whitelist()
def upsert_lead(contact_id, conversation_id=None, interest_type=None, status=None):
	"""
	Create or consolidate lead per contact; status "not converted/converted"
	Detects intent and records it. Creates/consolidates lead per contact.
	
	Args:
		contact_id: Contact ID (required)
		conversation_id: Conversation ID (optional)
		interest_type: Interest type (Route/Experience)
		status: Status (if not provided, defaults to OPEN for new, keeps existing for update)
		
	Returns:
		Success response with lead data
	"""
	try:
		if not contact_id:
			return validation_error("contact_id is required")
		
		if not frappe.db.exists("Cheese Contact", contact_id):
			return not_found("Contact", contact_id)
		
		# Check for existing lead (any status except DISCARDED)
		existing_lead = frappe.db.get_value(
			"Cheese Lead",
			{
				"contact": contact_id,
				"status": ["!=", "DISCARDED"]
			},
			"name",
			order_by="modified desc"
		)
		
		if existing_lead:
			# Consolidate/update existing lead
			lead = frappe.get_doc("Cheese Lead", existing_lead)
			if conversation_id:
				lead.conversation = conversation_id
			if interest_type:
				lead.interest_type = interest_type
			if status:
				lead.status = status
			lead.last_interaction_at = now_datetime()
			lead.save()
			frappe.db.commit()
			
			return success(
				"Lead consolidated successfully",
				{
					"lead_id": lead.name,
					"contact_id": contact_id,
					"status": lead.status,
					"is_new": False
				}
			)
		
		# Create new lead
		lead_status = status or "OPEN"
		lead = frappe.get_doc({
			"doctype": "Cheese Lead",
			"contact": contact_id,
			"conversation": conversation_id,
			"interest_type": interest_type,
			"status": lead_status,
			"last_interaction_at": now_datetime()
		})
		lead.insert()
		frappe.db.commit()
		
		return created(
			"Lead created successfully",
			{
				"lead_id": lead.name,
				"contact_id": contact_id,
				"status": lead.status,
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
	try:
		if not contact_id:
			return validation_error("contact_id is required")
		
		if not frappe.db.exists("Cheese Contact", contact_id):
			return not_found("Contact", contact_id)
		
		# Check for existing active lead (OPEN or IN_PROGRESS)
		existing_lead = frappe.db.get_value(
			"Cheese Lead",
			{
				"contact": contact_id,
				"status": ["in", ["OPEN", "IN_PROGRESS"]]
			},
			"name",
			order_by="modified desc"
		)
		
		if existing_lead:
			# Update existing lead
			lead = frappe.get_doc("Cheese Lead", existing_lead)
			if conversation_id:
				lead.conversation = conversation_id
			if interest_type:
				lead.interest_type = interest_type
			lead.last_interaction_at = now_datetime()
			lead.save()
			frappe.db.commit()
			
			return success(
				"Lead updated successfully",
				{
					"lead_id": lead.name,
					"contact_id": contact_id,
					"status": lead.status,
					"is_new": False
				}
			)
		
		# Create new lead
		lead = frappe.get_doc({
			"doctype": "Cheese Lead",
			"contact": contact_id,
			"conversation": conversation_id,
			"interest_type": interest_type,
			"status": status,
			"last_interaction_at": now_datetime()
		})
		lead.insert()
		frappe.db.commit()
		
		return created(
			"Lead created successfully",
			{
				"lead_id": lead.name,
				"contact_id": contact_id,
				"status": lead.status,
				"is_new": True
			}
		)
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except Exception as e:
		frappe.log_error(f"Error in create_lead: {str(e)}")
		return error("Failed to create lead", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def update_lead_status(lead_id, status, lost_reason=None):
	"""
	Update lead status
	
	Args:
		lead_id: Lead ID
		status: New status (OPEN/IN_PROGRESS/CONVERTED/LOST/DISCARDED)
		lost_reason: Lost reason (required if status is LOST)
		
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
		
		lead = frappe.get_doc("Cheese Lead", lead_id)
		old_status = lead.status
		
		lead.status = status
		if status == "LOST" and lost_reason:
			lead.lost_reason = lost_reason
		lead.last_interaction_at = now_datetime()
		
		lead.save()
		frappe.db.commit()
		
		return success(
			"Lead status updated successfully",
			{
				"lead_id": lead.name,
				"old_status": old_status,
				"new_status": lead.status,
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
		
		filters = {}
		if status:
			filters["status"] = status
		if contact_id:
			filters["contact"] = contact_id
		if interest_type:
			filters["interest_type"] = interest_type
		
		leads = frappe.get_all(
			"Cheese Lead",
			filters=filters,
			fields=["name", "contact", "conversation", "status", "interest_type", "lost_reason", "last_interaction_at", "modified"],
			limit_start=(page - 1) * page_size,
			limit_page_length=page_size,
			order_by="modified desc"
		)
		
		# Enrich with contact names
		for lead in leads:
			if lead.contact:
				contact = frappe.db.get_value("Cheese Contact", lead.contact, "full_name", as_dict=True)
				lead["contact_name"] = contact.full_name if contact else None
		
		total = frappe.db.count("Cheese Lead", filters=filters)
		
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
		
		# Update lead status to CONVERTED
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
