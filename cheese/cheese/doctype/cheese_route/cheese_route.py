# Copyright (c) 2024
# License: MIT

import frappe
from frappe import _
from frappe.model.document import Document


def experience_combination_key(exp_ids):
	"""Multiset fingerprint for route experiences (order-independent)."""
	if not exp_ids:
		return None
	return tuple(sorted(exp_ids))


def find_duplicate_route_for_experience_combination(exp_ids, exclude_route=None):
	"""Return another non-archived route name with the same experience multiset, if any."""
	key = experience_combination_key(exp_ids)
	if not key:
		return None

	for route_name in frappe.get_all("Cheese Route", filters={"status": ["!=", "ARCHIVED"]}, pluck="name"):
		if exclude_route and route_name == exclude_route:
			continue
		other_ids = frappe.get_all(
			"Cheese Route Experience",
			filters={"parent": route_name},
			pluck="experience",
		)
		if experience_combination_key(other_ids) == key:
			return route_name
	return None


class CheeseRoute(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		deposit_required: DF.Check
		deposit_ttl_hours: DF.Int | None
		deposit_type: DF.Literal["", "Amount", "%"]
		deposit_value: DF.Float | None
		description: DF.TextEditor | None
		name: DF.Data
		price: DF.Currency | None
		price_mode: DF.Literal["", "Manual", "Sum"]
		status: DF.Literal["ONLINE", "OFFLINE", "ARCHIVED"]
		experiences: DF.Table[DF.Dict]
	# end: auto-generated types

	def validate(self):
		"""Validate route data"""
		# Validate deposit settings
		if self.deposit_required:
			if not self.deposit_type:
				frappe.throw(_("Deposit Type is required when Deposit Required is checked"))
			if not self.deposit_value:
				frappe.throw(_("Deposit Value is required when Deposit Required is checked"))
			if not self.deposit_ttl_hours:
				frappe.throw(_("Deposit TTL Hours is required when Deposit Required is checked"))

		# Validate price mode
		if self.price_mode == "Manual" and not self.price:
			frappe.throw(_("Price is required when Price Mode is Manual"))

		# No two active routes may share the exact same combination of experiences (multiset).
		# Archived routes are ignored so their combinations can be reused.
		if self.status != "ARCHIVED":
			exp_ids = [row.experience for row in self.experiences if getattr(row, "experience", None)]
			if exp_ids:
				duplicate = find_duplicate_route_for_experience_combination(exp_ids, exclude_route=self.name)
				if duplicate:
					frappe.throw(
						_("Another route already uses this exact combination of experiences: {0}").format(
							duplicate
						)
					)
