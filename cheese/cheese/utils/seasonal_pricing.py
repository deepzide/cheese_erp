# Copyright (c) 2024
# License: MIT

"""Seasonal / age-group pricing and automatic promotions.

Price resolution per person (all in the experience currency):

1. Matrix price: the experience's ``price_lines`` matched by day type
   (WEEKDAY = Mon-Fri, WEEKEND = Sat-Sun, derived by the ERP from the
   entry date) and the person's age group — most specific line wins.
2. Fallback: the experience base prices (individual/route/per-night).
3. Season: the active ``Cheese Season`` covering the date and experience
   applies its percent (+increase / -discount) as a second-level
   adjustment on top of every resolved price.
4. Promotion: the first active ``Cheese Promotion`` of the establishment
   whose requirement lines are ALL satisfied by the party applies
   automatically (percent off, or X cheapest entries free).
"""

import json

import frappe
from frappe.utils import cint, flt, getdate


def get_day_type(date_value):
	"""WEEKDAY (Mon-Fri) or WEEKEND (Sat-Sun) for a date; None when unknown."""
	if not date_value:
		return None
	try:
		return "WEEKEND" if getdate(date_value).weekday() >= 5 else "WEEKDAY"
	except Exception:
		return None


def parse_guest_ages(guest_ages):
	"""Normalize a guest_ages input (JSON string or list) to a list of ints."""
	if not guest_ages:
		return []
	if isinstance(guest_ages, str):
		try:
			guest_ages = json.loads(guest_ages)
		except Exception:
			return []
	if not isinstance(guest_ages, (list, tuple)):
		return []
	ages = []
	for a in guest_ages:
		try:
			ages.append(max(0, cint(a)))
		except Exception:
			continue
	return ages


def resolve_age_group(company, age):
	"""Cheese Age Group name of the company containing `age`, or None."""
	if age is None or not company:
		return None
	row = frappe.get_all(
		"Cheese Age Group",
		filters={"company": company, "min_age": ["<=", age], "max_age": [">=", age]},
		fields=["name"],
		limit=1,
	)
	return row[0].name if row else None


def _match_price_line(lines, day_type, age_group, in_route):
	"""Most specific matching price line; None when nothing matches.

	Specificity: exact day+age (3) > exact day (2) > exact age (1) > ALL/empty (0).
	"""
	best = None
	best_score = -1
	for line in lines or []:
		line_day = (line.get("day_type") or "ALL").upper()
		line_age = line.get("age_group") or None
		if line_day != "ALL" and day_type and line_day != day_type:
			continue
		if line_day != "ALL" and not day_type:
			continue
		if line_age and line_age != age_group:
			continue
		value = flt(line.get("route_price") if in_route else line.get("price"))
		if not value:
			continue
		score = (2 if line_day != "ALL" else 0) + (1 if line_age else 0)
		if score > best_score:
			best_score = score
			best = value
	return best


def get_active_season(company, experience_id, date_value):
	"""Active season covering the date whose experience set includes the
	experience (empty set = every experience of the company). Most recently
	modified wins when several overlap."""
	if not date_value:
		return None
	date_str = str(getdate(date_value))
	seasons = frappe.get_all(
		"Cheese Season",
		filters={
			"company": company,
			"is_active": 1,
			"date_from": ["<=", date_str],
			"date_to": [">=", date_str],
		},
		fields=["name", "season_name", "percent"],
		order_by="modified desc",
	)
	for season in seasons:
		linked = frappe.get_all(
			"Cheese Season Experience",
			filters={"parent": season.name},
			pluck="experience",
		)
		if not linked or experience_id in linked:
			return season
	return None


