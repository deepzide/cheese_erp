# Copyright (c) 2024
# License: MIT

import frappe
from frappe import _
from frappe.utils import getdate


@frappe.whitelist()
def get_calendar_data(date_from, date_to, establishment_id=None, experience_id=None):
	"""
	Fetch experience slot data for the calendar view.

	Args:
		date_from: Start date of the visible range (YYYY-MM-DD)
		date_to: End date of the visible range (YYYY-MM-DD)
		establishment_id: Filter by establishment (company) - optional
		experience_id: Filter by experience/activity - optional

	Returns:
		dict with 'experiences' list and 'slots' list
	"""
	date_from = getdate(date_from)
	date_to = getdate(date_to)

	# Build experience filters
	experience_filters = {"status": "ONLINE"}
	if establishment_id:
		experience_filters["company"] = establishment_id
	if experience_id:
		experience_filters["name"] = experience_id

	# Fetch all active experiences (filtered by establishment/experience if provided)
	experiences = frappe.get_all(
		"Cheese Experience",
		filters=experience_filters,
		fields=["name", "company", "individual_price", "event_duration"],
		order_by="name asc",
	)

	# Build slot filters - slots use single "date" field
	slot_filters = [
		["date", ">=", date_from],
		["date", "<=", date_to],
	]
	
	# Filter by experience if provided, or filter by experiences from establishment
	if experience_id:
		slot_filters.append(["experience", "=", experience_id])
	elif establishment_id:
		# Filter slots by experiences in the establishment
		exp_ids = [e.name for e in experiences]
		if exp_ids:
			slot_filters.append(["experience", "in", exp_ids])
		else:
			# No experiences for this establishment, return empty
			return {
				"experiences": [],
				"slots": [],
			}

	# Fetch all slots that overlap with the visible date range
	slots = frappe.get_all(
		"Cheese Experience Slot",
		filters=slot_filters,
		fields=[
			"name",
			"experience",
			"date",
			"time",
			"max_capacity",
			"reserved_capacity",
			"slot_status",
		],
		order_by="date asc, time asc",
	)

	return {
		"experiences": experiences,
		"slots": slots,
	}
