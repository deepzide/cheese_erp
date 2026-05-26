# Copyright (c) 2024
# License: MIT

import frappe
from frappe import _
from frappe.utils import now_datetime, add_to_date, getdate
from cheese.api.common.responses import success, created, error, not_found, validation_error
from cheese.api.v1.ticket_controller import create_pending_ticket
from cheese.api.v1.route_booking_controller import create_route_reservation, get_route_status
import json


@frappe.whitelist()
def create_pending_booking(contact_id, items, preferred_dates=None, conversation_id=None, notes=None):
	"""
	Create pending booking (recommended single entity)
	Creates aggregator entity containing:
	- optional route_booking
	- individual_reservations[]
	- consolidated pricing
	- global status
	
	Args:
		contact_id: Contact ID
		items: JSON array of items [{"type": "route", "route_id": "ROUTE-001", "party_size": 2},
		       {"type": "experience", "experience_id": "EXP-001", "slot_id": "SLOT-001", "party_size": 2}]
		preferred_dates: JSON array of preferred dates (if not in items)
		conversation_id: Conversation ID (optional)
		notes: Optional default notes applied when an item-level notes value is not provided
		
	Returns:
		Success response with booking_id, components, pricing preview, expirations
	"""
	try:
		if not contact_id:
			return validation_error("contact_id is required")
		if not items:
			return validation_error("items is required")
		
		if not frappe.db.exists("Cheese Contact", contact_id):
			return not_found("Contact", contact_id)
		
		# Parse items
		if isinstance(items, str):
			try:
				items = json.loads(items)
			except Exception as e:
				return validation_error(f"Invalid items format: {str(e)}")
		
		if not isinstance(items, list):
			return validation_error("items must be an array")
		
		route_booking_id = None
		individual_reservations = []
		total_price = 0
		total_deposit = 0
		
		# Pre-process items to gather available slots from experience items
		available_experience_slots = {}
		for item in items:
			if item.get("type") == "experience" and item.get("experience_id") and item.get("slot_id"):
				available_experience_slots[item.get("experience_id")] = {
					"slot_id": item.get("slot_id"),
					"selected_date": item.get("selected_date") or item.get("calendar_date") or item.get("date"),
				}

		# Experience rows can be used as slot providers for route rows.
		# Track which exact rows were consumed by route booking to avoid duplicate standalone tickets.
		consumed_route_slot_inputs = set()

		def _normalize_selected_date(value):
			if not value:
				return None
			try:
				return str(getdate(value))
			except Exception:
				return str(value)

		# Process items
		for item in items:
			item_type = item.get("type")
			party_size = item.get("party_size", 1)
			
			if item_type == "route":
				route_id = item.get("route_id")
				if not route_id:
					return validation_error("route_id is required for route items")
				
				# Get experiences_with_slots from item or preferred_dates
				experiences_with_slots = item.get("experiences_with_slots")
				route_date = item.get("date")

				if not experiences_with_slots:
					experiences_with_slots = item.get("preferred_dates")
					# If preferred_dates is actually a date string, treat it as route_date
					if isinstance(experiences_with_slots, str) and not route_date:
						route_date = experiences_with_slots
						experiences_with_slots = None

				if not experiences_with_slots and preferred_dates:
					if isinstance(preferred_dates, str) and not route_date:
						route_date = preferred_dates
					elif isinstance(preferred_dates, list):
						experiences_with_slots = preferred_dates

				# If still no slots, try to construct from available experience items
				if not experiences_with_slots and available_experience_slots:
					# Check if route requires specific experiences
					route_doc = frappe.get_doc("Cheese Route", route_id)
					constructed_slots = []
					for exp_row in route_doc.experiences:
						if exp_row.experience in available_experience_slots:
							slot_choice = available_experience_slots[exp_row.experience]
							# Format must match what create_route_reservation expects
							constructed_slots.append({
								"experience_id": exp_row.experience,
								"slot_id": slot_choice.get("slot_id"),
								"selected_date": slot_choice.get("selected_date"),
							})
							consumed_route_slot_inputs.add(
								(
									exp_row.experience,
									slot_choice.get("slot_id"),
									_normalize_selected_date(slot_choice.get("selected_date")),
								)
							)
					
					if constructed_slots:
						experiences_with_slots = constructed_slots
				
				if not experiences_with_slots and not route_date:
					return validation_error("experiences_with_slots (or date) is required for route items")
				
				# Create route reservation
				route_result = create_route_reservation(
					contact_id=contact_id,
					route_id=route_id,
					experiences_with_slots=experiences_with_slots,
					party_size=party_size,
					conversation_id=conversation_id,
					date_from=route_date,
					date_to=route_date,
					notes=item.get("notes") if item.get("notes") is not None else notes,
				)
				
				if not route_result.get("success"):
					return route_result
				
				route_booking_id = route_result.get("data", {}).get("route_booking_id")
				# Update experiences_with_slots with what was actually booked if we auto-selected
				if not experiences_with_slots:
					# We need to fetch the booked slots to correctly price manual routes if needed? 
					# For now, route price calculation below relies on route definition, not booked slots unless route.price_mode is Sum.
					pass
				
				if not route_result.get("success"):
					return route_result
				
				route_booking_id = route_result.get("data", {}).get("route_booking_id")
				
				# Reuse the finalized values from route booking creation
				route_payload = route_result.get("data", {}) or {}
				route_price = route_payload.get("total_price", 0) or 0
				deposit = route_payload.get("deposit_amount", 0) or 0
				
				total_price += route_price
				total_deposit += deposit
				
			elif item_type == "experience":
				experience_id = item.get("experience_id")
				slot_id = item.get("slot_id")
				item_selected_date = (
					item.get("selected_date") or item.get("calendar_date") or item.get("date")
				)
				item_selected_date_norm = _normalize_selected_date(item_selected_date)
				item_route_id = item.get("route_id")
				item_notes = item.get("notes") if item.get("notes") is not None else notes
				
				if not experience_id or not slot_id:
					return validation_error("experience_id and slot_id are required for experience items")

				if (
					(experience_id, slot_id, item_selected_date_norm) in consumed_route_slot_inputs
					and not item.get("book_as_individual")
				):
					continue
				
				# Create individual reservation
				ticket_result = create_pending_ticket(
					contact_id,
					experience_id,
					slot_id,
					party_size,
					selected_date=item_selected_date,
					route_id=item_route_id,
					notes=item_notes,
				)
				
				if not ticket_result.get("success"):
					return ticket_result
				
				ticket_id = ticket_result.get("data", {}).get("ticket_id")
				individual_reservations.append(ticket_id)
				
				# Reuse ticket pricing returned by ticket creation to keep totals consistent.
				item_price = ticket_result.get("data", {}).get("total_price", 0) or 0
				deposit = ticket_result.get("data", {}).get("deposit_amount", 0) or 0
				
				total_price += item_price
				total_deposit += deposit
				
				# Link to conversation if provided
				if conversation_id:
					ticket_doc = frappe.get_doc("Cheese Ticket", ticket_id)
					ticket_doc.conversation = conversation_id
					ticket_doc.save()
			else:
				return validation_error(f"Invalid item type: {item_type}. Must be 'route' or 'experience'")
		
		# Generate booking ID before commit
		booking_id = f"BK-{contact_id}-{now_datetime().strftime('%Y%m%d%H%M%S')}"
		
		# Store booking_id in conversation if available, or track via creation time
		# Since we can't add booking_id field, we'll use creation time window
		booking_creation_time = now_datetime()
		
		frappe.db.commit()
		
		# Determine overall status
		overall_status = "PENDING"
		if route_booking_id:
			route_status_result = get_route_status(route_booking_id)
			if route_status_result.get("success"):
				route_status = route_status_result.get("data", {}).get("status")
				if route_status == "CONFIRMED" and not individual_reservations:
					overall_status = "CONFIRMED"
				elif route_status == "PARTIALLY_CONFIRMED":
					overall_status = "PARTIALLY_CONFIRMED"
		
		return created(
			"Booking created successfully",
			{
				"booking_id": booking_id,
				"contact_id": contact_id,
				"status": overall_status,
				"route_booking_id": route_booking_id,
				"individual_reservations": individual_reservations,
				"pricing": {
					"total_price": total_price,
					"total_deposit": total_deposit,
					"final_price": total_price
				},
				"components": {
					"route_bookings": 1 if route_booking_id else 0,
					"individual_reservations": len(individual_reservations)
				},
				"conversation_id": conversation_id
			}
		)
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except Exception as e:
		frappe.log_error(f"Error in create_pending_booking: {str(e)}")
		return error("Failed to create booking", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def get_booking_status(booking_id):
	"""
	Get booking status - returns overall state and components
	
	Args:
		booking_id: Booking ID
		
	Returns:
		Success response with booking status
	"""
	try:
		if not booking_id:
			return validation_error("booking_id is required")
		
		# Extract contact and timestamp from booking ID
		# Format: BK-{contact_id}-{timestamp}
		parts = booking_id.split("-")
		if len(parts) < 3 or parts[0] != "BK":
			return validation_error("Invalid booking_id format")
		
		timestamp_str = parts[-1]
		contact_id = "-".join(parts[1:-1])
		
		# Parse timestamp to get creation time window
		from frappe.utils import get_datetime, add_to_date
		try:
			booking_time = get_datetime(f"{timestamp_str[:4]}-{timestamp_str[4:6]}-{timestamp_str[6:8]} {timestamp_str[8:10]}:{timestamp_str[10:12]}:{timestamp_str[12:14]}")
		except:
			return validation_error("Invalid booking_id timestamp format")
		
		# Get tickets created within 2 minutes of booking creation time
		# This ensures we only get tickets from the same booking
		window_start = add_to_date(booking_time, minutes=-2, as_datetime=True)
		window_end = add_to_date(booking_time, minutes=2, as_datetime=True)
		
		tickets = frappe.get_all(
			"Cheese Ticket",
			filters=[
				["contact", "=", contact_id],
				["creation", ">=", window_start],
				["creation", "<=", window_end],
				["status", "!=", "CANCELLED"]
			],
			fields=["name", "status", "route", "experience", "slot", "creation"],
			order_by="creation asc"
		)
		
		# Group by route and individual
		route_bookings = {}
		individual_reservations = []
		
		for ticket in tickets:
			if ticket.route:
				if ticket.route not in route_bookings:
					route_bookings[ticket.route] = []
				route_bookings[ticket.route].append(ticket)
			else:
				individual_reservations.append(ticket)
		
		# Determine overall status
		all_statuses = [t.status for t in tickets]
		overall_status = "PENDING"
		
		if all(s == "CONFIRMED" for s in all_statuses):
			overall_status = "CONFIRMED"
		elif any(s == "CONFIRMED" for s in all_statuses):
			overall_status = "PARTIALLY_CONFIRMED"
		elif any(s in ["CANCELLED", "EXPIRED"] for s in all_statuses):
			overall_status = "PARTIALLY_CANCELLED"
		
		return success(
			"Booking status retrieved successfully",
			{
				"booking_id": booking_id,
				"status": overall_status,
				"route_bookings": [
					{"route_id": route_id, "tickets": [t.name for t in tickets]}
					for route_id, tickets in route_bookings.items()
				],
				"individual_reservations": [t.name for t in individual_reservations],
				"total_components": len(tickets),
				"confirmed_count": len([t for t in tickets if t.status == "CONFIRMED"]),
				"pending_count": len([t for t in tickets if t.status == "PENDING"])
			}
		)
	except Exception as e:
		frappe.log_error(f"Error in get_booking_status: {str(e)}")
		return error("Failed to get booking status", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def modify_booking_preview(booking_id, changes):
	"""
	Modify booking preview - preview changes
	
	Args:
		booking_id: Booking ID
		changes: JSON object with changes
		
	Returns:
		Success response with preview
	"""
	try:
		if not booking_id:
			return validation_error("booking_id is required")
		if not changes:
			return validation_error("changes is required")
		
		# Parse changes
		if isinstance(changes, str):
			try:
				changes = json.loads(changes)
			except Exception as e:
				return validation_error(f"Invalid changes format: {str(e)}")
		
		# Get booking status
		status_result = get_booking_status(booking_id)
		if not status_result.get("success"):
			return status_result
		
		# Preview changes (simplified - would need more detail in production)
		return success(
			"Booking modification preview",
			{
				"booking_id": booking_id,
				"changes": changes,
				"note": "Call confirm_booking_modification to apply changes"
			}
		)
	except Exception as e:
		frappe.log_error(f"Error in modify_booking_preview: {str(e)}")
		return error("Failed to preview booking modification", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def confirm_booking_modification(booking_id, changes):
	"""
	Confirm booking modification - apply changes
	
	Args:
		booking_id: Booking ID
		changes: JSON object with changes
		
	Returns:
		Success response with updated booking
	"""
	try:
		if not booking_id:
			return validation_error("booking_id is required")
		if not changes:
			return validation_error("changes is required")
		
		# Parse changes
		if isinstance(changes, str):
			try:
				changes = json.loads(changes)
			except Exception as e:
				return validation_error(f"Invalid changes format: {str(e)}")
		
		# Apply changes (simplified - would use route/ticket modification endpoints)
		from cheese.api.v1.ticket_controller import modify_ticket
		from cheese.api.v1.route_booking_controller import confirm_route_modification
		
		modified_components = []
		
		for change in changes if isinstance(changes, list) else [changes]:
			change_type = change.get("type")
			
			if change_type == "route":
				route_booking_id = change.get("route_booking_id")
				route_changes = change.get("changes")
				result = confirm_route_modification(route_booking_id, route_changes)
				if result.get("success"):
					modified_components.append(route_booking_id)
				else:
					return result
			elif change_type == "ticket":
				ticket_id = change.get("ticket_id")
				new_slot = change.get("new_slot")
				party_size = change.get("party_size")
				result = modify_ticket(ticket_id, new_slot=new_slot, party_size=party_size)
				if result.get("success"):
					modified_components.append(ticket_id)
				else:
					return result
		
		frappe.db.commit()
		
		# Get updated booking status
		updated_status = get_booking_status(booking_id)
		
		return success(
			"Booking modified successfully",
			{
				"booking_id": booking_id,
				"modified_components": modified_components,
				"updated_status": updated_status.get("data", {}) if updated_status.get("success") else None
			}
		)
	except Exception as e:
		frappe.log_error(f"Error in confirm_booking_modification: {str(e)}")
		return error("Failed to confirm booking modification", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def cancel_booking(booking_id, reason=None):
	"""
	Cancel booking - cancels entire booking
	
	Args:
		booking_id: Booking ID
		reason: Cancellation reason (optional)
		
	Returns:
		Success response
	"""
	try:
		if not booking_id:
			return validation_error("booking_id is required")
		
		# Get booking status
		status_result = get_booking_status(booking_id)
		if not status_result.get("success"):
			return status_result
		
		status_data = status_result.get("data", {})
		route_bookings = status_data.get("route_bookings", [])
		individual_reservations = status_data.get("individual_reservations", [])
		
		# Cancel route bookings
		from cheese.api.v1.route_booking_controller import cancel_route_booking
		
		cancelled_routes = []
		for route_booking in route_bookings:
			route_id = route_booking.get("route_id")
			# Get first ticket to determine route booking ID
			tickets = route_booking.get("tickets", [])
			if tickets:
				route_booking_id = f"RB-{tickets[0]}"
				result = cancel_route_booking(route_booking_id, reason)
				if result.get("success"):
					cancelled_routes.append(route_booking_id)
				else:
					return result
		
		# Cancel individual reservations
		from cheese.api.v1.ticket_controller import cancel_ticket
		
		cancelled_tickets = []
		for ticket_id in individual_reservations:
			result = cancel_ticket(ticket_id)
			if result.get("success"):
				cancelled_tickets.append(ticket_id)
			else:
				return result
		
		frappe.db.commit()
		
		return success(
			"Booking cancelled successfully",
			{
				"booking_id": booking_id,
				"cancelled_route_bookings": cancelled_routes,
				"cancelled_reservations": cancelled_tickets,
				"reason": reason
			}
		)
	except Exception as e:
		frappe.log_error(f"Error in cancel_booking: {str(e)}")
		return error("Failed to cancel booking", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def get_payment_status_for_booking(booking_id):
	"""
	Get payment status for booking - consolidated payment status
	
	Args:
		booking_id: Booking ID
		
	Returns:
		Success response with payment status
	"""
	try:
		if not booking_id:
			return validation_error("booking_id is required")
		
		# Get booking status
		status_result = get_booking_status(booking_id)
		if not status_result.get("success"):
			return status_result
		
		status_data = status_result.get("data", {})
		route_bookings = status_data.get("route_bookings", [])
		individual_reservations = status_data.get("individual_reservations", [])
		
		# Get deposit status for all components
		from cheese.api.v1.deposit_controller import _amount_remaining_for_deposit, _get_deposit_phase
		
		total_required = 0
		total_paid = 0
		deposit_statuses = []
		
		# Check deposits for individual reservations
		for ticket_id in individual_reservations:
			deposits = frappe.get_all(
				"Cheese Deposit",
				filters={
					"entity_type": "Cheese Ticket",
					"entity_id": ticket_id,
					"status": ["not in", ["CANCELLED", "REFUNDED"]],
				},
				fields=["name", "entity_type", "entity_id", "amount_required", "amount_paid", "status", "due_at", "paid_at", "verification_method"],
				order_by="creation asc",
			)
			for deposit_data in deposits:
				total_required += deposit_data.get("amount_required", 0)
				total_paid += deposit_data.get("amount_paid", 0)
				deposit_data["deposit_id"] = deposit_data.name
				deposit_data["payment_type"] = _get_deposit_phase(deposit_data.name, deposits)
				deposit_data["amount_remaining"] = _amount_remaining_for_deposit(deposit_data)
				deposit_statuses.append(deposit_data)
		
		# Check deposits for route bookings (would need route booking deposit logic)
		
		return success(
			"Payment status retrieved successfully",
			{
				"booking_id": booking_id,
				"total_deposit_required": total_required,
				"total_deposit_paid": total_paid,
				"total_deposit_remaining": max(0, total_required - total_paid),
				"payment_status": "PAID" if total_paid >= total_required and total_required > 0 else "PENDING",
				"deposit_statuses": deposit_statuses
			}
		)
	except Exception as e:
		frappe.log_error(f"Error in get_payment_status_for_booking: {str(e)}")
		return error("Failed to get payment status", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def register_payment_for_booking(booking_id, amount, verification_method="Manual", ocr_payload=None):
	"""
	Register payment for booking - register payment for entire booking
	
	Args:
		booking_id: Booking ID
		amount: Payment amount
		verification_method: Verification method (Manual/OCR)
		ocr_payload: Optional OCR payload
		
	Returns:
		Success response
	"""
	try:
		if not booking_id:
			return validation_error("booking_id is required")
		if not amount or amount <= 0:
			return validation_error("amount must be greater than 0")
		
		# Get booking status
		status_result = get_booking_status(booking_id)
		if not status_result.get("success"):
			return status_result
		
		status_data = status_result.get("data", {})
		individual_reservations = status_data.get("individual_reservations", [])
		
		# Register payment for individual reservations (distribute proportionally)
		from cheese.api.v1.deposit_controller import record_deposit_payment
		
		registered_payments = []
		amount_per_reservation = amount / len(individual_reservations) if individual_reservations else 0
		
		attach_receipt_to_first_only = True
		for ticket_id in individual_reservations:
			result = record_deposit_payment(
				ticket_id=ticket_id,
				amount=amount_per_reservation,
				verification_method=verification_method,
				ocr_payload=ocr_payload,
				attach_receipt=attach_receipt_to_first_only,
			)
			attach_receipt_to_first_only = False
			if result.get("success"):
				registered_payments.append(ticket_id)
			else:
				return result
		
		frappe.db.commit()
		
		return success(
			"Payment registered for booking successfully",
			{
				"booking_id": booking_id,
				"amount": amount,
				"registered_for_reservations": registered_payments,
				"verification_method": verification_method
			}
		)
	except Exception as e:
		frappe.log_error(f"Error in register_payment_for_booking: {str(e)}")
		return error("Failed to register payment", "SERVER_ERROR", {"error": str(e)}, 500)
