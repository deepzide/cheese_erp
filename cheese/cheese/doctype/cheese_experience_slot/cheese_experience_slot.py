# Copyright (c) 2024
# License: MIT

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.query_builder import functions as fn
from frappe.utils import getdate, today, get_time as _get_time


class CheeseExperienceSlot(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		date_from: DF.Date
		date_to: DF.Date
		experience: DF.Link
		max_capacity: DF.Int
		reserved_capacity: DF.Int | None
		slot_status: DF.Literal["OPEN", "CLOSED", "BLOCKED"]
		time_from: DF.Time | None
		time_to: DF.Time | None
		time_range: DF.Data | None
	# end: auto-generated types

	def validate(self):
		"""Validate slot data and calculate reserved capacity"""
		# Validate max capacity
		if self.max_capacity <= 0:
			frappe.throw(_("Max Capacity must be greater than 0"))

		# Validate dates are provided
		if not self.date_from:
			frappe.throw(_("Date From is required"))

		if not self.date_to:
			frappe.throw(_("Date To is required"))

		# Only enforce past-date checks when creating a new slot or when dates are changed
		if self.is_new() or self.has_value_changed("date_from") or self.has_value_changed("date_to"):
			today_date = getdate(today())
			if self.date_from and getdate(self.date_from) < today_date:
				frappe.throw(_("Date From cannot be in the past"))
			if self.date_to and getdate(self.date_to) < today_date:
				frappe.throw(_("Date To cannot be in the past"))

		# Validate date range
		if self.date_from and self.date_to:
			if str(self.date_from) > str(self.date_to):
				frappe.throw(_("Date From must be before or equal to Date To"))

		# Get time range fields (optional)
		time_from = getattr(self, 'time_from', None)
		time_to = getattr(self, 'time_to', None)

		# Validate time range (only if both time fields are provided)
		if time_from and time_to:
			try:
				t_from = _get_time(time_from)
				t_to = _get_time(time_to)
				if str(t_from) > str(t_to):
					frappe.throw(_("Time From must be before or equal to Time To"))
			except Exception:
				pass  # Skip comparison if time parsing fails

		# Update combined time range field
		self.update_time_range()

		# Calculate reserved capacity
		self.calculate_reserved_capacity()

		# Update slot status based on capacity
		self.update_slot_status()

	def update_time_range(self):
		"""Update the combined time range field"""
		time_from = getattr(self, 'time_from', None)
		time_to = getattr(self, 'time_to', None)

		if time_from and time_to:
			# Format: "09:00 - 17:00"
			from frappe.utils import format_time
			self.time_range = f"{format_time(time_from)} - {format_time(time_to)}"
		elif time_from:
			# Only time_from provided
			from frappe.utils import format_time
			self.time_range = f"{format_time(time_from)} -"
		elif time_to:
			# Only time_to provided
			from frappe.utils import format_time
			self.time_range = f"- {format_time(time_to)}"
		else:
			# No time range
			self.time_range = None

	def calculate_reserved_capacity(self):
		"""Store peak reserved load: per calendar day for multi-day slots, else that single day."""
		from cheese.cheese.utils.capacity import peak_reserved_capacity_for_slot_document

		self.reserved_capacity = peak_reserved_capacity_for_slot_document(self)

	def update_slot_status(self):
		"""Update slot status based on capacity (single-day slots only; multi-day is per-day in API)."""
		if self.slot_status == "BLOCKED":
			return

		df, dt = getdate(self.date_from), getdate(self.date_to)
		if df != dt:
			# Capacity is enforced per calendar day on tickets; do not close the whole range
			# when one day fills up.
			self.slot_status = "OPEN"
			return

		available_capacity = self.max_capacity - (self.reserved_capacity or 0)
		if available_capacity <= 0:
			self.slot_status = "CLOSED"
		else:
			self.slot_status = "OPEN"

	def get_available_capacity(self, selected_date=None):
		"""Prefer get_available_capacity(slot_id, date) from cheese.cheese.utils.capacity for bookings."""
		from cheese.cheese.utils.capacity import get_available_capacity as _avail

		if selected_date is not None:
			return _avail(self.name, getdate(selected_date))
		if getdate(self.date_from) == getdate(self.date_to):
			return _avail(self.name, getdate(self.date_from))
		return _avail(self.name, None)

	def on_trash(self):
		"""Prevent casual deletion of slots. Force-delete via API is allowed."""
		if not frappe.flags.in_delete:
			# Allow deletion - the API delete endpoints handle validation
			pass
