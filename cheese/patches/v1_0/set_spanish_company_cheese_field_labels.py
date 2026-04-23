import frappe


def execute():
	"""Set Spanish labels on Company cheese custom fields (desk UI)."""
	labels = {
		"cheese_payment_methods": "Métodos de pago",
		"cheese_types": "Tipos de queso",
		"cheese_establishment_type": "Tipo de establecimiento",
		"cheese_operating_hours": "Horario de atención",
		"cheese_google_maps_link": "Enlace de Google Maps",
	}
	for fieldname, label_es in labels.items():
		name = frappe.db.get_value("Custom Field", {"dt": "Company", "fieldname": fieldname}, "name")
		if name:
			frappe.db.set_value("Custom Field", name, "label", label_es)
	frappe.db.commit()
