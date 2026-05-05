import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields


def execute():
	fields = [
		{
			"fieldname": "cheese_is_hotel",
			"fieldtype": "Check",
			"label": "Is Hotel",
			"insert_after": "administrator_contact",
			"description": "Mark this establishment as a hotel to enable hotel-specific features",
		},
		{
			"fieldname": "cheese_payment_methods",
			"fieldtype": "Small Text",
			"label": "Métodos de pago",
			"insert_after": "cheese_is_hotel",
			"description": "Accepted payment methods (comma-separated: cash, card, transfer, etc.)",
		},
		{
			"fieldname": "cheese_types",
			"fieldtype": "Small Text",
			"label": "Tipos de queso",
			"insert_after": "cheese_payment_methods",
			"description": "Types of cheese produced (comma-separated)",
		},
		{
			"fieldname": "cheese_establishment_type",
			"fieldtype": "Select",
			"label": "Tipo de establecimiento",
			"options": "\nCraft\nIndustrial\nPoint of Sale\nAccommodation\nOther",
			"insert_after": "cheese_types",
			"description": "Type of cheese establishment",
		},
		{
			"fieldname": "cheese_operating_hours",
			"fieldtype": "Small Text",
			"label": "Horario de atención",
			"insert_after": "cheese_establishment_type",
			"description": "Weekly availability (days and hours)",
		},
		{
			"fieldname": "cheese_google_maps_link",
			"fieldtype": "Data",
			"label": "Enlace de Google Maps",
			"insert_after": "cheese_operating_hours",
			"description": "Google Maps URL for the establishment location",
		},
	]

	# Only create fields that don't already exist on the Company doctype
	meta = frappe.get_meta("Company")
	new_fields = [
		f for f in fields
		if not meta.has_field(f["fieldname"])
	]

	if new_fields:
		create_custom_fields({"Company": new_fields})

