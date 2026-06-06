"""Add ``company`` to Cheese Message for per-establishment transcript scoping."""

import frappe


def execute():
	try:
		frappe.reload_doc("cheese", "doctype", "cheese_message")
	except Exception as exc:  # pragma: no cover - migration robustness
		frappe.log_error(
			f"add_message_company_field: failed to reload cheese_message: {exc}",
			"Cheese Migration",
		)
	frappe.db.commit()
