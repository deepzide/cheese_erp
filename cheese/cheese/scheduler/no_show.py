# Copyright (c) 2024
# License: MIT

import frappe
from frappe.utils import now_datetime, get_datetime
from frappe.query_builder import functions as fn


def process_no_shows():
	"""
	Process CONFIRMED tickets that are past their slot time without check-in
	Run hourly
	"""
	from frappe.query_builder import DocType

	ticket = DocType("Cheese Ticket")
	slot = DocType("Cheese Experience Slot")

	# Get confirmed tickets with past slot times
	no_show_tickets = (
		frappe.qb.from_(ticket)
		.join(slot).on(ticket.slot == slot.name)
		.select(ticket.name, ticket.slot)
		.where(ticket.status == "CONFIRMED")
		.where(
			fn.Concat(slot.date, " ", slot.time) < now_datetime()
		)
		.where(
			~fn.Exists(
				frappe.qb.from_("Cheese Attendance")
				.select("*")
				.where(fn.Field("ticket") == ticket.name)
			)
		)
	).run(as_dict=True)

	no_show_count = 0
	slots_to_update = set()

	for ticket_data in no_show_tickets:
		ticket_doc = frappe.get_doc("Cheese Ticket", ticket_data.name)
		ticket_doc.status = "NO_SHOW"
		ticket_doc.save()
		no_show_count += 1
		
		if ticket_data.slot:
			slots_to_update.add(ticket_data.slot)

	# Update capacity for affected slots
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
