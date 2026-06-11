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

	def autoname(self):
		"""Set document name to the contact's full_name"""
		contact_name = self.contact
		if self.contact:
			full_name = frappe.db.get_value("Cheese Contact", self.contact, "full_name")
			if full_name:
				contact_name = full_name

		# Ensure uniqueness by appending a counter if needed
		base_name = contact_name
		name = base_name
		counter = 1
		while frappe.db.exists("Cheese Lead", name):
			name = f"{base_name}-{counter}"
			counter += 1

		self.name = name

	def load_from_db(self):
		"""Apply tenant filtering after every DB load (API + desk)."""
		super().load_from_db()
		from cheese.cheese.utils.events import filter_lead_companies_for_user

		filter_lead_companies_for_user(self)

	def validate(self):
		"""Validate per-establishment status rows and parent field sync."""
		from cheese.cheese.utils.lead_company import (
			ACTIVE_LEAD_STATUSES,
			check_active_lead_for_company,
			sync_company_rows_from_parent,
			sync_parent_from_primary_company,
			validate_status_transition,
		)

		sync_company_rows_from_parent(self)

		if not self.is_new():
			previous_parent = frappe.db.get_value("Cheese Lead", self.name, "status")
			validate_status_transition(previous_parent, self.status)

		for row in self.get("companies") or []:
			previous = (
				frappe.db.get_value("Cheese Lead Company", row.name, "status")
				if row.name
				else row.status
			)
			if previous and previous != row.status:
				validate_status_transition(previous, row.status)
			if row.status in ACTIVE_LEAD_STATUSES:
				check_active_lead_for_company(
					self.contact,
					row.company,
					self.name if not self.is_new() else None,
				)

		if self.status in ACTIVE_LEAD_STATUSES and self.get("company"):
			check_active_lead_for_company(
				self.contact,
				self.company,
				self.name if not self.is_new() else None,
			)

		sync_parent_from_primary_company(self)

	def on_update(self):
		"""Update last interaction timestamp"""
		if self.has_value_changed("status"):
			self.last_interaction_at = now_datetime()
