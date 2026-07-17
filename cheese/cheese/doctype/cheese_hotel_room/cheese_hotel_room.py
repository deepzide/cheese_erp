# Copyright (c) 2024
# License: MIT

import frappe
from frappe import _
from frappe.model.document import Document


class CheeseHotelRoom(Document):
	def validate(self):
		exp_type, exp_company = frappe.db.get_value(
			"Cheese Experience", self.room_type, ["experience_type", "company"]
		) or (None, None)
		if exp_type != "HOTEL":
			frappe.throw(_("Room type must be a HOTEL experience"))
		if exp_company and self.company and exp_company != self.company:
			frappe.throw(_("Room type belongs to {0}, not {1}").format(exp_company, self.company))

		duplicate = frappe.db.exists(
			"Cheese Hotel Room",
			{
				"company": self.company,
				"room_number": self.room_number,
				"name": ["!=", self.name or ""],
			},
		)
		if duplicate:
			frappe.throw(
				_("Room number {0} already exists in this hotel: {1}").format(self.room_number, duplicate)
			)
