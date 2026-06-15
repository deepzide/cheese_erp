"""
Fix Pending Cheese Tickets number card: replace invalid static \"Now\" filter
with a dynamic expires_at >= frappe.datetime.now_datetime() expression.
Safe to re-run.
"""

import frappe


def execute():
	name = "Pending Cheese Tickets"
	if not frappe.db.exists("Number Card", name):
		return

	frappe.db.set_value(
		"Number Card",
		name,
		{
			"filters_json": (
				'[["Cheese Ticket","status","=","PENDING",false]]'
			),
			"dynamic_filters_json": (
				'[["Cheese Ticket","expires_at",">=","frappe.datetime.now_datetime()",false]]'
			),
		},
		update_modified=False,
	)
	frappe.db.commit()
