import frappe


def on_deposit_paid(doc, method=None):
	"""Auto-confirm ticket and generate QR token+image when a deposit transitions to PAID."""
	if doc.status != "PAID":
		return
	if not doc.has_value_changed("status"):
		return
	if doc.entity_type != "Cheese Ticket":
		return

	ticket_id = doc.entity_id
	if not ticket_id:
		return

	# ── Step 1: Auto-confirm the ticket if still PENDING ─────────────────
	try:
		ticket = frappe.get_doc("Cheese Ticket", ticket_id)
		if ticket.deposit_required and (ticket.deposit_amount or 0) > 0:
			total_paid = frappe.db.sql(
				"""
				select coalesce(sum(amount_paid), 0)
				from `tabCheese Deposit`
				where entity_type='Cheese Ticket'
				  and entity_id=%s
				  and status='PAID'
				""",
				(ticket_id,),
			)[0][0] or 0
			if float(total_paid) < float(ticket.deposit_amount or 0):
				return
		if ticket.status == "PENDING":
			ticket.status = "CONFIRMED"
			ticket.save()
			frappe.db.commit()
			frappe.logger().info(
				f"Auto-confirmed ticket {ticket_id} after deposit {doc.name} was paid"
			)
	except Exception as e:
		frappe.log_error(
			f"Auto-confirm failed for ticket {ticket_id}: {e}",
			"Auto-Confirm on Deposit",
		)
		return  # Don't attempt QR if confirm failed

	# ── Step 2: Auto-generate QR if one doesn't exist yet ────────────────
	existing = frappe.db.get_value(
		"Cheese QR Token",
		{"ticket": ticket_id, "status": "ACTIVE"},
		"name",
	)
	if existing:
		try:
			from cheese.api.v1.qr_controller import _send_qr_notification
			_send_qr_notification(ticket_id)
		except Exception as e:
			frappe.log_error(
				f"QR notification failed for existing token on ticket {ticket_id}: {e}",
				"QR Auto-Notification",
			)
		return

	try:
		from cheese.api.v1.qr_controller import get_qr
		get_qr(ticket_id)
	except Exception as e:
		frappe.log_error(
			f"Auto QR generation failed for ticket {ticket_id}: {e}",
			"QR Auto-Generation",
		)
