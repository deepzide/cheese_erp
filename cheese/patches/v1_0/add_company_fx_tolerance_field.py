import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields


def execute():
	"""Add the FX tolerance custom field to Company (idempotent).

	Percentage margin accepted when a deposit payment arrives in a currency
	different from the establishment's and the converted amount does not
	match exactly due to exchange-rate fluctuation.
	"""
	create_custom_fields(
		{
			"Company": [
				{
					"fieldname": "fx_tolerance_percent",
					"fieldtype": "Float",
					"label": "FX Tolerance (%)",
					"insert_after": "default_currency",
					"default": "3",
					"description": (
						"Accepted margin (in %) between a converted foreign-currency payment "
						"and the required deposit amount. Within the margin the deposit is "
						"considered fully paid."
					),
				}
			]
		},
		ignore_validate=True,
	)
	frappe.db.commit()
