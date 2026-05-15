import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields


def execute():
	"""Link bot CRM entities to Company (establishment)."""
	fields = {
		"Cheese Contact": [
			{
				"fieldname": "company",
				"fieldtype": "Link",
				"label": "Establishment",
				"options": "Company",
				"insert_after": "email",
				"in_standard_filter": 1,
			},
		],
		"Cheese Lead": [
			{
				"fieldname": "company",
				"fieldtype": "Link",
				"label": "Establishment",
				"options": "Company",
				"insert_after": "conversation",
				"in_list_view": 1,
				"in_standard_filter": 1,
			},
		],
		"Conversation": [
			{
				"fieldname": "company",
				"fieldtype": "Link",
				"label": "Establishment",
				"options": "Company",
				"insert_after": "channel",
				"in_standard_filter": 1,
			},
		],
		"Cheese Message": [
			{
				"fieldname": "company",
				"fieldtype": "Link",
				"label": "Establishment",
				"options": "Company",
				"insert_after": "phone_number",
				"in_standard_filter": 1,
			},
		],
	}

	filtered = {}
	for doctype, field_defs in fields.items():
		meta = frappe.get_meta(doctype)
		missing = [f for f in field_defs if not meta.has_field(f["fieldname"])]
		if missing:
			filtered[doctype] = missing

	if filtered:
		create_custom_fields(filtered)
