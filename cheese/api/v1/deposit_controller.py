# Copyright (c) 2024
# License: MIT

import frappe
from frappe import _
from frappe.utils import add_to_date, flt, now_datetime

from cheese.api.common.responses import created, error, not_found, success, validation_error
from cheese.api.v1.bank_account_controller import get_active_company_bank_accounts_list
from cheese.api.v1.user_controller import _get_current_user_company

OPEN_DEPOSIT_STATUSES = ("PENDING", "OVERDUE")
RECEIVED_DEPOSIT_STATUSES = ("PAID", "REVIEW", "ADJUSTED")
IGNORED_DEPOSIT_STATUSES = ("CANCELLED", "REFUNDED")


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
	return _("Please transfer {0} {1}. Pay to one of: {2}").format(amount_required, first_cur, accounts_txt)


def _bank_accounts_for_ticket(ticket):
	if not ticket.experience:
		return []
	if not frappe.db.exists("Cheese Experience", ticket.experience):
		return []
	establishment_company = frappe.db.get_value("Cheese Experience", ticket.experience, "company")
	if not establishment_company:
		return []
	return get_active_company_bank_accounts_list(establishment_company)


def _get_entity_total_price(entity_type, entity_doc):
	if entity_type == "Cheese Ticket":
		return flt(entity_doc.total_price or 0)
	return flt(entity_doc.total_price or 0)


def _get_paid_amount_for_entity(entity_type, entity_id):
	paid_rows = frappe.get_all(
		"Cheese Deposit",
		filters={"entity_type": entity_type, "entity_id": entity_id, "status": "PAID"},
		fields=["amount_paid"],
	)
	return sum(flt(row.amount_paid or 0) for row in paid_rows)


def _get_deposits_for_entity(entity_type, entity_id):
	return frappe.get_all(
		"Cheese Deposit",
		filters={"entity_type": entity_type, "entity_id": entity_id},
		fields=["name", "status", "amount_required", "amount_paid", "creation"],
		order_by="creation asc",
	)


def _get_deposit_phase(deposit_name, deposits=None):
	deposits = deposits or []
	if not deposits:
		deposit = frappe.get_doc("Cheese Deposit", deposit_name)
		deposits = _get_deposits_for_entity(deposit.entity_type, deposit.entity_id)
	if not deposits:
		return "Deposit"
	return "Deposit" if deposits[0].name == deposit_name else "Balance"


def _amount_remaining_for_deposit(deposit):
	if deposit.status in IGNORED_DEPOSIT_STATUSES:
		return 0
	return max(0, flt(deposit.amount_required or 0) - flt(deposit.amount_paid or 0))


def _get_amount_received_for_entity(entity_type, entity_id):
	"""Total amount received excluding cancelled/refunded deposits."""
	rows = frappe.get_all(
		"Cheese Deposit",
		filters={
			"entity_type": entity_type,
			"entity_id": entity_id,
			"status": ["not in", ["CANCELLED", "REFUNDED"]],
		},
		fields=["amount_paid"],
	)
	return sum(flt(row.amount_paid or 0) for row in rows)


def _get_received_deposits_for_entity(entity_type, entity_id):
	return frappe.get_all(
		"Cheese Deposit",
		filters={
			"entity_type": entity_type,
			"entity_id": entity_id,
			"status": ["in", RECEIVED_DEPOSIT_STATUSES],
		},
		fields=["name", "status", "amount_required", "amount_paid"],
		order_by="creation asc",
	)


def _get_open_balance_deposit(entity_type, entity_id):
	deposits = _get_deposits_for_entity(entity_type, entity_id)
	for deposit in reversed(deposits[1:]):
		if deposit.status in OPEN_DEPOSIT_STATUSES:
			return deposit.name
	return None


