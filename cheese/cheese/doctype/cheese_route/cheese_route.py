# Copyright (c) 2024
# License: MIT

import frappe
from frappe import _
from frappe.model.document import Document


class CheeseRoute(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		deposit_required: DF.Check
		deposit_ttl_hours: DF.Int | None
		deposit_type: DF.Literal["", "Amount", "%"]
		deposit_value: DF.Float | None
		description: DF.TextEditor | None
		name: DF.Data
		price: DF.Currency | None
		price_mode: DF.Literal["", "Manual", "Sum"]
		status: DF.Literal["ONLINE", "OFFLINE", "ARCHIVED"]
		experiences: DF.Table[DF.Dict]
	# end: auto-generated types

	def validate(self):
		"""Validate route data"""
		# Validate deposit settings
		if self.deposit_required:
			if not self.deposit_type:
				frappe.throw(_("Deposit Type is required when Deposit Required is checked"))
			if not self.deposit_value:
				frappe.throw(_("Deposit Value is required when Deposit Required is checked"))
			if not self.deposit_ttl_hours:
				frappe.throw(_("Deposit TTL Hours is required when Deposit Required is checked"))

		# Validate price mode
		if self.price_mode == "Manual" and not self.price:
			frappe.throw(_("Price is required when Price Mode is Manual"))
