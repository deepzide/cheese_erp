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


@frappe.whitelist()
def get_deposit_status(deposit_id):
	"""
	Get deposit status and details (US-13)
	
	Args:
		deposit_id: Deposit ID
		
	Returns:
		Success response with deposit details
	"""
	try:
		if not deposit_id:
			return validation_error("deposit_id is required")
		
		if not frappe.db.exists("Cheese Deposit", deposit_id):
			return not_found("Deposit", deposit_id)
		
		deposit = frappe.get_doc("Cheese Deposit", deposit_id)
		
		return success(
			"Deposit status retrieved successfully",
			{
				"deposit_id": deposit.name,
				"entity_type": deposit.entity_type,
				"entity_id": deposit.entity_id,
				"amount_required": deposit.amount_required,
				"amount_paid": deposit.amount_paid or 0,
				"amount_remaining": deposit.amount_required - (deposit.amount_paid or 0),
				"status": deposit.status,
				"due_at": str(deposit.due_at) if deposit.due_at else None,
				"paid_at": str(deposit.paid_at) if deposit.paid_at else None,
				"verification_method": deposit.verification_method,
				"is_overdue": deposit.due_at and deposit.due_at < now_datetime() and deposit.status == "PENDING" if deposit.due_at else False
			}
		)
	except Exception as e:
		frappe.log_error(f"Error in get_deposit_status: {str(e)}")
		return error("Failed to get deposit status", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def mark_deposit_overdue(deposit_id):
	"""
	Mark deposit as overdue (US-13)
	
	Args:
		deposit_id: Deposit ID
		
	Returns:
		Success response
	"""
	try:
		if not deposit_id:
			return validation_error("deposit_id is required")
		
		if not frappe.db.exists("Cheese Deposit", deposit_id):
			return not_found("Deposit", deposit_id)
		
		deposit = frappe.get_doc("Cheese Deposit", deposit_id)
		
		if deposit.status != "PENDING":
			return validation_error(
				f"Only PENDING deposits can be marked as overdue. Current status: {deposit.status}",
				{"current_status": deposit.status}
			)
		
		if not deposit.due_at:
			return validation_error("Deposit has no due_at date")
		
		if deposit.due_at > now_datetime():
			return validation_error("Deposit is not yet overdue")
		
		old_status = deposit.status
		deposit.status = "OVERDUE"
		deposit.save()
		
		# Cancel associated ticket/route booking for non-payment
		if deposit.entity_type == "Ticket" and deposit.entity_id:
			if frappe.db.exists("Cheese Ticket", deposit.entity_id):
				ticket = frappe.get_doc("Cheese Ticket", deposit.entity_id)
				if ticket.status in ["PENDING", "CONFIRMED"]:
					ticket.status = "CANCELLED"
					ticket.save()
					
					# Release capacity
					from cheese.cheese.utils.capacity import update_slot_capacity
					update_slot_capacity(ticket.slot)
		
		frappe.db.commit()
		
		return success(
			"Deposit marked as overdue",
			{
				"deposit_id": deposit.name,
				"old_status": old_status,
				"new_status": deposit.status
			}
		)
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except Exception as e:
		frappe.log_error(f"Error in mark_deposit_overdue: {str(e)}")
		return error("Failed to mark deposit overdue", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def adjust_deposit(deposit_id, adjustment_reason, refund_amount=None):
	"""
	Adjust or refund deposit (US-13)
	
	Args:
		deposit_id: Deposit ID
		adjustment_reason: Reason for adjustment
		refund_amount: Refund amount (if partial refund)
		
	Returns:
		Success response
	"""
	try:
		if not deposit_id:
			return validation_error("deposit_id is required")
		if not adjustment_reason:
			return validation_error("adjustment_reason is required")
		
		if not frappe.db.exists("Cheese Deposit", deposit_id):
			return not_found("Deposit", deposit_id)
		
		deposit = frappe.get_doc("Cheese Deposit", deposit_id)
		
		if deposit.status not in ["PAID", "OVERDUE"]:
			return validation_error(
				f"Cannot adjust deposit with status: {deposit.status}",
				{"current_status": deposit.status}
			)
		
		old_status = deposit.status
		
		if refund_amount is not None:
			# Partial refund
			if refund_amount < 0:
				return validation_error("refund_amount must be >= 0")
			if refund_amount > (deposit.amount_paid or 0):
				return validation_error("refund_amount cannot exceed amount_paid")
			
			deposit.amount_paid = (deposit.amount_paid or 0) - refund_amount
			if deposit.amount_paid == 0:
				deposit.status = "REFUNDED"
			else:
				deposit.status = "ADJUSTED"
		else:
			# Full refund
			deposit.status = "REFUNDED"
			deposit.amount_paid = 0
		
		deposit.save()
		frappe.db.commit()
		
		return success(
			"Deposit adjusted successfully",
			{
				"deposit_id": deposit.name,
				"old_status": old_status,
				"new_status": deposit.status,
				"adjustment_reason": adjustment_reason,
				"refund_amount": refund_amount,
				"remaining_amount": deposit.amount_paid
			}
		)
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except Exception as e:
		frappe.log_error(f"Error in adjust_deposit: {str(e)}")
		return error("Failed to adjust deposit", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def list_deposits(page=1, page_size=20, status=None, entity_type=None, entity_id=None):
	"""
	List deposits with filters (US-13)
	
	Args:
		page: Page number
		page_size: Items per page
		status: Filter by status
		entity_type: Filter by entity type
		entity_id: Filter by entity ID
		
	Returns:
		Paginated response with deposits list
	"""
	try:
		from frappe.utils import cint
		from cheese.api.common.responses import paginated_response
		
		page = cint(page) or 1
		page_size = cint(page_size) or 20
		
		filters = {}
		if status:
			filters["status"] = status
		if entity_type:
			filters["entity_type"] = entity_type
		if entity_id:
			filters["entity_id"] = entity_id
		
		deposits = frappe.get_all(
			"Cheese Deposit",
			filters=filters,
			fields=["name", "entity_type", "entity_id", "amount_required", "amount_paid", "status", "due_at", "paid_at", "modified"],
			limit_start=(page - 1) * page_size,
			limit_page_length=page_size,
			order_by="modified desc"
		)
		
		# Calculate remaining amounts
		for deposit in deposits:
			deposit["amount_remaining"] = deposit.amount_required - (deposit.amount_paid or 0)
		
		total = frappe.db.count("Cheese Deposit", filters=filters)
		
		return paginated_response(
			deposits,
			"Deposits retrieved successfully",
			page=page,
			page_size=page_size,
			total=total
		)
	except Exception as e:
		frappe.log_error(f"Error in list_deposits: {str(e)}")
		return error("Failed to list deposits", "SERVER_ERROR", {"error": str(e)}, 500)
