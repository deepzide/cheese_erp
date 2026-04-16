import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields


def execute():
	create_custom_fields(
		{
			"Company": [
				{
					"fieldname": "cheese_archived",
					"fieldtype": "Check",
					"label": "Cheese Archived",
					"default": "0",
					"insert_after": "website",
					"description": "When set, establishment is hidden from Cheese list APIs by default.",
				}
			]
		}
	)
