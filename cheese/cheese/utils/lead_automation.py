import frappe

from cheese.cheese.utils.lead_company import advance_lead_company_status


def on_conversation_update(doc, method=None):
	"""When a Conversation is created or updated, move linked lead OPEN -> IN_PROGRESS."""
	if not doc.lead:
		return
	company = _conversation_company(doc)
	advance_lead_company_status(
		doc.lead,
		company,
		to_status="IN_PROGRESS",
		from_status="OPEN",
	)


def on_ticket_insert(doc, method=None):
	"""When a Cheese Ticket is created, convert the lead for that establishment."""
	if not doc.contact:
		return

	leads = frappe.get_all(
		"Cheese Lead",
		filters={"contact": doc.contact},
		pluck="name",
	)
	for lead_id in leads:
		advance_lead_company_status(
			lead_id,
			doc.company,
			to_status="CONVERTED",
		)


def _conversation_company(conversation):
	if conversation.get("company"):
		return conversation.company
	if conversation.lead:
		return frappe.db.get_value("Cheese Lead", conversation.lead, "company")
	if conversation.contact and frappe.db.has_table("tabCheese Contact Company"):
		return frappe.db.get_value(
			"Cheese Contact Company",
			{"parent": conversation.contact, "parenttype": "Cheese Contact"},
			"company",
			order_by="idx asc",
		)
	return None
