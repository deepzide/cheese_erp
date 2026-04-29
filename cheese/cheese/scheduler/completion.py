import frappe
from frappe.utils import now_datetime


def auto_complete_checked_in_tickets():
	"""
	Move CHECKED_IN tickets to COMPLETED when the experience slot's end time
	(selected_date or date_to + time_to) has passed.  Runs every 15 minutes via scheduler.
	"""
	from frappe.query_builder import DocType
	from frappe.query_builder import functions as fn

	ticket = DocType("Cheese Ticket")
	slot = DocType("Cheese Experience Slot")

	now = now_datetime()

	# Use the ticket's selected_date if set, otherwise fall back to slot.date_to, then slot.date_from
	effective_date = fn.Coalesce(ticket.selected_date, slot.date_to, slot.date_from)

	rows = (
		frappe.qb.from_(ticket)
		.join(slot).on(ticket.slot == slot.name)
		.select(ticket.name, ticket.slot)
		.where(ticket.status == "CHECKED_IN")
		.where(
			fn.Concat(effective_date, " ", fn.Coalesce(slot.time_to, "23:59:59")) < now
		)
	).run(as_dict=True)

	completed = 0
	for row in rows:
		try:
			doc = frappe.get_doc("Cheese Ticket", row.name)
			doc.status = "COMPLETED"
			doc.save()
			completed += 1
		except Exception as e:
			frappe.log_error(
				f"Failed to auto-complete ticket {row.name}: {e}",
				"Ticket Auto-Complete",
			)

	if completed:
		frappe.db.commit()
		frappe.logger().info(f"Auto-completed {completed} checked-in tickets")

	return completed
