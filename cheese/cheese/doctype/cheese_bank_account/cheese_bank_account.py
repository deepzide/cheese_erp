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
		entity_id: DF.DynamicLink
		entity_type: DF.Literal["Cheese Route", "Company"]
		holder: DF.Data
		iban: DF.Data | None
		route: DF.Link | None
		status: DF.Literal["ACTIVE", "INACTIVE"]
	# end: auto-generated types

	def validate(self):
		"""Validate bank account data"""
		self.title = f"{self.bank} - {self.account}"
		self.sync_legacy_route_field()
		self.validate_entity()

		# Validate IBAN format if provided
		if self.iban:
			self.validate_iban()

		self.validate_immutable_fields()

		# Ensure only one active bank account per entity
		if self.status == "ACTIVE":
			existing = frappe.db.exists(
				"Cheese Bank Account",
				{
					"entity_type": self.entity_type,
					"entity_id": self.entity_id,
					"status": "ACTIVE",
					"name": ["!=", self.name],
				},
			)
			if existing:
				frappe.throw(
					_("{0} {1} already has an active bank account").format(
						self.entity_type, self.entity_id
					)
				)

	def sync_legacy_route_field(self):
		# Backward compatibility for legacy docs and callers still using route.
		if self.entity_type == "Company":
			# Establishment-linked accounts must not retain a legacy route link.
			self.route = None
		elif self.entity_type == "Cheese Route" and self.entity_id:
			self.route = self.entity_id

		if self.route and not self.entity_type:
			self.entity_type = "Cheese Route"
		if self.route and not self.entity_id:
			self.entity_id = self.route

	def validate_entity(self):
		if not self.entity_type or not self.entity_id:
			frappe.throw(_("Entity Type and Entity are required"))
		if not frappe.db.exists(self.entity_type, self.entity_id):
			frappe.throw(_("{0} {1} does not exist").format(self.entity_type, self.entity_id))

	def validate_immutable_fields(self):
		if self.is_new():
			return

		previous = self.get_doc_before_save()
		if not previous:
			return

		# Allow editing bank account details until a deposit is linked to this account.
		if not self.has_linked_transactions():
			return

		for fieldname in ("holder", "bank", "account", "iban", "currency", "entity_type", "entity_id"):
			if self.get(fieldname) != previous.get(fieldname):
				frappe.throw(
					_("Field {0} cannot be modified after this bank account is used in deposits").format(
						frappe.bold(self.meta.get_label(fieldname))
					)
				)

	def before_rename(self, old_name, new_name, merge=False):
		"""Allow rename only when no deposit references this account yet."""
		if self.has_linked_transactions():
			frappe.throw(
				_("This bank account cannot be renamed because it is already linked to deposit records.")
			)

	def on_trash(self):
		"""Runs before Frappe link checks; block delete when deposits reference this account."""
		if self.has_linked_transactions():
			ref_count = frappe.db.count("Cheese Deposit", {"bank_account": self.name})
			frappe.throw(
				_(
					"Cannot delete bank account: it is linked to {0} deposit(s). "
					"Remove or change the bank account on those deposits first."
				).format(ref_count)
			)

	def has_linked_transactions(self):
		return bool(
			frappe.db.exists(
				"Cheese Deposit",
				{
					"bank_account": self.name,
				},
			)
		)

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
