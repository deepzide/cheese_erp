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
		
		if channel not in ["WhatsApp", "Email", "SMS", "Phone", "Web"]:
			return validation_error(f"Invalid channel: {channel}")
		
		if not frappe.db.exists("Cheese Contact", contact_id):
			return not_found("Contact", contact_id)
		
		contact = frappe.get_doc("Cheese Contact", contact_id)
		
		# Use channel-specific opt-in
		old_status = contact.set_channel_opt_in(channel, opt_in_status)
		
		# Update preferred channel if provided
		if channel:
			contact.preferred_channel = channel
		
		# Update global opt_in_status if all channels are OPT_OUT
		if hasattr(contact, "channel_opt_ins") and contact.channel_opt_ins:
			all_opted_out = all(
				opt_in.opt_in_status == "OPT_OUT" 
				for opt_in in contact.channel_opt_ins
			)
			if all_opted_out:
				contact.opt_in_status = "OPT_OUT"
			else:
				contact.opt_in_status = "OPT_IN"
		
		contact.save()
		frappe.db.commit()
		
		return success(
			"Opt-in status updated successfully",
			{
				"contact_id": contact.name,
				"channel": channel,
				"old_status": old_status,
				"new_status": contact.get_channel_opt_in_status(channel),
				"preferred_channel": contact.preferred_channel,
				"global_opt_in_status": contact.opt_in_status
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
		
		# Get channel-specific status if channel provided
		if channel:
			channel_status = contact.get_channel_opt_in_status(channel)
			return success(
				"Channel opt-in status retrieved successfully",
				{
					"contact_id": contact.name,
					"channel": channel,
					"opt_in_status": channel_status,
					"global_opt_in_status": contact.opt_in_status,
					"preferred_channel": contact.preferred_channel,
					"do_not_contact": contact.do_not_contact
				}
			)
		
		# Get all channel opt-ins
		channel_opt_ins = {}
		if hasattr(contact, "channel_opt_ins") and contact.channel_opt_ins:
			for opt_in in contact.channel_opt_ins:
				channel_opt_ins[opt_in.channel] = {
					"opt_in_status": opt_in.opt_in_status,
					"updated_at": str(opt_in.updated_at) if opt_in.updated_at else None
				}
		
		return success(
			"Opt-in status retrieved successfully",
			{
				"contact_id": contact.name,
				"opt_in_status": contact.opt_in_status,
				"preferred_channel": contact.preferred_channel,
				"do_not_contact": contact.do_not_contact,
				"channel_opt_ins": channel_opt_ins
			}
		)
	except Exception as e:
		frappe.log_error(f"Error in get_opt_in_status: {str(e)}")
		return error("Failed to get opt-in status", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def get_channel_opt_in_status(contact_id, channel):
	"""
	Get opt-in status for a specific channel (US-OPT-01)
	
	Args:
		contact_id: Contact ID
		channel: Channel (WhatsApp/Email/SMS/Phone/Web)
		
	Returns:
		Success response with channel-specific opt-in status
	"""
	return get_opt_in_status(contact_id, channel=channel)


def get_opt_in_status_for_channel(contact_id, channel):
	"""
	Utility function to get opt-in status for a specific channel (non-whitelisted)
	Used internally by notification system
	
	Args:
		contact_id: Contact ID
		channel: Channel (WhatsApp/Email/SMS/Phone/Web)
		
	Returns:
		True if opted in, False if opted out or not found
	"""
	try:
		if not contact_id or not channel:
			return False
		
		if not frappe.db.exists("Cheese Contact", contact_id):
			return False
		
		contact = frappe.get_doc("Cheese Contact", contact_id)
		
		# Check global do_not_contact flag
		if contact.do_not_contact:
			return False
		
		# Get channel-specific status
		channel_status = contact.get_channel_opt_in_status(channel)
		
		# Return True if OPT_IN, False otherwise
		return channel_status == "OPT_IN"
	except Exception:
		# On error, default to False (don't send notification)
		return False


@frappe.whitelist()
def bulk_update_opt_in(contacts, channel, opt_in_status):
	"""
	Bulk update opt-in status for multiple contacts (US-OPT-01)
	
	Args:
		contacts: List of contact IDs
		channel: Channel
		opt_in_status: Status (OPT_IN/OPT_OUT)
		
	Returns:
		Success response with update results
	"""
	try:
		import json
		
		if not contacts:
			return validation_error("contacts is required")
		if not channel:
			return validation_error("channel is required")
		if not opt_in_status:
			return validation_error("opt_in_status is required")
		
		if isinstance(contacts, str):
			contacts = json.loads(contacts)
		
		updated = []
		failed = []
		
		for contact_id in contacts:
			try:
				result = update_opt_in_status(contact_id, channel, opt_in_status)
				if result.get("success"):
					updated.append(contact_id)
				else:
					failed.append({"contact_id": contact_id, "error": result.get("message")})
			except Exception as e:
				failed.append({"contact_id": contact_id, "error": str(e)})
		
		return success(
			"Bulk opt-in update completed",
			{
				"updated_count": len(updated),
				"failed_count": len(failed),
				"updated": updated,
				"failed": failed
			}
		)
	except Exception as e:
		frappe.log_error(f"Error in bulk_update_opt_in: {str(e)}")
		return error("Failed to bulk update opt-in", "SERVER_ERROR", {"error": str(e)}, 500)
