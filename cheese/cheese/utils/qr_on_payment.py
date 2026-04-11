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
		return

	try:
		from cheese.api.v1.qr_controller import get_qr
		get_qr(ticket_id)
	except Exception as e:
		frappe.log_error(
			f"Auto QR generation failed for ticket {ticket_id}: {e}",
			"QR Auto-Generation",
		)
