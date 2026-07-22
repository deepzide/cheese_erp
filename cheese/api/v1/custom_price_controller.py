# Copyright (c) 2024
# License: MIT

"""Layer-4 custom prices: a price set that overrides an experience's layer-2
matrix or layer-1 base during a date range, with per-set flags controlling
whether the layer-3 season and promotions still apply."""

import json

import frappe
from frappe.utils import cint, flt, getdate

from cheese.api.common.responses import created, error, not_found, success, validation_error
from cheese.api.v1.user_controller import _get_current_user_company


def _company_allowed(company):
	user_company = _get_current_user_company()
	return not user_company or user_company == company


def _parse_lines(price_lines):
	if isinstance(price_lines, str):
		try:
			price_lines = json.loads(price_lines)
		except Exception:
			return []
	return price_lines if isinstance(price_lines, list) else []


@frappe.whitelist()
def create_custom_price(
	experience_id,
	date_from,
	date_to,
	individual_price=0,
	route_price=0,
	price_per_night=0,
	price_lines=None,
	participates_in_promotions=0,
	affected_by_seasons=0,
	custom_price_name=None,
):
	"""Create a layer-4 custom price for an experience over a date range.

	price_lines mirrors the experience's matrix (list of
	{day_type, age_group, price, route_price}); each base/matrix value overrides
	the corresponding current price during the range.
	"""
	try:
		if not experience_id or not frappe.db.exists("Cheese Experience", experience_id):
			return not_found("Experience", experience_id)
		company = frappe.db.get_value("Cheese Experience", experience_id, "company")
		if not _company_allowed(company):
			return error("Unauthorized", "UNAUTHORIZED", {}, 403)
		if not date_from or not date_to:
			return validation_error("date_from and date_to are required")
		if getdate(date_to) < getdate(date_from):
			return validation_error("date_to must be on or after date_from")

		lines = _parse_lines(price_lines)
		doc = frappe.get_doc(
			{
				"doctype": "Cheese Custom Price",
				"experience": experience_id,
				"company": company,
				"custom_price_name": custom_price_name,
				"date_from": date_from,
				"date_to": date_to,
				"is_active": 1,
				"participates_in_promotions": cint(participates_in_promotions),
				"affected_by_seasons": cint(affected_by_seasons),
				"individual_price": flt(individual_price),
				"route_price": flt(route_price),
				"price_per_night": flt(price_per_night),
				"price_lines": [
					{
						"day_type": (l.get("day_type") or "ALL"),
						"day_range": l.get("day_range") or None,
						"age_group": l.get("age_group") or None,
						"price": flt(l.get("price")),
						"route_price": flt(l.get("route_price")),
					}
					for l in lines
				],
			}
		)
		doc.insert(ignore_permissions=True)
		frappe.db.commit()
		return created("Custom price created", {"name": doc.name})
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except Exception as e:
		frappe.log_error(f"Error in create_custom_price: {e}")
		return error("Failed to create custom price", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def list_custom_prices(experience_id):
	"""Custom prices defined for an experience (for the calendar / management)."""
	try:
		if not frappe.db.exists("Cheese Experience", experience_id):
			return not_found("Experience", experience_id)
		company = frappe.db.get_value("Cheese Experience", experience_id, "company")
		if not _company_allowed(company):
			return error("Unauthorized", "UNAUTHORIZED", {}, 403)
		rows = frappe.get_all(
			"Cheese Custom Price",
			filters={"experience": experience_id},
			fields=[
				"name", "custom_price_name", "date_from", "date_to", "is_active",
				"participates_in_promotions", "affected_by_seasons",
			],
			order_by="date_from asc",
		)
		return success("Custom prices", {"custom_prices": rows})
	except Exception as e:
		frappe.log_error(f"Error in list_custom_prices: {e}")
		return error("Failed to list custom prices", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def delete_custom_price(name):
	"""Delete a custom price."""
	try:
		if not frappe.db.exists("Cheese Custom Price", name):
			return not_found("Custom price", name)
		company = frappe.db.get_value("Cheese Custom Price", name, "company")
		if not _company_allowed(company):
			return error("Unauthorized", "UNAUTHORIZED", {}, 403)
		frappe.delete_doc("Cheese Custom Price", name, ignore_permissions=True, force=True)
		frappe.db.commit()
		return success("Custom price deleted", {"name": name})
	except Exception as e:
		frappe.log_error(f"Error in delete_custom_price: {e}")
		return error("Failed to delete custom price", "SERVER_ERROR", {"error": str(e)}, 500)