def compute_party_prices(experience_doc, party_size, selected_date=None, guest_ages=None, in_route=False):
	"""Per-person unit prices for the party, with season applied.

	Returns dict: unit_prices (list, one per person), day_type, season
	({name, season_name, percent} | None), breakdown (per person), and
	uses_price_matrix flag. Prices are in the experience currency.
	"""
	company = experience_doc.company
	day_type = get_day_type(selected_date)
	ages = parse_guest_ages(guest_ages)
	party_size = cint(party_size) or max(len(ages), 1)

	lines = [
		{
			"day_type": row.day_type,
			"age_group": row.age_group,
			"price": row.price,
			"route_price": row.route_price,
		}
		for row in (experience_doc.get("price_lines") or [])
	]
	use_matrix = bool(lines) and bool(
		cint(experience_doc.get("differentiate_by_weekday"))
		or cint(experience_doc.get("differentiate_by_age_group"))
	)

	if in_route:
		base_price = flt(experience_doc.route_price)
	elif experience_doc.get("experience_type") == "HOTEL":
		base_price = flt(experience_doc.get("price_per_night"))
	else:
		base_price = flt(experience_doc.individual_price)

	unit_prices = []
	breakdown = []
	for i in range(party_size):
		age = ages[i] if i < len(ages) else None
		age_group = resolve_age_group(company, age) if age is not None else None
		unit = None
		if use_matrix:
			unit = _match_price_line(lines, day_type, age_group, in_route)
		if unit is None:
			unit = base_price
		unit_prices.append(flt(unit))
		breakdown.append(
			{"age": age, "age_group": age_group, "day_type": day_type, "unit_price": flt(unit)}
		)

	season = get_active_season(company, experience_doc.name, selected_date)
	if season and season.percent:
		factor = 1 + flt(season.percent) / 100.0
		unit_prices = [flt(u * factor, 2) for u in unit_prices]
		for i, entry in enumerate(breakdown):
			entry["unit_price"] = unit_prices[i]
			entry["season_percent"] = flt(season.percent)

	return {
		"unit_prices": unit_prices,
		"day_type": day_type,
		"season": dict(season) if season else None,
		"breakdown": breakdown,
		"uses_price_matrix": use_matrix,
	}


def find_matching_promotion(company, experience_id, date_value, guest_ages, party_size):
	"""First active promotion whose requirement lines are ALL satisfied.

	A requirement line without age group counts every person; a line with an
	age group counts only people whose age falls in it (people without a
	known age never satisfy age-specific lines).
	"""
	if not company or not date_value:
		return None
	date_str = str(getdate(date_value))
	ages = parse_guest_ages(guest_ages)
	party_size = cint(party_size) or len(ages)

	promos = frappe.get_all(
		"Cheese Promotion",
		filters={
			"company": company,
			"is_active": 1,
			"date_from": ["<=", date_str],
			"date_to": [">=", date_str],
		},
		fields=["name"],
		order_by="modified desc",
	)
	for row in promos:
		promo = frappe.get_doc("Cheese Promotion", row.name)
		if not promo.all_experiences:
			linked = [r.experience for r in (promo.experiences or [])]
			if experience_id not in linked:
				continue
		requirements = promo.requirements or []
		if not requirements:
			continue
		matched = True
		for req in requirements:
			needed = cint(req.min_people)
			if req.age_group:
				group = frappe.db.get_value(
					"Cheese Age Group", req.age_group, ["min_age", "max_age"], as_dict=True
				)
				if not group:
					matched = False
					break
				count = sum(1 for a in ages if group.min_age <= a <= group.max_age)
			else:
				count = max(party_size, len(ages))
			if count < needed:
				matched = False
				break
		if matched:
			return promo
	return None


def apply_promotion(promo, unit_prices):
	"""Discount amount for a matched promotion over the party unit prices."""
	total = flt(sum(unit_prices))
	if not promo or total <= 0:
		return 0.0
	if promo.discount_type == "PERCENT":
		return flt(total * flt(promo.percent) / 100.0, 2)
	if promo.discount_type == "FREE_TICKETS":
		free = min(cint(promo.free_tickets), len(unit_prices))
		return flt(sum(sorted(unit_prices)[:free]), 2)
	return 0.0
