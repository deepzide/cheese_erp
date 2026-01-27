# Copyright (c) 2024
# License: MIT

import frappe
from frappe import _
from frappe.utils import add_to_date, now_datetime, get_datetime
from cheese.cheese.utils.pricing import calculate_ticket_price, calculate_deposit_amount
from cheese.cheese.utils.validation import validate_booking_policy
from cheese.cheese.utils.capacity import update_slot_capacity
from cheese.api.common.responses import success, created, error, not_found, validation_error
import json


@frappe.whitelist()
def create_pending_ticket(contact_id, experience_id, slot_id, party_size):
	"""
	Create a pending ticket with TTL
	
	Args:
		contact_id: ID of the contact
		experience_id: ID of the experience
		slot_id: ID of the slot
		party_size: Number of people
		
	Returns:
		Success response with ticket data
	"""
	try:
		# Validate inputs
		if not contact_id:
			return validation_error("contact_id is required")
		if not experience_id:
			return validation_error("experience_id is required")
		if not slot_id:
			return validation_error("slot_id is required")
		if not party_size or party_size < 1:
			return validation_error("party_size must be at least 1")

		if not frappe.db.exists("Cheese Contact", contact_id):
			return not_found("Contact", contact_id)
		
		if not frappe.db.exists("Cheese Experience", experience_id):
			return not_found("Experience", experience_id)
		
		if not frappe.db.exists("Cheese Experience Slot", slot_id):
			return not_found("Slot", slot_id)

		# Get slot and experience
		slot = frappe.get_doc("Cheese Experience Slot", slot_id)
		experience = frappe.get_doc("Cheese Experience", experience_id)

		# Validate booking policy
		try:
			slot_datetime = get_datetime(f"{slot.date} {slot.time}")
			validate_booking_policy(experience_id, slot_datetime, action="booking")
		except frappe.ValidationError as e:
			return validation_error(str(e))

		# Calculate price
		price_data = calculate_ticket_price(experience_id, party_size)
		
		# Calculate deposit
		deposit_amount = calculate_deposit_amount(experience_id, price_data["total_price"])

		# Create ticket
		ticket = frappe.get_doc({
			"doctype": "Cheese Ticket",
			"contact": contact_id,
			"company": experience.company,
			"experience": experience_id,
			"slot": slot_id,
			"party_size": party_size,
			"status": "PENDING",
			"deposit_required": bool(deposit_amount > 0),
			"deposit_amount": deposit_amount
		})
		ticket.insert()
		
		# Update slot capacity
		update_slot_capacity(slot_id)
		
		frappe.db.commit()

		return created(
			"Ticket created successfully",
			{
				"ticket_id": ticket.name,
				"status": ticket.status,
				"contact_id": contact_id,
				"experience_id": experience_id,
				"slot_id": slot_id,
				"party_size": party_size,
				"total_price": price_data["total_price"],
				"deposit_required": ticket.deposit_required,
				"deposit_amount": ticket.deposit_amount,
				"expires_at": str(ticket.expires_at) if ticket.expires_at else None
			}
		)
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except Exception as e:
		frappe.log_error(f"Error in create_pending_ticket: {str(e)}")
		return error("Failed to create ticket", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def modify_ticket(ticket_id, new_slot=None, party_size=None):
	"""
	Modify a ticket (change slot or party size)
	
	Args:
		ticket_id: ID of the ticket
		new_slot: New slot ID (optional)
		party_size: New party size (optional)
		
	Returns:
		Success response with updated ticket data
	"""
	try:
		if not ticket_id:
			return validation_error("ticket_id is required")

		if not frappe.db.exists("Cheese Ticket", ticket_id):
			return not_found("Ticket", ticket_id)

		ticket = frappe.get_doc("Cheese Ticket", ticket_id)
		
		if ticket.status not in ["PENDING", "CONFIRMED"]:
			return validation_error(
				f"Only PENDING or CONFIRMED tickets can be modified. Current status: {ticket.status}",
				{"current_status": ticket.status, "allowed_statuses": ["PENDING", "CONFIRMED"]}
			)

		old_slot = ticket.slot
		changes = []

		# Update slot if provided
		if new_slot:
			if not frappe.db.exists("Cheese Experience Slot", new_slot):
				return not_found("Slot", new_slot)
			
			try:
				slot = frappe.get_doc("Cheese Experience Slot", new_slot)
				slot_datetime = get_datetime(f"{slot.date} {slot.time}")
				validate_booking_policy(ticket.experience, slot_datetime, action="modify")
			except frappe.ValidationError as e:
				return validation_error(str(e))
			
			ticket.slot = new_slot
			changes.append("slot")

		# Update party size if provided
		if party_size:
			if party_size < 1:
				return validation_error("party_size must be at least 1")
			ticket.party_size = party_size
			changes.append("party_size")

		if not changes:
			return validation_error("No changes provided. Specify new_slot or party_size")

		ticket.save()
		
		# Update capacity for both old and new slots
		if old_slot:
			update_slot_capacity(old_slot)
		if new_slot and new_slot != old_slot:
			update_slot_capacity(new_slot)
		
		frappe.db.commit()

		return success(
			f"Ticket modified successfully. Changed: {', '.join(changes)}",
			{
				"ticket_id": ticket.name,
				"status": ticket.status,
				"slot_id": ticket.slot,
				"party_size": ticket.party_size,
				"changes": changes
			}
		)
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except Exception as e:
		frappe.log_error(f"Error in modify_ticket: {str(e)}")
		return error("Failed to modify ticket", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def cancel_ticket(ticket_id):
	"""
	Cancel a ticket
	
	Args:
		ticket_id: ID of the ticket
		
	Returns:
		Success response with cancelled ticket data
	"""
	try:
		if not ticket_id:
			return validation_error("ticket_id is required")

		if not frappe.db.exists("Cheese Ticket", ticket_id):
			return not_found("Ticket", ticket_id)

		ticket = frappe.get_doc("Cheese Ticket", ticket_id)
		
		if ticket.status not in ["PENDING", "CONFIRMED"]:
			return validation_error(
				f"Only PENDING or CONFIRMED tickets can be cancelled. Current status: {ticket.status}",
				{"current_status": ticket.status, "allowed_statuses": ["PENDING", "CONFIRMED"]}
			)

		if ticket.status == "CONFIRMED":
			# Validate cancellation policy
			try:
				slot = frappe.get_doc("Cheese Experience Slot", ticket.slot)
				slot_datetime = get_datetime(f"{slot.date} {slot.time}")
				validate_booking_policy(ticket.experience, slot_datetime, action="cancel")
			except frappe.ValidationError as e:
				return validation_error(str(e))

		slot_id = ticket.slot
		old_status = ticket.status
		ticket.cancel()
		
		# Update slot capacity
		update_slot_capacity(slot_id)
		
		frappe.db.commit()

		return success(
			"Ticket cancelled successfully",
			{
				"ticket_id": ticket.name,
				"old_status": old_status,
				"new_status": ticket.status,
				"slot_id": slot_id
			}
		)
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except Exception as e:
		frappe.log_error(f"Error in cancel_ticket: {str(e)}")
		return error("Failed to cancel ticket", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def get_ticket_summary(ticket_id):
	"""
	Get ticket summary/details
	
	Args:
		ticket_id: ID of the ticket
		
	Returns:
		Success response with ticket details
	"""
	try:
		if not ticket_id:
			return validation_error("ticket_id is required")

		if not frappe.db.exists("Cheese Ticket", ticket_id):
			return not_found("Ticket", ticket_id)

		ticket = frappe.get_doc("Cheese Ticket", ticket_id)
		slot = frappe.get_doc("Cheese Experience Slot", ticket.slot)
		experience = frappe.get_doc("Cheese Experience", ticket.experience)
		contact = frappe.get_doc("Cheese Contact", ticket.contact)

		return success(
			"Ticket details retrieved successfully",
			{
				"ticket_id": ticket.name,
				"status": ticket.status,
				"contact": {
					"contact_id": contact.name,
					"full_name": contact.full_name,
					"phone": contact.phone,
					"email": contact.email
				},
				"experience": {
					"experience_id": experience.name,
					"name": experience.name,
					"description": experience.description
				},
				"slot": {
					"slot_id": slot.name,
					"date": str(slot.date),
					"time": str(slot.time),
					"max_capacity": slot.max_capacity
				},
				"party_size": ticket.party_size,
				"deposit_required": ticket.deposit_required,
				"deposit_amount": ticket.deposit_amount,
				"expires_at": str(ticket.expires_at) if ticket.expires_at else None,
				"conversation_id": ticket.conversation if ticket.conversation else None
			}
		)
	except Exception as e:
		frappe.log_error(f"Error in get_ticket_summary: {str(e)}")
		return error("Failed to get ticket summary", "SERVER_ERROR", {"error": str(e)}, 500)
