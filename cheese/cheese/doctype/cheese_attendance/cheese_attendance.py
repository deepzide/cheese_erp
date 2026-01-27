# Copyright (c) 2024
# License: MIT

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import now_datetime


class CheeseAttendance(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		checked_in_at: DF.Datetime
		method: DF.Literal["QR", "MANUAL"]
		operator: DF.Link | None
		status: DF.Literal["PRESENT", "NO_SHOW"]
		ticket: DF.Link
	# end: auto-generated types

	def validate(self):
		"""Validate attendance data"""
		# Set checked_in_at if not provided
		if not self.checked_in_at:
			self.checked_in_at = now_datetime()

		# Set operator if not provided (for manual check-ins)
		if not self.operator and self.method == "MANUAL":
			self.operator = frappe.session.user

		# Validate ticket exists and is in correct status
		if self.ticket:
			ticket = frappe.get_doc("Cheese Ticket", self.ticket)
			if ticket.status not in ["CONFIRMED", "CHECKED_IN"]:
				frappe.throw(
					_("Ticket {0} must be CONFIRMED or CHECKED_IN to create attendance").format(
						self.ticket
					)
				)

	def on_submit(self):
		"""Handle attendance submission"""
		# Update ticket status to CHECKED_IN
		if self.ticket:
			ticket = frappe.get_doc("Cheese Ticket", self.ticket)
			if ticket.status == "CONFIRMED":
				ticket.check_in()
