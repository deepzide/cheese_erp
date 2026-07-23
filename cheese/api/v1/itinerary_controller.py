# Copyright (c) 2024
# License: MIT

import frappe
from frappe import _
from cheese.api.common.responses import success, error, not_found, validation_error
from cheese.cheese.utils.access import assert_contact_access, scope_filters


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

		try:
			assert_contact_access(contact_id)
		except frappe.PermissionError:
			return error("Unauthorized", "UNAUTHORIZED", {}, 403)
		
		# Get all tickets for this contact (scoped to the user's company so an
		# establishment user never sees the contact's cross-company reservations).
		tickets = frappe.get_all(
			"Cheese Ticket",
			filters=scope_filters({
				"contact": contact_id,
				"status": ["not in", ["CANCELLED", "EXPIRED", "REJECTED"]]
			}),
			fields=["name", "status", "experience", "route", "slot", "party_size", "creation", "modified"],
			order_by="creation desc"
		)
		
		# Build itinerary
		itinerary = []
		route_bookings = {}
		
		for ticket in tickets:
			# Hotel tickets carry no slot; their dates come from check-in/out.
			slot = frappe.get_doc("Cheese Experience Slot", ticket.slot) if ticket.slot else None
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
			
			# Get aggregate deposit status. Tickets can have an advance row and a balance row.
			deposits = frappe.get_all(
				"Cheese Deposit",
				filters={
					"entity_type": "Cheese Ticket",
					"entity_id": ticket.name,
					"status": ["not in", ["CANCELLED", "REFUNDED"]],
				},
				fields=["status", "amount_required", "amount_paid"],
				order_by="creation asc",
			)
			deposit_paid = sum(d.amount_paid or 0 for d in deposits)
			deposit_required = sum(d.amount_required or 0 for d in deposits)
			if not deposits:
				deposit_status = None
			elif deposit_required > 0 and deposit_paid >= deposit_required:
				deposit_status = "PAID"
			elif any(d.status in ("PENDING", "OVERDUE") for d in deposits):
				deposit_status = "PENDING"
			else:
				deposit_status = deposits[-1].status
			
			# Hotel tickets carry no slot: their stay window is check-in/out.
			base_date = (
				str(ticket.selected_date)
				if ticket.selected_date
				else (str(slot.date_from) if slot else str(ticket.check_in_date or ""))
			)
			time_from = str(slot.time_from) if slot and slot.time_from else None
			time_to = str(slot.time_to) if slot and slot.time_to else None
			item = {
				"reservation_id": ticket.name,
				"type": "route" if ticket.route else "individual",
				"experience_id": experience.name,
				"experience_name": experience.name,
				"date": base_date,
				"time": time_from or "",
				"time_from": time_from,
				"time_to": time_to,
				"scheduled_start": f"{base_date} {time_from}" if time_from else base_date,
				"scheduled_end": f"{base_date} {time_to}" if time_to else None,
				"status": ticket.status,
				"party_size": ticket.party_size,
				"qr_status": qr_token.status if qr_token else None,
				"checked_in": attendance.status == "PRESENT" if attendance else False,
				"checked_in_at": str(attendance.checked_in_at) if attendance and attendance.checked_in_at else None,
				"deposit_status": deposit_status,
				"deposit_paid": deposit_paid,
				"deposit_required": deposit_required
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
