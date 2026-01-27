# Copyright (c) 2024
# License: MIT

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import add_to_date, now_datetime
import secrets
import string


class CheeseQRToken(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		expires_at: DF.Datetime | None
		status: DF.Literal["ACTIVE", "USED", "EXPIRED", "REVOKED"]
		ticket: DF.Link
		token: DF.Data
	# end: auto-generated types

	def validate(self):
		"""Validate QR token data"""
		# Generate token if new
		if self.is_new() and not self.token:
			self.token = self.generate_token()
			self.status = "ACTIVE"
			# Default expiration: 7 days
			if not self.expires_at:
				self.expires_at = add_to_date(now_datetime(), days=7, as_string=False)

		# Check expiration
		if self.expires_at and self.expires_at < now_datetime():
			if self.status == "ACTIVE":
				self.status = "EXPIRED"

	def generate_token(self):
		"""Generate a secure random token"""
		alphabet = string.ascii_letters + string.digits
		return ''.join(secrets.choice(alphabet) for _ in range(32))

	@frappe.whitelist()
	def revoke(self):
		"""Revoke an ACTIVE token"""
		if self.status != "ACTIVE":
			frappe.throw(_("Only ACTIVE tokens can be revoked"))

		self.status = "REVOKED"
		self.save()

	@frappe.whitelist()
	def mark_used(self):
		"""Mark token as used"""
		if self.status != "ACTIVE":
			frappe.throw(_("Only ACTIVE tokens can be marked as used"))

		self.status = "USED"
		self.save()
