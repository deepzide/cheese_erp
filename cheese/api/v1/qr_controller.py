# Copyright (c) 2024
# License: MIT

import frappe
from frappe import _
from frappe.utils import now_datetime
import secrets
import string
from cheese.api.common.responses import success, created, error, not_found, validation_error


def _request_value(*keys):
	"""Read a value from function args payloads (form/query/json)."""
	for key in keys:
		value = None
		if getattr(frappe, "form_dict", None):
			value = frappe.form_dict.get(key)
		if value not in (None, ""):
			return value

	# Fallback for clients sending raw JSON
	try:
		if getattr(frappe, "request", None):
			payload = frappe.request.get_json(silent=True) or {}
			if isinstance(payload, dict):
				for key in keys:
					value = payload.get(key)
					if value not in (None, ""):
						return value
	except Exception:
		pass
	return None


def _generate_unique_qr_token(length=32, max_attempts=5):
	"""Generate a token that is not currently used by Cheese QR Token."""
	alphabet = string.ascii_letters + string.digits
	for _ in range(max_attempts):
		token = "".join(secrets.choice(alphabet) for _ in range(length))
		if not frappe.db.exists("Cheese QR Token", {"token": token}):
			return token
	# Extremely unlikely fallback; let unique constraint handle collisions after this.
	return "".join(secrets.choice(alphabet) for _ in range(length))


@frappe.whitelist()
def get_qr_for_reservation(reservation_id=None, ticket_id=None):
	"""
	Get QR for reservation - alias for get_qr
	
	Args:
		reservation_id: Reservation ID (ticket_id)
		
	Returns:
		Success response with QR token
	"""
	reservation_id = reservation_id or _request_value("reservation_id", "ticket_id") or ticket_id
	if not reservation_id:
		# Helpful guidance when clients accidentally send check-in token payload.
		if _request_value("token"):
			return validation_error(
				"reservation_id is required for this endpoint. Use validate_qr with token for check-in."
			)
		return validation_error("reservation_id is required")
	return get_qr(reservation_id)


@frappe.whitelist()
def get_checkin_status(reservation_id):
	"""
	Get check-in status for reservation
	
	Args:
		reservation_id: Reservation ID (ticket_id)
		
	Returns:
		Success response with check-in status
	"""
	try:
		if not reservation_id:
			return validation_error("reservation_id is required")
		
		if not frappe.db.exists("Cheese Ticket", reservation_id):
			return not_found("Reservation", reservation_id)
		
		ticket = frappe.get_doc("Cheese Ticket", reservation_id)
		
		# Get attendance record
		attendance = frappe.db.get_value(
			"Cheese Attendance",
			{"ticket": reservation_id},
			["name", "checked_in_at", "status", "method"],
			as_dict=True
		)
		
		# Get QR token status
		qr_token = frappe.db.get_value(
			"Cheese QR Token",
			{"ticket": reservation_id},
			["name", "status", "expires_at"],
			as_dict=True
		)
		
		checked_in = attendance is not None and attendance.status == "PRESENT"
		
		return success(
			"Check-in status retrieved successfully",
			{
				"reservation_id": reservation_id,
				"ticket_status": ticket.status,
				"checked_in": checked_in,
				"checked_in_at": str(attendance.checked_in_at) if attendance else None,
				"checkin_method": attendance.method if attendance else None,
				"qr_token_status": qr_token.status if qr_token else None,
				"qr_token_expires_at": str(qr_token.expires_at) if qr_token and qr_token.expires_at else None
			}
		)
	except Exception as e:
		frappe.log_error(f"Error in get_checkin_status: {str(e)}")
		return error("Failed to get check-in status", "SERVER_ERROR", {"error": str(e)}, 500)


def _pending_confirmation_allowed(ticket):
	if not ticket.deposit_required or (ticket.deposit_amount or 0) <= 0:
		return True

	deposit_status = frappe.db.get_value(
		"Cheese Deposit",
		{"entity_type": "Cheese Ticket", "entity_id": ticket.name},
		"status",
	)
	return deposit_status == "PAID"


def _qr_generation_allowed(ticket):
	"""Block QR generation until required deposit is fully paid."""
	if not ticket.deposit_required or (ticket.deposit_amount or 0) <= 0:
		return True

	deposit_status = frappe.db.get_value(
		"Cheese Deposit",
		{"entity_type": "Cheese Ticket", "entity_id": ticket.name},
		"status",
	)
	return deposit_status == "PAID"


def _can_use_pending_qr_flow():
	allowed_roles = {"System Manager", "Cheese Booking Manager", "Cheese Booking Operator"}
	return bool(set(frappe.get_roles()) & allowed_roles)


