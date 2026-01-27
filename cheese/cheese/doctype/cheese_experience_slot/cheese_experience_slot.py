# Copyright (c) 2024
# License: MIT

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.query_builder import functions as fn


class CheeseExperienceSlot(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		date: DF.Date
		experience: DF.Link
		max_capacity: DF.Int
		reserved_capacity: DF.Int | None
		slot_status: DF.Literal["OPEN", "CLOSED", "BLOCKED"]
		time: DF.Time
	# end: auto-generated types

	def validate(self):
		"""Validate slot data and calculate reserved capacity"""
		# Validate max capacity
		if self.max_capacity <= 0:
			frappe.throw(_("Max Capacity must be greater than 0"))

		# Calculate reserved capacity
		self.calculate_reserved_capacity()

		# Update slot status based on capacity
		self.update_slot_status()

	def calculate_reserved_capacity(self):
		"""Calculate reserved capacity from PENDING tickets"""
		from frappe.query_builder import DocType

		ticket = DocType("Cheese Ticket")
		
		result = (
			frappe.qb.from_(ticket)
			.select(fn.Sum(ticket.party_size).as_("total"))
			.where(ticket.slot == self.name)
			.where(ticket.status == "PENDING")
		).run()

		self.reserved_capacity = result[0][0] if result and result[0][0] else 0

	def update_slot_status(self):
		"""Update slot status based on capacity"""
		available_capacity = self.max_capacity - (self.reserved_capacity or 0)
		
		if self.slot_status != "BLOCKED":
			if available_capacity <= 0:
				self.slot_status = "CLOSED"
			else:
				self.slot_status = "OPEN"

	def get_available_capacity(self):
		"""Get available capacity for this slot"""
		return self.max_capacity - (self.reserved_capacity or 0)
