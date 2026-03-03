# Copyright (c) 2024
# License: MIT

import frappe
from frappe import _
from frappe.utils import getdate


@frappe.whitelist()
def get_calendar_data(date_from, date_to):
	"""
	Fetch experience slot data for the calendar view.

	Args:
		date_from: Start date of the visible range (YYYY-MM-DD)
		date_to: End date of the visible range (YYYY-MM-DD)

	Returns:
		dict with 'experiences' list and 'slots' list
	"""
	date_from = getdate(date_from)
	date_to = getdate(date_to)

	# Fetch all active experiences
	experiences = frappe.get_all(
		"Cheese Experience",
		filters={"status": "ONLINE"},
		fields=["name", "company", "individual_price", "event_duration"],
		order_by="name asc",
	)

	# Fetch all slots that overlap with the visible date range
	# A slot overlaps if: slot.date_from <= view.date_to AND slot.date_to >= view.date_from
	slots = frappe.get_all(
		"Cheese Experience Slot",
		filters=[
			["date_from", "<=", str(date_to)],
			["date_to", ">=", str(date_from)],
		],
		fields=[
			"name",
			"experience",
			"date_from",
			"date_to",
			"time_from",
			"time_to",
			"time_range",
			"max_capacity",
			"reserved_capacity",
			"slot_status",
		],
		order_by="date_from asc",
	)

	return {
		"experiences": experiences,
		"slots": slots,
	}
