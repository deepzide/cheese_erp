# Copyright (c) 2024
# License: MIT

import frappe
from frappe import _
from frappe.utils import now_datetime
from cheese.cheese.utils.capacity import update_slot_capacity


def process_overdue_deposits():
	"""
	Process overdue deposits: mark as OVERDUE and cancel associated tickets/route bookings
	Run every 15 minutes via cron
	"""
	# Get PENDING deposits that are past due_at
	overdue_deposits = frappe.get_all(
		"Cheese Deposit",
		filters={
			"status": "PENDING",
			"due_at": ["<=", now_datetime()]
		},
		fields=["name", "entity_type", "entity_id", "amount_required", "due_at"]
	)

	processed_count = 0
	slots_to_update = set()
	route_bookings_to_cancel = set()

	for deposit_data in overdue_deposits:
		try:
			deposit = frappe.get_doc("Cheese Deposit", deposit_data.name)
			
			# Mark deposit as OVERDUE
			deposit.status = "OVERDUE"
			deposit.save(ignore_permissions=True)
			
			# Cancel associated entity
			if deposit_data.entity_type == "Ticket":
				ticket = frappe.get_doc("Cheese Ticket", deposit_data.entity_id)
				if ticket.status in ["PENDING", "CONFIRMED"]:
					ticket.status = "CANCELLED"
					ticket.save(ignore_permissions=True)
					
					# Track slot for capacity update
					if ticket.slot:
						slots_to_update.add(ticket.slot)
					
					# Track route booking if exists
					if ticket.route_booking:
						route_bookings_to_cancel.add(ticket.route_booking)
			
			elif deposit_data.entity_type == "Route Booking":
				route_booking = frappe.get_doc("Cheese Route Booking", deposit_data.entity_id)
				if route_booking.status in ["PENDING", "PARTIALLY_CONFIRMED"]:
					route_booking.status = "CANCELLED"
					route_booking.save(ignore_permissions=True)
					
					# Cancel all tickets in the route booking
					if route_booking.tickets:
						for ticket_row in route_booking.tickets:
							if ticket_row.ticket:
								try:
									ticket = frappe.get_doc("Cheese Ticket", ticket_row.ticket)
									if ticket.status in ["PENDING", "CONFIRMED"]:
										ticket.status = "CANCELLED"
										ticket.save(ignore_permissions=True)
										
										# Track slot for capacity update
										if ticket.slot:
											slots_to_update.add(ticket.slot)
								except Exception as e:
									frappe.log_error(f"Failed to cancel ticket {ticket_row.ticket} in route booking {deposit_data.entity_id}: {e}")
			
			processed_count += 1
			
			# Log the cancellation
			from cheese.cheese.utils.events import log_event
			log_event(
				entity_type="Cheese Deposit",
				entity_id=deposit.name,
				event_type="overdue_cancellation",
				payload={
					"entity_type": deposit_data.entity_type,
					"entity_id": deposit_data.entity_id,
					"amount": deposit_data.amount_required
				}
			)
			
		except Exception as e:
			frappe.log_error(f"Failed to process overdue deposit {deposit_data.name}: {e}", "Deposit Overdue Error")

	# Update capacity for affected slots
	for slot_name in slots_to_update:
		try:
			update_slot_capacity(slot_name)
		except Exception as e:
			frappe.log_error(f"Failed to update capacity for slot {slot_name}: {e}")

	# Update route booking statuses
	for rb_name in route_bookings_to_cancel:
		try:
			route_booking = frappe.get_doc("Cheese Route Booking", rb_name)
			route_booking.calculate_status()
			route_booking.save(ignore_permissions=True)
		except Exception as e:
			frappe.log_error(f"Failed to update status for route booking {rb_name}: {e}")

	frappe.db.commit()

	if processed_count > 0:
		frappe.logger().info(f"Processed {processed_count} overdue deposits")

	return processed_count
