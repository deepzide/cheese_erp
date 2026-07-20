# Copyright (c) 2024
# License: MIT

"""Read-only endpoints to consult active seasons (seasonal pricing) and
promotions and which establishments / experiences they affect."""

import frappe
from frappe import _
from frappe.utils import getdate, nowdate, flt, cint
from cheese.api.common.responses import success, error, not_found, validation_error
from cheese.api.v1.user_controller import _get_current_user_company


def _serialize_season(season):
	linked = frappe.get_all(
		"Cheese Season Experience", filters={"parent": season.name}, pluck="experience"
	)
	return {
		"season_id": season.name,
		"season_name": season.season_name,
		"company": season.company,
		"percent": flt(season.percent),
		"date_from": str(season.date_from) if season.date_from else None,
		"date_to": str(season.date_to) if season.date_to else None,
		"applies_to_all_experiences": not linked,
		"experiences": linked,
	}


def _serialize_promotion(name):
	promo = frappe.get_doc("Cheese Promotion", name)
	requirements = []
	for req in promo.requirements or []:
		row = {"min_people": cint(req.min_people), "age_group": req.age_group}
		if req.age_group:
			g = frappe.db.get_value(
				"Cheese Age Group", req.age_group, ["group_name", "min_age", "max_age"], as_dict=True
			) or {}
			row.update({"age_group_name": g.get("group_name"), "min_age": g.get("min_age"), "max_age": g.get("max_age")})
		requirements.append(row)
	return {
		"promotion_id": promo.name,
		"promo_name": promo.promo_name,
		"company": promo.company,
		"discount_type": promo.discount_type,
		"percent": flt(promo.percent),
		"free_tickets": cint(promo.free_tickets),
		"date_from": str(promo.date_from) if promo.date_from else None,
		"date_to": str(promo.date_to) if promo.date_to else None,
		"applies_to_all_experiences": bool(promo.all_experiences),
		"experiences": [r.experience for r in (promo.experiences or [])],
		"requirements": requirements,
	}


def _covers_experience(offer, experience_id):
	"""True when the offer applies to the given experience."""
	if offer.get("applies_to_all_experiences"):
		return True
	return experience_id in (offer.get("experiences") or [])


@frappe.whitelist()
def list_active_offers(date=None):
	"""All active seasons and promotions covering ``date`` (default today), with
	the establishment and experiences each one affects. Establishment users only
	see their own establishment's offers; super admins see every one."""
	try:
		day = str(getdate(date or nowdate()))
		company_filter = _get_current_user_company()

		season_filters = {"is_active": 1, "date_from": ["<=", day], "date_to": [">=", day]}
		promo_filters = {"is_active": 1, "date_from": ["<=", day], "date_to": [">=", day]}
		if company_filter:
			season_filters["company"] = company_filter
			promo_filters["company"] = company_filter

		seasons = [
			_serialize_season(s)
			for s in frappe.get_all(
				"Cheese Season", filters=season_filters,
				fields=["name", "season_name", "company", "percent", "date_from", "date_to"],
				order_by="company asc, date_from asc",
			)
		]
		promotions = [
			_serialize_promotion(p.name)
			for p in frappe.get_all(
				"Cheese Promotion", filters=promo_filters, fields=["name"], order_by="company asc"
			)
		]
		return success(
			"Active offers retrieved",
			{"date": day, "seasons": seasons, "promotions": promotions,
			 "seasons_count": len(seasons), "promotions_count": len(promotions)},
		)
	except Exception as e:
		frappe.log_error(f"Error in list_active_offers: {str(e)}")
		return error("Failed to list active offers", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def get_offers_for(experience_id=None, company=None, date=None):
	"""Whether there are active seasons/promotions for a given experience or
	establishment on ``date`` (default today), and which ones.

	Provide ``experience_id`` (offers covering that experience) or ``company``
	(every active offer of that establishment)."""
	try:
		if not experience_id and not company:
			return validation_error("Provide experience_id or company")

		day = str(getdate(date or nowdate()))

		if experience_id:
			if not frappe.db.exists("Cheese Experience", experience_id):
				return not_found("Experience", experience_id)
			company = frappe.db.get_value("Cheese Experience", experience_id, "company")
		elif not frappe.db.exists("Company", company):
			return not_found("Company", company)

		# Tenant isolation: an establishment user may only query their own.
		user_company = _get_current_user_company()
		if user_company and company != user_company:
			return error("Unauthorized", "UNAUTHORIZED", {}, 403)

		seasons = [
			_serialize_season(s)
			for s in frappe.get_all(
				"Cheese Season",
				filters={"company": company, "is_active": 1, "date_from": ["<=", day], "date_to": [">=", day]},
				fields=["name", "season_name", "company", "percent", "date_from", "date_to"],
				order_by="date_from asc",
			)
		]
		promotions = [
			_serialize_promotion(p.name)
			for p in frappe.get_all(
				"Cheese Promotion",
				filters={"company": company, "is_active": 1, "date_from": ["<=", day], "date_to": [">=", day]},
				fields=["name"],
			)
		]

		if experience_id:
			seasons = [s for s in seasons if _covers_experience(s, experience_id)]
			promotions = [p for p in promotions if _covers_experience(p, experience_id)]

		return success(
			"Offers resolved",
			{
				"date": day,
				"company": company,
				"experience_id": experience_id,
				"has_active_season": bool(seasons),
				"has_active_promotion": bool(promotions),
				"seasons": seasons,
				"promotions": promotions,
			},
		)
	except Exception as e:
		frappe.log_error(f"Error in get_offers_for: {str(e)}")
		return error("Failed to get offers", "SERVER_ERROR", {"error": str(e)}, 500)
