# Copyright (c) 2024
# License: MIT

import frappe
from frappe.utils import cint, nowdate

from cheese.api.common.responses import created, error, not_found, success, validation_error
from cheese.api.v1.user_controller import _get_current_user_company
from cheese.cheese.utils.room_assignment import (
	ACTIVE_STAY_STATUSES,
	create_stay,
	find_free_rooms,
	stays_for_ticket,
)


def _company_allowed(company):
	user_company = _get_current_user_company()
	return not user_company or user_company == company


def _room_state_today(room_name):
	"""Occupancy state of a room for today: FREE / RESERVED / OCCUPIED / BLOCKED."""
	today = nowdate()
	stay = frappe.get_all(
		"Cheese Room Stay",
		filters={
			"room": room_name,
			"status": ["in", list(ACTIVE_STAY_STATUSES)],
			"check_in": ["<=", today],
			"check_out": [">", today],
		},
		fields=["name", "status", "ticket", "check_in", "check_out"],
		limit=1,
	)
	if not stay:
		return {"state": "FREE", "stay": None}
	return {"state": stay[0].status, "stay": stay[0]}


@frappe.whitelist()
def list_rooms(company=None, room_type=None):
	"""Rooms of a hotel with their operational status and occupancy today."""
	try:
		user_company = _get_current_user_company()
		company = company or user_company
		if not company:
			return validation_error("company is required")
		if not _company_allowed(company):
			return error("Unauthorized", "UNAUTHORIZED", {}, 403)

		filters = {"company": company}
		if room_type:
			filters["room_type"] = room_type
		rooms = frappe.get_all(
			"Cheese Hotel Room",
			filters=filters,
			fields=["name", "room_number", "floor", "room_type", "status", "notes"],
			order_by="room_number asc",
		)
		for room in rooms:
			occupancy = _room_state_today(room.name)
			room["today_state"] = (
				room.status if room.status != "ACTIVE" else occupancy["state"]
			)
			room["current_stay"] = occupancy["stay"]
		return success("Rooms retrieved", {"rooms": rooms, "count": len(rooms)})
	except Exception as e:
		frappe.log_error(f"Error in list_rooms: {e}")
		return error("Failed to list rooms", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def bulk_create_rooms(room_type, quantity, start_number=1, floor=None, prefix=""):
	"""Create N numbered rooms of a type (e.g. quantity=10 start_number=101)."""
	try:
		if not room_type or not frappe.db.exists("Cheese Experience", room_type):
			return not_found("Room type", room_type)
		exp = frappe.db.get_value(
			"Cheese Experience", room_type, ["experience_type", "company"], as_dict=True
		)
		if exp.experience_type != "HOTEL":
			return validation_error("room_type must be a HOTEL experience")
		if not _company_allowed(exp.company):
			return error("Unauthorized", "UNAUTHORIZED", {}, 403)
		quantity = cint(quantity)
		start_number = cint(start_number)
		if quantity < 1 or quantity > 500:
			return validation_error("quantity must be between 1 and 500")

		created_rooms, skipped = [], []
		for i in range(quantity):
			number = f"{prefix}{start_number + i}"
			if frappe.db.exists("Cheese Hotel Room", {"company": exp.company, "room_number": number}):
				skipped.append(number)
				continue
			room = frappe.get_doc(
				{
					"doctype": "Cheese Hotel Room",
					"company": exp.company,
					"room_type": room_type,
					"room_number": number,
					"floor": floor,
					"status": "ACTIVE",
				}
			)
			room.insert(ignore_permissions=True)
			created_rooms.append(room.name)
		frappe.db.commit()
		return created(
			f"Created {len(created_rooms)} room(s)",
			{"created": created_rooms, "skipped_existing": skipped},
		)
	except Exception as e:
		frappe.log_error(f"Error in bulk_create_rooms: {e}")
		return error("Failed to create rooms", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def set_room_status(room_id, status):
	"""Change the operational status (ACTIVE / MAINTENANCE / OUT_OF_SERVICE)."""
	try:
		if status not in ("ACTIVE", "MAINTENANCE", "OUT_OF_SERVICE"):
			return validation_error(f"Invalid status: {status}")
		if not frappe.db.exists("Cheese Hotel Room", room_id):
			return not_found("Room", room_id)
		company = frappe.db.get_value("Cheese Hotel Room", room_id, "company")
		if not _company_allowed(company):
			return error("Unauthorized", "UNAUTHORIZED", {}, 403)
		frappe.db.set_value("Cheese Hotel Room", room_id, "status", status)
		frappe.db.commit()
		return success("Room status updated", {"room_id": room_id, "status": status})
	except Exception as e:
		frappe.log_error(f"Error in set_room_status: {e}")
		return error("Failed to update room", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def block_room(room_id, date_from, date_to, reason=None):
	"""Block a room for a date range (maintenance) via a BLOCKED stay."""
	try:
		if not frappe.db.exists("Cheese Hotel Room", room_id):
			return not_found("Room", room_id)
		company = frappe.db.get_value("Cheese Hotel Room", room_id, "company")
		if not _company_allowed(company):
			return error("Unauthorized", "UNAUTHORIZED", {}, 403)
		stay = create_stay(room_id, None, "BLOCKED", date_from, date_to, reason=reason)
		frappe.db.commit()
		return created("Room blocked", {"stay_id": stay.name})
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except Exception as e:
		frappe.log_error(f"Error in block_room: {e}")
		return error("Failed to block room", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def release_stay(stay_id):
	"""Cancel an active stay (unblock a room or undo an assignment)."""
	try:
		if not frappe.db.exists("Cheese Room Stay", stay_id):
			return not_found("Stay", stay_id)
		company = frappe.db.get_value("Cheese Room Stay", stay_id, "company")
		if not _company_allowed(company):
			return error("Unauthorized", "UNAUTHORIZED", {}, 403)
		frappe.db.set_value("Cheese Room Stay", stay_id, "status", "CANCELLED")
		frappe.db.commit()
		return success("Stay released", {"stay_id": stay_id})
	except Exception as e:
		frappe.log_error(f"Error in release_stay: {e}")
		return error("Failed to release stay", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def get_ticket_rooms(ticket_id):
	"""Stays of a ticket + free rooms of its type for manual assignment."""
	try:
		if not frappe.db.exists("Cheese Ticket", ticket_id):
			return not_found("Ticket", ticket_id)
		ticket = frappe.get_doc("Cheese Ticket", ticket_id)
		if not _company_allowed(ticket.company):
			return error("Unauthorized", "UNAUTHORIZED", {}, 403)
		stays = stays_for_ticket(ticket_id, only_active=False)
		for stay in stays:
			stay["room_number"] = frappe.db.get_value("Cheese Hotel Room", stay["room"], "room_number")
		free = []
		if ticket.get("check_in_date") and ticket.get("check_out_date"):
			free = find_free_rooms(ticket.experience, ticket.check_in_date, ticket.check_out_date)
		return success(
			"Ticket rooms retrieved",
			{
				"ticket_id": ticket_id,
				"rooms_requested": ticket.get("rooms_requested") or 1,
				"stays": stays,
				"free_rooms": free,
			},
		)
	except Exception as e:
		frappe.log_error(f"Error in get_ticket_rooms: {e}")
		return error("Failed to get ticket rooms", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def assign_room(ticket_id, room_id):
	"""Manually assign a physical room to a hotel ticket."""
	try:
		if not frappe.db.exists("Cheese Ticket", ticket_id):
			return not_found("Ticket", ticket_id)
		if not frappe.db.exists("Cheese Hotel Room", room_id):
			return not_found("Room", room_id)
		ticket = frappe.get_doc("Cheese Ticket", ticket_id)
		if not _company_allowed(ticket.company):
			return error("Unauthorized", "UNAUTHORIZED", {}, 403)
		room = frappe.get_doc("Cheese Hotel Room", room_id)
		if room.room_type != ticket.experience:
			return validation_error(
				f"Room {room.room_number} is of a different type than the booking"
			)
		if not ticket.get("check_in_date") or not ticket.get("check_out_date"):
			return validation_error("Ticket has no check-in/check-out dates")
		status = "OCCUPIED" if ticket.status == "CHECKED_IN" else "RESERVED"
		stay = create_stay(
			room_id, ticket_id, status, ticket.check_in_date, ticket.check_out_date
		)
		frappe.db.commit()
		return created(
			"Room assigned",
			{"stay_id": stay.name, "room_number": room.room_number, "status": status},
		)
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except Exception as e:
		frappe.log_error(f"Error in assign_room: {e}")
		return error("Failed to assign room", "SERVER_ERROR", {"error": str(e)}, 500)
