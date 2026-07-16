import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields


def execute():
	"""Add the accepted currencies custom field to Company (idempotent)."""
	create_custom_fields(
		{
			"Company": [
				{
					"fieldname": "accepted_currencies",
					"fieldtype": "Small Text",
					"label": "Accepted Currencies",
					"insert_after": "fx_tolerance_percent",
					"description": (
						"Comma-separated ISO codes the establishment accepts for payments "
						"(e.g. UYU,USD). Empty means every supported currency is accepted."
					),
				}
			]
		},
		ignore_validate=True,
	)
	frappe.db.commit()
