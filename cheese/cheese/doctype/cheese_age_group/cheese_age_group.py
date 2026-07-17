# Copyright (c) 2024
# License: MIT

import frappe
from frappe import _
from frappe.model.document import Document


class CheeseAgeGroup(Document):
	def validate(self):
		if self.min_age is None or self.max_age is None:
			frappe.throw(_("Min and max age are required"))
		if self.min_age < 0 or self.max_age < self.min_age:
			frappe.throw(_("Invalid age range: min must be >= 0 and max >= min"))

		# Ranges must not overlap within the same company
		others = frappe.get_all(
			"Cheese Age Group",
			filters={"company": self.company, "name": ["!=", self.name or ""]},
			fields=["name", "group_name", "min_age", "max_age"],
		)
		for row in others:
			if self.min_age <= row.max_age and self.max_age >= row.min_age:
				frappe.throw(
					_("Age range overlaps with group {0} ({1}-{2})").format(
						row.group_name, row.min_age, row.max_age
					)
				)
