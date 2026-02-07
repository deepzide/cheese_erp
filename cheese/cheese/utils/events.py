# Copyright (c) 2024
# License: MIT

import frappe
from frappe.utils import now_datetime
import json


def log_event(entity_type, entity_id, event_type, payload=None):
	"""
	Log an event to System Event DocType
	
	Args:
		entity_type: Type of entity (e.g., "Cheese Ticket")
		entity_id: ID of the entity
		event_type: Type of event (e.g., "status_change")
		payload: Optional dictionary with event data
	"""
	try:
		event = frappe.get_doc({
			"doctype": "Cheese System Event",
			"entity_type": entity_type,
			"entity_id": entity_id,
			"event_type": event_type,
			"payload_json": json.dumps(payload) if payload else None,
			"triggered_by": frappe.session.user,
			"created_at": now_datetime()
		})
		event.insert(ignore_permissions=True)
		frappe.db.commit()
	except Exception as e:
		frappe.log_error(f"Failed to log event: {e}", "Event Logging Error")


def get_events(entity_type, entity_id, event_type=None):
	"""
	Get events for an entity
	
	Args:
		entity_type: Type of entity
		entity_id: ID of the entity
		event_type: Optional filter by event type
		
	Returns:
		List of event documents
	"""
	filters = {
		"entity_type": entity_type,
		"entity_id": entity_id
	}
	
	if event_type:
		filters["event_type"] = event_type
	
	return frappe.get_all(
		"Cheese System Event",
		filters=filters,
		order_by="created_at desc"
	)


def update_route_booking_status(doc, method):
	"""
	Update RouteBooking status when ticket status changes
	
	Args:
		doc: Cheese Ticket document
		method: Method name (on_update)
	"""
	try:
		# Only update if status changed
		if not doc.has_value_changed("status"):
			return
		
		# Find route booking that contains this ticket
		route_booking_name = frappe.db.get_value(
			"Cheese Route Booking Ticket",
			{"ticket": doc.name},
			"parent"
		)
		
		if route_booking_name:
			route_booking = frappe.get_doc("Cheese Route Booking", route_booking_name)
			route_booking.calculate_status()
			if route_booking.has_value_changed("status"):
				route_booking.save(ignore_permissions=True)
				frappe.db.commit()
	except Exception as e:
		# Silently fail to avoid breaking ticket updates
		frappe.log_error(f"Failed to update route booking status: {e}", "Route Booking Update Error")
