# Copyright (c) 2026
# License: MIT
"""Per-establishment status helpers for Cheese Lead company child rows."""

from typing import Optional

import frappe
from frappe.utils import now_datetime

ACTIVE_LEAD_STATUSES = ("OPEN", "IN_PROGRESS")
TERMINAL_LEAD_STATUSES = ("CONVERTED", "LOST", "DISCARDED")
VALID_STATUS_TRANSITIONS = {
	"OPEN": ["IN_PROGRESS", "CONVERTED", "LOST", "DISCARDED"],
	"IN_PROGRESS": ["OPEN", "CONVERTED", "LOST", "DISCARDED"],
	"CONVERTED": [],
	"LOST": [],
	"DISCARDED": [],
}


def find_company_row(doc, company: Optional[str]):
	if not company:
		return None
	for row in doc.get("companies") or []:
		if row.company == company:
			return row
	return None


def ensure_company_row(doc, company: str, status: str = "OPEN", notes: Optional[str] = None):
	row = find_company_row(doc, company)
	if row:
		if not row.get("status"):
			row.status = status
		return row

	row = {
		"company": company,
		"status": status,
		"linked_at": now_datetime(),
	}
	if notes is not None:
		row["notes"] = notes
	doc.append("companies", row)
	return find_company_row(doc, company)


def validate_status_transition(previous_status: str, new_status: str) -> None:
	if not previous_status or previous_status == new_status:
		return
	allowed = VALID_STATUS_TRANSITIONS.get(previous_status, [])
	if new_status not in allowed:
		frappe.throw(
			frappe._("Invalid status transition from {0} to {1}").format(
				previous_status, new_status
			),
			frappe.ValidationError,
		)


def set_company_row_status(
	doc,
	company: str,
	status: str,
	lost_reason: Optional[str] = None,
	notes: Optional[str] = None,
):
	row = ensure_company_row(doc, company, status=status, notes=notes)
	previous = frappe.db.get_value(
		"Cheese Lead Company",
		row.name,
		"status",
	) if not doc.is_new() and row.name else row.status
	if previous and previous != status:
		validate_status_transition(previous, status)

	row.status = status
	row.last_interaction_at = now_datetime()
	if status == "LOST" and lost_reason:
		row.lost_reason = lost_reason

	if doc.get("company") == company:
		doc.status = status
		if status == "LOST" and lost_reason:
			doc.lost_reason = lost_reason
		doc.last_interaction_at = row.last_interaction_at


def apply_company_row_to_parent(doc, company: str) -> None:
	"""Mirror one establishment row onto parent fields for list/desk display."""
	row = find_company_row(doc, company)
	if not row:
		return
	if row.get("status"):
		doc.status = row.status
	if row.get("lost_reason"):
		doc.lost_reason = row.lost_reason
	if row.get("last_interaction_at"):
		doc.last_interaction_at = row.last_interaction_at


def get_company_row_status(lead_id: str, company: str) -> Optional[str]:
	if frappe.db.has_table("tabCheese Lead Company"):
		status = frappe.db.get_value(
			"Cheese Lead Company",
			{"parent": lead_id, "parenttype": "Cheese Lead", "company": company},
			"status",
		)
		if status:
			return status
	return frappe.db.get_value("Cheese Lead", lead_id, "status")


def enrich_lead_dict_for_company(lead: dict, company: Optional[str]) -> dict:
	if not company or not lead.get("name"):
		return lead
	row = frappe.db.get_value(
		"Cheese Lead Company",
		{"parent": lead["name"], "parenttype": "Cheese Lead", "company": company},
		["status", "lost_reason", "last_interaction_at"],
		as_dict=True,
	)
	if row:
		if row.status:
			lead["status"] = row.status
		if row.lost_reason:
			lead["lost_reason"] = row.lost_reason
		if row.last_interaction_at:
			lead["last_interaction_at"] = row.last_interaction_at
	return lead


def sync_company_rows_from_parent(doc) -> None:
	"""Ensure child rows exist and inherit parent status when rows are missing fields."""
	parent_status = doc.get("status") or "OPEN"
	for row in doc.get("companies") or []:
		if not row.get("status"):
			row.status = parent_status
		if not row.get("linked_at"):
			row.linked_at = now_datetime()

	if doc.get("company"):
		set_company_row_status(doc, doc.company, parent_status)


def sync_parent_from_primary_company(doc) -> None:
	if doc.get("company"):
		apply_company_row_to_parent(doc, doc.company)


def check_active_lead_for_company(contact_id: str, company: str, exclude_lead: Optional[str] = None):
	if not contact_id or not company:
		return
	if not frappe.db.has_table("tabCheese Lead Company"):
		return

	filters = {
		"parenttype": "Cheese Lead",
		"company": company,
		"status": ["in", list(ACTIVE_LEAD_STATUSES)],
	}
	rows = frappe.get_all("Cheese Lead Company", filters=filters, fields=["parent"])
	for row in rows:
		if exclude_lead and row.parent == exclude_lead:
			continue
		lead_contact = frappe.db.get_value("Cheese Lead", row.parent, "contact")
		if lead_contact == contact_id:
			frappe.throw(
				frappe._(
					"An active lead already exists for this Contact at {0}: {1}"
				).format(company, row.parent),
				frappe.ValidationError,
			)


def advance_lead_company_status(
	lead_id: str,
	company: Optional[str],
	to_status: str,
	from_status: Optional[str] = None,
):
	if not company:
		return
	lead = frappe.get_doc("Cheese Lead", lead_id)
	row = find_company_row(lead, company)
	current = row.status if row else lead.status
	if from_status and current != from_status:
		return
	if not from_status and current in TERMINAL_LEAD_STATUSES:
		return
	set_company_row_status(lead, company, to_status)
	lead.save(ignore_permissions=True)


def count_leads_by_company_status(
	statuses,
	company: Optional[str] = None,
	user: Optional[str] = None,
) -> int:
	"""Count lead-company rows matching status(es), with tenant scope."""
	user = user or frappe.session.user
	from cheese.cheese.utils.permissions import _is_super_admin, get_user_companies, _quote_list

	if not frappe.db.has_table("tabCheese Lead Company"):
		filters = {"status": ["in", list(statuses)]}
		if company:
			filters["company"] = company
		return frappe.db.count("Cheese Lead", filters=filters)

	status_list = ", ".join(frappe.db.escape(s) for s in statuses)
	conditions = [f"lc.status IN ({status_list})"]
	params = {}

	if company:
		conditions.append("lc.company = %(company)s")
		params["company"] = company
	elif not _is_super_admin(user):
		companies = get_user_companies(user)
		if not companies:
			return 0
		quoted = _quote_list(companies)
		conditions.append(f"lc.company IN ({quoted})")

	where = " AND ".join(conditions)
	return frappe.db.sql(
		f"""
		SELECT COUNT(*) AS count
		FROM `tabCheese Lead Company` lc
		INNER JOIN `tabCheese Lead` l ON l.name = lc.parent
		WHERE lc.parenttype = 'Cheese Lead'
		  AND {where}
		""",
		params,
	)[0][0]


@frappe.whitelist()
def get_open_leads_count(filters=None):
	"""Custom number card: count OPEN lead rows (scoped per establishment)."""
	from cheese.api.v1.user_controller import _get_current_user_company
	from cheese.cheese.utils.permissions import _is_super_admin

	company = None
	if not _is_super_admin(frappe.session.user):
		company = _get_current_user_company()
	return count_leads_by_company_status(["OPEN"], company=company)
