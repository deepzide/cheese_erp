# Copyright (c) 2024
# License: MIT

import frappe
from frappe import _
from frappe.utils import now_datetime, cint, add_to_date
from cheese.api.common.responses import success, created, error, not_found, validation_error, paginated_response
import json


@frappe.whitelist()
def open_or_resume_conversation(contact_id, channel, status="ACTIVE"):
	"""
	Open or resume a persistent conversation, returns conversation_id
	Creates or resumes conversation (one active per channel+contact within time window)
	
	Args:
		contact_id: Contact ID
		channel: Channel (WhatsApp/Web/Agent)
		status: Status (ACTIVE/PAUSED/CLOSED)
		
	Returns:
		Success response with conversation_id
	"""
	try:
		if not contact_id:
			return validation_error("contact_id is required")
		if not channel:
			return validation_error("channel is required")
		
		if channel not in ["WhatsApp", "Web", "Agent"]:
			return validation_error(f"Invalid channel: {channel}")
		
		if not frappe.db.exists("Cheese Contact", contact_id):
			return not_found("Contact", contact_id)
		
		# Check for existing active conversation within time window (e.g., last 24 hours)
		time_window = add_to_date(now_datetime(), hours=-24, as_string=False)
		
		existing = frappe.db.get_value(
			"Conversation",
			{
				"contact": contact_id,
				"channel": channel,
				"status": "ACTIVE",
				"modified": [">", time_window]
			},
			"name",
			order_by="modified desc"
		)
		
		if existing:
			# Resume existing conversation
			conversation = frappe.get_doc("Conversation", existing)
			return success(
				"Conversation resumed",
				{
					"conversation_id": conversation.name,
					"contact_id": contact_id,
					"channel": conversation.channel,
					"status": conversation.status,
					"is_new": False
				}
			)
		
		# Create new conversation
		conversation = frappe.get_doc({
			"doctype": "Conversation",
			"contact": contact_id,
			"channel": channel,
			"status": status
		})
		conversation.insert()
		frappe.db.commit()
		
		return created(
			"Conversation opened successfully",
			{
				"conversation_id": conversation.name,
				"contact_id": contact_id,
				"channel": conversation.channel,
				"status": conversation.status,
				"is_new": True
			}
		)
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except Exception as e:
		frappe.log_error(f"Error in open_or_resume_conversation: {str(e)}")
		return error("Failed to open conversation", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def create_conversation(contact_id, channel, status="ACTIVE"):
	"""
	Create or reuse conversation (one active per channel+contact within time window)
	Legacy endpoint - use open_or_resume_conversation instead
	
	Args:
		contact_id: Contact ID
		channel: Channel (WhatsApp/Web/Agent)
		status: Status (ACTIVE/PAUSED/CLOSED)
		
	Returns:
		Success response with conversation data
	"""
	return open_or_resume_conversation(contact_id, channel, status)
	try:
		if not contact_id:
			return validation_error("contact_id is required")
		if not channel:
			return validation_error("channel is required")
		
		if channel not in ["WhatsApp", "Web", "Agent"]:
			return validation_error(f"Invalid channel: {channel}")
		
		if not frappe.db.exists("Cheese Contact", contact_id):
			return not_found("Contact", contact_id)
		
		# Check for existing active conversation within time window (e.g., last 24 hours)
		time_window = add_to_date(now_datetime(), hours=-24, as_string=False)
		
		existing = frappe.db.get_value(
			"Conversation",
			{
				"contact": contact_id,
				"channel": channel,
				"status": "ACTIVE",
				"modified": [">", time_window]
			},
			"name",
			order_by="modified desc"
		)
		
		if existing:
			# Reuse existing conversation
			conversation = frappe.get_doc("Conversation", existing)
			return success(
				"Existing conversation reused",
				{
					"conversation_id": conversation.name,
					"contact_id": contact_id,
					"channel": conversation.channel,
					"status": conversation.status,
					"is_new": False
				}
			)
		
		# Create new conversation
		conversation = frappe.get_doc({
			"doctype": "Conversation",
			"contact": contact_id,
			"channel": channel,
			"status": status
		})
		conversation.insert()
		frappe.db.commit()
		
		return created(
			"Conversation created successfully",
			{
				"conversation_id": conversation.name,
				"contact_id": contact_id,
				"channel": conversation.channel,
				"status": conversation.status,
				"is_new": True
			}
		)
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except Exception as e:
		frappe.log_error(f"Error in create_conversation: {str(e)}")
		return error("Failed to create conversation", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def update_conversation_summary(conversation_id, summary=None, highlights_json=None):
	"""
	Update conversation summary and highlights
	
	Args:
		conversation_id: Conversation ID
		summary: Summary text
		highlights_json: JSON object with highlights
		
	Returns:
		Success response
	"""
	try:
		if not conversation_id:
			return validation_error("conversation_id is required")
		
		if not frappe.db.exists("Conversation", conversation_id):
			return not_found("Conversation", conversation_id)
		
		conversation = frappe.get_doc("Conversation", conversation_id)
		
		if summary is not None:
			conversation.summary = summary
		
		if highlights_json is not None:
			# Validate JSON if string
			if isinstance(highlights_json, str):
				try:
					json.loads(highlights_json)
				except Exception as e:
					return validation_error(f"Invalid highlights_json format: {str(e)}")
			conversation.highlights_json = highlights_json
		
		conversation.save()
		frappe.db.commit()
		
		return success(
			"Conversation summary updated successfully",
			{
				"conversation_id": conversation.name,
				"summary": conversation.summary
			}
		)
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except Exception as e:
		frappe.log_error(f"Error in update_conversation_summary: {str(e)}")
		return error("Failed to update conversation summary", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def get_conversation_details(conversation_id):
	"""
	Get conversation details with linked entities
	
	Args:
		conversation_id: Conversation ID
		
	Returns:
		Success response with conversation details
	"""
	try:
		if not conversation_id:
			return validation_error("conversation_id is required")
		
		if not frappe.db.exists("Conversation", conversation_id):
			return not_found("Conversation", conversation_id)
		
		conversation = frappe.get_doc("Conversation", conversation_id)
		
		# Get contact details
		contact = None
		if conversation.contact:
			contact = frappe.get_doc("Cheese Contact", conversation.contact)
		
		# Get linked lead
		lead = None
		if conversation.lead:
			lead = frappe.get_doc("Cheese Lead", conversation.lead)
		
		# Get linked ticket
		ticket = None
		if conversation.ticket:
			ticket = frappe.get_doc("Cheese Ticket", conversation.ticket)
		
		# Parse highlights
		highlights = None
		if conversation.highlights_json:
			try:
				if isinstance(conversation.highlights_json, str):
					highlights = json.loads(conversation.highlights_json)
				else:
					highlights = conversation.highlights_json
			except Exception:
				pass
		
		return success(
			"Conversation details retrieved successfully",
			{
				"conversation_id": conversation.name,
				"contact": {
					"contact_id": contact.name if contact else None,
					"full_name": contact.full_name if contact else None,
					"phone": contact.phone if contact else None,
					"email": contact.email if contact else None
				} if contact else None,
				"channel": conversation.channel,
				"status": conversation.status,
				"summary": conversation.summary,
				"highlights": highlights,
				"lead": {
					"lead_id": lead.name if lead else None,
					"status": lead.status if lead else None,
					"interest_type": lead.interest_type if lead else None
				} if lead else None,
				"ticket": {
					"ticket_id": ticket.name if ticket else None,
					"status": ticket.status if ticket else None,
					"experience": ticket.experience if ticket else None
				} if ticket else None,
				"route_booking": conversation.route_booking,
				"modified": str(conversation.modified) if conversation.modified else None
			}
		)
	except Exception as e:
		frappe.log_error(f"Error in get_conversation_details: {str(e)}")
		return error("Failed to get conversation details", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def list_conversations(page=1, page_size=20, contact_id=None, channel=None, status=None):
	"""
	List conversations with filters
	
	Args:
		page: Page number
		page_size: Items per page
		contact_id: Filter by contact
		channel: Filter by channel
		status: Filter by status
		
	Returns:
		Paginated response with conversations list
	"""
	try:
		page = cint(page) or 1
		page_size = cint(page_size) or 20
		
		filters = {}
		if contact_id:
			filters["contact"] = contact_id
		if channel:
			filters["channel"] = channel
		if status:
			filters["status"] = status
		
		conversations = frappe.get_all(
			"Conversation",
			filters=filters,
			fields=["name", "contact", "channel", "status", "summary", "lead", "ticket", "modified"],
			limit_start=(page - 1) * page_size,
			limit_page_length=page_size,
			order_by="modified desc"
		)
		
		# Enrich with contact names
		for conv in conversations:
			if conv.contact:
				contact = frappe.db.get_value("Cheese Contact", conv.contact, "full_name", as_dict=True)
				conv["contact_name"] = contact.full_name if contact else None
		
		total = frappe.db.count("Conversation", filters=filters)
		
		return paginated_response(
			conversations,
			"Conversations retrieved successfully",
			page=page,
			page_size=page_size,
			total=total
		)
	except Exception as e:
		frappe.log_error(f"Error in list_conversations: {str(e)}")
		return error("Failed to list conversations", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def link_conversation_entity(conversation_id, entity_type, entity_id):
	"""
	Link conversation to lead/reservation/route_booking
	
	Args:
		conversation_id: Conversation ID
		entity_type: Entity type (lead/ticket/route_booking)
		entity_id: Entity ID
		
	Returns:
		Success response
	"""
	try:
		if not conversation_id:
			return validation_error("conversation_id is required")
		if not entity_type:
			return validation_error("entity_type is required")
		if not entity_id:
			return validation_error("entity_id is required")
		
		if entity_type not in ["lead", "ticket", "route_booking"]:
			return validation_error(f"Invalid entity_type: {entity_type}. Must be lead, ticket, or route_booking")
		
		if not frappe.db.exists("Conversation", conversation_id):
			return not_found("Conversation", conversation_id)
		
		conversation = frappe.get_doc("Conversation", conversation_id)
		
		# Validate entity exists
		if entity_type == "lead":
			if not frappe.db.exists("Cheese Lead", entity_id):
				return not_found("Lead", entity_id)
			conversation.lead = entity_id
		elif entity_type == "ticket":
			if not frappe.db.exists("Cheese Ticket", entity_id):
				return not_found("Ticket", entity_id)
			conversation.ticket = entity_id
		elif entity_type == "route_booking":
			# Route booking would be a string reference
			conversation.route_booking = entity_id
		
		conversation.save()
		frappe.db.commit()
		
		return success(
			"Conversation linked successfully",
			{
				"conversation_id": conversation.name,
				"entity_type": entity_type,
				"entity_id": entity_id
			}
		)
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except Exception as e:
		frappe.log_error(f"Error in link_conversation_entity: {str(e)}")
		return error("Failed to link conversation entity", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def append_conversation_event(conversation_id, event_type, event_data=None, metadata=None):
	"""
	Log conversation events (technical/audit)
	Persists events like intent, tool-calls, errors
	
	Args:
		conversation_id: Conversation ID
		event_type: Event type (intent, tool_call, error, message, etc.)
		event_data: Event data (JSON string or dict)
		metadata: Optional metadata (JSON string or dict)
		
	Returns:
		Success response with event_id
	"""
	try:
		if not conversation_id:
			return validation_error("conversation_id is required")
		if not event_type:
			return validation_error("event_type is required")
		
		if not frappe.db.exists("Conversation", conversation_id):
			return not_found("Conversation", conversation_id)
		
		# Parse event_data and metadata if strings
		if isinstance(event_data, str):
			try:
				event_data = json.loads(event_data)
			except Exception:
				event_data = {"raw": event_data}
		
		if isinstance(metadata, str):
			try:
				metadata = json.loads(metadata)
			except Exception:
				metadata = {"raw": metadata}
		
		# Create conversation event
		event_doc = {
			"doctype": "Cheese System Event",
			"event_type": f"CONVERSATION_{event_type.upper()}",
			"entity_type": "Conversation",
			"entity_id": conversation_id,
			"event_data": json.dumps(event_data) if event_data else None,
			"metadata": json.dumps(metadata) if metadata else None,
			"timestamp": now_datetime()
		}
		
		event = frappe.get_doc(event_doc)
		event.insert(ignore_permissions=True)
		frappe.db.commit()
		
		return created(
			"Conversation event logged successfully",
			{
				"event_id": event.name,
				"conversation_id": conversation_id,
				"event_type": event_type,
				"timestamp": str(event.timestamp)
			}
		)
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except Exception as e:
		frappe.log_error(f"Error in append_conversation_event: {str(e)}")
		return error("Failed to log conversation event", "SERVER_ERROR", {"error": str(e)}, 500)
