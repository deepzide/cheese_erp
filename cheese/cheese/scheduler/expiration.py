# Copyright (c) 2024
# License: MIT

import frappe
from frappe.utils import now_datetime, getdate
from cheese.cheese.utils.capacity import update_slot_capacity


def expire_pending_tickets():
	"""
	Expire PENDING tickets that have passed their expires_at time
	Run every 15 minutes via cron
	"""
	current_dt = now_datetime()
	current_date = getdate(current_dt)

	pending_tickets = frappe.get_all(
		"Cheese Ticket",
		filters={
			"status": "PENDING",
			"expires_at": ["<", current_dt]
		},
		fields=["name", "slot"]
	)

	expired_count = 0
	slots_to_update = set()

	for ticket_data in pending_tickets:
		ticket = frappe.get_doc("Cheese Ticket", ticket_data.name)
		ticket.status = "EXPIRED"
		ticket.save()
		expired_count += 1
		
		# Track slots that need capacity update
		if ticket_data.slot:
			slots_to_update.add(ticket_data.slot)

	# Also expire pending tickets whose slot/event date has already passed.
	pending_without_ttl = frappe.get_all(
		"Cheese Ticket",
		filters={"status": "PENDING"},
		fields=["name", "slot", "selected_date"],
	)
	for ticket_data in pending_without_ttl:
		try:
			if frappe.db.get_value("Cheese Ticket", ticket_data.name, "status") != "PENDING":
				continue
			slot_end = None
			if ticket_data.slot:
				slot_end = frappe.db.get_value("Cheese Experience Slot", ticket_data.slot, "date_to")
			effective_date = getdate(ticket_data.selected_date or slot_end) if (ticket_data.selected_date or slot_end) else None
			if effective_date and effective_date < current_date:
				ticket = frappe.get_doc("Cheese Ticket", ticket_data.name)
				ticket.status = "EXPIRED"
				ticket.save()
				expired_count += 1
				if ticket_data.slot:
					slots_to_update.add(ticket_data.slot)
		except Exception as e:
			frappe.log_error(f"Failed to expire stale pending ticket {ticket_data.name}: {e}")

	# Expire PENDING RouteBookings
	pending_route_bookings = frappe.get_all(
		"Cheese Route Booking",
		filters={
			"status": "PENDING",
			"expires_at": ["<", current_dt]
		},
		fields=["name"]
	)

	expired_route_bookings = 0
	for rb_data in pending_route_bookings:
		try:
			route_booking = frappe.get_doc("Cheese Route Booking", rb_data.name)
			# Cancel all tickets in the route booking
			for ticket_row in route_booking.tickets:
				if ticket_row.ticket:
					ticket = frappe.get_doc("Cheese Ticket", ticket_row.ticket)
					if ticket.status == "PENDING":
						ticket.status = "EXPIRED"
						ticket.save()
						if ticket.slot:
							slots_to_update.add(ticket.slot)
			
			route_booking.calculate_status()
			route_booking.save()
			expired_route_bookings += 1
		except Exception as e:
			frappe.log_error(f"Failed to expire route booking {rb_data.name}: {e}")

	# Update capacity for affected slots
	for slot_name in slots_to_update:
		try:
			update_slot_capacity(slot_name)
		except Exception as e:
			frappe.log_error(f"Failed to update capacity for slot {slot_name}: {e}")

	frappe.db.commit()

	if expired_count > 0 or expired_route_bookings > 0:
		frappe.logger().info(f"Expired {expired_count} pending tickets and {expired_route_bookings} route bookings")

	return expired_count + expired_route_bookings
