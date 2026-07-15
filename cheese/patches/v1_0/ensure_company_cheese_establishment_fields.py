import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields


FIELDNAMES = (
	"cheese_is_hotel",
	"cheese_payment_methods",
	"cheese_types",
	"cheese_establishment_type",
	"cheese_operating_hours",
	"cheese_google_maps_link",
)


def execute():
	"""Re-ensure Company cheese establishment columns exist (idempotent).

	Earlier installs may have marked add_company_cheese_establishment_fields as
	done while cheese_payment_methods / related columns were never created.
	"""
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

	needs_sync = any(not frappe.db.has_column("Company", fieldname) for fieldname in FIELDNAMES)
	if not needs_sync and all(
		frappe.db.exists("Custom Field", {"dt": "Company", "fieldname": fieldname})
		for fieldname in FIELDNAMES
	):
		return

	create_custom_fields({"Company": fields}, update=True)
	# Force schema sync when Custom Field docs exist but DB columns are missing
	frappe.clear_cache(doctype="Company")
	frappe.db.updatedb("Company")
