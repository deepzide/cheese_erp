import frappe


def execute():
	"""Fix legacy Cheese Complaint DocType metadata to avoid wrong module imports."""
	if not frappe.db.exists("DocType", "Cheese Complaint"):
		return

	module_name, is_custom = frappe.db.get_value(
		"DocType", "Cheese Complaint", ["module", "custom"]
	)

	updates = {}
	if module_name == "Core":
		updates["module"] = "Cheese"
	if not is_custom:
		updates["custom"] = 1

	if updates:
		frappe.db.set_value("DocType", "Cheese Complaint", updates, update_modified=False)
