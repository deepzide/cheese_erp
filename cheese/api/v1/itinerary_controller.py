# Copyright (c) 2024
# License: MIT

import frappe
from frappe import _
from cheese.api.common.responses import success, error, not_found, validation_error


@frappe.whitelist()
def get_customer_itinerary(contact_id):
	"""
	Get customer itinerary - returns all reservations/bookings for a contact with details
	
	Args:
		contact_id: Contact ID
		
	Returns:
		Success response with itinerary
	"""
	try:
		if not contact_id:
			return validation_error("contact_id is required")
		
		if not frappe.db.exists("Cheese Contact", contact_id):
			return not_found("Contact", contact_id)
		
		# Get all tickets for this contact
		tickets = frappe.get_all(
			"Cheese Ticket",
			filters={
				"contact": contact_id,
				"status": ["not in", ["CANCELLED", "EXPIRED", "REJECTED"]]
			},
			fields=["name", "status", "experience", "route", "slot", "party_size", "creation", "modified"],
			order_by="creation desc"
		)
		
		# Build itinerary
		itinerary = []
		route_bookings = {}
		
		for ticket in tickets:
			slot = frappe.get_doc("Cheese Experience Slot", ticket.slot)
			experience = frappe.get_doc("Cheese Experience", ticket.experience)
			
			# Get QR status
			qr_token = frappe.db.get_value(
				"Cheese QR Token",
				{"ticket": ticket.name},
				["status", "expires_at"],
				as_dict=True
			)
			
			# Get check-in status
			attendance = frappe.db.get_value(
				"Cheese Attendance",
				{"ticket": ticket.name},
				["checked_in_at", "status"],
				as_dict=True
			)
			
			# Get deposit status
			deposit = frappe.db.get_value(
				"Cheese Deposit",
				{"entity_type": "Ticket", "entity_id": ticket.name},
				["status", "amount_required", "amount_paid"],
				as_dict=True
			)
			
			item = {
				"reservation_id": ticket.name,
				"type": "route" if ticket.route else "individual",
				"experience_id": experience.name,
				"experience_name": experience.name,
				"date": str(slot.date),
				"time": str(slot.time),
				"status": ticket.status,
				"party_size": ticket.party_size,
				"qr_status": qr_token.status if qr_token else None,
				"checked_in": attendance.status == "PRESENT" if attendance else False,
				"checked_in_at": str(attendance.checked_in_at) if attendance and attendance.checked_in_at else None,
				"deposit_status": deposit.status if deposit else None,
				"deposit_paid": deposit.amount_paid if deposit else 0,
				"deposit_required": deposit.amount_required if deposit else 0
			}
			
			if ticket.route:
				if ticket.route not in route_bookings:
					route_bookings[ticket.route] = []
				route_bookings[ticket.route].append(item)
			else:
				itinerary.append(item)
		
		# Add route bookings to itinerary
		for route_id, route_items in route_bookings.items():
			route = frappe.get_doc("Cheese Route", route_id)
			itinerary.append({
				"type": "route",
				"route_id": route_id,
				"route_name": route.name,
				"reservations": route_items,
				"reservations_count": len(route_items)
			})
		
		# Sort itinerary by date
		def get_date(item):
			if item.get("type") == "route":
				# Get earliest date from reservations
				dates = [r.get("date") for r in item.get("reservations", [])]
				return min(dates) if dates else "9999-12-31"
			return item.get("date", "9999-12-31")
		
		itinerary.sort(key=get_date)
		
		return success(
			"Customer itinerary retrieved successfully",
			{
				"contact_id": contact_id,
				"itinerary": itinerary,
				"total_reservations": len(tickets),
				"upcoming_count": len([i for i in itinerary if i.get("status") in ["PENDING", "CONFIRMED"]]),
				"completed_count": len([i for i in itinerary if i.get("status") == "COMPLETED"])
			}
		)
	except Exception as e:
		frappe.log_error(f"Error in get_customer_itinerary: {str(e)}")
		return error("Failed to get customer itinerary", "SERVER_ERROR", {"error": str(e)}, 500)