def _create_balance_deposit(entity_type, entity_doc, due_at=None):
	existing_balance = _get_open_balance_deposit(entity_type, entity_doc.name)
	if existing_balance:
		return frappe.get_doc("Cheese Deposit", existing_balance)

	total_price = _get_entity_total_price(entity_type, entity_doc)
	paid_total = _get_amount_received_for_entity(entity_type, entity_doc.name)
	remaining = total_price - paid_total
	if remaining <= 0:
		frappe.throw(
			_("No remaining balance. Total price: {0}, already paid: {1}").format(total_price, paid_total),
			frappe.ValidationError,
		)

	if due_at is None:
		ttl = 24
		if entity_type == "Cheese Ticket" and getattr(entity_doc, "experience", None):
			ttl = frappe.db.get_value("Cheese Experience", entity_doc.experience, "deposit_ttl_hours") or 24
		due_at = add_to_date(now_datetime(), hours=ttl, as_string=False)

	new_deposit = frappe.get_doc(
		{
			"doctype": "Cheese Deposit",
			"entity_type": entity_type,
			"entity_id": entity_doc.name,
			"amount_required": remaining,
			"status": "PENDING",
			"due_at": due_at,
		}
	)
	new_deposit.flags.skip_unique_check = True
	new_deposit.insert()
	return new_deposit


def _select_open_deposit(entity_type, entity_id, payment_type=None):
	"""Pick the best active deposit for the requested payment phase."""
	all_deposits = _get_deposits_for_entity(entity_type, entity_id)
	open_deposits = [d for d in all_deposits if d.status in OPEN_DEPOSIT_STATUSES]

	if not open_deposits:
		return None

	first_deposit_name = all_deposits[0].name if all_deposits else None

	if payment_type == "Balance":
		if len(all_deposits) > 1 and open_deposits[-1].name != first_deposit_name:
			return open_deposits[-1].name
		if open_deposits[-1].name == first_deposit_name:
			return None

	if payment_type == "Deposit":
		return first_deposit_name if all_deposits[0].status in OPEN_DEPOSIT_STATUSES else None

	return open_deposits[0].name


def _build_deposit_payload(deposit):
	bank_account_title = None
	if getattr(deposit, "bank_account", None) and frappe.db.exists(
		"Cheese Bank Account", deposit.bank_account
	):
		bank_account_title = frappe.db.get_value("Cheese Bank Account", deposit.bank_account, "title")

	payload = {
		"deposit_id": deposit.name,
		"entity_type": deposit.entity_type,
		"entity_id": deposit.entity_id,
		"amount_required": deposit.amount_required,
		"amount_paid": deposit.amount_paid or 0,
		"amount_remaining": _amount_remaining_for_deposit(deposit),
		"status": deposit.status,
		"payment_type": _get_deposit_phase(deposit.name),
		"due_at": str(deposit.due_at) if deposit.due_at else None,
		"paid_at": str(deposit.paid_at) if deposit.paid_at else None,
		"verification_method": deposit.verification_method,
		"bank_account": getattr(deposit, "bank_account", None),
		"bank_account_title": bank_account_title,
		"notes": getattr(deposit, "notes", None),
	}

	if deposit.entity_type == "Cheese Ticket" and frappe.db.exists("Cheese Ticket", deposit.entity_id):
		ticket = frappe.db.get_value(
			"Cheese Ticket",
			deposit.entity_id,
			["name", "contact", "route", "company", "total_price", "deposit_amount"],
			as_dict=True,
		)
		if ticket:
			contact_name = None
			if ticket.contact:
				contact_name = frappe.db.get_value("Cheese Contact", ticket.contact, "full_name")
			payload.update(
				{
					"ticket_id": ticket.name,
					"contact": ticket.contact,
					"contact_name": contact_name,
					"route": ticket.route,
					"company": ticket.company,
					"ticket_total_price": ticket.total_price,
					"ticket_deposit_amount": ticket.deposit_amount,
					"bank_accounts": _bank_accounts_for_ticket(frappe.get_doc("Cheese Ticket", ticket.name)),
				}
			)

	return payload


