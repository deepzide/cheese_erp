# Copyright (c) 2024
# License: MIT

from collections import defaultdict

import frappe
from cheese.api.common.responses import error, not_found, success, validation_error
from cheese.cheese.utils.access import assert_entity_access


def serialize_company_bank_account_row(row):
	"""API/bot shape: account_number, bank_name, currency (+ optional ids)."""
	return {
		"bank_account_id": row.get("name"),
		"account_number": (row.get("account") or "") or "",
		"bank_name": (row.get("bank") or "") or "",
		"currency": (row.get("currency") or "") or "",
		"holder": row.get("holder"),
		"iban": row.get("iban") or None,
	}


def get_active_company_bank_accounts_list(company_id):
	"""All ACTIVE Cheese Bank Account rows for a Company (establishment)."""
	if not company_id:
		return []
	rows = frappe.get_all(
		"Cheese Bank Account",
		filters={"entity_type": "Company", "entity_id": company_id, "status": "ACTIVE"},
		fields=["name", "account", "bank", "currency", "holder", "iban"],
		order_by="modified asc",
	)
	return [serialize_company_bank_account_row(r) for r in rows]


def get_active_company_bank_accounts_map(company_ids):
	"""Batch: company_id -> list of serialized bank account dicts."""
	if not company_ids:
		return {}
	ids = list({c for c in company_ids if c})
	if not ids:
		return {}
	rows = frappe.get_all(
		"Cheese Bank Account",
		filters={"entity_type": "Company", "entity_id": ["in", ids], "status": "ACTIVE"},
		fields=["name", "entity_id", "account", "bank", "currency", "holder", "iban"],
		order_by="entity_id asc, modified asc",
	)
	out = defaultdict(list)
	for r in rows:
		out[r.entity_id].append(serialize_company_bank_account_row(r))
	return dict(out)


def get_active_bank_account_doc(entity_type, entity_id):
	if not entity_type or not entity_id:
		return None

	filters = {"status": "ACTIVE", "entity_type": entity_type, "entity_id": entity_id}
	bank_account_name = frappe.db.get_value("Cheese Bank Account", filters, "name")

	# Backward compatibility for data not migrated yet.
	if not bank_account_name and entity_type == "Cheese Route":
		bank_account_name = frappe.db.get_value(
			"Cheese Bank Account", {"status": "ACTIVE", "route": entity_id}, "name"
		)

	if not bank_account_name:
		return None

	return frappe.get_doc("Cheese Bank Account", bank_account_name)


@frappe.whitelist()
def get_entity_bank_account(entity_type, entity_id):
	try:
		if not entity_type:
			return validation_error("entity_type is required")
		if not entity_id:
			return validation_error("entity_id is required")

		if entity_type not in ("Cheese Route", "Company"):
			return validation_error("entity_type must be Cheese Route or Company")

		if not frappe.db.exists(entity_type, entity_id):
			return not_found(entity_type, entity_id)

		try:
			assert_entity_access(entity_type, entity_id)
		except frappe.PermissionError:
			return error("Unauthorized", "UNAUTHORIZED", {}, 403)

		bank_account = get_active_bank_account_doc(entity_type, entity_id)
		if not bank_account:
			return not_found("Bank Account", f"for {entity_type} {entity_id}")

		return success(
			"Bank account retrieved successfully",
			{
				"entity_type": entity_type,
				"entity_id": entity_id,
				"bank_account_id": bank_account.name,
				"holder": bank_account.holder,
				"bank": bank_account.bank,
				"account": bank_account.account,
				"iban": bank_account.iban,
				"currency": bank_account.currency,
			},
		)
	except Exception as e:
		frappe.log_error(f"Error in get_entity_bank_account: {str(e)}")
		return error("Failed to get bank account", "SERVER_ERROR", {"error": str(e)}, 500)
