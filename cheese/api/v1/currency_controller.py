# Copyright (c) 2024
# License: MIT

import frappe
from frappe.utils import cint

from cheese.api.common.responses import error, paginated_response, success, validation_error
from cheese.api.v1.user_controller import _get_current_user_company
from cheese.cheese.utils.currency_rates import SUPPORTED_CURRENCIES, convert_amount


@frappe.whitelist()
def get_supported_currencies():
	"""Currencies the currency converter and pricing forms offer."""
	return success("Supported currencies retrieved", {"currencies": list(SUPPORTED_CURRENCIES)})


@frappe.whitelist()
def convert_currency(amount, from_currency, to_currency):
	"""
	Manual, on-demand conversion using the stored API exchange rates.

	This is a utility lookup for staff (e.g. "what is 100 USD in ARS right
	now?") — it does not write to the automatic-conversion audit log, since
	nothing is actually being booked or paid.
	"""
	try:
		if amount in (None, ""):
			return validation_error("amount is required")
		try:
			amount = float(amount)
		except (TypeError, ValueError):
			return validation_error("amount must be a number")
		if not from_currency or not to_currency:
			return validation_error("from_currency and to_currency are required")

		from_currency = from_currency.strip().upper()
		to_currency = to_currency.strip().upper()
		if from_currency not in SUPPORTED_CURRENCIES or to_currency not in SUPPORTED_CURRENCIES:
			return validation_error(
				f"Unsupported currency. Supported: {', '.join(SUPPORTED_CURRENCIES)}"
			)

		snapshot = convert_amount(amount, from_currency, to_currency)
		return success("Conversion calculated", snapshot)
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except Exception as e:
		frappe.log_error(f"Error in convert_currency: {str(e)}")
		return error("Failed to convert currency", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def list_conversion_logs(page=1, page_size=20, company=None, trigger=None):
	"""
	Paginated audit trail of automatic currency conversions performed by the
	system (ticket/route booking pricing, deposit payments).

	Establishment users are scoped to their own company; admins see every
	company or can filter to one.
	"""
	try:
		page = cint(page) or 1
		page_size = min(cint(page_size) or 20, 100)

		user_company = _get_current_user_company()
		filters = {}
		if user_company:
			filters["company"] = user_company
		elif company:
			filters["company"] = company
		if trigger:
			filters["trigger"] = trigger

		total = frappe.db.count("Cheese Currency Conversion Log", filters=filters)
		rows = frappe.get_all(
			"Cheese Currency Conversion Log",
			filters=filters,
			fields=[
				"name", "trigger", "company", "from_currency", "to_currency",
				"original_amount", "converted_amount", "exchange_rate", "rate_date",
				"reference_doctype", "reference_name", "creation",
			],
			order_by="creation desc",
			limit_start=(page - 1) * page_size,
			limit_page_length=page_size,
		)
		logs = [
			{
				"log_id": row.name,
				"trigger": row.trigger,
				"company": row.company,
				"from_currency": row.from_currency,
				"to_currency": row.to_currency,
				"original_amount": row.original_amount,
				"converted_amount": row.converted_amount,
				"exchange_rate": row.exchange_rate,
				"rate_date": str(row.rate_date) if row.rate_date else None,
				"reference_doctype": row.reference_doctype,
				"reference_name": row.reference_name,
				"created_at": str(row.creation),
			}
			for row in rows
		]
		return paginated_response(logs, "Conversion logs retrieved successfully", page=page, page_size=page_size, total=total)
	except Exception as e:
		frappe.log_error(f"Error in list_conversion_logs: {str(e)}")
		return error("Failed to list conversion logs", "SERVER_ERROR", {"error": str(e)}, 500)