@frappe.whitelist()
def get_payment_link_or_instructions(ticket_id=None, deposit_id=None, payment_type=None):
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
			if not frappe.db.exists("Cheese Ticket", ticket_id):
				return not_found("Ticket", ticket_id)

			deposit_name = _select_open_deposit("Cheese Ticket", ticket_id, payment_type=payment_type)

			if deposit_name:
				deposit_doc = frappe.get_doc("Cheese Deposit", deposit_name)
			else:
				# Use get_deposit_instructions to create if needed
				instructions_result = get_deposit_instructions(ticket_id, payment_type=payment_type)
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
		if deposit_doc.status in OPEN_DEPOSIT_STATUSES:
			# In production, this would generate a real payment link
			payment_link = f"/api/method/cheese.api.v1.deposit_controller.record_deposit_payment?ticket_id={ticket_id}&amount={deposit_doc.amount_required}&payment_type={payment_type or _get_deposit_phase(deposit_doc.name)}"

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
				"amount_remaining": _amount_remaining_for_deposit(deposit_doc),
				"due_at": str(deposit_doc.due_at) if deposit_doc.due_at else None,
				"status": deposit_doc.status,
				"payment_type": payment_type or _get_deposit_phase(deposit_doc.name),
				"payment_link": payment_link,
				"bank_account": bank_account,
				"instructions": instructions,
			},
		)
	except Exception as e:
		frappe.log_error(f"Error in get_payment_link_or_instructions: {e!s}")
		return error("Failed to get payment link or instructions", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def get_deposit_instructions(ticket_id, payment_type=None):
	"""
	Get deposit payment instructions for a ticket

	Args:
		ticket_id: ID of the ticket
		payment_type: Optional "Deposit" or "Balance"

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
				},
			)

		# Fetch existing deposits to determine state before selecting or creating
		existing_deps = frappe.get_all(
			"Cheese Deposit",
			filters={"entity_type": "Cheese Ticket", "entity_id": ticket_id},
			fields=["name", "status", "amount_required", "amount_paid"],
			order_by="creation asc",
		)
		first_dep = existing_deps[0] if existing_deps else None

		# When payment_type == "Deposit", if the seña is already paid do not create a new one
		if payment_type == "Deposit" and first_dep and first_dep.status in RECEIVED_DEPOSIT_STATUSES:
			deposit_doc = frappe.get_doc("Cheese Deposit", first_dep.name)
			deposit = first_dep.name
		else:
			deposit = _select_open_deposit("Cheese Ticket", ticket_id, payment_type=payment_type)

			if not deposit:
				# Create deposit based on payment_type
				if payment_type == "Balance":
					advance_required = flt(ticket.deposit_amount or 0) if ticket.deposit_required else 0
					if (
						advance_required > 0
						and _get_amount_received_for_entity("Cheese Ticket", ticket_id) + 0.01
						< advance_required
					):
						return validation_error(
							"No paid advance deposit found. The advance must be paid before creating a remaining-balance deposit."
						)
					deposit_doc = _create_balance_deposit("Cheese Ticket", ticket)
				else:
					experience = frappe.get_doc("Cheese Experience", ticket.experience)
					due_at = add_to_date(
						now_datetime(), hours=experience.deposit_ttl_hours or 24, as_string=False
					)

					deposit_doc = frappe.get_doc(
						{
							"doctype": "Cheese Deposit",
							"entity_type": "Cheese Ticket",
							"entity_id": ticket_id,
							"amount_required": ticket.deposit_amount,
							"status": "PENDING",
							"due_at": due_at,
						}
					)
					deposit_doc.insert()
				deposit = deposit_doc.name
				frappe.db.commit()
			else:
				deposit_doc = frappe.get_doc("Cheese Deposit", deposit)

		# Re-fetch after potential creation of a new deposit
		all_deps = frappe.get_all(
			"Cheese Deposit",
			filters={"entity_type": "Cheese Ticket", "entity_id": ticket_id},
			fields=["name", "status", "amount_required", "amount_paid"],
			order_by="creation asc",
		)

		inferred_payment_type = payment_type or (
			"Balance" if all_deps and all_deps[0].name != deposit_doc.name else "Deposit"
		)

		# Filter all_deposits to only include entries matching the requested payment_type
		if payment_type == "Deposit":
			filtered_deps = [d for d in all_deps if _get_deposit_phase(d.name, all_deps) == "Deposit"]
		elif payment_type == "Balance":
			filtered_deps = [d for d in all_deps if _get_deposit_phase(d.name, all_deps) == "Balance"]
		else:
			filtered_deps = all_deps

		# Build deposits summary
		deposits_summary = []
		for d in filtered_deps:
			deposits_summary.append(
				{
					"deposit_id": d.name,
					"status": d.status,
					"payment_type": _get_deposit_phase(d.name, all_deps),
					"amount_required": d.amount_required,
					"amount_paid": d.amount_paid or 0,
					"amount_remaining": _amount_remaining_for_deposit(d),
				}
			)

		# Get total received and total price for context
		total_received = _get_amount_received_for_entity("Cheese Ticket", ticket_id)
		total_price = flt(ticket.total_price or 0)

		# Enrich with contact info
		contact_info = None
		if ticket.contact:
			contact_name = frappe.db.get_value("Cheese Contact", ticket.contact, "full_name")
			contact_info = {"contact_id": ticket.contact, "contact_name": contact_name}

		# deposit_required is False when the seña deposit is already completed
		deposit_is_complete = deposit_doc.status in RECEIVED_DEPOSIT_STATUSES

		instructions = (
			_("Your deposit payment has been completed")
			if deposit_is_complete
			else _instructions_for_deposit(deposit_doc.amount_required, bank_account)
		)

		return success(
			"Deposit instructions retrieved successfully",
			{
				"deposit_required": not deposit_is_complete,
				"deposit_id": deposit,
				"ticket_id": ticket_id,
				"payment_type": inferred_payment_type,
				"amount_required": deposit_doc.amount_required,
				"amount_paid": deposit_doc.amount_paid or 0,
				"amount_remaining": _amount_remaining_for_deposit(deposit_doc),
				"due_at": str(deposit_doc.due_at) if deposit_doc.due_at else None,
				"status": deposit_doc.status,
				"bank_account": bank_account,
				"contact": contact_info,
				"ticket_total_price": total_price,
				"total_received": total_received,
				"total_remaining": max(0, total_price - total_received),
				"all_deposits": deposits_summary,
				"instructions": instructions,
			},
		)
	except Exception as e:
		frappe.log_error(f"Error in get_deposit_instructions: {e!s}")
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
	ticket_id=None,
	amount=None,
	verification_method="Manual",
	ocr_payload=None,
	attach_receipt=True,
	deposit_id=None,
	payment_type=None,
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
		json_body = {}
		if getattr(frappe, "request", None):
			json_body = frappe.request.get_json(silent=True) or {}
		bank_account = (
			frappe.form_dict.get("bank_account")
			or getattr(frappe.local, "form_dict", {}).get("bank_account")
			or json_body.get("bank_account")
		)
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
			entity_type = "Cheese Ticket"
			if frappe.db.exists("Cheese Route Booking", ticket_id):
				entity_type = "Cheese Route Booking"
			elif not frappe.db.exists("Cheese Ticket", ticket_id):
				return not_found("Ticket or Route Booking", ticket_id)

			# Get or auto-create deposit for this ticket
			ticket_doc = frappe.get_doc(entity_type, ticket_id)
			deposit_name = None

			deposit_name = _select_open_deposit(entity_type, ticket_id, payment_type=payment_type)

			if not deposit_name:
				# Check if advance deposit already PAID — need remaining balance deposit OR explicitly requested Balance
				total_received = _get_amount_received_for_entity(entity_type, ticket_id)
				total_due = _get_entity_total_price(entity_type, ticket_doc)
				needs_balance = total_received > 0 and total_received < total_due

				if needs_balance or payment_type == "Balance":
					advance_required = (
						flt(getattr(ticket_doc, "deposit_amount", 0) or 0)
						if getattr(ticket_doc, "deposit_required", 0)
						else 0
					)
					if (
						payment_type == "Balance"
						and advance_required > 0
						and total_received + 0.01 < advance_required
					):
						return validation_error(
							"No paid advance deposit found. The advance must be paid before creating a remaining-balance deposit."
						)
					# Advance is PAID or explicitly requested Balance — create remaining balance deposit
					new_deposit = _create_balance_deposit(entity_type, ticket_doc)
					frappe.db.commit()
					deposit_name = new_deposit.name
				else:
					# No deposit at all — auto-create the advance deposit
					ticket_doc = frappe.get_doc(entity_type, ticket_id)
					if not ticket_doc.deposit_required:
						return validation_error("This booking does not require a deposit")

					ttl = 24
					if entity_type == "Cheese Ticket" and ticket_doc.get("experience"):
						exp = frappe.get_doc("Cheese Experience", ticket_doc.experience)
						ttl = exp.deposit_ttl_hours or 24

					due_at = add_to_date(now_datetime(), hours=ttl, as_string=False)

					new_deposit = frappe.get_doc(
						{
							"doctype": "Cheese Deposit",
							"entity_type": entity_type,
							"entity_id": ticket_id,
							"amount_required": ticket_doc.deposit_amount,
							"status": "PENDING",
							"due_at": due_at,
						}
					)
					new_deposit.insert()
					frappe.db.commit()
					deposit_name = new_deposit.name

			deposit = frappe.get_doc("Cheese Deposit", deposit_name)
		old_status = deposit.status
		if verification_method == "Manual" and not bank_account and deposit.entity_type == "Cheese Ticket":
			ticket_for_bank = frappe.get_doc("Cheese Ticket", deposit.entity_id)
			bank_accounts = _bank_accounts_for_ticket(ticket_for_bank)
			if len(bank_accounts) == 1:
				bank_account = bank_accounts[0].get("bank_account_id") or bank_accounts[0].get("name")
		if verification_method == "Manual" and not bank_account:
			return validation_error("Selecting a bank account is mandatory for manual deposits")
		if bank_account and frappe.db.exists("Cheese Bank Account", bank_account):
			deposit.bank_account = bank_account

		projected_total = _get_amount_received_for_entity(deposit.entity_type, deposit.entity_id) + amount
		entity_doc = frappe.get_doc(deposit.entity_type, deposit.entity_id)
		total_price = _get_entity_total_price(deposit.entity_type, entity_doc)
		is_overpayment = projected_total - total_price > 0.01

		deposit.record_payment(amount, verification_method, ocr_payload, is_overpayment=is_overpayment)

		receipt_file_id = None
		receipt_file_url = None
		if do_attach:
			upload = _extract_receipt_upload()
			if upload:
				file_doc = _attach_receipt_to_deposit(deposit.name, upload)
				receipt_file_id = file_doc.name
				receipt_file_url = file_doc.file_url

		frappe.db.commit()

		# Build enriched response
		total_received = _get_amount_received_for_entity(deposit.entity_type, deposit.entity_id)
		entity_total = _get_entity_total_price(deposit.entity_type, entity_doc)
		overpayment_amount = max(0, total_received - entity_total)

		payload = {
			"deposit_id": deposit.name,
			"ticket_id": ticket_id,
			"amount_paid": amount,
			"total_amount_paid": deposit.amount_paid or 0,
			"amount_required": deposit.amount_required,
			"amount_remaining": _amount_remaining_for_deposit(deposit),
			"old_status": old_status,
			"new_status": deposit.status,
			"payment_type": _get_deposit_phase(deposit.name),
			"verification_method": verification_method,
			"is_complete": deposit.status in ["PAID", "REVIEW"],
			"is_overpayment": is_overpayment,
			"overpayment_amount": overpayment_amount if is_overpayment else 0,
			"total_received_for_ticket": total_received,
			"ticket_total_price": entity_total,
		}

		# Enrich with bank account and contact info
		if ticket_id and frappe.db.exists("Cheese Ticket", ticket_id):
			ticket_doc_info = frappe.get_doc("Cheese Ticket", ticket_id)
			payload["bank_accounts"] = _bank_accounts_for_ticket(ticket_doc_info)
			if ticket_doc_info.contact:
				contact_name = frappe.db.get_value("Cheese Contact", ticket_doc_info.contact, "full_name")
				payload["contact"] = ticket_doc_info.contact
				payload["contact_name"] = contact_name

		if receipt_file_id:
			payload["receipt_file_id"] = receipt_file_id
			payload["receipt_file_url"] = receipt_file_url

		# Log overpayment event
		if is_overpayment:
			try:
				from cheese.cheese.utils.events import log_event

				log_event(
					entity_type="Cheese Deposit",
					entity_id=deposit.name,
					event_type="OVERPAYMENT_DETECTED",
					payload={
						"overpayment_amount": overpayment_amount,
						"total_received": total_received,
						"ticket_total": entity_total,
					},
				)
			except Exception:
				pass

		return success("Deposit payment recorded successfully", payload)
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except Exception as e:
		frappe.log_error(f"Error in record_deposit_payment: {e!s}")
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
		frappe.log_error(f"Error in verify_deposit: {e!s}")
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
				"amount_remaining": _amount_remaining_for_deposit(deposit),
				"status": deposit.status,
				"payment_type": _get_deposit_phase(deposit.name),
				"due_at": str(deposit.due_at) if deposit.due_at else None,
				"paid_at": str(deposit.paid_at) if deposit.paid_at else None,
				"verification_method": deposit.verification_method,
				"is_overdue": deposit.due_at
				and deposit.due_at < now_datetime()
				and deposit.status == "PENDING"
				if deposit.due_at
				else False,
			},
		)
	except Exception as e:
		frappe.log_error(f"Error in get_deposit_status: {e!s}")
		return error("Failed to get deposit status", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def get_deposit(deposit_id):
	"""Get enriched deposit detail for frontend detail page."""
	try:
		if not deposit_id:
			return validation_error("deposit_id is required")
		if not frappe.db.exists("Cheese Deposit", deposit_id):
			return not_found("Deposit", deposit_id)
		deposit = frappe.get_doc("Cheese Deposit", deposit_id)
		return success("Deposit retrieved successfully", _build_deposit_payload(deposit))
	except Exception as e:
		frappe.log_error(f"Error in get_deposit: {e!s}")
		return error("Failed to get deposit", "SERVER_ERROR", {"error": str(e)}, 500)


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
				{"current_status": deposit.status},
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
			{"deposit_id": deposit.name, "old_status": old_status, "new_status": deposit.status},
		)
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except Exception as e:
		frappe.log_error(f"Error in mark_deposit_overdue: {e!s}")
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
				f"Cannot adjust deposit with status: {deposit.status}", {"current_status": deposit.status}
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
				"remaining_amount": deposit.amount_paid,
			},
		)
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except Exception as e:
		frappe.log_error(f"Error in adjust_deposit: {e!s}")
		return error("Failed to adjust deposit", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def list_deposits(
	page=1, page_size=20, status=None, entity_type=None, entity_id=None, route_id=None, company_id=None
):
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

		user_company = _get_current_user_company()
		if user_company:
			company_id = user_company

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
			fields=[
				"name",
				"entity_type",
				"entity_id",
				"amount_required",
				"amount_paid",
				"status",
				"due_at",
				"paid_at",
				"modified",
				"bank_account",
			],
			order_by="modified desc",
		)

		# Enrich with contact and relation info for UI filtering and display.
		enriched = []
		for deposit in deposits:
			deposit["amount_remaining"] = _amount_remaining_for_deposit(deposit)
			deposit["payment_type"] = _get_deposit_phase(deposit.name)
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
				deposit["contact_name"] = frappe.db.get_value(
					"Cheese Contact", deposit["contact"], "full_name"
				)

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
			deposits_page, "Deposits retrieved successfully", page=page, page_size=page_size, total=total
		)
	except Exception as e:
		frappe.log_error(f"Error in list_deposits: {e!s}")
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
				{"missing_fields": missing_fields},
			)

		# Validate amount if provided
		if expected_amount:
			ocr_amount = float(ocr_data.get("amount", 0))
			if abs(ocr_amount - float(expected_amount)) > 0.01:
				return validation_error(
					f"OCR amount ({ocr_amount}) does not match expected amount ({expected_amount})",
					{"ocr_amount": ocr_amount, "expected_amount": expected_amount},
				)

		# Validate date format
		try:
			from frappe.utils import getdate

			ocr_date = getdate(ocr_data["date"])
			from frappe.utils import now_datetime

			if ocr_date > getdate(now_datetime()):
				return validation_error("OCR date cannot be in the future")
		except Exception as e:
			return validation_error(f"Invalid date format in OCR payload: {e!s}")

		return success(
			"OCR payload is valid",
			{
				"valid": True,
				"ocr_data": ocr_data,
				"account": ocr_data.get("account"),
				"amount": ocr_data.get("amount"),
				"date": ocr_data.get("date"),
				"reference": ocr_data.get("reference"),
			},
		)
	except Exception as e:
		frappe.log_error(f"Error in validate_ocr_payload: {e!s}")
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
				"message": reconciliation_result.get("message"),
			},
		)
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except Exception as e:
		frappe.log_error(f"Error in reconcile_deposit: {e!s}")
		return error("Failed to reconcile deposit", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def create_remaining_balance_deposit(ticket_id=None, route_booking_id=None):
	"""
	Create a deposit for the remaining balance after the advance deposit has been paid.

	The remaining balance = total ticket price − advance deposit amount.
	This is only allowed when the advance deposit status is PAID.

	Args:
		ticket_id: Cheese Ticket ID (provide one of ticket_id or route_booking_id)
		route_booking_id: Cheese Route Booking ID

	Returns:
		Success response with new deposit data
	"""
	try:
		if not ticket_id and not route_booking_id:
			return validation_error("Either ticket_id or route_booking_id is required")

		if route_booking_id:
			entity_type = "Cheese Route Booking"
			entity_id = route_booking_id
			if not frappe.db.exists(entity_type, entity_id):
				return not_found("Route Booking", entity_id)
			entity_doc = frappe.get_doc(entity_type, entity_id)
			total_price = entity_doc.total_price or 0
		else:
			entity_type = "Cheese Ticket"
			entity_id = ticket_id
			if not frappe.db.exists(entity_type, entity_id):
				return not_found("Ticket", entity_id)
			entity_doc = frappe.get_doc(entity_type, entity_id)
			total_price = _get_entity_total_price(entity_type, entity_doc)

		existing_balance = _get_open_balance_deposit(entity_type, entity_id)
		if existing_balance:
			balance_doc = frappe.get_doc("Cheese Deposit", existing_balance)
			bank_accounts = _bank_accounts_for_ticket(entity_doc) if entity_type == "Cheese Ticket" else []
			return success(
				"Remaining balance deposit already exists",
				{
					"deposit_id": balance_doc.name,
					"entity_type": entity_type,
					"entity_id": entity_id,
					"total_price": total_price,
					"advance_paid": _get_amount_received_for_entity(entity_type, entity_id),
					"remaining_balance": _amount_remaining_for_deposit(balance_doc),
					"amount_required": balance_doc.amount_required,
					"status": balance_doc.status,
					"payment_type": "Balance",
					"bank_account": bank_accounts,
					"instructions": _instructions_for_deposit(balance_doc.amount_required, bank_accounts),
				},
			)

		# Only require an advance PAID deposit if the ticket actually has an advance deposit configured and deposit is required
		is_deposit_required = bool(getattr(entity_doc, "deposit_required", 0))
		advance_required = flt(getattr(entity_doc, "deposit_amount", 0) or 0) if is_deposit_required else 0

		if advance_required > 0:
			advance_paid = _get_amount_received_for_entity(entity_type, entity_id)
			if advance_paid + 0.01 < advance_required:
				return validation_error(
					"No paid advance deposit found. The advance must be paid before creating a remaining-balance deposit."
				)

		advance_paid = _get_amount_received_for_entity(entity_type, entity_id)
		remaining = total_price - advance_paid
		if remaining <= 0:
			return validation_error(
				f"No remaining balance. Total price: {total_price}, already paid: {advance_paid}"
			)

		new_deposit = _create_balance_deposit(entity_type, entity_doc)

		frappe.db.commit()

		bank_accounts = []
		if entity_type == "Cheese Ticket":
			bank_accounts = _bank_accounts_for_ticket(entity_doc)

		return created(
			"Remaining balance deposit created successfully",
			{
				"deposit_id": new_deposit.name,
				"entity_type": entity_type,
				"entity_id": entity_id,
				"total_price": total_price,
				"advance_paid": advance_paid,
				"remaining_balance": remaining,
				"amount_required": remaining,
				"status": new_deposit.status,
				"payment_type": "Balance",
				"bank_account": bank_accounts,
				"instructions": _instructions_for_deposit(remaining, bank_accounts),
			},
		)
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except Exception as e:
		frappe.log_error(f"Error in create_remaining_balance_deposit: {e!s}")
		return error(
			"Failed to create remaining balance deposit",
			"SERVER_ERROR",
			{"error": str(e)},
			500,
		)
