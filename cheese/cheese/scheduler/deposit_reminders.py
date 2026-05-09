# Copyright (c) 2024
# License: MIT

import frappe
from frappe.utils import add_to_date

from cheese.cheese.utils.time import utcnow


def send_deposit_reminders():
	"""
	Send deposit reminders X hours before due_at
	Run hourly
	"""
	# Get deposits due in next 24 hours that are still PENDING
	reminder_hours = 24  # Send reminder 24 hours before due
	
	now_dt = utcnow()
	window_end = add_to_date(now_dt, hours=reminder_hours, as_string=False)
	upcoming_deposits = frappe.get_all(
		"Cheese Deposit",
		filters={
			"status": "PENDING",
			"due_at": ["between", [now_dt, window_end]],
		},
		fields=["name", "entity_type", "entity_id", "amount_required", "due_at"]
	)
	
	reminder_count = 0
	
	for deposit_data in upcoming_deposits:
		try:
			already_sent = frappe.db.exists(
				"Cheese System Event",
				{
					"entity_type": "Cheese Deposit",
					"entity_id": deposit_data.name,
					"event_type": "deposit_reminder_due",
				},
			)
			if already_sent:
				continue

			# Get contact from entity
			contact_id = None
			if deposit_data.entity_type == "Cheese Ticket":
				ticket_status = frappe.db.get_value("Cheese Ticket", deposit_data.entity_id, "status")
				if ticket_status in {"CANCELLED", "EXPIRED", "REJECTED"}:
					continue
				contact_id = frappe.db.get_value("Cheese Ticket", deposit_data.entity_id, "contact")
			elif deposit_data.entity_type == "Cheese Route Booking":
				booking_status = frappe.db.get_value("Cheese Route Booking", deposit_data.entity_id, "status")
				if booking_status == "CANCELLED":
					continue
				contact_id = frappe.db.get_value("Cheese Route Booking", deposit_data.entity_id, "contact")
			
			if not contact_id:
				continue
			
			# Check opt-in status
			contact = frappe.get_doc("Cheese Contact", contact_id)
			if contact.do_not_contact:
				continue
			
			# Send deposit notification using notification utility
			from cheese.cheese.utils.notifications import send_deposit_notification
			from frappe.utils import format_datetime
			from cheese.cheese.utils.events import log_event
			
			send_deposit_notification(
				deposit_data.name,
				"due",
				deposit_amount=deposit_data.amount_required,
				due_date=format_datetime(deposit_data.due_at) if deposit_data.due_at else None
			)
			log_event(
				entity_type="Cheese Deposit",
				entity_id=deposit_data.name,
				event_type="deposit_reminder_due",
				payload={"due_at": str(deposit_data.due_at)},
			)
			
			reminder_count += 1
		except Exception as e:
			frappe.log_error(f"Failed to send deposit reminder for {deposit_data.name}: {e}")
	
	frappe.db.commit()
	
	if reminder_count > 0:
		frappe.logger().info(f"Sent {reminder_count} deposit reminders")
	
	return reminder_count
