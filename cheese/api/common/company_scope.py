# Copyright (c) 2024
# License: MIT

import frappe
from frappe import _


def resolve_company_id(
	company_id=None,
	establishment_id=None,
	company=None,
	*,
	required=False,
	experience_id=None,
	ticket_id=None,
	route_id=None,
):
	"""
	Resolve establishment/company id from bot API aliases.

	Accepts company_id, establishment_id, or company (all map to Company.name).
	Optionally infers from experience, ticket, or route when not required.
	"""
	resolved = company_id or establishment_id or company

	if not resolved and experience_id:
		resolved = frappe.db.get_value("Cheese Experience", experience_id, "company")

	if not resolved and ticket_id:
		resolved = frappe.db.get_value("Cheese Ticket", ticket_id, "company")

	if not resolved and route_id:
		experience_names = frappe.get_all(
			"Cheese Route Experience",
			filters={"parent": route_id},
			pluck="experience",
			limit=1,
		)
		if experience_names:
			resolved = frappe.db.get_value("Cheese Experience", experience_names[0], "company")

	if required and not resolved:
		frappe.throw(_("company_id is required"))

	if resolved and not frappe.db.exists("Company", resolved):
		frappe.throw(_("Establishment {0} not found").format(resolved))

	return resolved


def validate_company_matches_experience(company_id, experience_id):
	"""Ensure the requested establishment owns the experience."""
	if not company_id or not experience_id:
		return
	exp_company = frappe.db.get_value("Cheese Experience", experience_id, "company")
	if exp_company and company_id != exp_company:
		frappe.throw(
			_("Experience {0} does not belong to establishment {1}").format(experience_id, company_id)
		)


def apply_company(doc, company_id, *, overwrite=False):
	"""Set company on a document when the field exists and is empty."""
	if not company_id or not doc:
		return
	if not doc.meta.has_field("company"):
		return
	if overwrite or not doc.get("company"):
		doc.company = company_id


def company_from_form_dict():
	"""Read company aliases from frappe form_dict / JSON body."""
	form = getattr(frappe.local, "form_dict", None) or {}
	body = {}
	if getattr(frappe, "request", None):
		body = frappe.request.get_json(silent=True) or {}
	return {
		"company_id": form.get("company_id") or body.get("company_id"),
		"establishment_id": form.get("establishment_id") or body.get("establishment_id"),
		"company": form.get("company") or body.get("company"),
	}
