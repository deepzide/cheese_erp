import frappe


def on_deposit_paid(doc, method=None):
	"""Auto-generate a QR token+image when a ticket deposit transitions to PAID."""
	if doc.status != "PAID":
		return
	if not doc.has_value_changed("status"):
		return
	if doc.entity_type != "Cheese Ticket":
		return

	ticket_id = doc.entity_id
	if not ticket_id:
		return

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
