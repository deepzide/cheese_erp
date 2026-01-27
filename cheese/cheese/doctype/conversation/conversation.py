# Copyright (c) 2024
# License: MIT

import frappe
from frappe import _
from frappe.model.document import Document


class Conversation(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		channel: DF.Literal["WhatsApp", "Web", "Agent"]
		contact: DF.Link
		highlights_json: DF.JSON | None
		lead: DF.Link | None
		route_booking: DF.Link | None
		status: DF.Literal["ACTIVE", "PAUSED", "CLOSED"]
		summary: DF.TextEditor | None
		ticket: DF.Link | None
	# end: auto-generated types

	def validate(self):
		"""Enforce one active conversation per Contact + Channel"""
		if self.status == "ACTIVE":
			self.check_active_conversation()

	def check_active_conversation(self):
		"""Check if there's already an active conversation for this contact + channel"""
		filters = {
			"contact": self.contact,
			"channel": self.channel,
			"status": "ACTIVE"
		}
		
		if not self.is_new():
			filters["name"] = ["!=", self.name]

		existing = frappe.get_all("Conversation", filters=filters, limit=1)
		
		if existing:
			frappe.throw(
				_("An active conversation already exists for this Contact ({0}) and Channel ({1})").format(
					self.contact, self.channel
				),
				frappe.ValidationError
			)
