# Copyright (c) 2024
# License: MIT

import frappe
from frappe import _
from frappe.model.document import Document
import re


class CheeseBankAccount(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		account: DF.Data
		bank: DF.Data
		currency: DF.Link
		holder: DF.Data
		iban: DF.Data | None
		route: DF.Link
		status: DF.Literal["ACTIVE", "INACTIVE"]
	# end: auto-generated types

	def validate(self):
		"""Validate bank account data"""
		# Validate route exists
		if self.route and not frappe.db.exists("Cheese Route", self.route):
			frappe.throw(_("Route {0} does not exist").format(self.route))

		# Validate IBAN format if provided
		if self.iban:
			self.validate_iban()

		# Ensure only one active bank account per route
		if self.status == "ACTIVE":
			existing = frappe.db.exists(
				"Cheese Bank Account",
				{
					"route": self.route,
					"status": "ACTIVE",
					"name": ["!=", self.name]
				}
			)
			if existing:
				frappe.throw(_("Route {0} already has an active bank account").format(self.route))

	def validate_iban(self):
		"""Validate IBAN format (basic validation)"""
		# Remove spaces and convert to uppercase
		iban = self.iban.replace(" ", "").upper()

		# Basic IBAN format: 2 letters (country code) + 2 digits (check digits) + up to 30 alphanumeric characters
		iban_pattern = re.compile(r"^[A-Z]{2}[0-9]{2}[A-Z0-9]{4,30}$")
		
		if not iban_pattern.match(iban):
			frappe.throw(_("Invalid IBAN format. IBAN should be in format: CC00XXXX... (2 letters, 2 digits, 4-30 alphanumeric)"))

		# Store normalized IBAN
		self.iban = iban
