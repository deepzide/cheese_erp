"""
Switch Open Cheese Leads number card to custom method that counts per-establishment OPEN rows.
Safe to re-run.
"""

import frappe


def execute():
	name = "Open Cheese Leads"
	if not frappe.db.exists("Number Card", name):
		return

	frappe.db.set_value(
		"Number Card",
		name,
		{
			"type": "Custom",
			"method": "cheese.cheese.utils.lead_company.get_open_leads_count",
			"filters_json": "[]",
			"dynamic_filters_json": "[]",
		},
		update_modified=False,
	)
	frappe.db.commit()
