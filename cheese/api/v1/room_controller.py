# Copyright (c) 2024
# License: MIT

import json

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


def _parse_room_ids(room_ids):
	"""Normalize a room_ids input (JSON string, comma string or list) to a list."""
	if isinstance(room_ids, str):
		try:
			room_ids = json.loads(room_ids)
		except Exception:
			room_ids = [x.strip() for x in room_ids.split(",") if x.strip()]
	return room_ids if isinstance(room_ids, list) else []


def _room_has_booking(room_id):
	"""True when the room has an active booking stay (RESERVED/OCCUPIED); BLOCKED
	maintenance stays don't count — they are cleared when the room is removed."""
	return bool(
		frappe.db.exists(
			"Cheese Room Stay",
			{"room": room_id, "status": ["in", ["RESERVED", "OCCUPIED"]]},
		)
	)


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


def _delete_room(room_id):
	"""Delete a room and its non-booking stays. Returns ('deleted'|'in_use', None)."""
	if _room_has_booking(room_id):
		return "in_use"
	frappe.db.delete("Cheese Room Stay", {"room": room_id})
	frappe.delete_doc("Cheese Hotel Room", room_id, ignore_permissions=True, force=True)
	return "deleted"


@frappe.whitelist()
def delete_room(room_id):
	"""Delete a physical room. Refuses when it has an active booking; its
	maintenance blocks and stay history are removed with it."""
	try:
		if not frappe.db.exists("Cheese Hotel Room", room_id):
			return not_found("Room", room_id)
		company = frappe.db.get_value("Cheese Hotel Room", room_id, "company")
		if not _company_allowed(company):
			return error("Unauthorized", "UNAUTHORIZED", {}, 403)
		if _delete_room(room_id) == "in_use":
			return error(
				"Room has active bookings; release them before deleting",
				"ROOM_IN_USE",
				{"room_id": room_id},
				409,
			)
		frappe.db.commit()
		return success("Room deleted", {"room_id": room_id})
	except Exception as e:
		frappe.log_error(f"Error in delete_room: {e}")
		return error("Failed to delete room", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def bulk_set_room_status(room_ids, status):
	"""Set the operational status of many rooms at once."""
	try:
		if status not in ("ACTIVE", "MAINTENANCE", "OUT_OF_SERVICE"):
			return validation_error(f"Invalid status: {status}")
		ids = _parse_room_ids(room_ids)
		if not ids:
			return validation_error("room_ids is required")
		updated, failed = [], []
		for rid in ids:
			if not frappe.db.exists("Cheese Hotel Room", rid):
				failed.append({"room_id": rid, "reason": "not_found"})
				continue
			if not _company_allowed(frappe.db.get_value("Cheese Hotel Room", rid, "company")):
				failed.append({"room_id": rid, "reason": "unauthorized"})
				continue
			frappe.db.set_value("Cheese Hotel Room", rid, "status", status)
			updated.append(rid)
		frappe.db.commit()
		return success("Rooms updated", {"updated": updated, "failed": failed, "status": status})
	except Exception as e:
		frappe.log_error(f"Error in bulk_set_room_status: {e}")
		return error("Failed to update rooms", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def bulk_block_rooms(room_ids, date_from, date_to, reason=None):
	"""Block many rooms for the same date range (maintenance BLOCKED stays)."""
	try:
		if not date_from or not date_to:
			return validation_error("date_from and date_to are required")
		ids = _parse_room_ids(room_ids)
		if not ids:
			return validation_error("room_ids is required")
		blocked, failed = [], []
		for rid in ids:
			if not frappe.db.exists("Cheese Hotel Room", rid):
				failed.append({"room_id": rid, "reason": "not_found"})
				continue
			if not _company_allowed(frappe.db.get_value("Cheese Hotel Room", rid, "company")):
				failed.append({"room_id": rid, "reason": "unauthorized"})
				continue
			try:
				stay = create_stay(rid, None, "BLOCKED", date_from, date_to, reason=reason)
				blocked.append({"room_id": rid, "stay_id": stay.name})
			except Exception as ex:
				failed.append({"room_id": rid, "reason": str(ex)})
		frappe.db.commit()
		return success("Rooms blocked", {"blocked": blocked, "failed": failed})
	except Exception as e:
		frappe.log_error(f"Error in bulk_block_rooms: {e}")
		return error("Failed to block rooms", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def bulk_delete_rooms(room_ids):
	"""Delete many rooms. Rooms with an active booking are skipped, not deleted."""
	try:
		ids = _parse_room_ids(room_ids)
		if not ids:
			return validation_error("room_ids is required")
		deleted, skipped_in_use, failed = [], [], []
		for rid in ids:
			if not frappe.db.exists("Cheese Hotel Room", rid):
				failed.append({"room_id": rid, "reason": "not_found"})
				continue
			if not _company_allowed(frappe.db.get_value("Cheese Hotel Room", rid, "company")):
				failed.append({"room_id": rid, "reason": "unauthorized"})
				continue
			try:
				if _delete_room(rid) == "in_use":
					skipped_in_use.append(rid)
				else:
					deleted.append(rid)
			except Exception as ex:
				failed.append({"room_id": rid, "reason": str(ex)})
		frappe.db.commit()
		return success(
			"Rooms deleted",
			{"deleted": deleted, "skipped_in_use": skipped_in_use, "failed": failed},
		)
	except Exception as e:
		frappe.log_error(f"Error in bulk_delete_rooms: {e}")
		return error("Failed to delete rooms", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def get_room_day_states(room_type, date_from, date_to):
	"""Per-room daily slot states for the availability calendar detail.

	States: AVAILABLE / RESERVED / OCCUPIED / BLOCKED / MAINTENANCE /
	OUT_OF_SERVICE, one per room per day in [date_from, date_to].
	"""
	try:
		if not room_type or not date_from or not date_to:
			return validation_error("room_type, date_from and date_to are required")
		if not frappe.db.exists("Cheese Experience", room_type):
			return not_found("Experience", room_type)
		company = frappe.db.get_value("Cheese Experience", room_type, "company")
		if not _company_allowed(company):
			return error("Unauthorized", "UNAUTHORIZED", {}, 403)
		from cheese.cheese.utils.room_assignment import room_day_states

		data = room_day_states(room_type, date_from, date_to)
		data["room_type"] = room_type
		return success("Room day states retrieved successfully", data)
	except Exception as e:
		frappe.log_error(f"Error in get_room_day_states: {str(e)}")
		return error("Failed to get room day states", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def list_free_rooms(room_type, check_in, check_out):
	"""Rooms of the type free for the whole [check_in, check_out) range.

	Backs the manual room selection in the ERP booking modal.
	"""
	try:
		if not room_type or not check_in or not check_out:
			return validation_error("room_type, check_in and check_out are required")
		if not frappe.db.exists("Cheese Experience", room_type):
			return not_found("Experience", room_type)
		company = frappe.db.get_value("Cheese Experience", room_type, "company")
		if not _company_allowed(company):
			return error("Unauthorized", "UNAUTHORIZED", {}, 403)
		free = find_free_rooms(room_type, check_in, check_out)
		return success(
			"Free rooms retrieved successfully",
			{
				"room_type": room_type,
				"check_in": str(check_in),
				"check_out": str(check_out),
				"total_rooms": frappe.db.count("Cheese Hotel Room", {"room_type": room_type}),
				"free_rooms": free,
				"free_count": len(free),
			},
		)
	except Exception as e:
		frappe.log_error(f"Error in list_free_rooms: {str(e)}")
		return error("Failed to list free rooms", "SERVER_ERROR", {"error": str(e)}, 500)
