import frappe
from frappe.utils import now_datetime, get_datetime

# Standard hotel checkout hour used to decide when a CHECKED_IN hotel
# reservation is over (Cheese Experience has no per-hotel checkout time field).
HOTEL_CHECKOUT_TIME = "12:00:00"


def _ticket_effective_end(row):
	"""Return the datetime at which the ticket's experience is over.

	Activities end at the slot's end time (selected_date or date_to + time_to).
	Hotel stays end at check_out_date + HOTEL_CHECKOUT_TIME — the slot range
	covers the whole availability window and must not be used for hotels.
	Returns None when the end cannot be determined.
	"""
	experience_type = None
	if row.experience:
		experience_type = frappe.db.get_value("Cheese Experience", row.experience, "experience_type")

	if experience_type == "HOTEL":
		if not row.check_out_date:
			return None
		return get_datetime(f"{row.check_out_date} {HOTEL_CHECKOUT_TIME}")

	if not row.slot:
		return None
	slot_data = frappe.db.get_value(
		"Cheese Experience Slot",
		row.slot,
		["date_from", "date_to", "time_to"],
		as_dict=True,
	)
	if not slot_data:
		return None

	effective_date = row.selected_date or slot_data.date_to or slot_data.date_from
	if not effective_date:
		return None
	effective_time = slot_data.time_to or "23:59:59"
	return get_datetime(f"{effective_date} {effective_time}")


def auto_complete_checked_in_tickets():
	"""
	Move CHECKED_IN tickets to COMPLETED when the experience is over: slot end
	time for activities, checkout for hotels.  Runs every 15 minutes via scheduler.
	"""
	now = now_datetime()

	# Add a 15-minute grace period after slot end time before auto-completing,
	# so tickets aren't marked COMPLETED while guests are still in the experience.
	grace_minutes = 15

	rows = frappe.get_all(
		"Cheese Ticket",
		filters={"status": "CHECKED_IN"},
		fields=["name", "slot", "selected_date", "experience", "check_out_date"],
	)

	completed = 0
	for row in rows:
		try:
			effective_end = _ticket_effective_end(row)
			if not effective_end:
				continue
			if (now - effective_end).total_seconds() < grace_minutes * 60:
				continue

			doc = frappe.get_doc("Cheese Ticket", row.name)
			if doc.status != "CHECKED_IN":
				continue
			doc.status = "COMPLETED"
			doc.flags.ignore_validate = True
			doc.flags.status_change_trigger = "scheduler:auto_complete_checked_in_tickets"
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
