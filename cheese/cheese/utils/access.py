# Copyright (c) 2026
# License: MIT
"""API-level access checks for tenant-scoped Cheese resources."""

from typing import Optional

import frappe

from cheese.api.v1.user_controller import _get_current_user_company


def _slot_company(slot) -> Optional[str]:
	company = getattr(slot, "company", None)
	if company:
		return company
	if slot.experience:
		return frappe.db.get_value("Cheese Experience", slot.experience, "company")
	return None


def assert_experience_access(experience_id: str) -> None:
	"""Raise PermissionError when the current user cannot access this experience."""
	user_company = _get_current_user_company()
	if not user_company:
		return
	exp_company = frappe.db.get_value("Cheese Experience", experience_id, "company")
	if exp_company != user_company:
		frappe.throw(frappe._("Unauthorized"), frappe.PermissionError)


def assert_slot_access(slot_id: str):
	"""Raise PermissionError when the current user cannot access this slot.

	A slot without an owning company on either the slot itself or its parent
	experience is treated as ownerless — any logged-in user with the doctype
	role can act on it. This avoids blocking establishment users from deleting
	legacy slots created before the `company` field was wired up (issue #265).
	"""
	slot = frappe.get_doc("Cheese Experience Slot", slot_id)
	user_company = _get_current_user_company()
	if not user_company:
		return slot
	company = _slot_company(slot)
	if not company:
		return slot
	if company != user_company:
		frappe.throw(frappe._("Unauthorized"), frappe.PermissionError)
	return slot
