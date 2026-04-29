# Copyright (c) 2024
# License: MIT

import frappe
from frappe import _
from frappe.utils import now_datetime, get_datetime, cint, getdate
from cheese.cheese.utils.pricing import calculate_ticket_price, calculate_deposit_amount
from cheese.cheese.utils.validation import validate_booking_policy
from cheese.cheese.utils.capacity import update_slot_capacity, get_available_capacity
from cheese.api.common.responses import success, created, error, not_found, validation_error
from cheese.api.v1.user_controller import _get_current_user_company
import json


def _normalize_time_part(time_value):
	"""Convert slot time values to HH:MM:SS."""
	if time_value is None:
		return "00:00:00"
	time_part = str(time_value).split(".")[0]
	if len(time_part) == 5:
		return f"{time_part}:00"
	return time_part


def _read_selected_date_input(selected_date=None):
	"""Read selected_date from argument or request payload fallback keys."""
	if selected_date is None:
		selected_date = (
			frappe.form_dict.get("selected_date")
			or frappe.form_dict.get("date")
		)
	if isinstance(selected_date, str):
		selected_date = selected_date.strip() or None
	return selected_date


def _capacity_date_for_slot(ticket, slot_id, selected_date_obj=None):
	"""Calendar day for per-day capacity (multi-day slots require selected_date on the ticket)."""
	d = selected_date_obj or ticket.selected_date
	if d:
		return getdate(d)
	if not frappe.db.exists("Cheese Experience Slot", slot_id):
		return None
	slot = frappe.get_doc("Cheese Experience Slot", slot_id)
	if getdate(slot.date_from) == getdate(slot.date_to):
		return getdate(slot.date_from)
	return None


def _resolve_slot_policy_datetimes(slot_doc, selected_date=None, fallback_date=None, allow_past_date=False):
	"""
	Resolve effective reservation date and return policy datetimes.

	Returns:
		(effective_date, slot_datetime, event_end_datetime)
	"""
	today_date = getdate(now_datetime())
	slot_start = getdate(slot_doc.date_from)
	slot_end = getdate(slot_doc.date_to) if slot_doc.date_to else slot_start

	if slot_end < today_date:
		raise frappe.ValidationError(_("Cannot book or modify an expired slot"))

	effective_date = None
	if selected_date:
		try:
			effective_date = getdate(selected_date)
		except Exception:
			raise frappe.ValidationError(_("selected_date must be a valid date"))
		if not allow_past_date and effective_date < today_date:
			raise frappe.ValidationError(_("Cannot book or modify with a past selected_date"))
		if effective_date < slot_start or effective_date > slot_end:
			raise frappe.ValidationError(_("selected_date must be within the selected slot range"))
	elif fallback_date:
		effective_date = getdate(fallback_date)
	elif slot_start <= today_date <= slot_end:
		effective_date = today_date
	else:
		effective_date = slot_start

	time_part = _normalize_time_part(slot_doc.time_from)
	slot_datetime = get_datetime(f"{effective_date} {time_part}")
	event_end_datetime = get_datetime(f"{effective_date} 23:59:59")
	return effective_date, slot_datetime, event_end_datetime


def _run_booking_policy(experience_id, slot_datetime, action, event_end_datetime=None):
	"""
	Run policy check while suppressing transient server messages from frappe.throw.
	"""
	previous_mute = getattr(frappe.flags, "mute_messages", False)
	frappe.flags.mute_messages = True
	try:
		validate_booking_policy(
			experience_id,
			slot_datetime,
			action=action,
			event_end_datetime=event_end_datetime,
		)
	finally:
		frappe.flags.mute_messages = previous_mute


def _recalculate_ticket_financials(ticket):
	price_data = calculate_ticket_price(ticket.experience, ticket.party_size, route_id=ticket.route)
	total_price = price_data.get("total_price", 0)
	deposit_amount = calculate_deposit_amount(ticket.experience, total_price, route_id=ticket.route)
	ticket.total_price = total_price
	ticket.deposit_required = bool(deposit_amount > 0)
	ticket.deposit_amount = deposit_amount


@frappe.whitelist()
def create_pending_reservation(contact_id, experience_id, slot_id, party_size=1, selected_date=None, route_id=None, check_in_date=None, check_out_date=None, rooms_requested=None):
	"""
	Create pending reservation (individual) - alias for create_pending_ticket
	
	Args:
		contact_id: ID of the contact
		experience_id: ID of the experience
		slot_id: ID of the slot
		party_size: Number of people (for activities)
		selected_date: Optional specific date within the slot range chosen by the user (YYYY-MM-DD).
		              This is important for multi-day slots: pass the date the user actually selected
		              so that booking policy validation uses that date instead of slot.date_from.
		check_in_date: Check in date (for hotels)
		check_out_date: Check out date (for hotels)
		rooms_requested: Number of rooms (for hotels)
	Returns:
		Success response with reservation data
	"""
	return create_pending_ticket(contact_id, experience_id, slot_id, party_size, selected_date=selected_date, route_id=route_id, check_in_date=check_in_date, check_out_date=check_out_date, rooms_requested=rooms_requested)


