# Copyright (c) 2024
# License: MIT

import frappe
from frappe import _
from frappe.utils import now_datetime
from cheese.api.common.responses import success, created, error, not_found, validation_error
import json


@frappe.whitelist()
def upload_message_transcript(phone_number, messages, conversation_id=None):
	"""
	Upload message transcript - stores individual messages from a conversation
	
	Args:
		phone_number: Phone number of the user
		messages: Array of message objects with role and content
			Example: [{"role": "user", "content": "hello"}, {"role": "assistant", "content": "Nice to meet you"}]
		conversation_id: Optional conversation ID to link messages to
		
	Returns:
		Created response with message IDs
	"""
	try:
		if not phone_number:
			return validation_error("phone_number is required")
		if not messages:
			return validation_error("messages array is required")
		
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
			fields=["name"],
			limit=1
		)
		
		if not contact:
			# Create new contact
			contact_doc = frappe.get_doc({
				"doctype": "Cheese Contact",
				"phone": phone_number,
				"full_name": f"Contact {phone_number}"
			})
			contact_doc.insert()
			frappe.db.commit()
			contact_id = contact_doc.name
		else:
			contact_id = contact[0].name
		
		# Validate conversation if provided
		if conversation_id:
			if not frappe.db.exists("Conversation", conversation_id):
				return not_found("Conversation", conversation_id)
		
		# Create message records
		message_ids = []
		timestamp = now_datetime()
		
		for idx, msg in enumerate(messages):
			message_doc = frappe.get_doc({
				"doctype": "Cheese Message",
				"contact": contact_id,
				"phone_number": phone_number,
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
