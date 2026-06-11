"""
Add Cheese Lead Company child table and backfill from existing lead.company values.
Safe to re-run.
"""

import frappe
from frappe.utils import now_datetime


def execute():
	try:
		frappe.reload_doc("cheese", "doctype", "cheese_lead_company")
		frappe.reload_doc("cheese", "doctype", "cheese_lead")
	except Exception as exc:  # pragma: no cover - migration robustness
		frappe.log_error(
			f"add_lead_companies_table: failed to reload doctypes: {exc}",
			"Cheese Migration",
		)

	if not frappe.db.has_table("tabCheese Lead Company"):
		return

	_backfill_from_lead_company_field()
	frappe.db.commit()


def _backfill_from_lead_company_field():
	rows = frappe.db.sql(
		"""
		SELECT name, company
		FROM `tabCheese Lead`
		WHERE COALESCE(company, '') <> ''
		""",
		as_dict=True,
	)
	for row in rows:
		if frappe.db.exists(
			"Cheese Lead Company",
			{
				"parent": row.name,
				"parenttype": "Cheese Lead",
				"company": row.company,
			},
		):
			continue
		try:
			lead = frappe.get_doc("Cheese Lead", row.name)
		except frappe.DoesNotExistError:
			continue
		lead.append(
			"companies",
			{"company": row.company, "linked_at": now_datetime()},
		)
		lead.save(ignore_permissions=True)