@frappe.whitelist()
def get_reservation_status(reservation_id):
	"""
	Get reservation status - alias for get_ticket_summary
	
	Args:
		reservation_id: Reservation ID (ticket_id)
		
	Returns:
		Success response with reservation status
	"""
	return get_ticket_summary(reservation_id)


@frappe.whitelist()
def create_pending_ticket(contact_id, experience_id, slot_id, party_size=1, selected_date=None, route_id=None, check_in_date=None, check_out_date=None, rooms_requested=None):
	"""
	Create a pending ticket with TTL
	
	Args:
		contact_id: ID of the contact
		experience_id: ID of the experience
		slot_id: ID of the slot
		party_size: Number of people
		selected_date: Optional date selected by the user (YYYY-MM-DD). If provided, stored in ticket.selected_date
		
	Returns:
		Success response with ticket data
	"""
	try:
		# Keep a local binding to avoid any accidental local-scope shadowing later.
		parse_date = getdate
		selected_date = _read_selected_date_input(selected_date)
		party_size = cint(party_size) if party_size is not None else 1
		rooms_requested = cint(rooms_requested) if rooms_requested is not None else None

		# Validate inputs
		if not contact_id:
			return validation_error("contact_id is required")
		if not experience_id:
			return validation_error("experience_id is required")
		if not slot_id:
			return validation_error("slot_id is required")

		if not frappe.db.exists("Cheese Contact", contact_id):
			return not_found("Contact", contact_id)
		
		if not frappe.db.exists("Cheese Experience", experience_id):
			return not_found("Experience", experience_id)
		
		if not frappe.db.exists("Cheese Experience Slot", slot_id):
			return not_found("Slot", slot_id)

		# Get slot and experience
		slot = frappe.get_doc("Cheese Experience Slot", slot_id)
		experience = frappe.get_doc("Cheese Experience", experience_id)

		try:
			selected_date_obj, slot_datetime, event_end_datetime = _resolve_slot_policy_datetimes(
				slot_doc=slot,
				selected_date=selected_date,
				allow_past_date=False,
			)
		except frappe.ValidationError as e:
			return validation_error(str(e))

		# Validation 1: Capacity check
		if experience.experience_type == "HOTEL":
			if not check_in_date or not check_out_date:
				return validation_error("check_in_date and check_out_date are required for hotel reservations")
			if not rooms_requested or rooms_requested < 1:
				return validation_error("rooms_requested must be at least 1 for hotel reservations")
			try:
				check_in_obj = parse_date(check_in_date)
				check_out_obj = parse_date(check_out_date)
			except Exception:
				return validation_error("check_in_date and check_out_date must be valid dates (YYYY-MM-DD)")
			if check_out_obj <= check_in_obj:
				return validation_error("check_out_date must be after check_in_date")
		else:
			if not party_size or party_size < 1:
				return validation_error("party_size must be at least 1")
			available = get_available_capacity(slot_id, selected_date)
			if party_size > available:
				return validation_error(f"Cannot book {party_size} tickets. Only {available} slots available.")

		# Validate booking policy using the same date resolver as modification endpoints.
		try:
			_run_booking_policy(
				experience_id,
				slot_datetime,
				action="booking",
				event_end_datetime=event_end_datetime,
			)
		except frappe.ValidationError as e:
			return validation_error(str(e))

		# Calculate price
		party_size_for_price = rooms_requested if experience.experience_type == "HOTEL" else party_size
		price_data = calculate_ticket_price(experience_id, party_size_for_price, route_id=route_id)
		
		# Calculate deposit
		deposit_amount = calculate_deposit_amount(experience_id, price_data["total_price"], route_id=route_id)

		ticket_data = {
			"doctype": "Cheese Ticket",
			"contact": contact_id,
			"company": experience.company,
			"experience": experience_id,
			"slot": slot_id,
			"route": route_id,
			"party_size": party_size,
			"status": "PENDING",
			"total_price": price_data["total_price"],
			"deposit_required": bool(deposit_amount > 0),
			"deposit_amount": deposit_amount,
			"check_in_date": check_in_date,
			"check_out_date": check_out_date,
			"rooms_requested": rooms_requested
		}
		
		# Store selected_date if provided
		if selected_date_obj:
			ticket_data["selected_date"] = selected_date_obj
		
		ticket = frappe.get_doc(ticket_data)
		ticket.insert()
		
		# Update slot capacity
		update_slot_capacity(slot_id)
		
		frappe.db.commit()

		return created(
			"Ticket created successfully",
			{
				"ticket_id": ticket.name,
				"status": ticket.status,
				"contact_id": contact_id,
				"experience_id": experience_id,
				"slot_id": slot_id,
				"party_size": party_size,
				"total_price": price_data["total_price"],
				"deposit_required": ticket.deposit_required,
				"deposit_amount": ticket.deposit_amount,
				"expires_at": str(ticket.expires_at) if ticket.expires_at else None
			}
		)
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except Exception as e:
		frappe.log_error(f"Error in create_pending_ticket: {str(e)}")
		return error("Failed to create ticket", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def modify_reservation_preview(reservation_id, new_slot=None, party_size=None, selected_date=None):
	"""
	Modify reservation preview - preview changes before applying
	
	Args:
		reservation_id: Reservation ID (ticket_id)
		new_slot: New slot ID (optional)
		party_size: New party size (optional)
		
	Returns:
		Success response with preview of changes
	"""
	try:
		if not reservation_id:
			return validation_error("reservation_id is required")
		
		if not frappe.db.exists("Cheese Ticket", reservation_id):
			return not_found("Reservation", reservation_id)
		
		ticket = frappe.get_doc("Cheese Ticket", reservation_id)
		
		if ticket.status not in ["PENDING", "CONFIRMED"]:
			return validation_error(
				f"Only PENDING or CONFIRMED reservations can be modified. Current status: {ticket.status}",
				{"current_status": ticket.status, "allowed_statuses": ["PENDING", "CONFIRMED"]}
			)
		
		preview = {
			"reservation_id": reservation_id,
			"current_slot": ticket.slot,
			"current_party_size": ticket.party_size
		}
		
		# Preview slot change
		if new_slot:
			if not frappe.db.exists("Cheese Experience Slot", new_slot):
				return not_found("Slot", new_slot)
			
			new_slot_doc = frappe.get_doc("Cheese Experience Slot", new_slot)
			selected_date = _read_selected_date_input(selected_date)
			preview["new_slot"] = new_slot
			preview["new_slot_date"] = str(new_slot_doc.date_from)
			preview["new_slot_time"] = str(new_slot_doc.time_from)
			if selected_date:
				preview["selected_date"] = str(selected_date)
			
			# Check modification policy
			try:
				_, slot_datetime, event_end_datetime = _resolve_slot_policy_datetimes(
					slot_doc=new_slot_doc,
					selected_date=selected_date,
					fallback_date=ticket.selected_date,
					allow_past_date=False,
				)
				_run_booking_policy(
					ticket.experience,
					slot_datetime,
					action="modify",
					event_end_datetime=event_end_datetime,
				)
				preview["slot_change_allowed"] = True
			except frappe.ValidationError as e:
				preview["slot_change_allowed"] = False
				preview["slot_change_error"] = str(e)
		
		# Preview party size change
		if party_size:
			if party_size < 1:
				preview["party_size_change_allowed"] = False
				preview["party_size_change_error"] = "party_size must be at least 1"
			else:
				preview["new_party_size"] = party_size
				preview["party_size_change_allowed"] = True
		
		# Calculate price impact
		if new_slot or party_size:
			new_party_size = party_size if party_size else ticket.party_size
			price_data = calculate_ticket_price(ticket.experience, new_party_size, route_id=ticket.route)
			current_price_data = calculate_ticket_price(ticket.experience, ticket.party_size, route_id=ticket.route)
			
			preview["price_impact"] = {
				"current_price": current_price_data.get("total_price", 0),
				"new_price": price_data.get("total_price", 0),
				"price_difference": price_data.get("total_price", 0) - current_price_data.get("total_price", 0)
			}
		
		return success(
			"Modification preview generated successfully",
			{
				"preview": preview,
				"note": "Call confirm_modification to apply changes"
			}
		)
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except Exception as e:
		frappe.log_error(f"Error in modify_reservation_preview: {str(e)}")
		return error("Failed to preview modification", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def confirm_modification(reservation_id, new_slot=None, party_size=None, selected_date=None):
	"""
	Confirm modification - apply changes
	
	Args:
		reservation_id: Reservation ID (ticket_id)
		new_slot: New slot ID (optional)
		party_size: New party size (optional)
		
	Returns:
		Success response with updated reservation data
	"""
	return modify_ticket(
		reservation_id,
		new_slot=new_slot,
		party_size=party_size,
		selected_date=selected_date,
	)


@frappe.whitelist()
def modify_ticket(ticket_id, new_slot=None, party_size=None, selected_date=None):
	"""
	Modify a ticket (change slot or party size)
	Legacy endpoint - use confirm_modification instead
	
	Args:
		ticket_id: ID of the ticket
		new_slot: New slot ID (optional)
		party_size: New party size (optional)
		
	Returns:
		Success response with updated ticket data
	"""
	try:
		selected_date = _read_selected_date_input(selected_date)

		if not ticket_id:
			return validation_error("ticket_id is required")

		if not frappe.db.exists("Cheese Ticket", ticket_id):
			return not_found("Ticket", ticket_id)

		ticket = frappe.get_doc("Cheese Ticket", ticket_id)
		
		if ticket.status not in ["PENDING", "CONFIRMED"]:
			return validation_error(
				f"Only PENDING or CONFIRMED tickets can be modified. Current status: {ticket.status}",
				{"current_status": ticket.status, "allowed_statuses": ["PENDING", "CONFIRMED"]}
			)

		old_slot = ticket.slot
		changes = []

		# Update slot if provided
		if new_slot:
			if not frappe.db.exists("Cheese Experience Slot", new_slot):
				return not_found("Slot", new_slot)
			
			try:
				slot = frappe.get_doc("Cheese Experience Slot", new_slot)
				selected_date_obj, slot_datetime, event_end_datetime = _resolve_slot_policy_datetimes(
					slot_doc=slot,
					selected_date=selected_date,
					fallback_date=ticket.selected_date,
					allow_past_date=False,
				)
				_run_booking_policy(
					ticket.experience,
					slot_datetime,
					action="modify",
					event_end_datetime=event_end_datetime,
				)
			except frappe.ValidationError as e:
				return validation_error(str(e))
			
			ticket.slot = new_slot
			if selected_date_obj:
				ticket.selected_date = selected_date_obj
			changes.append("slot")

			# Capacity check for new slot
			req_size = party_size if party_size else ticket.party_size
			cap_date = _capacity_date_for_slot(ticket, new_slot, selected_date_obj)
			if not cap_date:
				return validation_error(
					"selected_date is required on the ticket (or pass selected_date) to verify capacity for this slot"
				)
			available = get_available_capacity(new_slot, cap_date)
			if req_size > available:
				return validation_error(f"Cannot move {req_size} tickets to new slot. Only {available} slots available.")

		# Update party size if provided
		if party_size:
			if party_size < 1:
				return validation_error("party_size must be at least 1")
			
			if not new_slot:
				diff_size = party_size - ticket.party_size
				if diff_size > 0:
					cap_date = _capacity_date_for_slot(ticket, ticket.slot, None)
					if not cap_date:
						return validation_error(
							"selected_date is required on the ticket to verify capacity for this slot"
						)
					available = get_available_capacity(ticket.slot, cap_date)
					if diff_size > available:
						return validation_error(f"Cannot increase party size by {diff_size}. Only {available} more slots available.")

			ticket.party_size = party_size
			changes.append("party_size")

		if not changes:
			return validation_error("No changes provided. Specify new_slot or party_size")

		if "party_size" in changes:
			_recalculate_ticket_financials(ticket)
			changes.extend(["total_price", "deposit_amount"])

		ticket.save()
		
		# Update capacity for both old and new slots
		if old_slot:
			update_slot_capacity(old_slot)
		if new_slot and new_slot != old_slot:
			update_slot_capacity(new_slot)
		
		frappe.db.commit()

		return success(
			f"Ticket modified successfully. Changed: {', '.join(changes)}",
			{
				"ticket_id": ticket.name,
				"status": ticket.status,
				"slot_id": ticket.slot,
				"party_size": ticket.party_size,
				"changes": changes
			}
		)
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except Exception as e:
		frappe.log_error(f"Error in modify_ticket: {str(e)}")
		return error("Failed to modify ticket", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def cancel_reservation(reservation_id):
	"""
	Cancel reservation - alias for cancel_ticket
	
	Args:
		reservation_id: Reservation ID (ticket_id)
		
	Returns:
		Success response with cancelled reservation data
	"""
	return cancel_ticket(reservation_id)


@frappe.whitelist()
def cancel_ticket(ticket_id):
	"""
	Cancel a ticket
	
	Args:
		ticket_id: ID of the ticket
		
	Returns:
		Success response with cancelled ticket data
	"""
	try:
		if not ticket_id:
			return validation_error("ticket_id is required")

		if not frappe.db.exists("Cheese Ticket", ticket_id):
			return not_found("Ticket", ticket_id)

		ticket = frappe.get_doc("Cheese Ticket", ticket_id)
		
		if ticket.status not in ["PENDING", "CONFIRMED"]:
			return validation_error(
				f"Only PENDING or CONFIRMED tickets can be cancelled. Current status: {ticket.status}",
				{"current_status": ticket.status, "allowed_statuses": ["PENDING", "CONFIRMED"]}
			)

		if ticket.status == "CONFIRMED":
			# Validate cancellation policy
			try:
				slot = frappe.get_doc("Cheese Experience Slot", ticket.slot)
				slot_datetime = get_datetime(f"{slot.date_from} {slot.time_from}")
				validate_booking_policy(ticket.experience, slot_datetime, action="cancel")
			except frappe.ValidationError as e:
				return validation_error(str(e))

		slot_id = ticket.slot
		old_status = ticket.status
		ticket.status = "CANCELLED"
		ticket.save()
		
		# Update slot capacity
		update_slot_capacity(slot_id)
		
		frappe.db.commit()

		return success(
			"Ticket cancelled successfully",
			{
				"ticket_id": ticket.name,
				"old_status": old_status,
				"new_status": ticket.status,
				"slot_id": slot_id
			}
		)
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except Exception as e:
		frappe.log_error(f"Error in cancel_ticket: {str(e)}")
		return error("Failed to cancel ticket", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def get_ticket_summary(ticket_id):
	"""
	Get ticket summary/details
	
	Args:
		ticket_id: ID of the ticket
		
	Returns:
		Success response with ticket details
	"""
	try:
		if not ticket_id:
			return validation_error("ticket_id is required")

		if not frappe.db.exists("Cheese Ticket", ticket_id):
			return not_found("Ticket", ticket_id)

		ticket = frappe.get_doc("Cheese Ticket", ticket_id)
		slot = frappe.get_doc("Cheese Experience Slot", ticket.slot)
		experience = frappe.get_doc("Cheese Experience", ticket.experience)
		contact = frappe.get_doc("Cheese Contact", ticket.contact)

		# Use selected_date if available, otherwise fall back to slot.date_from
		display_date = str(ticket.selected_date) if ticket.selected_date else str(slot.date_from)

		return success(
			"Ticket details retrieved successfully",
			{
				"ticket_id": ticket.name,
				"status": ticket.status,
				"contact": {
					"contact_id": contact.name,
					"full_name": contact.full_name,
					"phone": contact.phone,
					"email": contact.email
				},
				"experience": {
					"experience_id": experience.name,
					"name": experience.name,
					"description": experience.description
				},
				"slot": {
					"slot_id": slot.name,
					"date": display_date,
					"time": str(slot.time_from),
					"max_capacity": slot.max_capacity
				},
				"party_size": ticket.party_size,
				"deposit_required": ticket.deposit_required,
				"deposit_amount": ticket.deposit_amount,
				"expires_at": str(ticket.expires_at) if ticket.expires_at else None,
				"conversation_id": ticket.conversation if ticket.conversation else None
			}
		)
	except Exception as e:
		frappe.log_error(f"Error in get_ticket_summary: {str(e)}")
		return error("Failed to get ticket summary", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def confirm_ticket(ticket_id):
	"""
	Confirm a pending ticket (US-12)
	
	Args:
		ticket_id: Ticket ID
		
	Returns:
		Success response with confirmed ticket data
	"""
	try:
		if not ticket_id:
			return validation_error("ticket_id is required")
		
		if not frappe.db.exists("Cheese Ticket", ticket_id):
			return not_found("Ticket", ticket_id)
		
		ticket = frappe.get_doc("Cheese Ticket", ticket_id)
		
		if ticket.status != "PENDING":
			return validation_error(
				f"Only PENDING tickets can be confirmed. Current status: {ticket.status}",
				{"current_status": ticket.status}
			)
		
		# Check if ticket has expired
		if ticket.expires_at and ticket.expires_at < now_datetime():
			return validation_error("Cannot confirm expired ticket")
		
		old_status = ticket.status
		ticket.status = "CONFIRMED"
		ticket.save()
		
		# Update slot capacity
		update_slot_capacity(ticket.slot)
		
		frappe.db.commit()
		
		return success(
			"Ticket confirmed successfully",
			{
				"ticket_id": ticket.name,
				"old_status": old_status,
				"new_status": ticket.status
			}
		)
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except Exception as e:
		frappe.log_error(f"Error in confirm_ticket: {str(e)}")
		return error("Failed to confirm ticket", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def reject_ticket(ticket_id, reason=None):
	"""
	Reject a pending ticket (US-12)
	
	Args:
		ticket_id: Ticket ID
		reason: Rejection reason (optional)
		
	Returns:
		Success response with rejected ticket data
	"""
	try:
		if not ticket_id:
			return validation_error("ticket_id is required")
		
		if not frappe.db.exists("Cheese Ticket", ticket_id):
			return not_found("Ticket", ticket_id)
		
		ticket = frappe.get_doc("Cheese Ticket", ticket_id)
		
		if ticket.status != "PENDING":
			return validation_error(
				f"Only PENDING tickets can be rejected. Current status: {ticket.status}",
				{"current_status": ticket.status}
			)
		
		old_status = ticket.status
		slot_id = ticket.slot
		ticket.status = "REJECTED"
		ticket.save()
		
		# Release capacity
		update_slot_capacity(slot_id)
		
		frappe.db.commit()
		
		return success(
			"Ticket rejected successfully",
			{
				"ticket_id": ticket.name,
				"old_status": old_status,
				"new_status": ticket.status,
				"reason": reason
			}
		)
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except Exception as e:
		frappe.log_error(f"Error in reject_ticket: {str(e)}")
		return error("Failed to reject ticket", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def list_tickets(page=1, page_size=20, status=None, route_id=None, establishment_id=None, experience_id=None, date=None, date_from=None, date_to=None):
	"""
	List tickets with filters (US-TK-01)
	
	Args:
		page: Page number
		page_size: Items per page
		status: Filter by status
		route_id: Filter by route
		establishment_id: Filter by establishment (company)
		experience_id: Filter by experience
		date: Filter by date (YYYY-MM-DD) - deprecated, use date_from and date_to instead
		date_from: Start date filter (YYYY-MM-DD)
		date_to: End date filter (YYYY-MM-DD)
		
	Returns:
		Paginated response with tickets list
	"""
	try:
		from frappe.utils import cint, getdate
		from cheese.api.common.responses import paginated_response
		
		page = cint(page) or 1
		page_size = cint(page_size) or 20
		
		user_company = _get_current_user_company()
		if user_company:
			establishment_id = user_company
			
		filters = {}
		if status:
			filters["status"] = status
		if route_id:
			filters["route"] = route_id
		if establishment_id:
			filters["company"] = establishment_id
		if experience_id:
			filters["experience"] = experience_id
		
		# Date filter requires joining with slot
		# Support both single date (legacy) and date range
		if date:
			# Legacy support: single date
			date_from = date
			date_to = date
		
		if date_from or date_to:
			if date_from and date_to:
				date_from_obj = getdate(date_from)
				date_to_obj = getdate(date_to)
				if date_from_obj > date_to_obj:
					return validation_error("date_from must be before or equal to date_to")
				
				# Get slots for the date range
				if date_from_obj == date_to_obj:
					# Single day
					slots = frappe.get_all(
						"Cheese Experience Slot",
						filters={"date_from": date_from_obj},
						fields=["name"]
					)
				else:
					# Date range - use between operator
					slots = frappe.get_all(
						"Cheese Experience Slot",
						filters={"date_from": ["between", [date_from_obj, date_to_obj]]},
						fields=["name"]
					)
			elif date_from:
				# Only date_from provided
				date_from_obj = getdate(date_from)
				slots = frappe.get_all(
					"Cheese Experience Slot",
					filters={"date_from": [">=", date_from_obj]},
					fields=["name"]
				)
			elif date_to:
				# Only date_to provided
				date_to_obj = getdate(date_to)
				slots = frappe.get_all(
					"Cheese Experience Slot",
					filters={"date_from": ["<=", date_to_obj]},
					fields=["name"]
				)
			
			if slots:
				filters["slot"] = ["in", [s.name for s in slots]]
			else:
				# No slots for this date range, return empty
				return paginated_response(
					[],
					"No tickets found for this date range",
					page=page,
					page_size=page_size,
					total=0
				)
		
		tickets = frappe.get_all(
			"Cheese Ticket",
			filters=filters,
			fields=["name", "contact", "company", "experience", "slot", "route", "party_size", "status", "selected_date", "creation", "modified"],
			limit_start=(page - 1) * page_size,
			limit_page_length=page_size,
			order_by="modified desc"
		)
		
		for ticket in tickets:
			if ticket.slot:
				slot = frappe.db.get_value(
					"Cheese Experience Slot",
					ticket.slot,
					["date_from", "time_from"],
					as_dict=True
				)
				if slot:
					ticket["slot_date"] = str(ticket.selected_date) if ticket.selected_date else str(slot.date_from)
					ticket["slot_time"] = str(slot.time_from)
		
		total = frappe.db.count("Cheese Ticket", filters=filters)
		
		return paginated_response(
			tickets,
			"Tickets retrieved successfully",
			page=page,
			page_size=page_size,
			total=total
		)
	except Exception as e:
		frappe.log_error(f"Error in list_tickets: {str(e)}")
		return error("Failed to list tickets", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def get_reservations_by_phone(phone, page=1, page_size=20, status=None):
	"""
	Get reservations by contact phone number
	
	Args:
		phone: Contact phone number
		page: Page number
		page_size: Items per page
		status: Optional status filter
		
	Returns:
		Success response with reservations list
	"""
	try:
		if not phone:
			return validation_error("phone is required")

		phone = phone.strip()
		page = cint(page) or 1
		page_size = cint(page_size) or 20

		contact = frappe.get_all(
			"Cheese Contact",
			filters={"phone": phone},
			fields=["name", "full_name", "phone", "email"],
			limit=1
		)

		if not contact:
			return success(
				"No contact found for this phone",
				{
					"phone": phone,
					"contact": None,
					"tickets": [],
					"page": page,
					"page_size": page_size,
					"total": 0
				}
			)

		contact = contact[0]
		filters = {"contact": contact.name}
		if status:
			filters["status"] = status

		tickets = frappe.get_all(
			"Cheese Ticket",
			filters=filters,
			fields=["name", "company", "experience", "slot", "route", "party_size", "status", "selected_date", "creation", "modified"],
			limit_start=(page - 1) * page_size,
			limit_page_length=page_size,
			order_by="modified desc"
		)

		for ticket in tickets:
			if ticket.experience:
				exp = frappe.db.get_value(
					"Cheese Experience",
					ticket.experience,
					"name",
					as_dict=True
				)
				ticket["experience_name"] = exp.name if exp else None
			if ticket.slot:
				slot = frappe.db.get_value(
					"Cheese Experience Slot",
					ticket.slot,
					["date_from", "time_from"],
					as_dict=True
				)
				if slot:
					ticket["slot_date"] = str(ticket.selected_date) if ticket.selected_date else str(slot.date_from)
					ticket["slot_time"] = str(slot.time_from)

		total = frappe.db.count("Cheese Ticket", filters=filters)

		return success(
			"Reservations retrieved successfully",
			{
				"contact": {
					"contact_id": contact.name,
					"full_name": contact.full_name,
					"phone": contact.phone,
					"email": contact.email
				},
				"tickets": tickets,
				"page": page,
				"page_size": page_size,
				"total": total
			}
		)
	except Exception as e:
		frappe.log_error(f"Error in get_reservations_by_phone: {str(e)}")
		return error("Failed to get reservations", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def get_ticket_board(filters=None, status=None, route_id=None, establishment_id=None, experience_id=None, date=None):
	"""
	Get ticket board grouped by status (kanban view) (US-TK-01)
	
	Args:
		filters: JSON filters
		status: Optional status filter
		route_id: Filter by route
		establishment_id: Filter by establishment (company)
		experience_id: Filter by experience
		date: Filter by date (YYYY-MM-DD)
		
	Returns:
		Success response with tickets grouped by status
	"""
	try:
		import json
		from frappe.utils import getdate
		
		filter_dict = {}
		if filters:
			try:
				filter_dict = json.loads(filters) if isinstance(filters, str) else filters
			except Exception:
				pass
		
		if status:
			filter_dict["status"] = status
		if route_id:
			filter_dict["route"] = route_id
		if establishment_id:
			filter_dict["company"] = establishment_id
		if experience_id:
			filter_dict["experience"] = experience_id
		
		# Date filter requires joining with slot
		if date:
			date_obj = getdate(date)
			slots = frappe.get_all(
				"Cheese Experience Slot",
				filters={"date_from": date_obj},
				fields=["name"]
			)
			if slots:
				filter_dict["slot"] = ["in", [s.name for s in slots]]
			else:
				# No slots for this date, return empty board
				board = {}
				statuses = ["PENDING", "CONFIRMED", "CHECKED_IN", "COMPLETED", "EXPIRED", "REJECTED", "CANCELLED", "NO_SHOW"]
				for status_val in statuses:
					board[status_val] = {"status": status_val, "tickets": [], "count": 0}
				return success("Ticket board retrieved successfully", {"board": board, "total_tickets": 0})
		
		tickets = frappe.get_all(
			"Cheese Ticket",
			filters=filter_dict,
			fields=["name", "status", "contact", "experience", "slot", "route", "party_size", "company", "total_price", "deposit_amount", "selected_date", "expires_at", "creation", "modified"]
		)

		slot_ids = sorted({t.slot for t in tickets if t.slot})
		slot_map = {}
		if slot_ids:
			slot_rows = frappe.get_all(
				"Cheese Experience Slot",
				filters={"name": ["in", slot_ids]},
				fields=["name", "date_from", "time_from"],
			)
			slot_map = {row.name: row for row in slot_rows}

		contact_ids = sorted({t.contact for t in tickets if t.contact})
		contact_map = {}
		if contact_ids:
			contact_rows = frappe.get_all(
				"Cheese Contact",
				filters={"name": ["in", contact_ids]},
				fields=["name", "full_name", "phone", "email"],
			)
			contact_map = {row.name: row for row in contact_rows}

		for ticket in tickets:
			if ticket.slot and ticket.slot in slot_map:
				slot = slot_map[ticket.slot]
				ticket["slot_date"] = str(ticket.selected_date) if ticket.selected_date else str(slot.date_from)
				ticket["slot_time"] = str(slot.time_from)
			if ticket.contact and ticket.contact in contact_map:
				contact = contact_map[ticket.contact]
				ticket["contact_name"] = contact.full_name
				ticket["contact_phone"] = contact.phone
				ticket["contact_email"] = contact.email
		
		# Group by status
		board = {}
		statuses = ["PENDING", "CONFIRMED", "CHECKED_IN", "COMPLETED", "EXPIRED", "REJECTED", "CANCELLED", "NO_SHOW"]
		
		for status_val in statuses:
			board[status_val] = {
				"status": status_val,
				"tickets": [],
				"count": 0
			}
		
		for ticket in tickets:
			status_val = ticket.status
			if status_val not in board:
				board[status_val] = {"status": status_val, "tickets": [], "count": 0}
			
			board[status_val]["tickets"].append(ticket)
			board[status_val]["count"] = len(board[status_val]["tickets"])
		
		return success(
			"Ticket board retrieved successfully",
			{
				"board": board,
				"total_tickets": len(tickets),
				"filters_applied": {
					"status": status,
					"route_id": route_id,
					"establishment_id": establishment_id,
					"experience_id": experience_id,
					"date": date
				}
			}
		)
	except Exception as e:
		frappe.log_error(f"Error in get_ticket_board: {str(e)}")
		return error("Failed to get ticket board", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def update_ticket_status(ticket_id, new_status, reason=None):
	"""
	Update ticket status with validation (US-TK-01)
	
	Args:
		ticket_id: Ticket ID
		new_status: New status
		reason: Reason for status change
		
	Returns:
		Success response
	"""
	try:
		if not ticket_id:
			return validation_error("ticket_id is required")
		if not new_status:
			return validation_error("new_status is required")
		
		if not frappe.db.exists("Cheese Ticket", ticket_id):
			return not_found("Ticket", ticket_id)
		
		ticket = frappe.get_doc("Cheese Ticket", ticket_id)
		old_status = ticket.status
		
		# Validate status transition using the doctype state machine.
		from cheese.cheese.doctype.cheese_ticket.cheese_ticket import CheeseTicket
		allowed_transitions = CheeseTicket.VALID_TRANSITIONS
		
		if new_status not in allowed_transitions.get(old_status, []):
			return validation_error(
				f"Invalid status transition from {old_status} to {new_status}",
				{
					"old_status": old_status,
					"new_status": new_status,
					"allowed_transitions": allowed_transitions.get(old_status, [])
				}
			)
		
		ticket.status = new_status
		ticket.save()
		
		# Release capacity if cancelled/expired/rejected
		if new_status in ["CANCELLED", "EXPIRED", "REJECTED"]:
			update_slot_capacity(ticket.slot)
		
		frappe.db.commit()
		
		return success(
			"Ticket status updated successfully",
			{
				"ticket_id": ticket.name,
				"old_status": old_status,
				"new_status": ticket.status,
				"reason": reason
			}
		)
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except Exception as e:
		frappe.log_error(f"Error in update_ticket_status: {str(e)}")
		return error("Failed to update ticket status", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def mark_no_show(ticket_id, reason=None):
	"""
	Mark ticket as no-show (US-TK-10)
	
	Args:
		ticket_id: Ticket ID
		reason: Reason for no-show
		
	Returns:
		Success response
	"""
	try:
		if not ticket_id:
			return validation_error("ticket_id is required")
		
		if not frappe.db.exists("Cheese Ticket", ticket_id):
			return not_found("Ticket", ticket_id)
		
		ticket = frappe.get_doc("Cheese Ticket", ticket_id)
		
		if ticket.status not in ["CONFIRMED", "CHECKED_IN"]:
			return validation_error(
				f"Cannot mark no-show for ticket with status: {ticket.status}",
				{"current_status": ticket.status}
			)
		
		old_status = ticket.status
		ticket.status = "NO_SHOW"
		ticket.save()
		
		frappe.db.commit()
		
		return success(
			"Ticket marked as no-show",
			{
				"ticket_id": ticket.name,
				"old_status": old_status,
				"new_status": ticket.status,
				"reason": reason
			}
		)
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except Exception as e:
		frappe.log_error(f"Error in mark_no_show: {str(e)}")
		return error("Failed to mark no-show", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def get_establishment_ticket_board(establishment_id, date=None):
	"""
	Get establishment ticket board for today (US-TK-11)
	
	Args:
		establishment_id: Establishment (company) ID
		date: Date (YYYY-MM-DD), defaults to today
		
	Returns:
		Success response with establishment ticket board
	"""
	try:
		from frappe.utils import getdate, today
		
		if not establishment_id:
			return validation_error("establishment_id is required")
		
		if not frappe.db.exists("Company", establishment_id):
			return not_found("Company", establishment_id)
		
		# Use today if date not provided
		target_date = getdate(date) if date else getdate(today())
		
		# Get slots for the date
		slots = frappe.get_all(
			"Cheese Experience Slot",
			filters={"date_from": target_date},
			fields=["name", "experience", "time_from"]
		)
		
		if not slots:
			return success(
				"No slots found for this date",
				{
					"establishment_id": establishment_id,
					"date": str(target_date),
					"tickets": [],
					"pending": [],
					"today": []
				}
			)
		
		slot_ids = [s.name for s in slots]
		
		# Get tickets for this establishment and date
		tickets = frappe.get_all(
			"Cheese Ticket",
			filters={
				"company": establishment_id,
				"slot": ["in", slot_ids]
			},
			fields=["name", "status", "experience", "slot", "party_size", "contact", "creation"]
		)
		
		# Group by status
		pending = [t for t in tickets if t.status == "PENDING"]
		today_tickets = [t for t in tickets if t.status in ["CONFIRMED", "CHECKED_IN"]]
		
		return success(
			"Establishment ticket board retrieved successfully",
			{
				"establishment_id": establishment_id,
				"date": str(target_date),
				"tickets": tickets,
				"pending": pending,
				"pending_count": len(pending),
				"today": today_tickets,
				"today_count": len(today_tickets),
				"total_count": len(tickets)
			}
		)
	except Exception as e:
		frappe.log_error(f"Error in get_establishment_ticket_board: {str(e)}")
		return error("Failed to get establishment ticket board", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def convert_ticket_to_booking(ticket_id, route_id=None):
	"""
	Convert an existing ticket into a booking (used by the frontend only).
	Always confirms the ticket as a single-experience reservation.
	
	This function is intentionally standalone — it does NOT call
	confirm_ticket or create_route_reservation to avoid side-effects
	on endpoints used by the WhatsApp chat-bot API.
	
	Args:
		ticket_id: The Cheese Ticket to convert
		route_id: Ignored for backward compatibility
	
	Returns:
		Success response with booking data
	"""
	try:
		if not ticket_id:
			return validation_error("ticket_id is required")

		if not frappe.db.exists("Cheese Ticket", ticket_id):
			return not_found("Ticket", ticket_id)

		ticket = frappe.get_doc("Cheese Ticket", ticket_id)

		if ticket.status not in ("PENDING", "CONFIRMED"):
			return validation_error(
				f"Only PENDING or CONFIRMED tickets can be converted. Current status: {ticket.status}",
				{"current_status": ticket.status}
			)

		if ticket.status == "CONFIRMED":
			return validation_error("Ticket is already confirmed")

		# Check TTL
		if ticket.expires_at and ticket.expires_at < now_datetime():
			return validation_error("Cannot confirm expired ticket")

		ticket.status = "CONFIRMED"
		ticket.save()
		update_slot_capacity(ticket.slot)
		frappe.db.commit()

		return success(
			"Ticket confirmed as single-experience reservation",
			{
				"ticket_id": ticket.name,
				"status": ticket.status,
			}
		)
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except Exception as e:
		frappe.log_error(f"Error in convert_ticket_to_booking: {str(e)}")
		return error("Failed to convert ticket to booking", "SERVER_ERROR", {"error": str(e)}, 500)

