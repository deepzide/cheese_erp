# Copyright (c) 2024
# License: MIT

import frappe
from frappe import _
from frappe.utils import add_to_date, flt, now_datetime
from cheese.api.common.responses import success, created, error, not_found, validation_error
from cheese.api.v1.bank_account_controller import get_active_company_bank_accounts_list


def _instructions_for_deposit(amount_required, bank_accounts):
	if not bank_accounts:
		return _("Please make payment to complete your booking")
	parts = []
	for ba in bank_accounts:
		parts.append(
			_("{0} — {1} ({2})").format(
				ba.get("bank_name") or "",
				ba.get("account_number") or "",
				ba.get("currency") or "",
			)
		)
	accounts_txt = "; ".join(parts)
	first_cur = bank_accounts[0].get("currency") or ""
	return _("Please transfer {0} {1}. Pay to one of: {2}").format(
		amount_required, first_cur, accounts_txt
	)


def _bank_accounts_for_ticket(ticket):
	if not ticket.experience:
		return []
	if not frappe.db.exists("Cheese Experience", ticket.experience):
		return []
	establishment_company = frappe.db.get_value("Cheese Experience", ticket.experience, "company")
	if not establishment_company:
		return []
	return get_active_company_bank_accounts_list(establishment_company)


@frappe.whitelist()
def get_payment_link_or_instructions(ticket_id=None, deposit_id=None):
	"""
	Get payment link or instructions - enhanced version of get_deposit_instructions
	Returns payment link if available, otherwise returns instructions
	
	Args:
		ticket_id: Ticket ID (optional if deposit_id provided)
		deposit_id: Deposit ID (optional if ticket_id provided)
		
	Returns:
		Success response with payment link or instructions
	"""
	try:
		if not ticket_id and not deposit_id:
			return validation_error("Either ticket_id or deposit_id must be provided")
		
		deposit_doc = None
		
		if deposit_id:
			if not frappe.db.exists("Cheese Deposit", deposit_id):
				return not_found("Deposit", deposit_id)
			deposit_doc = frappe.get_doc("Cheese Deposit", deposit_id)
			ticket_id = deposit_doc.entity_id if deposit_doc.entity_type == "Cheese Ticket" else None
		else:
			# Get deposit from ticket
			deposit_name = frappe.db.get_value(
				"Cheese Deposit",
				{"entity_type": "Cheese Ticket", "entity_id": ticket_id},
				"name"
			)
			
			if deposit_name:
				deposit_doc = frappe.get_doc("Cheese Deposit", deposit_name)
			else:
				# Use get_deposit_instructions to create if needed
				instructions_result = get_deposit_instructions(ticket_id)
				if not instructions_result.get("success"):
					return instructions_result
				
				deposit_id_from_result = instructions_result.get("data", {}).get("deposit_id")
				if deposit_id_from_result:
					deposit_doc = frappe.get_doc("Cheese Deposit", deposit_id_from_result)
		
		if not deposit_doc:
			return not_found("Deposit", deposit_id or f"for ticket {ticket_id}")

		bank_account = []
		if ticket_id and frappe.db.exists("Cheese Ticket", ticket_id):
			ticket_doc = frappe.get_doc("Cheese Ticket", ticket_id)
			bank_account = _bank_accounts_for_ticket(ticket_doc)

		# Generate payment link (simplified - would integrate with payment gateway in production)
		payment_link = None
		if deposit_doc.status == "PENDING":
			# In production, this would generate a real payment link
			payment_link = f"/api/method/cheese.api.v1.deposit_controller.record_deposit_payment?ticket_id={ticket_id}&amount={deposit_doc.amount_required}"

		instructions = (
			_instructions_for_deposit(deposit_doc.amount_required, bank_account)
			if bank_account
			else (
				_("Use the payment link to complete payment")
				if payment_link
				else _("Please make payment to complete your booking")
			)
		)

		return success(
			"Payment instructions retrieved successfully",
			{
				"deposit_id": deposit_doc.name,
				"ticket_id": ticket_id,
				"amount_required": deposit_doc.amount_required,
				"amount_paid": deposit_doc.amount_paid or 0,
				"amount_remaining": deposit_doc.amount_required - (deposit_doc.amount_paid or 0),
				"due_at": str(deposit_doc.due_at) if deposit_doc.due_at else None,
				"status": deposit_doc.status,
				"payment_link": payment_link,
				"bank_account": bank_account,
				"instructions": instructions,
			}
		)
	except Exception as e:
		frappe.log_error(f"Error in get_payment_link_or_instructions: {str(e)}")
		return error("Failed to get payment link or instructions", "SERVER_ERROR", {"error": str(e)}, 500)


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
		bank_account = _bank_accounts_for_ticket(ticket)

		if not ticket.deposit_required:
			return success(
				"No deposit required for this ticket",
				{
					"deposit_required": False,
					"ticket_id": ticket_id,
					"bank_account": bank_account,
				}
			)

		# Get or create deposit
		deposit = frappe.db.get_value(
			"Cheese Deposit",
			{"entity_type": "Cheese Ticket", "entity_id": ticket_id},
			"name"
		)

		if not deposit:
			# Create deposit
			experience = frappe.get_doc("Cheese Experience", ticket.experience)
			due_at = add_to_date(now_datetime(), hours=experience.deposit_ttl_hours or 24, as_string=False)
			
			deposit_doc = frappe.get_doc({
				"doctype": "Cheese Deposit",
				"entity_type": "Cheese Ticket",
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
				"bank_account": bank_account,
				"instructions": _instructions_for_deposit(deposit_doc.amount_required, bank_account),
			}
		)
	except Exception as e:
		frappe.log_error(f"Error in get_deposit_instructions: {str(e)}")
		return error("Failed to get deposit instructions", "SERVER_ERROR", {"error": str(e)}, 500)


