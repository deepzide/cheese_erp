import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields


def execute():
	create_custom_fields(
		{
			"Company": [
				{
					"fieldname": "cheese_payment_methods",
					"fieldtype": "Small Text",
					"label": "Métodos de pago",
					"insert_after": "cheese_archived",
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
		}
	)
