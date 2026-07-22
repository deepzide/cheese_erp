# Copyright (c) 2024
# License: MIT

import frappe
from frappe import _
from frappe.model.document import Document


class CheeseExperience(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		company: DF.Link
		deposit_required: DF.Check
		deposit_ttl_hours: DF.Int | None
		deposit_type: DF.Literal["", "Amount", "%"]
		deposit_value: DF.Float | None
		description: DF.TextEditor | None
		individual_price: DF.Currency | None
		manual_confirmation: DF.Check
		name: DF.Data
		package_mode: DF.Literal["", "Establishment", "Route", "Both"]
		route_price: DF.Currency | None
		status: DF.Literal["ONLINE", "OFFLINE"]
	# end: auto-generated types

	def validate(self):
		"""Validate experience data"""
		# Validate company exists
		if self.company and not frappe.db.exists("Company", self.company):
			frappe.throw(_("Company {0} does not exist").format(self.company))

		# Price lines: day scopes must not overlap for the same age group.
		from cheese.cheese.utils.seasonal_pricing import validate_price_lines_day_overlap

		validate_price_lines_day_overlap(self)

		# Validate deposit settings
		if self.deposit_required:
			if not self.deposit_type:
				frappe.throw(_("Deposit Type is required when Deposit Required is checked"))
			if not self.deposit_value:
				frappe.throw(_("Deposit Value is required when Deposit Required is checked"))
			
			if self.experience_type == "HOTEL":
				if not self.deposit_ttl_days:
					frappe.throw(_("Deposit TTL Days is required when Deposit Required is checked for Hotels"))
			else:
				if not self.deposit_ttl_hours:
					frappe.throw(_("Deposit TTL Hours is required when Deposit Required is checked for Activities"))

		if self.experience_type == "HOTEL":
			if not self.price_per_night:
				frappe.throw(_("Price per Night is required for Hotel experiences"))
			from frappe.utils import cint
			if self.is_room:
				if not self.room_size or cint(self.room_size) < 1:
					frappe.throw(_("Room Size must be at least 1 for room experiences"))
				self.max_occupancy_per_unit = cint(self.room_size)
			if not self.max_occupancy_per_unit or cint(self.max_occupancy_per_unit) < 1:
				frappe.throw(_("Max Occupancy per Unit must be at least 1 for Hotel experiences"))
		else:
			self.is_room = 0
			self.room_size = 0
			# Validate pricing for activities
			if self.package_mode == "Route" and not self.route_price:
				frappe.throw(_("Route Price is required when Package Mode is Route"))

		self._normalize_price_lines()

	def _normalize_price_lines(self):
		"""A price line may only carry the dimensions the experience differentiates by.

		Without weekday differentiation every line applies to every day; without
		age group differentiation every line applies to every age.
		"""
		from frappe.utils import cint

		for line in self.get("price_lines") or []:
			if not cint(self.differentiate_by_weekday):
				line.day_type = "ALL"
			if not cint(self.differentiate_by_age_group):
				line.age_group = None
