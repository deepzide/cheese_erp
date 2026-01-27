# Copyright (c) 2024
# License: MIT

import frappe
from frappe import _
from frappe.model.document import Document


class CheeseBookingPolicy(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		cancel_until_hours_before: DF.Int | None
		experience: DF.Link
		min_hours_before_booking: DF.Int | None
		modify_until_hours_before: DF.Int | None
	# end: auto-generated types

	def validate(self):
		"""Validate policy data"""
		# Validate experience exists
		if self.experience and not frappe.db.exists("Cheese Experience", self.experience):
			frappe.throw(_("Experience {0} does not exist").format(self.experience))

		# Validate hours are non-negative
		if self.cancel_until_hours_before is not None and self.cancel_until_hours_before < 0:
			frappe.throw(_("Cancel Until Hours Before must be non-negative"))

		if self.modify_until_hours_before is not None and self.modify_until_hours_before < 0:
			frappe.throw(_("Modify Until Hours Before must be non-negative"))

		if self.min_hours_before_booking is not None and self.min_hours_before_booking < 0:
			frappe.throw(_("Min Hours Before Booking must be non-negative"))
