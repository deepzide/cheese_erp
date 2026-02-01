# Copyright (c) 2024
# License: MIT

import frappe
from frappe import _
from frappe.utils import now_datetime, getdate, cint, get_datetime
from cheese.api.common.responses import success, created, error, not_found, validation_error, paginated_response


@frappe.whitelist()
def manual_check_in(contact_id=None, ticket_id=None, reservation_code=None):
	"""
	Manual check-in by search (US-TK-09)
	
	Args:
		contact_id: Contact ID (optional)
		ticket_id: Ticket ID (optional)
		reservation_code: Reservation code/name (optional)
		
	Returns:
		Success response with check-in data
	"""
	try:
		if not contact_id and not ticket_id and not reservation_code:
			return validation_error("At least one of contact_id, ticket_id, or reservation_code must be provided")
		
		# Find ticket
		ticket = None
		
		if ticket_id:
			if not frappe.db.exists("Cheese Ticket", ticket_id):
				return not_found("Ticket", ticket_id)
			ticket = frappe.get_doc("Cheese Ticket", ticket_id)
		elif reservation_code:
			# Search by ticket name/code
			ticket = frappe.db.get_value(
				"Cheese Ticket",
				{"name": reservation_code},
				"*",
				as_dict=True
			)
			if ticket:
				ticket = frappe.get_doc("Cheese Ticket", ticket.name)
			else:
				return not_found("Ticket", reservation_code)
		elif contact_id:
			# Get today's tickets for this contact
			today = getdate()
			slots = frappe.get_all(
				"Cheese Experience Slot",
				filters={"date": today},
				fields=["name"]
			)
			
			if not slots:
				return validation_error("No slots found for today")
			
			tickets = frappe.get_all(
				"Cheese Ticket",
				filters={
					"contact": contact_id,
					"slot": ["in", [s.name for s in slots]],
					"status": "CONFIRMED"
				},
				fields=["name"],
				limit=1
			)
			
			if not tickets:
				return not_found("Ticket", f"for contact {contact_id} today")
			
			ticket = frappe.get_doc("Cheese Ticket", tickets[0].name)
		
		if not ticket:
			return not_found("Ticket", "not found")
		
		# Validate ticket can be checked in
		if ticket.status != "CONFIRMED":
			return validation_error(
				f"Only CONFIRMED tickets can be checked in. Current status: {ticket.status}",
				{"current_status": ticket.status}
			)
		
		# Check if already checked in
		existing_attendance = frappe.db.get_value(
			"Cheese Attendance",
			{"ticket": ticket.name, "status": "PRESENT"},
			"name"
		)
		
		if existing_attendance:
			return validation_error("Ticket is already checked in")
		
		# Check in ticket
		old_status = ticket.status
		ticket.status = "CHECKED_IN"
		ticket.save()
		
		# Create attendance record
		attendance = frappe.get_doc({
			"doctype": "Cheese Attendance",
			"ticket": ticket.name,
			"checked_in_at": now_datetime(),
			"method": "MANUAL",
			"status": "PRESENT"
		})
		attendance.insert()
		
		# Mark QR as used if exists
		qr_token = frappe.db.get_value(
			"Cheese QR Token",
			{"ticket": ticket.name, "status": "ACTIVE"},
			"name"
		)
		
		if qr_token:
			qr = frappe.get_doc("Cheese QR Token", qr_token)
			qr.mark_used()
		
		frappe.db.commit()
		
		return success(
			"Manual check-in successful",
			{
				"ticket_id": ticket.name,
				"old_status": old_status,
				"new_status": ticket.status,
				"attendance_id": attendance.name,
				"checked_in_at": str(attendance.checked_in_at),
				"method": "MANUAL"
			}
		)
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except Exception as e:
		frappe.log_error(f"Error in manual_check_in: {str(e)}")
		return error("Failed to perform manual check-in", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def get_attendance_record(attendance_id):
	"""
	Get attendance record details
	
	Args:
		attendance_id: Attendance ID
		
	Returns:
		Success response with attendance details
	"""
	try:
		if not attendance_id:
			return validation_error("attendance_id is required")
		
		if not frappe.db.exists("Cheese Attendance", attendance_id):
			return not_found("Attendance", attendance_id)
		
		attendance = frappe.get_doc("Cheese Attendance", attendance_id)
		ticket = frappe.get_doc("Cheese Ticket", attendance.ticket)
		
		return success(
			"Attendance record retrieved successfully",
			{
				"attendance_id": attendance.name,
				"ticket_id": ticket.name,
				"checked_in_at": str(attendance.checked_in_at) if attendance.checked_in_at else None,
				"method": attendance.method,
				"status": attendance.status,
				"ticket_status": ticket.status
			}
		)
	except Exception as e:
		frappe.log_error(f"Error in get_attendance_record: {str(e)}")
		return error("Failed to get attendance record", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def list_attendance(page=1, page_size=20, date=None, establishment_id=None, experience_id=None):
	"""
	List attendance records with filters
	
	Args:
		page: Page number
		page_size: Items per page
		date: Filter by date
		establishment_id: Filter by establishment
		experience_id: Filter by experience
		
	Returns:
		Paginated response with attendance list
	"""
	try:
		page = cint(page) or 1
		page_size = cint(page_size) or 20
		
		# Build filters
		filters = {}
		
		# Get tickets matching filters first
		ticket_filters = {}
		if establishment_id:
			ticket_filters["company"] = establishment_id
		if experience_id:
			ticket_filters["experience"] = experience_id
		
		ticket_ids = []
		if ticket_filters:
			tickets = frappe.get_all(
				"Cheese Ticket",
				filters=ticket_filters,
				fields=["name"]
			)
			ticket_ids = [t.name for t in tickets]
		
		if ticket_ids:
			filters["ticket"] = ["in", ticket_ids]
		elif ticket_filters:
			# No tickets match, return empty
			return paginated_response(
				[],
				"No attendance records found",
				page=page,
				page_size=page_size,
				total=0
			)
		
		# Date filter requires checking ticket slot
		if date:
			date_obj = getdate(date)
			slots = frappe.get_all(
				"Cheese Experience Slot",
				filters={"date": date_obj},
				fields=["name"]
			)
			
			if slots:
				slot_tickets = frappe.get_all(
					"Cheese Ticket",
					filters={"slot": ["in", [s.name for s in slots]]},
					fields=["name"]
				)
				slot_ticket_ids = [t.name for t in slot_tickets]
				
				if "ticket" in filters:
					filters["ticket"] = ["in", list(set(filters["ticket"]) & set(slot_ticket_ids))]
				else:
					filters["ticket"] = ["in", slot_ticket_ids]
			else:
				return paginated_response(
					[],
					"No attendance records found for this date",
					page=page,
					page_size=page_size,
					total=0
				)
		
		attendance_records = frappe.get_all(
			"Cheese Attendance",
			filters=filters,
			fields=["name", "ticket", "checked_in_at", "method", "status", "modified"],
			limit_start=(page - 1) * page_size,
			limit_page_length=page_size,
			order_by="checked_in_at desc"
		)
		
		# Enrich with ticket info
		for record in attendance_records:
			if record.ticket:
				ticket = frappe.db.get_value(
					"Cheese Ticket",
					record.ticket,
					["experience", "party_size", "status"],
					as_dict=True
				)
				if ticket:
					record["experience_id"] = ticket.experience
					record["party_size"] = ticket.party_size
					record["ticket_status"] = ticket.status
		
		total = frappe.db.count("Cheese Attendance", filters=filters)
		
		return paginated_response(
			attendance_records,
			"Attendance records retrieved successfully",
			page=page,
			page_size=page_size,
			total=total
		)
	except Exception as e:
		frappe.log_error(f"Error in list_attendance: {str(e)}")
		return error("Failed to list attendance", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def mark_no_show_manual(ticket_id, reason=None):
	"""
	Manually mark no-show (US-15)
	
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
		
		if ticket.status not in ["CONFIRMED"]:
			return validation_error(
				f"Cannot mark no-show for ticket with status: {ticket.status}",
				{"current_status": ticket.status}
			)
		
		# Check if already checked in
		existing_attendance = frappe.db.get_value(
			"Cheese Attendance",
			{"ticket": ticket_id, "status": "PRESENT"},
			"name"
		)
		
		if existing_attendance:
			return validation_error("Cannot mark no-show for ticket that is already checked in")
		
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
		frappe.log_error(f"Error in mark_no_show_manual: {str(e)}")
		return error("Failed to mark no-show", "SERVER_ERROR", {"error": str(e)}, 500)
