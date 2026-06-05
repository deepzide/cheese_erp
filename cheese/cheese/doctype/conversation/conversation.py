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
		company: DF.Link | None
	# end: auto-generated types

	def before_insert(self):
		# Conversations are company-agnostic; tenant scoping lives on Cheese Message.
		# Frappe otherwise auto-fills Link defaults from the session user's Company.
		self.company = None

	def validate(self):
		"""Enforce one active conversation per Contact + Channel (+ Company when set)."""
		if self.status == "ACTIVE":
			self.check_active_conversation()

	def check_active_conversation(self):
		"""Check if there's already an active conversation for this contact + channel scope."""
		filters = {
			"contact": self.contact,
			"channel": self.channel,
			"status": "ACTIVE"
		}
		if self.company:
			filters["company"] = self.company
		
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
