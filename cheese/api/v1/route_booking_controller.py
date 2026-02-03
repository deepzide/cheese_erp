# Copyright (c) 2024
# License: MIT

import frappe
from frappe import _
from frappe.utils import now_datetime, get_datetime, add_to_date
from cheese.api.common.responses import success, created, error, not_found, validation_error
from cheese.cheese.utils.pricing import calculate_ticket_price, calculate_deposit_amount
from cheese.cheese.utils.capacity import update_slot_capacity
from cheese.api.v1.ticket_controller import create_pending_ticket
import json


@frappe.whitelist()
def create_route_reservation(contact_id, route_id, experiences_with_slots=None, party_size=1, conversation_id=None):
	"""
	Create pending route reservation
	Creates RouteBooking = PENDING + internal reservations, locks capacity
	
	Args:
		contact_id: Contact ID
		route_id: Route ID
		experiences_with_slots: JSON array of {"experience_id": "EXP-001", "slot_id": "SLOT-001"}
		party_size: Party size (default: 1)
		conversation_id: Conversation ID (optional)
		
	Returns:
		Success response with route booking data
	"""
	try:
		if not contact_id:
			return validation_error("contact_id is required")
		if not route_id:
			return validation_error("route_id is required")
		if not experiences_with_slots:
			return validation_error("experiences_with_slots is required")
		if party_size < 1:
			return validation_error("party_size must be at least 1")
		
		if not frappe.db.exists("Cheese Contact", contact_id):
			return not_found("Contact", contact_id)
		
		if not frappe.db.exists("Cheese Route", route_id):
			return not_found("Route", route_id)
		
		route = frappe.get_doc("Cheese Route", route_id)
		
		if route.status != "ONLINE":
			return validation_error(f"Route {route_id} is not ONLINE. Current status: {route.status}")
		
		# Parse experiences_with_slots
		if isinstance(experiences_with_slots, str):
			try:
				experiences_with_slots = json.loads(experiences_with_slots)
			except Exception as e:
				return validation_error(f"Invalid experiences_with_slots format: {str(e)}")
		
		if not isinstance(experiences_with_slots, list):
			return validation_error("experiences_with_slots must be an array")
		
		# Validate all experiences and slots
		slot_map = {}
		for item in experiences_with_slots:
			exp_id = item.get("experience_id")
			slot_id = item.get("slot_id")
			if not exp_id or not slot_id:
				return validation_error("Each item must have 'experience_id' and 'slot_id'")
			if not frappe.db.exists("Cheese Experience", exp_id):
				return not_found("Experience", exp_id)
			if not frappe.db.exists("Cheese Experience Slot", slot_id):
				return not_found("Slot", slot_id)
			slot_map[exp_id] = slot_id
		
		# Verify all route experiences have slots
		route_experiences = route.experiences
		if not route_experiences or len(route_experiences) == 0:
			return validation_error("Route has no experiences")
		
		# Create tickets for each experience in the route
		tickets = []
		creation_times = []
		
		for exp_row in route.experiences:
			experience_id = exp_row.experience
			slot_id = slot_map.get(experience_id)
			
			if not slot_id:
				return validation_error(f"No slot provided for experience {experience_id} at sequence {exp_row.sequence}")
			
			# Create pending ticket
			ticket_result = create_pending_ticket(contact_id, experience_id, slot_id, party_size)
			
			if not ticket_result.get("success"):
				# Rollback created tickets
				for ticket in tickets:
					try:
						ticket_doc = frappe.get_doc("Cheese Ticket", ticket)
						ticket_doc.status = "CANCELLED"
						ticket_doc.save()
						update_slot_capacity(ticket_doc.slot)
					except Exception:
						pass
				frappe.db.rollback()
				return ticket_result
			
			ticket_id = ticket_result.get("data", {}).get("ticket_id")
			ticket_doc = frappe.get_doc("Cheese Ticket", ticket_id)
			creation_times.append(ticket_doc.creation)
			
			# Link ticket to route
			ticket_doc.route = route_id
			if conversation_id:
				ticket_doc.conversation = conversation_id
			ticket_doc.save()
			
			tickets.append(ticket_id)
		
		frappe.db.commit()
		
		# Generate route booking ID (using first ticket as reference)
		route_booking_id = f"RB-{tickets[0]}"
		
		return created(
			"Route reservation created successfully",
			{
				"route_booking_id": route_booking_id,
				"route_id": route_id,
				"contact_id": contact_id,
				"party_size": party_size,
				"status": "PENDING",
				"tickets": tickets,
				"tickets_count": len(tickets),
				"conversation_id": conversation_id
			}
		)
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except Exception as e:
		frappe.log_error(f"Error in create_route_reservation: {str(e)}")
		return error("Failed to create route reservation", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def get_route_status(route_booking_id):
	"""
	Get route status - returns PENDING / PARTIALLY_CONFIRMED / CONFIRMED
	
	Args:
		route_booking_id: Route booking ID (or first ticket ID in route booking)
		
	Returns:
		Success response with route status
	"""
	try:
		if not route_booking_id:
			return validation_error("route_booking_id is required")
		
		# Extract ticket ID from route booking ID if needed
		ticket_id = route_booking_id
		if route_booking_id.startswith("RB-"):
			ticket_id = route_booking_id.replace("RB-", "")
		
		if not frappe.db.exists("Cheese Ticket", ticket_id):
			return not_found("Route Booking", route_booking_id)
		
		# Get first ticket to find route
		first_ticket = frappe.get_doc("Cheese Ticket", ticket_id)
		route_id = first_ticket.route
		
		if not route_id:
			return validation_error("Ticket is not part of a route booking")
		
		# Get all tickets for this route and contact created within a time window (5 minutes)
		# This ensures we only get tickets from the same route booking
		from frappe.utils import add_to_date
		creation_window_start = add_to_date(first_ticket.creation, minutes=-5, as_datetime=True)
		creation_window_end = add_to_date(first_ticket.creation, minutes=5, as_datetime=True)
		
		# Get tickets created in the same time window
		tickets = frappe.get_all(
			"Cheese Ticket",
			filters=[
				["route", "=", route_id],
				["contact", "=", first_ticket.contact],
				["status", "!=", "CANCELLED"],
				["creation", ">=", creation_window_start],
				["creation", "<=", creation_window_end]
			],
			fields=["name", "status", "experience", "slot", "creation"],
			order_by="creation asc"
		)
		
		if not tickets:
			return not_found("Route Booking", route_booking_id)
		
		# Determine overall status
		statuses = [t.status for t in tickets]
		overall_status = "PENDING"
		
		if all(s == "CONFIRMED" for s in statuses):
			overall_status = "CONFIRMED"
		elif any(s == "CONFIRMED" for s in statuses):
			overall_status = "PARTIALLY_CONFIRMED"
		
		return success(
			"Route status retrieved successfully",
			{
				"route_booking_id": route_booking_id,
				"route_id": route_id,
				"status": overall_status,
				"tickets": tickets,
				"tickets_count": len(tickets),
				"confirmed_count": len([t for t in tickets if t.status == "CONFIRMED"]),
				"pending_count": len([t for t in tickets if t.status == "PENDING"])
			}
		)
	except Exception as e:
		frappe.log_error(f"Error in get_route_status: {str(e)}")
		return error("Failed to get route status", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def get_route_summary(route_booking_id):
	"""
	Get route summary / itinerary - user-friendly summary
	
	Args:
		route_booking_id: Route booking ID
		
	Returns:
		Success response with route summary
	"""
	try:
		if not route_booking_id:
			return validation_error("route_booking_id is required")
		
		# Get route status first
		status_result = get_route_status(route_booking_id)
		if not status_result.get("success"):
			return status_result
		
		status_data = status_result.get("data", {})
		route_id = status_data.get("route_id")
		tickets = status_data.get("tickets", [])
		
		if not route_id:
			return not_found("Route Booking", route_booking_id)
		
		route = frappe.get_doc("Cheese Route", route_id)
		
		# Build itinerary
		itinerary = []
		for ticket_info in tickets:
			ticket = frappe.get_doc("Cheese Ticket", ticket_info.name)
			slot = frappe.get_doc("Cheese Experience Slot", ticket.slot)
			experience = frappe.get_doc("Cheese Experience", ticket.experience)
			
			itinerary.append({
				"ticket_id": ticket.name,
				"experience_id": experience.name,
				"experience_name": experience.name,
				"date": str(slot.date),
				"time": str(slot.time),
				"status": ticket.status,
				"party_size": ticket.party_size
			})
		
		# Sort by date/time
		itinerary.sort(key=lambda x: (x["date"], x["time"]))
		
		return success(
			"Route summary retrieved successfully",
			{
				"route_booking_id": route_booking_id,
				"route_id": route_id,
				"route_name": route.name,
				"status": status_data.get("status"),
				"party_size": tickets[0].party_size if tickets else 0,
				"itinerary": itinerary,
				"total_experiences": len(itinerary)
			}
		)
	except Exception as e:
		frappe.log_error(f"Error in get_route_summary: {str(e)}")
		return error("Failed to get route summary", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def modify_route_booking_preview(route_booking_id, changes):
	"""
	Modify route booking preview - preview changes
	
	Args:
		route_booking_id: Route booking ID
		changes: JSON object with changes {"ticket_id": "TICKET-001", "new_slot": "SLOT-002", "party_size": 3}
		
	Returns:
		Success response with preview of changes
	"""
	try:
		if not route_booking_id:
			return validation_error("route_booking_id is required")
		if not changes:
			return validation_error("changes is required")
		
		# Parse changes
		if isinstance(changes, str):
			try:
				changes = json.loads(changes)
			except Exception as e:
				return validation_error(f"Invalid changes format: {str(e)}")
		
		# Get route status
		status_result = get_route_status(route_booking_id)
		if not status_result.get("success"):
			return status_result
		
		status_data = status_result.get("data", {})
		tickets = status_result.get("data", {}).get("tickets", [])
		
		# Preview changes
		preview_changes = []
		for change in changes if isinstance(changes, list) else [changes]:
			ticket_id = change.get("ticket_id")
			if not ticket_id:
				return validation_error("ticket_id is required in changes")
			
			ticket = frappe.get_doc("Cheese Ticket", ticket_id)
			
			preview = {
				"ticket_id": ticket_id,
				"current_slot": ticket.slot,
				"current_party_size": ticket.party_size
			}
			
			if "new_slot" in change:
				preview["new_slot"] = change["new_slot"]
				preview["slot_changed"] = True
			
			if "party_size" in change:
				preview["new_party_size"] = change["party_size"]
				preview["party_size_changed"] = True
			
			preview_changes.append(preview)
		
		return success(
			"Route booking modification preview",
			{
				"route_booking_id": route_booking_id,
				"changes": preview_changes,
				"note": "Call confirm_route_modification to apply changes"
			}
		)
	except Exception as e:
		frappe.log_error(f"Error in modify_route_booking_preview: {str(e)}")
		return error("Failed to preview route booking modification", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def confirm_route_modification(route_booking_id, changes):
	"""
	Confirm route modification - apply changes
	
	Args:
		route_booking_id: Route booking ID
		changes: JSON object with changes (same format as preview)
		
	Returns:
		Success response with updated route booking
	"""
	try:
		if not route_booking_id:
			return validation_error("route_booking_id is required")
		if not changes:
			return validation_error("changes is required")
		
		# Parse changes
		if isinstance(changes, str):
			try:
				changes = json.loads(changes)
			except Exception as e:
				return validation_error(f"Invalid changes format: {str(e)}")
		
		# Apply changes using ticket modification
		from cheese.api.v1.ticket_controller import modify_ticket
		
		modified_tickets = []
		for change in changes if isinstance(changes, list) else [changes]:
			ticket_id = change.get("ticket_id")
			new_slot = change.get("new_slot")
			party_size = change.get("party_size")
			
			result = modify_ticket(ticket_id, new_slot=new_slot, party_size=party_size)
			if result.get("success"):
				modified_tickets.append(ticket_id)
			else:
				return result
		
		frappe.db.commit()
		
		# Get updated route status
		status_result = get_route_status(route_booking_id)
		
		return success(
			"Route booking modified successfully",
			{
				"route_booking_id": route_booking_id,
				"modified_tickets": modified_tickets,
				"updated_status": status_result.get("data", {}) if status_result.get("success") else None
			}
		)
	except Exception as e:
		frappe.log_error(f"Error in confirm_route_modification: {str(e)}")
		return error("Failed to confirm route modification", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def add_activities_to_route_preview(route_booking_id, activities):
	"""
	Add activities to route preview - preview add-ons
	
	Args:
		route_booking_id: Route booking ID
		activities: JSON array of activities to add [{"experience_id": "EXP-001", "slot_id": "SLOT-001"}]
		
	Returns:
		Success response with preview
	"""
	try:
		if not route_booking_id:
			return validation_error("route_booking_id is required")
		if not activities:
			return validation_error("activities is required")
		
		# Parse activities
		if isinstance(activities, str):
			try:
				activities = json.loads(activities)
			except Exception as e:
				return validation_error(f"Invalid activities format: {str(e)}")
		
		# Get route status
		status_result = get_route_status(route_booking_id)
		if not status_result.get("success"):
			return status_result
		
		status_data = status_result.get("data", {})
		party_size = status_data.get("tickets", [{}])[0].get("party_size", 1) if status_data.get("tickets") else 1
		
		# Preview new activities
		preview_activities = []
		for activity in activities:
			experience_id = activity.get("experience_id")
			slot_id = activity.get("slot_id")
			
			if not experience_id or not slot_id:
				return validation_error("experience_id and slot_id are required for each activity")
			
			if not frappe.db.exists("Cheese Experience", experience_id):
				return not_found("Experience", experience_id)
			
			if not frappe.db.exists("Cheese Experience Slot", slot_id):
				return not_found("Slot", slot_id)
			
			experience = frappe.get_doc("Cheese Experience", experience_id)
			slot = frappe.get_doc("Cheese Experience Slot", slot_id)
			
			# Calculate price
			from cheese.cheese.utils.pricing import calculate_ticket_price, calculate_deposit_amount
			price_data = calculate_ticket_price(experience_id, party_size)
			deposit = calculate_deposit_amount(experience_id, price_data.get("total_price", 0))
			
			preview_activities.append({
				"experience_id": experience_id,
				"experience_name": experience.name,
				"slot_id": slot_id,
				"date": str(slot.date),
				"time": str(slot.time),
				"price": price_data.get("total_price", 0),
				"deposit": deposit,
				"party_size": party_size
			})
		
		# Calculate total additional cost
		total_additional_price = sum(a["price"] for a in preview_activities)
		total_additional_deposit = sum(a["deposit"] for a in preview_activities)
		
		return success(
			"Add activities preview",
			{
				"route_booking_id": route_booking_id,
				"activities_to_add": preview_activities,
				"total_additional_price": total_additional_price,
				"total_additional_deposit": total_additional_deposit,
				"note": "Call confirm_add_activities_to_route to apply"
			}
		)
	except Exception as e:
		frappe.log_error(f"Error in add_activities_to_route_preview: {str(e)}")
		return error("Failed to preview add activities", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def confirm_add_activities_to_route(route_booking_id, activities):
	"""
	Confirm add activities to route - apply add-ons
	
	Args:
		route_booking_id: Route booking ID
		activities: JSON array of activities to add
		
	Returns:
		Success response with updated route booking
	"""
	try:
		if not route_booking_id:
			return validation_error("route_booking_id is required")
		if not activities:
			return validation_error("activities is required")
		
		# Parse activities
		if isinstance(activities, str):
			try:
				activities = json.loads(activities)
			except Exception as e:
				return validation_error(f"Invalid activities format: {str(e)}")
		
		# Get route status to get contact and route
		status_result = get_route_status(route_booking_id)
		if not status_result.get("success"):
			return status_result
		
		status_data = status_result.get("data", {})
		tickets = status_data.get("tickets", [])
		
		if not tickets:
			return not_found("Route Booking", route_booking_id)
		
		first_ticket = frappe.get_doc("Cheese Ticket", tickets[0].name)
		contact_id = first_ticket.contact
		route_id = first_ticket.route
		party_size = first_ticket.party_size
		
		# Create tickets for new activities
		new_tickets = []
		for activity in activities:
			experience_id = activity.get("experience_id")
			slot_id = activity.get("slot_id")
			
			ticket_result = create_pending_ticket(contact_id, experience_id, slot_id, party_size)
			if not ticket_result.get("success"):
				# Rollback
				for ticket_id in new_tickets:
					try:
						ticket_doc = frappe.get_doc("Cheese Ticket", ticket_id)
						ticket_doc.status = "CANCELLED"
						ticket_doc.save()
						update_slot_capacity(ticket_doc.slot)
					except Exception:
						pass
				return ticket_result
			
			ticket_id = ticket_result.get("data", {}).get("ticket_id")
			
			# Link to route
			ticket_doc = frappe.get_doc("Cheese Ticket", ticket_id)
			ticket_doc.route = route_id
			ticket_doc.save()
			
			new_tickets.append(ticket_id)
		
		frappe.db.commit()
		
		# Get updated route status
		updated_status = get_route_status(route_booking_id)
		
		return success(
			"Activities added to route successfully",
			{
				"route_booking_id": route_booking_id,
				"new_tickets": new_tickets,
				"updated_status": updated_status.get("data", {}) if updated_status.get("success") else None
			}
		)
	except Exception as e:
		frappe.log_error(f"Error in confirm_add_activities_to_route: {str(e)}")
		return error("Failed to add activities to route", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def cancel_route_booking(route_booking_id, reason=None):
	"""
	Cancel route booking
	
	Args:
		route_booking_id: Route booking ID
		reason: Cancellation reason (optional)
		
	Returns:
		Success response
	"""
	try:
		if not route_booking_id:
			return validation_error("route_booking_id is required")
		
		# Get route status
		status_result = get_route_status(route_booking_id)
		if not status_result.get("success"):
			return status_result
		
		tickets = status_result.get("data", {}).get("tickets", [])
		
		if not tickets:
			return not_found("Route Booking", route_booking_id)
		
		# Cancel all tickets
		from cheese.api.v1.ticket_controller import cancel_ticket
		
		cancelled_tickets = []
		for ticket_info in tickets:
			if ticket_info.status in ["PENDING", "CONFIRMED"]:
				result = cancel_ticket(ticket_info.name)
				if result.get("success"):
					cancelled_tickets.append(ticket_info.name)
				else:
					return result
		
		frappe.db.commit()
		
		return success(
			"Route booking cancelled successfully",
			{
				"route_booking_id": route_booking_id,
				"cancelled_tickets": cancelled_tickets,
				"reason": reason
			}
		)
	except Exception as e:
		frappe.log_error(f"Error in cancel_route_booking: {str(e)}")
		return error("Failed to cancel route booking", "SERVER_ERROR", {"error": str(e)}, 500)
