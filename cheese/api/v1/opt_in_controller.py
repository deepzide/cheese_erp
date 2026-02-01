# Copyright (c) 2024
# License: MIT

import frappe
from frappe import _
from frappe.utils import now_datetime
from cheese.api.common.responses import success, error, not_found, validation_error


@frappe.whitelist()
def update_opt_in_status(contact_id, channel, opt_in_status):
	"""
	Update opt-in/opt-out status (US-OPT-01)
	
	Args:
		contact_id: Contact ID
		channel: Channel (WhatsApp/Email/SMS/Phone/Web)
		opt_in_status: Status (OPT_IN/OPT_OUT)
		
	Returns:
		Success response
	"""
	try:
		if not contact_id:
			return validation_error("contact_id is required")
		if not channel:
			return validation_error("channel is required")
		if not opt_in_status:
			return validation_error("opt_in_status is required")
		
		if opt_in_status not in ["OPT_IN", "OPT_OUT"]:
			return validation_error(f"Invalid opt_in_status: {opt_in_status}")
		
		if not frappe.db.exists("Cheese Contact", contact_id):
			return not_found("Contact", contact_id)
		
		contact = frappe.get_doc("Cheese Contact", contact_id)
		
		# Update opt-in status
		# Note: The contact doctype has opt_in_status field, but it's global
		# For channel-specific opt-in, you might need a separate doctype
		# For now, we'll update the global field
		old_status = contact.opt_in_status
		contact.opt_in_status = opt_in_status
		
		# Update preferred channel if provided
		if channel:
			contact.preferred_channel = channel
		
		contact.save()
		frappe.db.commit()
		
		return success(
			"Opt-in status updated successfully",
			{
				"contact_id": contact.name,
				"channel": channel,
				"old_status": old_status,
				"new_status": contact.opt_in_status,
				"preferred_channel": contact.preferred_channel
			}
		)
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except Exception as e:
		frappe.log_error(f"Error in update_opt_in_status: {str(e)}")
		return error("Failed to update opt-in status", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def get_opt_in_status(contact_id, channel=None):
	"""
	Get current opt-in status (US-OPT-01)
	
	Args:
		contact_id: Contact ID
		channel: Channel (optional, for channel-specific status)
		
	Returns:
		Success response with opt-in status
	"""
	try:
		if not contact_id:
			return validation_error("contact_id is required")
		
		if not frappe.db.exists("Cheese Contact", contact_id):
			return not_found("Contact", contact_id)
		
		contact = frappe.get_doc("Cheese Contact", contact_id)
		
		return success(
			"Opt-in status retrieved successfully",
			{
				"contact_id": contact.name,
				"opt_in_status": contact.opt_in_status,
				"preferred_channel": contact.preferred_channel,
				"do_not_contact": contact.do_not_contact,
				"note": "Channel-specific opt-in would require additional doctype"
			}
		)
	except Exception as e:
		frappe.log_error(f"Error in get_opt_in_status: {str(e)}")
		return error("Failed to get opt-in status", "SERVER_ERROR", {"error": str(e)}, 500)
