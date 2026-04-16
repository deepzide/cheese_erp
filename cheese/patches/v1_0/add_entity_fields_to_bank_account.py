import frappe


def execute():
	records = frappe.get_all(
		"Cheese Bank Account",
		fields=["name", "route", "entity_type", "entity_id"],
		limit_page_length=0,
	)
	for row in records:
		updates = {}
		if not row.entity_type and row.route:
			updates["entity_type"] = "Cheese Route"
		if not row.entity_id and row.route:
			updates["entity_id"] = row.route
		if updates:
			frappe.db.set_value("Cheese Bank Account", row.name, updates, update_modified=False)
