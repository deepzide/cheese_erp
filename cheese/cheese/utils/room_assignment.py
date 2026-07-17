# Copyright (c) 2024
# License: MIT

"""Automatic physical-room assignment for HOTEL tickets.

Booking stays type-based (capacity per night, unchanged); the physical
room is an operational layer: on CHECKED_IN the ticket gets one OCCUPIED
Cheese Room Stay per requested room (auto-picking free ACTIVE rooms of
the type), and terminal ticket statuses close those stays. Assignment
never blocks a ticket transition — a shortage is logged for reception.
"""

import frappe
from frappe.utils import cint

ACTIVE_STAY_STATUSES = ("RESERVED", "OCCUPIED", "BLOCKED")
TERMINAL_MAP = {
	"COMPLETED": "COMPLETED",
	"CANCELLED": "CANCELLED",
	"NO_SHOW": "CANCELLED",
	"EXPIRED": "CANCELLED",
	"REJECTED": "CANCELLED",
}


def _is_hotel_ticket(ticket):
	if not ticket.experience or not ticket.get("check_in_date") or not ticket.get("check_out_date"):
		return False
	return frappe.db.get_value("Cheese Experience", ticket.experience, "experience_type") == "HOTEL"


def find_free_rooms(room_type, check_in, check_out, limit=None, exclude_rooms=None):
	"""ACTIVE rooms of the type without an active stay overlapping the range."""
	rooms = frappe.get_all(
		"Cheese Hotel Room",
		filters={"room_type": room_type, "status": "ACTIVE"},
		fields=["name", "room_number", "floor"],
		order_by="room_number asc",
	)
	exclude = set(exclude_rooms or [])
	free = []
	for room in rooms:
		if room.name in exclude:
			continue
		overlap = frappe.db.exists(
			"Cheese Room Stay",
			{
				"room": room.name,
				"status": ["in", list(ACTIVE_STAY_STATUSES)],
				"check_in": ["<", str(check_out)],
				"check_out": [">", str(check_in)],
			},
		)
		if not overlap:
			free.append(room)
			if limit and len(free) >= limit:
				break
	return free


def stays_for_ticket(ticket_name, only_active=True):
	filters = {"ticket": ticket_name}
	if only_active:
		filters["status"] = ["in", list(ACTIVE_STAY_STATUSES)]
	return frappe.get_all(
		"Cheese Room Stay",
		filters=filters,
		fields=["name", "room", "status", "check_in", "check_out"],
	)


def create_stay(room, ticket, status, check_in, check_out, reason=None):
	stay = frappe.get_doc(
		{
			"doctype": "Cheese Room Stay",
			"room": room,
			"ticket": ticket,
			"status": status,
			"check_in": str(check_in),
			"check_out": str(check_out),
			"reason": reason,
		}
	)
	stay.insert(ignore_permissions=True)
	return stay


def assign_rooms_for_ticket(ticket, stay_status="OCCUPIED"):
	"""Ensure the ticket has one active stay per requested room (auto-pick).

	Existing active stays count toward the requested amount (manual
	assignments are respected). Returns the list of created stay names.
	"""
	if not _is_hotel_ticket(ticket):
		return []

	needed = max(1, cint(ticket.get("rooms_requested") or 1))
	existing = stays_for_ticket(ticket.name)
	missing = needed - len(existing)
	if missing <= 0:
		# Promote reserved stays on check-in
		for stay in existing:
			if stay_status == "OCCUPIED" and stay.status == "RESERVED":
				frappe.db.set_value("Cheese Room Stay", stay.name, "status", "OCCUPIED")
		return []

	free = find_free_rooms(
		ticket.experience,
		ticket.check_in_date,
		ticket.check_out_date,
		limit=missing,
		exclude_rooms=[s.room for s in existing],
	)
	created = []
	for room in free:
		stay = create_stay(
			room.name, ticket.name, stay_status, ticket.check_in_date, ticket.check_out_date
		)
		created.append(stay.name)

	for stay in existing:
		if stay_status == "OCCUPIED" and stay.status == "RESERVED":
			frappe.db.set_value("Cheese Room Stay", stay.name, "status", "OCCUPIED")

	if len(created) < missing:
		frappe.log_error(
			f"Ticket {ticket.name}: only {len(created)} of {missing} rooms auto-assigned "
			f"(type {ticket.experience}) — assign manually from the ticket page",
			"Room Assignment",
		)
	return created


def close_stays_for_ticket(ticket, new_ticket_status):
	"""Close the ticket's active stays when the ticket reaches a final status."""
	target = TERMINAL_MAP.get(new_ticket_status)
	if not target:
		return 0
	closed = 0
	for stay in stays_for_ticket(ticket.name):
		if stay.status == "BLOCKED":
			continue
		frappe.db.set_value("Cheese Room Stay", stay.name, "status", target)
		closed += 1
	return closed


def on_ticket_status_change(ticket, new_status):
	"""Doc-event helper called from CheeseTicket.on_update. Never raises."""
	try:
		if new_status == "CHECKED_IN":
			assign_rooms_for_ticket(ticket, stay_status="OCCUPIED")
		elif new_status in TERMINAL_MAP:
			close_stays_for_ticket(ticket, new_status)
	except Exception as e:
		frappe.log_error(f"Room assignment failed for {ticket.name}: {e}", "Room Assignment")
