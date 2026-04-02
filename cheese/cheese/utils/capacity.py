# Copyright (c) 2024
# License: MIT

import frappe
from frappe.query_builder import functions as fn


def calculate_reserved_capacity(slot_name):
	"""
	Calculate reserved capacity for a slot.

	Counts party_size for all tickets that are actively occupying capacity:
	PENDING, CONFIRMED, and CHECKED_IN. Terminal statuses (CANCELLED, EXPIRED,
	REJECTED, NO_SHOW, COMPLETED) are excluded.

	Args:
		slot_name: Name of the slot

	Returns:
		Reserved capacity (sum of party_size for active tickets)
	"""
	from frappe.query_builder import DocType

	ticket = DocType("Cheese Ticket")

	active_statuses = ["PENDING", "CONFIRMED", "CHECKED_IN"]

	result = (
		frappe.qb.from_(ticket)
		.select(fn.Sum(ticket.party_size).as_("total"))
		.where(ticket.slot == slot_name)
		.where(ticket.status.isin(active_statuses))
	).run()

	return result[0][0] if result and result[0][0] else 0


def get_available_capacity(slot_name):
	"""
	Get available capacity for a slot
	
	Args:
		slot_name: Name of the slot
		
	Returns:
		Available capacity
	"""
	slot = frappe.get_doc("Cheese Experience Slot", slot_name)
	reserved = calculate_reserved_capacity(slot_name)
	return slot.max_capacity - reserved


def update_slot_capacity(slot_name):
	"""
	Update slot capacity calculations
	
	Args:
		slot_name: Name of the slot
	"""
	slot = frappe.get_doc("Cheese Experience Slot", slot_name)
	slot.calculate_reserved_capacity()
	slot.update_slot_status()
	slot.save()
