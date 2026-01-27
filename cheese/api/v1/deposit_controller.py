# Copyright (c) 2024
# License: MIT

import frappe
from frappe import _
from frappe.utils import add_to_date, now_datetime
from cheese.api.common.responses import success, created, error, not_found, validation_error


@frappe.whitelist()
def get_deposit_instructions(ticket_id):
	"""
	Get deposit payment instructions for a ticket
	
	Args:
		ticket_id: ID of the ticket
		
	Returns:
		Success response with deposit instructions
	"""
	try:
		if not ticket_id:
			return validation_error("ticket_id is required")

		if not frappe.db.exists("Cheese Ticket", ticket_id):
			return not_found("Ticket", ticket_id)

		ticket = frappe.get_doc("Cheese Ticket", ticket_id)
		
		if not ticket.deposit_required:
			return success(
				"No deposit required for this ticket",
				{
					"deposit_required": False,
					"ticket_id": ticket_id
				}
			)

		# Get or create deposit
		deposit = frappe.db.get_value(
			"Cheese Deposit",
			{"entity_type": "Ticket", "entity_id": ticket_id},
			"name"
		)

		if not deposit:
			# Create deposit
			experience = frappe.get_doc("Cheese Experience", ticket.experience)
			due_at = add_to_date(now_datetime(), hours=experience.deposit_ttl_hours or 24, as_string=False)
			
			deposit_doc = frappe.get_doc({
				"doctype": "Cheese Deposit",
				"entity_type": "Ticket",
				"entity_id": ticket_id,
				"amount_required": ticket.deposit_amount,
				"status": "PENDING",
				"due_at": due_at
			})
			deposit_doc.insert()
			deposit = deposit_doc.name
			frappe.db.commit()
		else:
			deposit_doc = frappe.get_doc("Cheese Deposit", deposit)

		return success(
			"Deposit instructions retrieved successfully",
			{
				"deposit_required": True,
				"deposit_id": deposit,
				"ticket_id": ticket_id,
				"amount_required": deposit_doc.amount_required,
				"amount_paid": deposit_doc.amount_paid or 0,
				"amount_remaining": deposit_doc.amount_required - (deposit_doc.amount_paid or 0),
				"due_at": str(deposit_doc.due_at) if deposit_doc.due_at else None,
				"status": deposit_doc.status,
				"instructions": "Please make payment to complete your booking"
			}
		)
	except Exception as e:
		frappe.log_error(f"Error in get_deposit_instructions: {str(e)}")
		return error("Failed to get deposit instructions", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def record_deposit_payment(ticket_id, amount, verification_method="Manual", ocr_payload=None):
	"""
	Record a deposit payment
	
	Args:
		ticket_id: ID of the ticket
		amount: Payment amount
		verification_method: Verification method (Manual/OCR)
		ocr_payload: Optional OCR payload JSON
		
	Returns:
		Success response with updated deposit data
	"""
	try:
		if not ticket_id:
			return validation_error("ticket_id is required")
		if not amount or amount <= 0:
			return validation_error("amount must be greater than 0")

		if not frappe.db.exists("Cheese Ticket", ticket_id):
			return not_found("Ticket", ticket_id)

		# Get deposit
		deposit_name = frappe.db.get_value(
			"Cheese Deposit",
			{"entity_type": "Ticket", "entity_id": ticket_id},
			"name"
		)

		if not deposit_name:
			return not_found("Deposit", f"for ticket {ticket_id}")

		deposit = frappe.get_doc("Cheese Deposit", deposit_name)
		old_status = deposit.status
		old_amount_paid = deposit.amount_paid or 0
		
		deposit.record_payment(amount, verification_method, ocr_payload)
		frappe.db.commit()

		return success(
			"Deposit payment recorded successfully",
			{
				"deposit_id": deposit.name,
				"ticket_id": ticket_id,
				"amount_paid": amount,
				"total_amount_paid": deposit.amount_paid or 0,
				"amount_required": deposit.amount_required,
				"amount_remaining": deposit.amount_required - (deposit.amount_paid or 0),
				"old_status": old_status,
				"new_status": deposit.status,
				"verification_method": verification_method,
				"is_complete": deposit.status == "PAID"
			}
		)
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except Exception as e:
		frappe.log_error(f"Error in record_deposit_payment: {str(e)}")
		return error("Failed to record deposit payment", "SERVER_ERROR", {"error": str(e)}, 500)
