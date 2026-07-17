# Copyright (c) 2024
# License: MIT

import frappe
from frappe import _
from frappe.model.document import Document

# Stays in these statuses hold the room (block overlapping stays)
ACTIVE_STAY_STATUSES = ("RESERVED", "OCCUPIED", "BLOCKED")


class CheeseRoomStay(Document):
	def validate(self):
		if str(self.check_out) <= str(self.check_in):
			frappe.throw(_("Check-out must be after check-in"))
		if not self.company:
			self.company = frappe.db.get_value("Cheese Hotel Room", self.room, "company")

		if self.status not in ACTIVE_STAY_STATUSES:
			return
		# Active stays of the same room must not overlap (half-open ranges)
		overlapping = frappe.get_all(
			"Cheese Room Stay",
			filters={
				"room": self.room,
				"name": ["!=", self.name or ""],
				"status": ["in", list(ACTIVE_STAY_STATUSES)],
				"check_in": ["<", self.check_out],
				"check_out": [">", self.check_in],
			},
			fields=["name", "status", "check_in", "check_out"],
			limit=1,
		)
		if overlapping:
			row = overlapping[0]
			frappe.throw(
				_("Room already has an active stay {0} ({1} {2} -> {3}) overlapping these dates").format(
					row.name, row.status, row.check_in, row.check_out
				)
			)
