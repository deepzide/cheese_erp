# Copyright (c) 2024
# License: MIT

"""Physical-room availability and assignment for HOTEL tickets.

Hotel availability derives 100% from physical inventory: a room type's
nightly capacity is its ACTIVE Cheese Hotel Rooms minus the rooms taken
by an active Cheese Room Stay (RESERVED/OCCUPIED/BLOCKED) that night —
Cheese Experience Slots are no longer part of the hotel flow.

Lifecycle: booking creation validates availability (with a clear reason
on failure), auto-picks rooms (or honors a manual selection from the ERP
UI) and creates one RESERVED stay per requested room; CHECKED_IN
promotes them to OCCUPIED; terminal ticket statuses close them.
"""

import frappe
from frappe import _
from frappe.utils import add_days, cint, getdate

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


def find_free_rooms(room_type, check_in, check_out, limit=None, exclude_rooms=None, exclude_ticket=None):
	"""ACTIVE rooms of the type without an active stay overlapping the range.

	``exclude_ticket`` ignores that ticket's own stays, so re-validating an
	existing reservation (modification, status change) does not count its own
	rooms as busy.
	"""
	rooms = frappe.get_all(
		"Cheese Hotel Room",
		filters={"room_type": room_type, "status": "ACTIVE"},
		fields=["name", "room_number", "floor"],
		order_by="room_number asc",
	)
	if not rooms:
		return []
	stays = frappe.get_all(
		"Cheese Room Stay",
		filters={
			"room": ["in", [r.name for r in rooms]],
			"status": ["in", list(ACTIVE_STAY_STATUSES)],
			"check_in": ["<", str(check_out)],
			"check_out": [">", str(check_in)],
		},
		fields=["room", "ticket"],
	)
	busy = {s.room for s in stays if not (exclude_ticket and s.ticket == exclude_ticket)}
	exclude = set(exclude_rooms or [])
	free = [r for r in rooms if r.name not in busy and r.name not in exclude]
	return free[: cint(limit)] if limit else free


def validate_hotel_room_availability(room_type, check_in, check_out, rooms_requested=1, exclude_ticket=None):
	"""Raise a ValidationError with a clear reason when the stay cannot be honored.

	Checks, in order: the room type has physical rooms created, and at least
	``rooms_requested`` rooms are free (no overlapping active stay, room
	ACTIVE) for the whole [check_in, check_out) range.
	Returns the list of free rooms on success.
	"""
	rooms_requested = max(1, cint(rooms_requested or 1))
	total = frappe.db.count("Cheese Hotel Room", {"room_type": room_type})
	if total == 0:
		frappe.throw(
			_("Room type {0} has no rooms created. Create its physical rooms in Habitaciones before booking.").format(room_type),
			frappe.ValidationError,
		)
	free = find_free_rooms(room_type, check_in, check_out, exclude_ticket=exclude_ticket)
	if len(free) < rooms_requested:
		frappe.throw(
			_("No availability for room type {0}: {1} room(s) requested for {2} → {3} but only {4} free for the whole range.").format(
				room_type, rooms_requested, check_in, check_out, len(free)
			),
			frappe.ValidationError,
		)
	return free


def room_day_states(room_type, date_from, date_to):
	"""Per-room, per-day state matrix for the calendar detail view.

	Daily slot states: AVAILABLE / RESERVED / OCCUPIED / BLOCKED /
	MAINTENANCE / OUT_OF_SERVICE. Room-level status (maintenance, out of
	service) wins over stays; among stays BLOCKED > OCCUPIED > RESERVED.
	Returns {"rooms": [{name, room_number, floor, status, days: {date: state}}], "dates": [...]}.
	"""
	start = getdate(date_from)
	end = getdate(date_to)
	dates = []
	d = start
	while d <= end:
		dates.append(str(d))
		d = add_days(d, 1)

	rooms = frappe.get_all(
		"Cheese Hotel Room",
		filters={"room_type": room_type},
		fields=["name", "room_number", "floor", "status"],
		order_by="room_number asc",
	)
	if not rooms:
		return {"rooms": [], "dates": dates}

	stays = frappe.get_all(
		"Cheese Room Stay",
		filters={
			"room": ["in", [r.name for r in rooms]],
			"status": ["in", list(ACTIVE_STAY_STATUSES)],
			"check_in": ["<=", str(end)],
			"check_out": [">", str(start)],
		},
		fields=["room", "status", "check_in", "check_out", "ticket"],
	)
	stays_by_room = {}
	for s in stays:
		stays_by_room.setdefault(s.room, []).append(s)

	stay_priority = {"BLOCKED": 3, "OCCUPIED": 2, "RESERVED": 1}
	out = []
	for room in rooms:
		days = {}
		tickets = {}
		for date_str in dates:
			if room.status in ("MAINTENANCE", "OUT_OF_SERVICE"):
				days[date_str] = room.status
				continue
			state = "AVAILABLE"
			best = 0
			for s in stays_by_room.get(room.name, []):
				# Half-open stay range [check_in, check_out)
				if str(s.check_in) <= date_str < str(s.check_out):
					prio = stay_priority.get(s.status, 0)
					if prio > best:
						best = prio
						state = s.status
						if s.ticket:
							tickets[date_str] = s.ticket
			days[date_str] = state
		out.append(
			{
				"name": room.name,
				"room_number": room.room_number,
				"floor": room.floor,
				"status": room.status,
				"days": days,
				"tickets": tickets,
			}
		)
	return {"rooms": out, "dates": dates}


