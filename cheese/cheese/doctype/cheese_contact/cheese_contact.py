# Copyright (c) 2024
# License: MIT

import frappe
from frappe import _
from frappe.model.document import Document


class CheeseContact(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		do_not_contact: DF.Check
		email: DF.Data | None
		full_name: DF.Data
		opt_in_status: DF.Literal["OPT_IN", "OPT_OUT"]
		phone: DF.Data | None
		preferred_channel: DF.Literal["", "WhatsApp", "Email", "SMS", "Phone", "Web"]
		preferred_language: DF.Literal[
			"", "English", "Spanish", "French", "German", "Italian", "Portuguese", "Other"
		]
		privacy_notes: DF.SmallText | None
		erpnext_contact: DF.Link | None
	# end: auto-generated types

	def validate(self):
		"""Validate contact data and enforce deduplication rules"""
		# Ensure at least phone or email is provided
		if not self.phone and not self.email:
			frappe.throw(_("Either Phone or Email must be provided"))

		# Check for duplicates by phone OR email
		self.check_duplicates()

	def check_duplicates(self):
		"""Check for duplicate contacts by phone or email"""
		or_filters = []
		
		if self.phone:
			or_filters.append(["phone", "=", self.phone])
		if self.email:
			or_filters.append(["email", "=", self.email])
		
		if not or_filters:
			return

		# Exclude current document
		filters = {}
		if not self.is_new():
			filters["name"] = ["!=", self.name]

		duplicates = frappe.get_all(
			"Cheese Contact",
			filters=filters,
			or_filters=or_filters,
			limit=1
		)
		
		if duplicates:
			frappe.throw(
				_("Contact with this phone or email already exists: {0}").format(
					duplicates[0].name
				),
				frappe.DuplicateEntryError
			)
