# Copyright (c) 2024
# License: MIT

import frappe
from frappe.query_builder import functions as fn
from frappe.utils import add_days, getdate


def iter_calendar_days_inclusive(start, end):
	"""Yield each calendar date from start through end (inclusive)."""
	d = getdate(start)
	end_d = getdate(end)
	while d <= end_d:
		yield d
		d = add_days(d, 1)


def slot_calendar_days_in_range(slot_date_from, slot_date_to, range_from, range_to):
	"""
	Calendar days where a slot is active and overlaps the requested query range.
	Both ranges are inclusive.
	"""
	sf, st = getdate(slot_date_from), getdate(slot_date_to)
	rf, rt = getdate(range_from), getdate(range_to)
	a = max(sf, rf)
	b = min(st, rt)
	if a > b:
		return []
	return list(iter_calendar_days_inclusive(a, b))


def peak_reserved_capacity_for_slot_document(slot_doc):
	"""
	Aggregate reserved count for storing on Cheese Experience Slot.

	Single-day slot: reserved for that day only.
	Multi-day slot: max reserved on any single calendar day (peak load).
	"""
	df, dt = getdate(slot_doc.date_from), getdate(slot_doc.date_to)
	if df == dt:
		return calculate_reserved_capacity(slot_doc.name, df)
	peak = 0
	for d in iter_calendar_days_inclusive(df, dt):
		r = calculate_reserved_capacity(slot_doc.name, d)
		if r > peak:
			peak = r
	return peak


def calculate_reserved_capacity(slot_name, selected_date=None, exclude_ticket=None):
	"""
	Calculate reserved capacity for a slot.

	Counts party_size for all tickets that are actively occupying capacity:
	PENDING, CONFIRMED, and CHECKED_IN. Terminal statuses (CANCELLED, EXPIRED,
	REJECTED, NO_SHOW, COMPLETED) are excluded.

	Args:
		slot_name: Name of the slot
		selected_date: Optional date to filter by (for multi-day slots)
		exclude_ticket: Optional ticket name to exclude from the count. Used when
			validating a ticket against capacity so its own already-reserved seats
			are not double-counted (e.g. confirming a ticket that fills the slot).

	Returns:
		Reserved capacity (sum of party_size for active tickets)
	"""
	from frappe.query_builder import DocType

	ticket = DocType("Cheese Ticket")

	active_statuses = ["PENDING", "CONFIRMED", "CHECKED_IN"]

	slot_doc = frappe.get_doc("Cheese Experience Slot", slot_name)
	exp_doc = frappe.get_doc("Cheese Experience", slot_doc.experience)

	if exp_doc.experience_type == "HOTEL":
		# Count by experience + date range (not by slot) so that multi-night stays
		# that span different per-night slots are all accounted for correctly.
		query = (
			frappe.qb.from_(ticket)
			.select(fn.Sum(ticket.rooms_requested).as_("total"))
			.where(ticket.experience == exp_doc.name)
			.where(ticket.status.isin(active_statuses))
		)
		if selected_date:
			query = query.where(ticket.check_in_date <= selected_date)
			query = query.where(ticket.check_out_date > selected_date)
	else:
		query = (
			frappe.qb.from_(ticket)
			.select(fn.Sum(ticket.party_size).as_("total"))
			.where(ticket.slot == slot_name)
			.where(ticket.status.isin(active_statuses))
		)

		if selected_date:
			query = query.where(ticket.selected_date == selected_date)

	if exclude_ticket:
		query = query.where(ticket.name != exclude_ticket)

	result = query.run()

	return result[0][0] if result and result[0][0] else 0


def get_available_capacity(slot_name, selected_date=None, exclude_ticket=None):
	"""
	Get available capacity for a slot

	Args:
		slot_name: Name of the slot
		selected_date: Optional date to filter by
		exclude_ticket: Optional ticket name to exclude from the reserved count
			(so a ticket does not consume capacity against itself).

	Returns:
		Available capacity
	"""
	slot = frappe.get_doc("Cheese Experience Slot", slot_name)
	reserved = calculate_reserved_capacity(slot_name, selected_date, exclude_ticket=exclude_ticket)
	max_capacity = _effective_max_capacity(slot, selected_date)
	return max_capacity - reserved


def _effective_max_capacity(slot, selected_date=None):
	"""Max capacity of a slot.

	Phase 2 (Company.derive_hotel_capacity): for HOTEL room types the nightly
	max is derived from physical inventory — ACTIVE rooms of the type minus
	BLOCKED stays overlapping that night — instead of the manual slot value.
	"""
	exp = frappe.db.get_value(
		"Cheese Experience", slot.experience, ["experience_type", "company"], as_dict=True
	)
	if not exp or exp.experience_type != "HOTEL":
		return slot.max_capacity
	if not frappe.db.get_value("Company", exp.company, "derive_hotel_capacity"):
		return slot.max_capacity

	active_rooms = frappe.db.count(
		"Cheese Hotel Room", {"room_type": slot.experience, "status": "ACTIVE"}
	)
	night = str(selected_date or slot.date_from)
	blocked = frappe.db.count(
		"Cheese Room Stay",
		{
			"status": "BLOCKED",
			"check_in": ["<=", night],
			"check_out": [">", night],
			"room": [
				"in",
				frappe.get_all(
					"Cheese Hotel Room", filters={"room_type": slot.experience}, pluck="name"
				)
				or ["__none__"],
			],
		},
	)
	return max(0, active_rooms - blocked)


def update_slot_capacity(slot_name):
	"""
	Update slot capacity calculations

	Args:
		slot_name: Name of the slot (None-safe: hotel tickets carry no slot)
	"""
	if not slot_name:
		return
	slot = frappe.get_doc("Cheese Experience Slot", slot_name)
	slot.calculate_reserved_capacity()
	slot.update_slot_status()
	slot.save()
