# Copyright (c) 2024
# License: MIT

import frappe
from frappe.model.document import Document
from frappe.utils import getdate


class CheeseCustomPrice(Document):
	"""Layer-4 price: a set of prices that overrides the experience's layer-2
	(matrix) or layer-1 (base) prices during a date range. Two flags control
	whether the layer-3 adjustments still apply on top: participates_in_promotions
	and affected_by_seasons."""

	def validate(self):
		if self.date_from and self.date_to and getdate(self.date_to) < getdate(self.date_from):
			frappe.throw("'To' date must be on or after 'From' date")
		if self.experience and not self.company:
			self.company = frappe.db.get_value("Cheese Experience", self.experience, "company")
