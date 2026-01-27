# Copyright (c) 2024
# License: MIT

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import now_datetime


class CheeseLead(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		contact: DF.Link
		conversation: DF.Link | None
		interest_type: DF.Literal["", "Route", "Experience"]
		last_interaction_at: DF.Datetime | None
		lost_reason: DF.Literal["", "No Response", "Price Too High", "Not Interested", "Other"]
		status: DF.Literal["OPEN", "IN_PROGRESS", "CONVERTED", "LOST", "DISCARDED"]
	# end: auto-generated types

	def validate(self):
		"""Enforce one active lead per contact and validate status transitions"""
		# Check for active leads
		if self.status in ["OPEN", "IN_PROGRESS"]:
			self.check_active_lead()
		
		# Validate status transitions
		self.validate_status_transition()

	def check_active_lead(self):
		"""Check if there's already an active lead for this contact"""
		filters = {
			"contact": self.contact,
			"status": ["in", ["OPEN", "IN_PROGRESS"]]
		}
		
		if not self.is_new():
			filters["name"] = ["!=", self.name]

		existing = frappe.get_all("Cheese Lead", filters=filters, limit=1)
		
		if existing:
			frappe.throw(
				_("An active lead already exists for this Contact: {0}").format(
					existing[0].name
				),
				frappe.ValidationError
			)

	def validate_status_transition(self):
		"""Validate status transitions"""
		if self.is_new():
			return
		
		# Get previous status
		previous_status = frappe.db.get_value("Cheese Lead", self.name, "status")
		
		# Define valid transitions
		valid_transitions = {
			"OPEN": ["IN_PROGRESS", "CONVERTED", "LOST", "DISCARDED"],
			"IN_PROGRESS": ["OPEN", "CONVERTED", "LOST", "DISCARDED"],
			"CONVERTED": [],  # Terminal state
			"LOST": [],  # Terminal state
			"DISCARDED": []  # Terminal state
		}
		
		if previous_status and self.status != previous_status:
			if self.status not in valid_transitions.get(previous_status, []):
				frappe.throw(
					_("Invalid status transition from {0} to {1}").format(
						previous_status, self.status
					),
					frappe.ValidationError
				)

	def on_update(self):
		"""Update last interaction timestamp"""
		if self.has_value_changed("status"):
			self.last_interaction_at = now_datetime()
