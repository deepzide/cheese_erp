import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields


def execute():
	"""Add the derive-hotel-capacity opt-in custom field to Company (idempotent)."""
	create_custom_fields(
		{
			"Company": [
				{
					"fieldname": "derive_hotel_capacity",
					"fieldtype": "Check",
					"label": "Derive Hotel Capacity From Rooms",
					"insert_after": "accepted_currencies",
					"default": "0",
					"description": (
						"Phase 2: nightly capacity of HOTEL room types is computed from the "
						"registered ACTIVE physical rooms minus maintenance blocks, instead of "
						"the manual slot capacity."
					),
				}
			]
		},
		ignore_validate=True,
	)
	frappe.db.commit()
