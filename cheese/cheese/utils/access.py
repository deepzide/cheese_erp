# Copyright (c) 2026
# License: MIT
"""API-level access checks for tenant-scoped Cheese resources.

These helpers provide a single, consistent enforcement layer for the custom
whitelisted API endpoints. The custom endpoints use ``frappe.get_all`` /
``frappe.get_doc`` / ``frappe.db.*`` which bypass the doctype-level
``permission_query_conditions`` / ``has_permission`` hooks, so isolation must
be applied explicitly here.

Super admins (Route Administrator / System Manager / Central Admin /
Administrator) are never scoped; establishment-level (Level 2) users are
scoped to their single assigned company.
"""

from typing import Optional

import frappe

from cheese.api.v1.user_controller import _get_current_user_company
from cheese.cheese.utils.permissions import _is_super_admin, get_user_companies


def current_scope_company() -> Optional[str]:
	"""Return the company the current user is scoped to, or ``None`` for super admins.

	A scoped user with no assigned company also returns ``None`` from
	``_get_current_user_company``; callers that must hide everything in that
	case should use :func:`scope_filters` which inserts an impossible filter.
	"""
	return _get_current_user_company()


def _user_companies() -> list:
	"""All companies the current (non-super-admin) user may access."""
	return get_user_companies(frappe.session.user)


def scope_filters(filters: Optional[dict] = None, field: str = "company") -> dict:
	"""Inject a company constraint into a ``frappe.get_all`` filters dict.

	* Super admins: filters returned unchanged.
	* Scoped user with a company: ``filters[field] = company``.
	* Scoped user with NO company: ``filters[field]`` is set to an impossible
	  value so the query returns nothing (fail closed).
	"""
	filters = dict(filters or {})
	if _is_super_admin(frappe.session.user):
		return filters
	company = _get_current_user_company()
	if company:
		filters[field] = company
	else:
		filters[field] = "__no_company_for_user__"
	return filters


def assert_company_value(company: Optional[str]) -> None:
	"""Block parameter-override leaks.

	Raise ``PermissionError`` when a scoped user passes a ``company`` /
	``establishment_id`` that is not one of their assigned companies. Super
	admins may pass any company.
	"""
	if _is_super_admin(frappe.session.user):
		return
	if not company:
		return
	allowed = set(_user_companies())
	if company not in allowed:
		frappe.throw(frappe._("Unauthorized"), frappe.PermissionError)


def _resolve_record_company(doctype: str, name: str) -> Optional[str]:
	"""Resolve the owning company of a record across the known link shapes.

	Mirrors the SQL relationships used by ``permissions.py``:
	  * direct ``company`` field (Cheese Ticket / Experience / Slot / etc.)
	  * Cheese Route          -> via a linked experience's company
	  * Cheese Route Booking  -> via a child ticket's company
	  * dynamic entity records (Cheese Deposit / Document / Bank Account)
	    -> resolve entity_type/entity_id
	"""
	meta = frappe.get_meta(doctype)

	if meta.has_field("company"):
		return frappe.db.get_value(doctype, name, "company")

	if doctype == "Cheese Route":
		exp = frappe.get_all(
			"Cheese Route Experience",
			filters={"parent": name, "parenttype": "Cheese Route"},
			pluck="experience",
			limit=1,
		)
		if exp:
			return frappe.db.get_value("Cheese Experience", exp[0], "company")
		return None

	if doctype == "Cheese Route Booking":
		ticket = frappe.get_all(
			"Cheese Route Booking Ticket",
			filters={"parent": name, "parenttype": "Cheese Route Booking"},
			pluck="ticket",
			limit=1,
		)
		if ticket:
			return frappe.db.get_value("Cheese Ticket", ticket[0], "company")
		return None

	entity_type, entity_id = frappe.db.get_value(
		doctype, name, ["entity_type", "entity_id"]
	) or (None, None)
	if entity_type and entity_id:
		return _resolve_entity_company(entity_type, entity_id)
	return None


def _resolve_entity_company(entity_type: str, entity_id: str) -> Optional[str]:
	"""Resolve company for a dynamic entity_type/entity_id pair."""
	if entity_type == "Company":
		return entity_id
	if entity_type in ("Cheese Experience", "Cheese Ticket"):
		return frappe.db.get_value(entity_type, entity_id, "company")
	if entity_type == "Cheese Route":
		return _resolve_record_company("Cheese Route", entity_id)
	if entity_type == "Cheese Route Booking":
		return _resolve_record_company("Cheese Route Booking", entity_id)
	return None


def assert_record_access(doctype: str, name: str) -> None:
	"""Raise ``PermissionError`` when the current user may not access ``name``.

	Ownerless records (no resolvable company) are allowed through, matching the
	lenient behavior of :func:`assert_slot_access` for legacy data.

	Conversations are company-agnostic; establishment users may access a
	conversation only when it contains messages tagged with their company.
	"""
	if _is_super_admin(frappe.session.user):
		return
	user_company = _get_current_user_company()
	if not user_company:
		return

	if doctype == "Conversation":
		if not frappe.db.exists(
			"Cheese Message",
			{"conversation": name, "company": user_company},
		):
			frappe.throw(frappe._("Unauthorized"), frappe.PermissionError)
		return

	record_company = _resolve_record_company(doctype, name)
	if not record_company:
		return
	if record_company != user_company:
		frappe.throw(frappe._("Unauthorized"), frappe.PermissionError)


def assert_contact_access(contact_id: str) -> None:
	"""Raise ``PermissionError`` when the current user may not access a contact.

	Cheese Contact uses a many-to-many ``companies`` child table. A contact
	with no company links is treated as ownerless and allowed through (legacy
	data); otherwise at least one linked company must match the user's company.
	"""
	if _is_super_admin(frappe.session.user):
		return
	user_company = _get_current_user_company()
	if not user_company:
		return
	linked = frappe.get_all(
		"Cheese Contact Company",
		filters={"parent": contact_id, "parenttype": "Cheese Contact"},
		pluck="company",
	)
	if linked and user_company not in linked:
		frappe.throw(frappe._("Unauthorized"), frappe.PermissionError)


def assert_entity_access(entity_type: str, entity_id: str) -> None:
	"""Ownership assert for a dynamic entity_type/entity_id pair."""
	if _is_super_admin(frappe.session.user):
		return
	user_company = _get_current_user_company()
	if not user_company:
		return
	record_company = _resolve_entity_company(entity_type, entity_id)
	if not record_company:
		return
	if record_company != user_company:
		frappe.throw(frappe._("Unauthorized"), frappe.PermissionError)


def assert_route_access(route_id: str) -> None:
	"""Raise ``PermissionError`` when the current user may not access a route.

	Routes can be cross-establishment: a route is visible to a user when at
	least one of its experiences belongs to the user's company (mirrors
	``permissions.has_route_permission``). Routes with no experiences are
	treated as ownerless and allowed through.
	"""
	if _is_super_admin(frappe.session.user):
		return
	user_company = _get_current_user_company()
	if not user_company:
		return
	exp_ids = frappe.get_all(
		"Cheese Route Experience",
		filters={"parent": route_id, "parenttype": "Cheese Route"},
		pluck="experience",
	)
	if not exp_ids:
		return
	exp_companies = set(
		frappe.get_all(
			"Cheese Experience",
			filters={"name": ["in", exp_ids]},
			pluck="company",
		)
	)
	if user_company not in exp_companies:
		frappe.throw(frappe._("Unauthorized"), frappe.PermissionError)


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
