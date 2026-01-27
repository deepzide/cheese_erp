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
		min_acts_for_route_price: DF.Int | None
		name: DF.Data
		package_mode: DF.Literal["", "Package", "Public", "Both"]
		route_price: DF.Currency | None
		status: DF.Literal["ONLINE", "OFFLINE"]
	# end: auto-generated types

	def validate(self):
		"""Validate experience data"""
		# Validate company exists
		if self.company and not frappe.db.exists("Company", self.company):
			frappe.throw(_("Company {0} does not exist").format(self.company))

		# Validate deposit settings
		if self.deposit_required:
			if not self.deposit_type:
				frappe.throw(_("Deposit Type is required when Deposit Required is checked"))
			if not self.deposit_value:
				frappe.throw(_("Deposit Value is required when Deposit Required is checked"))
			if not self.deposit_ttl_hours:
				frappe.throw(_("Deposit TTL Hours is required when Deposit Required is checked"))

		# Validate pricing
		if self.package_mode == "Package" and not self.route_price:
			frappe.throw(_("Route Price is required when Package Mode is Package"))
