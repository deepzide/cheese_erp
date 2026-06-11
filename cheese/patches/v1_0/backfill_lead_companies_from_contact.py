"""
Copy linked companies from each Cheese Contact onto its matching Cheese Lead(s).

For every lead with a contact, ensure every row in `Cheese Contact Company`
also exists in `Cheese Lead Company`. Also sets `lead.company` when empty.
Safe to re-run.
"""

import frappe
from frappe.utils import now_datetime


def execute():
	if not frappe.db.has_table("tabCheese Lead Company"):
		return
	if not frappe.db.has_table("tabCheese Contact Company"):
		return

	_backfill_lead_companies_from_contacts()
	_sync_lead_primary_company_from_contact()
	frappe.db.commit()


def _backfill_lead_companies_from_contacts():
	"""Add missing contact company links onto matching leads."""
	pairs = frappe.db.sql(
		"""
		SELECT DISTINCT l.name AS lead_id, cc.company AS company
		FROM `tabCheese Lead` l
		INNER JOIN `tabCheese Contact Company` cc
			ON cc.parent = l.contact
			AND cc.parenttype = 'Cheese Contact'
		WHERE COALESCE(l.contact, '') <> ''
		  AND COALESCE(cc.company, '') <> ''
		""",
		as_dict=True,
	)

	for pair in pairs:
		if frappe.db.exists(
			"Cheese Lead Company",
			{
				"parent": pair.lead_id,
				"parenttype": "Cheese Lead",
				"company": pair.company,
			},
		):
			continue
		try:
			lead = frappe.get_doc("Cheese Lead", pair.lead_id)
		except frappe.DoesNotExistError:
			continue
		lead.append(
			"companies",
			{"company": pair.company, "linked_at": now_datetime()},
		)
		lead.save(ignore_permissions=True)


def _sync_lead_primary_company_from_contact():
	"""Set lead.company from the contact's primary company when still empty."""
	leads = frappe.db.sql(
		"""
		SELECT name, contact
		FROM `tabCheese Lead`
		WHERE COALESCE(contact, '') <> ''
		  AND COALESCE(company, '') = ''
		""",
		as_dict=True,
	)
	for row in leads:
		company = frappe.db.get_value(
			"Cheese Contact Company",
			{"parent": row.contact, "parenttype": "Cheese Contact"},
			"company",
			order_by="idx asc",
		)
		if company:
			frappe.db.set_value(
				"Cheese Lead",
				row.name,
				"company",
				company,
				update_modified=False,
			)