def reserve_rooms_for_ticket(ticket, room_ids=None):
	"""Create RESERVED stays at booking time (manual room_ids or auto-pick).

	Called after the ticket is inserted. Manual rooms are validated (type,
	ACTIVE, free for the range); shortage raises so the transaction rolls
	back and no reservation is left without its rooms.
	"""
	if not _is_hotel_ticket(ticket):
		return []
	needed = max(1, cint(ticket.get("rooms_requested") or 1))
	existing = stays_for_ticket(ticket.name)
	missing = needed - len(existing)
	if missing <= 0:
		return []

	free = find_free_rooms(
		ticket.experience,
		ticket.check_in_date,
		ticket.check_out_date,
		exclude_rooms=[s.room for s in existing],
		exclude_ticket=ticket.name,
	)
	free_names = {r.name for r in free}

	chosen = []
	if room_ids:
		for rid in room_ids:
			if len(chosen) >= missing:
				break
			if rid not in free_names:
				frappe.throw(
					_("Room {0} is not available for {1} → {2}.").format(
						rid, ticket.check_in_date, ticket.check_out_date
					),
					frappe.ValidationError,
				)
			chosen.append(rid)
		# Top up with auto-picked rooms when fewer manual rooms than requested
		for r in free:
			if len(chosen) >= missing:
				break
			if r.name not in chosen:
				chosen.append(r.name)
	else:
		chosen = [r.name for r in free[:missing]]

	if len(chosen) < missing:
		frappe.throw(
			_("No availability for room type {0}: {1} room(s) requested but only {2} free.").format(
				ticket.experience, needed, len(existing) + len(chosen)
			),
			frappe.ValidationError,
		)

	created = []
	for rid in chosen:
		stay = create_stay(rid, ticket.name, "RESERVED", ticket.check_in_date, ticket.check_out_date)
		created.append(stay.name)
	return created


def resync_stays_for_ticket(ticket):
	"""Re-align active stays after the stay window or room count changed.

	Keeps rooms that are still free for the new range (updating stay dates),
	replaces the rest, and cancels extra stays when rooms_requested shrank.
	"""
	if not _is_hotel_ticket(ticket):
		return
	needed = max(1, cint(ticket.get("rooms_requested") or 1))
	stays = stays_for_ticket(ticket.name)

	# Cancel extras (last ones first)
	while len(stays) > needed:
		extra = stays.pop()
		frappe.db.set_value("Cheese Room Stay", extra.name, "status", "CANCELLED")

	# Rooms free for the new range, ignoring this ticket's own stays.
	still_free = {
		r.name
		for r in find_free_rooms(
			ticket.experience,
			ticket.check_in_date,
			ticket.check_out_date,
			exclude_ticket=ticket.name,
		)
	}
	for stay in stays:
		if stay.room in still_free:
			frappe.db.set_value(
				"Cheese Room Stay",
				stay.name,
				{"check_in": str(ticket.check_in_date), "check_out": str(ticket.check_out_date)},
			)
		else:
			frappe.db.set_value("Cheese Room Stay", stay.name, "status", "CANCELLED")

	# Reserve replacements / additions
	reserve_rooms_for_ticket(ticket)


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
