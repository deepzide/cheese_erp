"""
Backfill per-establishment status fields on Cheese Lead Company child rows
from the parent Cheese Lead status. Safe to re-run.
"""

import frappe
from frappe.utils import now_datetime


def execute():
	if not frappe.db.has_table("tabCheese Lead Company"):
		return

	if not frappe.db.has_column("Cheese Lead Company", "status"):
		return

	rows = frappe.db.sql(
		"""
		SELECT lc.name, lc.parent, lc.company, lc.status AS row_status,
		       l.status AS lead_status, l.lost_reason, l.last_interaction_at
		FROM `tabCheese Lead Company` lc
		INNER JOIN `tabCheese Lead` l ON l.name = lc.parent
		""",
		as_dict=True,
	)

	for row in rows:
		updates = {}
		if not row.row_status and row.lead_status:
			updates["status"] = row.lead_status
		if row.lead_status and not row.get("linked_at"):
			updates["linked_at"] = now_datetime()
		if row.lost_reason and not frappe.db.get_value(
			"Cheese Lead Company", row.name, "lost_reason"
		):
			updates["lost_reason"] = row.lost_reason
		if row.last_interaction_at and not frappe.db.get_value(
			"Cheese Lead Company", row.name, "last_interaction_at"
		):
			updates["last_interaction_at"] = row.last_interaction_at
		if updates:
			frappe.db.set_value(
				"Cheese Lead Company",
				row.name,
				updates,
				update_modified=False,
			)

	frappe.db.commit()
