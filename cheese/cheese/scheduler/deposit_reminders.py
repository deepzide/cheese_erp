# Copyright (c) 2024
# License: MIT

import frappe
from frappe.utils import now_datetime, add_to_date


def send_deposit_reminders():
	"""
	Send deposit reminders X hours before due_at
	Run hourly
	"""
	# Get deposits due in next 24 hours that are still PENDING
	reminder_hours = 24  # Send reminder 24 hours before due
	
	upcoming_deposits = frappe.get_all(
		"Cheese Deposit",
		filters={
			"status": "PENDING",
			"due_at": [">=", now_datetime()],
			"due_at": ["<=", add_to_date(now_datetime(), hours=reminder_hours, as_string=False)]
		},
		fields=["name", "entity_type", "entity_id", "amount_required", "due_at"]
	)
	
	reminder_count = 0
	
	for deposit_data in upcoming_deposits:
		try:
			# Get contact from entity
			contact_id = None
			if deposit_data.entity_type == "Ticket":
				contact_id = frappe.db.get_value("Cheese Ticket", deposit_data.entity_id, "contact")
			elif deposit_data.entity_type == "Route Booking":
				contact_id = frappe.db.get_value("Cheese Route Booking", deposit_data.entity_id, "contact")
			
			if not contact_id:
				continue
			
			# Check opt-in status
			contact = frappe.get_doc("Cheese Contact", contact_id)
			if contact.do_not_contact:
				continue
			
			# Check if reminder already sent (using a flag or checking system events)
			# For now, we'll send reminder (in production, track sent reminders)
			
			# Send deposit notification using notification utility
			from cheese.cheese.utils.notifications import send_deposit_notification
			from frappe.utils import format_datetime
			
			send_deposit_notification(
				deposit_data.name,
				"due",
				deposit_amount=deposit_data.amount_required,
				due_date=format_datetime(deposit_data.due_at) if deposit_data.due_at else None
			)
			
			reminder_count += 1
		except Exception as e:
			frappe.log_error(f"Failed to send deposit reminder for {deposit_data.name}: {e}")
	
	frappe.db.commit()
	
	if reminder_count > 0:
		frappe.logger().info(f"Sent {reminder_count} deposit reminders")
	
	return reminder_count
