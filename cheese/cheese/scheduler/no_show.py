# Copyright (c) 2024
# License: MIT

import frappe
from frappe.utils import getdate

from cheese.cheese.utils.time import utcnow, uy_slot_time_to_utc


def _has_unpaid_deposit(ticket_name: str) -> bool:
	"""Return True when ticket still has open (unpaid) deposit(s)."""
	open_deposit = frappe.db.exists(
		"Cheese Deposit",
		{
			"entity_type": "Cheese Ticket",
			"entity_id": ticket_name,
			"status": ["in", ["PENDING", "OVERDUE"]],
		},
	)
	return bool(open_deposit)


def process_no_shows():
	"""
	Process CONFIRMED tickets that are past their slot start time without check-in.
	Run hourly.
	"""
	confirmed = frappe.get_all(
		"Cheese Ticket",
		filters={"status": "CONFIRMED"},
		fields=["name", "slot", "selected_date"],
	)

	no_show_count = 0
	slots_to_update = set()
	now = utcnow()

	for row in confirmed:
		if frappe.db.exists("Cheese Attendance", {"ticket": row.name}):
			continue
		if not row.slot:
			continue
		slot = frappe.db.get_value(
			"Cheese Experience Slot",
			row.slot,
			["date_from", "date_to", "time_from"],
			as_dict=True,
		)
		if not slot:
			continue

		event_date = row.selected_date or slot.date_from
		if not event_date:
			continue
		time_part = str(slot.time_from).split(".")[0] if slot.time_from else "00:00:00"
		if len(time_part) == 5:
			time_part = f"{time_part}:00"
		try:
			slot_start = uy_slot_time_to_utc(getdate(event_date), time_part)
		except Exception:
			continue
		if slot_start is None:
			continue

		if slot_start >= now:
			continue

		try:
			# If deposit is still unpaid, cancellation takes precedence over no-show.
			# This keeps overdue unpaid bookings out of NO_SHOW analytics.
			next_status = "CANCELLED" if _has_unpaid_deposit(row.name) else "NO_SHOW"
			# Use db.set_value so we do not re-run capacity validation (party may already
			# equal slot max). Document hooks are skipped — notify the bot explicitly.
			frappe.db.set_value("Cheese Ticket", row.name, "status", next_status)
			from cheese.cheese.utils.notifications import enqueue_ticket_status_webhook

			enqueue_ticket_status_webhook(row.name, next_status)
			no_show_count += 1
			slots_to_update.add(row.slot)
		except Exception as e:
			frappe.log_error(
				message=str(e)[:300],
				title="No-show scheduler ticket update",
			)

	for slot_name in slots_to_update:
		try:
			from cheese.cheese.utils.capacity import update_slot_capacity

			update_slot_capacity(slot_name)
		except Exception as e:
			frappe.log_error(f"Failed to update capacity for slot {slot_name}: {e}")

	frappe.db.commit()

	if no_show_count > 0:
		frappe.logger().info(f"Processed {no_show_count} no-show tickets")

	return no_show_count