def _extract_receipt_upload():
	if not frappe.request or not getattr(frappe.request, "files", None):
		return None
	for key in ("receipt", "payment_receipt", "file"):
		f = frappe.request.files.get(key)
		if f and getattr(f, "filename", None):
			return f
	return None


def _attach_receipt_to_deposit(deposit_name, file_storage):
	content = file_storage.stream.read()
	if not content:
		frappe.throw(_("Uploaded file is empty"))
	filename = (file_storage.filename or "receipt").strip()
	ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
	if ext not in ("pdf", "png", "jpg", "jpeg", "webp"):
		frappe.throw(_("Unsupported file type. Use PDF, PNG, JPG, JPEG, or WEBP."))
	max_bytes = 10 * 1024 * 1024
	if len(content) > max_bytes:
		frappe.throw(_("File exceeds maximum size of {0} MB").format(10))

	file_doc = frappe.get_doc(
		{
			"doctype": "File",
			"file_name": filename,
			"attached_to_doctype": "Cheese Deposit",
			"attached_to_name": deposit_name,
			"content": content,
			"is_private": 1,
		}
	)
	file_doc.save(ignore_permissions=True)
	return file_doc


@frappe.whitelist()
def record_deposit_payment(
	ticket_id=None, amount=None, verification_method="Manual", ocr_payload=None,
	attach_receipt=True, deposit_id=None
):
	"""
	Record a deposit payment

	Args:
		ticket_id: ID of the ticket (required unless deposit_id is provided)
		amount: Payment amount
		verification_method: Verification method (Manual/OCR)
		ocr_payload: Optional OCR payload JSON
		attach_receipt: If true (default), accept multipart file field receipt/payment_receipt/file
		deposit_id: Deposit ID (optional - if provided, looks up deposit directly)

	Returns:
		Success response with updated deposit data
	"""
	try:
		if not ticket_id and not deposit_id:
			return validation_error("Either ticket_id or deposit_id is required")
		amount = flt(amount)
		if not amount or amount <= 0:
			return validation_error("amount must be greater than 0")

		if attach_receipt in (0, "0", False, "false", "False"):
			do_attach = False
		else:
			do_attach = True

		# Resolve deposit directly by deposit_id if provided
		if deposit_id:
			if not frappe.db.exists("Cheese Deposit", deposit_id):
				return not_found("Deposit", deposit_id)
			deposit = frappe.get_doc("Cheese Deposit", deposit_id)
			ticket_id = ticket_id or (deposit.entity_id if deposit.entity_type == "Cheese Ticket" else None)
		else:
			if not frappe.db.exists("Cheese Ticket", ticket_id):
				return not_found("Ticket", ticket_id)

			# Get or auto-create deposit for this ticket
			deposit_name = frappe.db.get_value(
				"Cheese Deposit",
				{"entity_type": "Cheese Ticket", "entity_id": ticket_id},
				"name"
			)

			if not deposit_name:
				# Auto-create deposit if it doesn't exist yet
				ticket_doc = frappe.get_doc("Cheese Ticket", ticket_id)
				if not ticket_doc.deposit_required:
					return validation_error("This ticket does not require a deposit")
				if not ticket_doc.experience:
					return validation_error("Ticket has no experience linked; cannot determine deposit TTL")
				experience = frappe.get_doc("Cheese Experience", ticket_doc.experience)
				due_at = add_to_date(now_datetime(), hours=experience.deposit_ttl_hours or 24, as_string=False)
				new_deposit = frappe.get_doc({
					"doctype": "Cheese Deposit",
					"entity_type": "Cheese Ticket",
					"entity_id": ticket_id,
					"amount_required": ticket_doc.deposit_amount,
					"status": "PENDING",
					"due_at": due_at,
				})
				new_deposit.insert()
				frappe.db.commit()
				deposit_name = new_deposit.name

			deposit = frappe.get_doc("Cheese Deposit", deposit_name)
		old_status = deposit.status

		deposit.record_payment(amount, verification_method, ocr_payload)

		receipt_file_id = None
		receipt_file_url = None
		if do_attach:
			upload = _extract_receipt_upload()
			if upload:
				file_doc = _attach_receipt_to_deposit(deposit.name, upload)
				receipt_file_id = file_doc.name
				receipt_file_url = file_doc.file_url

		frappe.db.commit()

		payload = {
			"deposit_id": deposit.name,
			"ticket_id": ticket_id,
			"amount_paid": amount,
			"total_amount_paid": deposit.amount_paid or 0,
			"amount_required": deposit.amount_required,
			"amount_remaining": deposit.amount_required - (deposit.amount_paid or 0),
			"old_status": old_status,
			"new_status": deposit.status,
			"verification_method": verification_method,
			"is_complete": deposit.status == "PAID",
		}
		if receipt_file_id:
			payload["receipt_file_id"] = receipt_file_id
			payload["receipt_file_url"] = receipt_file_url

		return success("Deposit payment recorded successfully", payload)
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except Exception as e:
		frappe.log_error(f"Error in record_deposit_payment: {str(e)}")
		return error("Failed to record deposit payment", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def verify_deposit(deposit_id):
	"""
	Manual verification helper used by backoffice UI.
	If deposit is still pending, mark it as fully paid and verified.
	"""
	try:
		if not deposit_id:
			return validation_error("deposit_id is required")

		if not frappe.db.exists("Cheese Deposit", deposit_id):
			return not_found("Deposit", deposit_id)

		deposit = frappe.get_doc("Cheese Deposit", deposit_id)
		old_status = deposit.status

		if deposit.status in ["PAID", "REFUNDED"]:
			return success(
				"Deposit already verified",
				{
					"deposit_id": deposit.name,
					"old_status": old_status,
					"new_status": deposit.status,
					"amount_required": deposit.amount_required,
					"amount_paid": deposit.amount_paid or 0,
				},
			)

		deposit.amount_paid = deposit.amount_required
		deposit.verification_method = "Manual"
		deposit.status = "PAID"
		deposit.paid_at = now_datetime()
		deposit.save()
		frappe.db.commit()

		return success(
			"Deposit verified successfully",
			{
				"deposit_id": deposit.name,
				"old_status": old_status,
				"new_status": deposit.status,
				"amount_required": deposit.amount_required,
				"amount_paid": deposit.amount_paid or 0,
			},
		)
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except Exception as e:
		frappe.log_error(f"Error in verify_deposit: {str(e)}")
		return error("Failed to verify deposit", "SERVER_ERROR", {"error": str(e)}, 500)


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
		if deposit.entity_type == "Cheese Ticket" and deposit.entity_id:
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
def list_deposits(page=1, page_size=20, status=None, entity_type=None, entity_id=None, route_id=None, company_id=None):
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
			order_by="modified desc"
		)

		# Enrich with contact and relation info for UI filtering and display.
		enriched = []
		for deposit in deposits:
			deposit["amount_remaining"] = deposit.amount_required - (deposit.amount_paid or 0)
			deposit["contact"] = None
			deposit["contact_name"] = None
			deposit["route"] = None
			deposit["company"] = None
			deposit["linked_ticket_id"] = None

			if deposit.entity_type == "Cheese Ticket":
				ticket = frappe.db.get_value(
					"Cheese Ticket",
					deposit.entity_id,
					["name", "contact", "route", "company"],
					as_dict=True,
				)
				if ticket:
					deposit["contact"] = ticket.contact
					deposit["route"] = ticket.route
					deposit["company"] = ticket.company
					deposit["linked_ticket_id"] = ticket.name
			elif deposit.entity_type == "Cheese Route Booking":
				booking = frappe.db.get_value(
					"Cheese Route Booking",
					deposit.entity_id,
					["contact", "route"],
					as_dict=True,
				)
				if booking:
					deposit["contact"] = booking.contact
					deposit["route"] = booking.route
					# Route doctype has no direct company field; derive establishment from linked tickets.
					first_ticket_id = frappe.db.get_value(
						"Cheese Route Booking Ticket",
						{"parent": deposit.entity_id},
						"ticket",
						order_by="idx asc",
					)
					if first_ticket_id:
						deposit["company"] = frappe.db.get_value("Cheese Ticket", first_ticket_id, "company")
					deposit["linked_ticket_id"] = frappe.db.get_value(
						"Cheese Route Booking Ticket",
						{"parent": deposit.entity_id},
						"ticket",
						order_by="idx asc",
					)

			if deposit.get("contact"):
				deposit["contact_name"] = frappe.db.get_value("Cheese Contact", deposit["contact"], "full_name")

			if route_id and deposit.get("route") != route_id:
				continue
			if company_id and deposit.get("company") != company_id:
				continue
			enriched.append(deposit)

		total = len(enriched)
		start = (page - 1) * page_size
		end = start + page_size
		deposits_page = enriched[start:end]
		
		return paginated_response(
			deposits_page,
			"Deposits retrieved successfully",
			page=page,
			page_size=page_size,
			total=total
		)
	except Exception as e:
		frappe.log_error(f"Error in list_deposits: {str(e)}")
		return error("Failed to list deposits", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def validate_ocr_payload(ocr_payload, expected_amount=None):
	"""
	Validate OCR payload structure before recording payment (US-03)
	
	Args:
		ocr_payload: OCR payload JSON (string or dict)
		expected_amount: Expected payment amount (optional, for validation)
		
	Returns:
		Success response with validation result
	"""
	try:
		import json
		
		if not ocr_payload:
			return validation_error("ocr_payload is required")
		
		# Parse OCR payload if string
		if isinstance(ocr_payload, str):
			try:
				ocr_data = json.loads(ocr_payload)
			except json.JSONDecodeError:
				return validation_error("Invalid OCR payload JSON format")
		else:
			ocr_data = ocr_payload

		# Required fields
		required_fields = ["account", "amount", "date"]
		missing_fields = [f for f in required_fields if f not in ocr_data]
		
		if missing_fields:
			return validation_error(
				f"OCR payload missing required fields: {', '.join(missing_fields)}",
				{"missing_fields": missing_fields}
			)

		# Validate amount if provided
		if expected_amount:
			ocr_amount = float(ocr_data.get("amount", 0))
			if abs(ocr_amount - float(expected_amount)) > 0.01:
				return validation_error(
					f"OCR amount ({ocr_amount}) does not match expected amount ({expected_amount})",
					{"ocr_amount": ocr_amount, "expected_amount": expected_amount}
				)

		# Validate date format
		try:
			from frappe.utils import getdate
			ocr_date = getdate(ocr_data["date"])
			from frappe.utils import now_datetime
			if ocr_date > getdate(now_datetime()):
				return validation_error("OCR date cannot be in the future")
		except Exception as e:
			return validation_error(f"Invalid date format in OCR payload: {str(e)}")

		return success(
			"OCR payload is valid",
			{
				"valid": True,
				"ocr_data": ocr_data,
				"account": ocr_data.get("account"),
				"amount": ocr_data.get("amount"),
				"date": ocr_data.get("date"),
				"reference": ocr_data.get("reference")
			}
		)
	except Exception as e:
		frappe.log_error(f"Error in validate_ocr_payload: {str(e)}")
		return error("Failed to validate OCR payload", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def reconcile_deposit(deposit_id, bank_account_number=None):
	"""
	Reconcile deposit payment against expected bank account (US-03)
	
	Args:
		deposit_id: Deposit ID
		bank_account_number: Expected bank account number (optional)
		
	Returns:
		Success response with reconciliation result
	"""
	try:
		if not deposit_id:
			return validation_error("deposit_id is required")
		
		if not frappe.db.exists("Cheese Deposit", deposit_id):
			return not_found("Deposit", deposit_id)
		
		deposit = frappe.get_doc("Cheese Deposit", deposit_id)
		
		# Use reconcile_ocr_payment method
		reconciliation_result = deposit.reconcile_ocr_payment(bank_account_number)
		
		frappe.db.commit()
		
		return success(
			"Deposit reconciled successfully",
			{
				"deposit_id": deposit.name,
				"reconciled": reconciliation_result.get("reconciled", False),
				"ocr_data": reconciliation_result.get("ocr_data"),
				"message": reconciliation_result.get("message")
			}
		)
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except Exception as e:
		frappe.log_error(f"Error in reconcile_deposit: {str(e)}")
		return error("Failed to reconcile deposit", "SERVER_ERROR", {"error": str(e)}, 500)
