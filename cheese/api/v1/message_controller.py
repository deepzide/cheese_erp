# Copyright (c) 2024
# License: MIT

import frappe
from frappe import _
from frappe.utils import now_datetime
from cheese.api.common.responses import success, created, error, not_found, validation_error
from cheese.api.common.company_scope import resolve_company_id, apply_company
import json


@frappe.whitelist()
def upload_message_transcript(
	phone_number,
	messages,
	conversation_id=None,
	company_id=None,
	establishment_id=None,
	company=None,
):
	"""
	Upload message transcript - stores individual messages from a conversation
	
	Args:
		phone_number: Phone number of the user
		messages: Array of message objects with role and content
			Example: [{"role": "user", "content": "hello"}, {"role": "assistant", "content": "Nice to meet you"}]
		conversation_id: Optional conversation ID to link messages to
		company_id: Establishment / Company ID (required)
		establishment_id: Alias for company_id
		company: Alias for company_id
		
	Returns:
		Created response with message IDs
	"""
	try:
		if not phone_number:
			return validation_error("phone_number is required")
		if not messages:
			return validation_error("messages array is required")

		resolved_company = resolve_company_id(
			company_id=company_id,
			establishment_id=establishment_id,
			company=company,
			required=True,
		)
		
		# Parse messages if string
		if isinstance(messages, str):
			try:
				messages = json.loads(messages)
			except json.JSONDecodeError:
				return validation_error("Invalid messages format. Expected JSON array.")
		
		if not isinstance(messages, list):
			return validation_error("messages must be an array")
		
		if len(messages) == 0:
			return validation_error("messages array cannot be empty")
		
		# Validate each message
		for idx, msg in enumerate(messages):
			if not isinstance(msg, dict):
				return validation_error(f"Message at index {idx} must be an object")
			if "role" not in msg:
				return validation_error(f"Message at index {idx} missing 'role' field")
			if "content" not in msg:
				return validation_error(f"Message at index {idx} missing 'content' field")
			if msg["role"] not in ["user", "assistant"]:
				return validation_error(f"Message at index {idx} has invalid role. Must be 'user' or 'assistant'")
		
		# Find or create contact by phone number
		contact = frappe.get_all(
			"Cheese Contact",
			filters={"phone": phone_number},
			fields=["name", "company"],
			limit=1
		)
		
		if not contact:
			contact_doc = frappe.get_doc({
				"doctype": "Cheese Contact",
				"phone": phone_number,
				"full_name": f"Contact {phone_number}",
				"company": resolved_company,
			})
			contact_doc.insert()
			frappe.db.commit()
			contact_id = contact_doc.name
		else:
			contact_id = contact[0].name
			if not contact[0].company:
				contact_doc = frappe.get_doc("Cheese Contact", contact_id)
				apply_company(contact_doc, resolved_company)
				contact_doc.save(ignore_permissions=True)
				frappe.db.commit()
		
		# Validate conversation if provided
		if conversation_id:
			if not frappe.db.exists("Conversation", conversation_id):
				return not_found("Conversation", conversation_id)
			conv_company = frappe.db.get_value("Conversation", conversation_id, "company")
			if conv_company and conv_company != resolved_company:
				return validation_error("conversation_id does not belong to the provided company_id")
		
		# Create message records
		message_ids = []
		timestamp = now_datetime()
		
		for idx, msg in enumerate(messages):
			message_doc = frappe.get_doc({
				"doctype": "Cheese Message",
				"contact": contact_id,
				"phone_number": phone_number,
				"company": resolved_company,
				"role": msg["role"],
				"content": msg["content"],
				"message_order": idx + 1,
				"timestamp": timestamp,
				"conversation": conversation_id
			})
			message_doc.insert()
			message_ids.append(message_doc.name)
		
		frappe.db.commit()
		
		return created(
			"Message transcript uploaded successfully",
			{
				"contact_id": contact_id,
				"company_id": resolved_company,
				"conversation_id": conversation_id,
				"message_count": len(message_ids),
				"message_ids": message_ids
			}
		)
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except Exception as e:
		frappe.log_error(f"Error in upload_message_transcript: {str(e)}")
		return error("Failed to upload message transcript", "SERVER_ERROR", {"error": str(e)}, 500)
