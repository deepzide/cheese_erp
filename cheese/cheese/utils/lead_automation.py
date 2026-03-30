import frappe


def on_conversation_update(doc, method=None):
	"""When a Conversation is created or updated, move linked lead OPEN -> IN_PROGRESS."""
	if not doc.lead:
		return
	_advance_lead_if(doc.lead, from_status="OPEN", to_status="IN_PROGRESS")


def on_ticket_insert(doc, method=None):
	"""When a Cheese Ticket is created, convert any lead for that contact."""
	if not doc.contact:
		return

	leads = frappe.get_all(
		"Cheese Lead",
		filters={"contact": doc.contact, "status": ["in", ["OPEN", "IN_PROGRESS"]]},
		fields=["name"],
	)
	for lead in leads:
		_advance_lead_if(lead.name, from_status=None, to_status="CONVERTED")


def _advance_lead_if(lead_id, from_status=None, to_status="IN_PROGRESS"):
	lead = frappe.get_doc("Cheese Lead", lead_id)
	if from_status and lead.status != from_status:
		return
	if not from_status and lead.status in ("CONVERTED", "LOST", "DISCARDED"):
		return
	lead.status = to_status
	lead.save(ignore_permissions=True)
