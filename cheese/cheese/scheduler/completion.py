import frappe
from frappe.utils import now_datetime, get_datetime


def auto_complete_checked_in_tickets():
	"""
	Move CHECKED_IN tickets to COMPLETED when the experience slot's end time
	(selected_date or date_to + time_to) has passed.  Runs every 15 minutes via scheduler.
	"""
	now = now_datetime()

	# Add a 15-minute grace period after slot end time before auto-completing,
	# so tickets aren't marked COMPLETED while guests are still in the experience.
	grace_minutes = 15

	rows = frappe.get_all(
		"Cheese Ticket",
		filters={"status": "CHECKED_IN"},
		fields=["name", "slot", "selected_date"],
	)

	completed = 0
	for row in rows:
		try:
			if not row.slot:
				continue
			slot_data = frappe.db.get_value(
				"Cheese Experience Slot",
				row.slot,
				["date_from", "date_to", "time_to"],
				as_dict=True,
			)
			if not slot_data:
				continue

			effective_date = row.selected_date or slot_data.date_to or slot_data.date_from
			if not effective_date:
				continue
			effective_time = slot_data.time_to or "23:59:59"
			effective_end = get_datetime(f"{effective_date} {effective_time}")
			if (now - effective_end).total_seconds() < grace_minutes * 60:
				continue

			doc = frappe.get_doc("Cheese Ticket", row.name)
			if doc.status != "CHECKED_IN":
				continue
			doc.status = "COMPLETED"
			doc.flags.ignore_validate = True
			doc.save(ignore_permissions=True)
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