@frappe.whitelist()
def get_qr(ticket_id=None, allow_pending=0):
	"""
	Get or generate QR token for a ticket
	
	Args:
		ticket_id: ID of the ticket
		
	Returns:
		Success response with QR token
	"""
	try:
		ticket_id = ticket_id or _request_value("ticket_id", "reservation_id")
		if not ticket_id:
			return validation_error("ticket_id is required")

		if not frappe.db.exists("Cheese Ticket", ticket_id):
			return not_found("Ticket", ticket_id)

		ticket = frappe.get_doc("Cheese Ticket", ticket_id)
		
		allow_pending = int(allow_pending or 0)
		allowed_statuses = ["CONFIRMED", "CHECKED_IN"]
		if allow_pending and _can_use_pending_qr_flow() and _pending_confirmation_allowed(ticket):
			allowed_statuses.append("PENDING")

		if ticket.status not in allowed_statuses:
			return validation_error(
				f"QR code can only be generated for {', '.join(allowed_statuses)} tickets. Current status: {ticket.status}",
				{"current_status": ticket.status, "allowed_statuses": allowed_statuses}
			)

		# Enforce business rule: confirmed tickets that require deposit can get QR only after payment.
		if not _qr_generation_allowed(ticket):
			return validation_error(
				"QR code is available only after the required deposit is paid.",
				{
					"ticket_id": ticket.name,
					"ticket_status": ticket.status,
					"deposit_required": bool(ticket.deposit_required),
					"deposit_amount": ticket.deposit_amount or 0,
				},
			)

		# Get or create QR token
		qr_token = frappe.db.get_value(
			"Cheese QR Token",
			{"ticket": ticket_id},
			"name"
		)

		if qr_token:
			qr = frappe.get_doc("Cheese QR Token", qr_token)
			if qr.status == "ACTIVE":
				# Regenerate QR image if it was never created or the file is missing
				qr_image_url = qr.qr_image or None
				if not qr_image_url:
					try:
						from cheese.cheese.utils.qr_utils import generate_qr_image
						qr_image_url = generate_qr_image(qr.token, ticket_id, qr.name)
						frappe.db.commit()
					except Exception as img_err:
						frappe.log_error(f"Failed to regenerate QR image for ticket {ticket_id}: {img_err}", "QR Image Error")
				return success(
					"QR token retrieved successfully",
					{
						"qr_token_id": qr.name,
						"token": qr.token,
						"ticket_id": ticket_id,
						"status": qr.status,
						"expires_at": str(qr.expires_at) if qr.expires_at else None,
						"qr_image_url": qr_image_url,
						"is_new": False
					}
				)
			else:
				return validation_error(
					f"QR token is not active. Current status: {qr.status}",
					{"qr_token_id": qr.name, "status": qr.status}
				)

		qr = frappe.get_doc({
			"doctype": "Cheese QR Token",
			"ticket": ticket_id,
			"token": _generate_unique_qr_token(),
			"status": "ACTIVE"
		})
		qr.insert()
		frappe.db.commit()

		# Generate QR image and attach to token
		qr_image_url = None
		try:
			from cheese.cheese.utils.qr_utils import generate_qr_image
			qr_image_url = generate_qr_image(qr.token, ticket_id, qr.name)
		except Exception as e:
			frappe.log_error(f"Failed to generate QR image for ticket {ticket_id}: {e}", "QR Image Error")

		try:
			from cheese.cheese.utils.notifications import send_ticket_notification
			send_ticket_notification(ticket_id, "qr_generated")
		except Exception as e:
			frappe.log_error(f"Failed to send QR notification for ticket {ticket_id}: {e}", "QR Notification Error")

		return created(
			"QR token generated successfully",
			{
				"qr_token_id": qr.name,
				"token": qr.token,
				"ticket_id": ticket_id,
				"status": qr.status,
				"expires_at": str(qr.expires_at) if qr.expires_at else None,
				"qr_image_url": qr_image_url,
				"is_new": True
			}
		)
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except Exception as e:
		frappe.log_error(f"Error in get_qr: {str(e)}")
		return error("Failed to get QR token", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def validate_qr(token=None):
	"""
	Validate QR token and check in
	
	Args:
		token: QR token string
		
	Returns:
		Success response with validation result and ticket info
	"""
	try:
		token = token or _request_value("token")
		if not token:
			return validation_error("token is required")

		qr_token = frappe.db.get_value(
			"Cheese QR Token",
			{"token": token},
			["name", "ticket", "status", "expires_at"],
			as_dict=True
		)

		if not qr_token:
			return validation_error("Invalid QR token", {"token": token})

		if qr_token.status != "ACTIVE":
			return validation_error(
				f"QR token is not active. Status: {qr_token.status}",
				{"qr_token_id": qr_token.name, "status": qr_token.status}
			)

		if qr_token.expires_at and qr_token.expires_at < now_datetime():
			return validation_error(
				"QR token has expired",
				{"qr_token_id": qr_token.name, "expires_at": str(qr_token.expires_at)}
			)

		# Get ticket
		ticket = frappe.get_doc("Cheese Ticket", qr_token.ticket)

		if ticket.status == "PENDING":
			if not _pending_confirmation_allowed(ticket):
				return validation_error(
					"Ticket is PENDING and cannot be auto-confirmed yet. Deposit must be paid first.",
					{"ticket_id": ticket.name}
				)
			ticket.confirm()
			ticket.reload()

		if ticket.status != "CONFIRMED":
			return validation_error(
				f"Ticket must be CONFIRMED to check in. Current status: {ticket.status}",
				{"ticket_id": ticket.name, "current_status": ticket.status}
			)

		# Check in ticket
		old_status = ticket.status
		ticket.check_in()
		
		# Mark QR as used
		qr = frappe.get_doc("Cheese QR Token", qr_token.name)
		qr.mark_used()
		
		# Create attendance record
		attendance = frappe.get_doc({
			"doctype": "Cheese Attendance",
			"ticket": ticket.name,
			"checked_in_at": now_datetime(),
			"method": "QR",
			"status": "PRESENT"
		})
		attendance.insert()
		
		frappe.db.commit()

		return success(
			"Successfully checked in",
			{
				"valid": True,
				"checked_in": True,
				"ticket_id": ticket.name,
				"old_status": old_status,
				"new_status": ticket.status,
				"attendance_id": attendance.name,
				"checked_in_at": str(attendance.checked_in_at)
			}
		)
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except Exception as e:
		frappe.log_error(f"Error in validate_qr: {str(e)}")
		return error("Failed to validate QR token", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def resend_qr(ticket_id):
	"""
	Resend QR code to customer (US-14, US-TK-07)
	
	Args:
		ticket_id: Ticket ID
		
	Returns:
		Success response with QR data
	"""
	try:
		if not ticket_id:
			return validation_error("ticket_id is required")
		
		if not frappe.db.exists("Cheese Ticket", ticket_id):
			return not_found("Ticket", ticket_id)
		
		ticket = frappe.get_doc("Cheese Ticket", ticket_id)
		
		if ticket.status not in ["CONFIRMED", "CHECKED_IN"]:
			return validation_error(
				f"QR can only be resent for CONFIRMED or CHECKED_IN tickets. Current status: {ticket.status}",
				{"current_status": ticket.status}
			)
		
		# Get or create QR
		qr_result = get_qr(ticket_id)
		
		if not qr_result.get("success"):
			return qr_result
		
		qr_data = qr_result.get("data", {})
		
		return success(
			"QR code ready to resend",
			{
				"ticket_id": ticket_id,
				"qr_token": qr_data.get("token"),
				"qr_token_id": qr_data.get("qr_token_id"),
				"expires_at": qr_data.get("expires_at"),
				"note": "QR should be sent to customer via bot/channel"
			}
		)
	except Exception as e:
		frappe.log_error(f"Error in resend_qr: {str(e)}")
		return error("Failed to resend QR", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def revoke_qr(ticket_id):
	"""
	Revoke QR token (US-14, US-TK-07)
	
	Args:
		ticket_id: Ticket ID
		
	Returns:
		Success response
	"""
	try:
		if not ticket_id:
			return validation_error("ticket_id is required")
		
		if not frappe.db.exists("Cheese Ticket", ticket_id):
			return not_found("Ticket", ticket_id)
		
		# Get QR token
		qr_token = frappe.db.get_value(
			"Cheese QR Token",
			{"ticket": ticket_id},
			"name"
		)
		
		if not qr_token:
			return success(
				"No QR token found to revoke",
				{"ticket_id": ticket_id}
			)
		
		qr = frappe.get_doc("Cheese QR Token", qr_token)
		
		if qr.status == "USED":
			return validation_error("QR token is already used and cannot be revoked")
		
		qr.status = "REVOKED"
		qr.save()
		frappe.db.commit()
		
		return success(
			"QR token revoked successfully",
			{
				"ticket_id": ticket_id,
				"qr_token_id": qr.name,
				"status": qr.status
			}
		)
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except Exception as e:
		frappe.log_error(f"Error in revoke_qr: {str(e)}")
		return error("Failed to revoke QR", "SERVER_ERROR", {"error": str(e)}, 500)
