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
from frappe import _
from frappe.utils import cint, flt, getdate

from cheese.cheese.doctype.cheese_day_range.cheese_day_range import day_range_set


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


def _company_day_ranges(company):
	"""Custom day-range nomenclator of a company: {name: {day_from, day_to, range_name}}."""
	if not company:
		return {}
	return {
		r.name: r
		for r in frappe.get_all(
			"Cheese Day Range",
			filters={"company": company},
			fields=["name", "range_name", "day_from", "day_to"],
		)
	}


def _match_price_line(lines, day_type, age_group, in_route, weekday=None, day_ranges=None):
	"""Most specific matching layer-2 price line; None when nothing matches.

	Day scope: a line with a custom ``day_range`` matches when the date's
	weekday (0=Mon..6=Sun) falls in the range; a legacy WEEKDAY/WEEKEND line
	matches the derived day type; ALL lines are day-generic. Specificity:
	exact day+age (3) > exact day (2) > exact age (1) > ALL/empty (0).
	A line with no age group matches any person's age (day-general price); an
	age-specific line matches only that age group. When nothing matches (e.g. an
	age-only matrix and an age outside every group) the caller falls back to the
	layer-1 base price.
	"""
	best = None
	best_score = -1
	for line in lines or []:
		line_range = line.get("day_range") or None
		line_day = (line.get("day_type") or "ALL").upper()
		line_age = line.get("age_group") or None
		if line_range:
			rng = (day_ranges or {}).get(line_range)
			if not rng or weekday is None:
				continue
			if weekday not in day_range_set(rng["day_from"], rng["day_to"]):
				continue
			day_specific = True
		elif line_day != "ALL":
			if not day_type or line_day != day_type:
				continue
			day_specific = True
		else:
			day_specific = False
		if line_age and line_age != age_group:
			continue
		value = flt(line.get("route_price") if in_route else line.get("price"))
		if not value:
			continue
		score = (2 if day_specific else 0) + (1 if line_age else 0)
		if score > best_score:
			best_score = score
			best = value
	return best


def validate_price_lines_day_overlap(doc):
	"""Reject price lines whose day scopes overlap for the same age group.

	Applies to day-scoped lines only (a custom day range, or legacy
	WEEKDAY/WEEKEND); ALL lines are the generic fallback and are exempt. Lines
	of different age groups may share day scopes (specificity resolves them).
	"""
	lines = list(doc.get("price_lines") or [])
	if not lines:
		return
	range_ids = [l.day_range for l in lines if l.get("day_range")]
	ranges = {}
	if range_ids:
		for r in frappe.get_all(
			"Cheese Day Range",
			filters={"name": ["in", range_ids]},
			fields=["name", "range_name", "day_from", "day_to"],
		):
			ranges[r.name] = r

	def day_set(line):
		if line.get("day_range"):
			r = ranges.get(line.day_range)
			if not r:
				frappe.throw(_("Day range {0} not found").format(line.day_range))
			return day_range_set(r.day_from, r.day_to)
		dt = (line.get("day_type") or "ALL").upper()
		if dt == "WEEKDAY":
			return set(range(0, 5))
		if dt == "WEEKEND":
			return {5, 6}
		return None

	def label(line):
		if line.get("day_range"):
			r = ranges.get(line.day_range)
			return r.range_name if r else line.day_range
		return line.get("day_type") or "ALL"

	by_age = {}
	for idx, line in enumerate(lines, start=1):
		days = day_set(line)
		if days is None:
			continue
		key = line.get("age_group") or ""
		for prev_idx, prev_label, prev_days in by_age.get(key, []):
			if days & prev_days:
				frappe.throw(
					_(
						"Price lines {0} and {1} overlap: the day ranges \"{2}\" and \"{3}\" "
						"share days for the same age group. Pick non-overlapping ranges."
					).format(prev_idx, idx, prev_label, label(line)),
					frappe.ValidationError,
				)
		by_age.setdefault(key, []).append((idx, label(line), days))


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


def get_active_custom_price(experience_id, date_value):
	"""Layer-4 custom price (Cheese Custom Price) covering the date for the
	experience, or None. Most recently modified wins when several overlap."""
	if not date_value:
		return None
	date_str = str(getdate(date_value))
	rows = frappe.get_all(
		"Cheese Custom Price",
		filters={
			"experience": experience_id,
			"is_active": 1,
			"date_from": ["<=", date_str],
			"date_to": [">=", date_str],
		},
		fields=["name", "participates_in_promotions", "affected_by_seasons"],
		order_by="modified desc",
		limit=1,
	)
	return rows[0] if rows else None


def compute_party_prices(experience_doc, party_size, selected_date=None, guest_ages=None, in_route=False):
	"""Per-person unit prices for the party, with season applied.

	Returns dict: unit_prices (list, one per person), day_type, season
	({name, season_name, percent} | None), breakdown (per person), and
	uses_price_matrix flag. Prices are in the experience currency.
	"""
	company = experience_doc.company
	day_type = get_day_type(selected_date)
	try:
		weekday = getdate(selected_date).weekday() if selected_date else None
	except Exception:
		weekday = None
	day_ranges = _company_day_ranges(company)
	ages = parse_guest_ages(guest_ages)
	party_size = cint(party_size) or max(len(ages), 1)

	# Layer 4: an active custom price overrides the experience's own layer-2
	# matrix and layer-1 base for this date. Its two flags decide whether the
	# layer-3 season and promotions still apply on top of it.
	custom = get_active_custom_price(experience_doc.name, selected_date)
	custom_doc = frappe.get_doc("Cheese Custom Price", custom.name) if custom else None
	source = custom_doc or experience_doc

	lines = [
		{
			"day_type": row.day_type,
			"day_range": row.day_range,
			"age_group": row.age_group,
			"price": row.price,
			"route_price": row.route_price,
		}
		for row in (source.get("price_lines") or [])
	]
	if custom_doc is not None:
		# A custom price always overrides via its own lines/base.
		use_matrix = bool(lines)
	else:
		use_matrix = bool(lines) and bool(
			cint(experience_doc.get("differentiate_by_weekday"))
			or cint(experience_doc.get("differentiate_by_age_group"))
		)

	if in_route:
		base_price = flt(source.get("route_price"))
	elif experience_doc.get("experience_type") == "HOTEL":
		base_price = flt(source.get("price_per_night"))
	else:
		base_price = flt(source.get("individual_price"))

	unit_prices = []
	breakdown = []
	for i in range(party_size):
		age = ages[i] if i < len(ages) else None
		age_group = resolve_age_group(company, age) if age is not None else None
		unit = None
		if use_matrix:
			# Layer 2 (or the custom's matrix) overrides the base for every person
			# whose (day, age) matches a price line — including a day-general line
			# with no age group. EXCEPTION: when the matrix carries only age-group
			# prices and a person's age falls outside all groups (no matching line),
			# the base price is used for that person.
			unit = _match_price_line(
				lines, day_type, age_group, in_route, weekday=weekday, day_ranges=day_ranges
			)
		if unit is None:
			unit = base_price
		unit_prices.append(flt(unit))
		breakdown.append(
			{"age": age, "age_group": age_group, "day_type": day_type, "unit_price": flt(unit)}
		)

	season = get_active_season(company, experience_doc.name, selected_date)
	season_applies = bool(
		season and season.percent
		and (custom_doc is None or cint(custom_doc.affected_by_seasons))
	)
	if season_applies:
		factor = 1 + flt(season.percent) / 100.0
		unit_prices = [flt(u * factor, 2) for u in unit_prices]
		for i, entry in enumerate(breakdown):
			entry["unit_price"] = unit_prices[i]
			entry["season_percent"] = flt(season.percent)

	allow_promotions = True if custom_doc is None else bool(cint(custom_doc.participates_in_promotions))

	return {
		"unit_prices": unit_prices,
		"day_type": day_type,
		"season": dict(season) if season else None,
		"season_applied": season_applies,
		"breakdown": breakdown,
		"uses_price_matrix": use_matrix,
		"custom_price": custom_doc.name if custom_doc else None,
		"allow_promotions": allow_promotions,
	}


def find_matching_promotion(company, experience_id, date_value, guest_ages, party_size, unit_prices=None):
	"""Best active promotion whose requirement lines are ALL satisfied.

	A requirement line without age group counts every person; a line with an
	age group counts only people whose age falls in it (people without a
	known age never satisfy age-specific lines).

	When ``unit_prices`` is given and more than one promotion matches, the one
	that reduces the total the most is returned (so the customer always gets the
	best deal). Without ``unit_prices`` the most recently modified match wins.
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
	matches = []
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
			matches.append(promo)

	if not matches:
		return None
	if unit_prices:
		# Pick the promotion with the largest discount over these unit prices.
		return max(matches, key=lambda p: apply_promotion(p, unit_prices))
	return matches[0]


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


def get_pricing_catalog(experience_doc, date_value=None):
	"""Every price variant of an experience, resolved for catalog consumers
	(the chatbot, the SPA): the day-type x age-group matrix with age ranges
	spelled out, the company age-group nomenclator, and the current and
	upcoming active seasons and promotions that cover the experience.

	Purely informational — booking-time math stays in compute_party_prices.
	"""
	from frappe.utils import nowdate

	company = experience_doc.company
	today = str(getdate(date_value or nowdate()))

	age_groups = frappe.get_all(
		"Cheese Age Group",
		filters={"company": company},
		fields=["name", "group_name", "min_age", "max_age"],
		order_by="min_age asc",
	)
	group_map = {g.name: g for g in age_groups}

	def _group_fields(group_id):
		g = group_map.get(group_id)
		if not g:
			return {"age_group": None, "age_group_name": None, "min_age": None, "max_age": None}
		return {
			"age_group": g.name,
			"age_group_name": g.group_name,
			"min_age": g.min_age,
			"max_age": g.max_age,
		}

	day_ranges = _company_day_ranges(company)
	price_lines = []
	for row in experience_doc.get("price_lines") or []:
		rng = day_ranges.get(row.day_range) if row.day_range else None
		line = {
			"day_type": (row.day_type or "ALL").upper(),
			"day_range": row.day_range,
			"day_range_name": rng.range_name if rng else None,
			"day_from": rng.day_from if rng else None,
			"day_to": rng.day_to if rng else None,
			"price": flt(row.price),
			"route_price": flt(row.route_price),
		}
		line.update(_group_fields(row.age_group))
		price_lines.append(line)

	def _covers(child_doctype, name):
		linked = frappe.get_all(child_doctype, filters={"parent": name}, pluck="experience")
		return not linked or experience_doc.name in linked

	seasons = []
	for season in frappe.get_all(
		"Cheese Season",
		filters={"company": company, "is_active": 1, "date_to": [">=", today]},
		fields=["name", "season_name", "percent", "date_from", "date_to"],
		order_by="date_from asc",
	):
		if not _covers("Cheese Season Experience", season.name):
			continue
		seasons.append(
			{
				"season_id": season.name,
				"season_name": season.season_name,
				"percent": flt(season.percent),
				"date_from": str(season.date_from) if season.date_from else None,
				"date_to": str(season.date_to) if season.date_to else None,
				"active_today": bool(
					season.date_from and str(season.date_from) <= today
				),
			}
		)

	promotions = []
	for row in frappe.get_all(
		"Cheese Promotion",
		filters={"company": company, "is_active": 1, "date_to": [">=", today]},
		fields=["name"],
		order_by="date_from asc",
	):
		promo = frappe.get_doc("Cheese Promotion", row.name)
		if not promo.all_experiences:
			linked = [r.experience for r in (promo.experiences or [])]
			if experience_doc.name not in linked:
				continue
		requirements = []
		for req in promo.requirements or []:
			entry = {"min_people": cint(req.min_people)}
			entry.update(_group_fields(req.age_group))
			requirements.append(entry)
		promotions.append(
			{
				"promotion_id": promo.name,
				"promo_name": promo.promo_name,
				"discount_type": promo.discount_type,
				"percent": flt(promo.percent),
				"free_tickets": cint(promo.free_tickets),
				"date_from": str(promo.date_from) if promo.date_from else None,
				"date_to": str(promo.date_to) if promo.date_to else None,
				"active_today": bool(promo.date_from and str(promo.date_from) <= today),
				"requirements": requirements,
			}
		)

	return {
		"differentiate_by_weekday": bool(cint(experience_doc.get("differentiate_by_weekday"))),
		"differentiate_by_age_group": bool(cint(experience_doc.get("differentiate_by_age_group"))),
		"price_lines": price_lines,
		"age_groups": [
			{
				"age_group": g.name,
				"age_group_name": g.group_name,
				"min_age": g.min_age,
				"max_age": g.max_age,
			}
			for g in age_groups
		],
		"seasons": seasons,
		"promotions": promotions,
	}


def _seasons_in_range(company, experience_id, date_from, date_to):
	"""Active seasons overlapping [date_from, date_to] that cover the experience
	(empty experience set = every experience). ISO date strings so callers can
	compare against a day with plain string ordering. Sorted most-recently
	modified first (first match wins per day, matching get_active_season)."""
	rows = frappe.get_all(
		"Cheese Season",
		filters={
			"company": company,
			"is_active": 1,
			"date_from": ["<=", str(date_to)],
			"date_to": [">=", str(date_from)],
		},
		fields=["name", "season_name", "percent", "date_from", "date_to"],
		order_by="modified desc",
	)
	out = []
	for s in rows:
		linked = frappe.get_all(
			"Cheese Season Experience", filters={"parent": s.name}, pluck="experience"
		)
		if linked and experience_id not in linked:
			continue
		out.append(
			{
				"season_id": s.name,
				"season_name": s.season_name,
				"percent": flt(s.percent),
				"date_from": str(s.date_from),
				"date_to": str(s.date_to),
			}
		)
	return out


def _promotions_in_range(company, experience_id, date_from, date_to, group_map):
	"""Active promotions overlapping [date_from, date_to] that cover the
	experience, with requirement lines resolved against the age-group map."""
	rows = frappe.get_all(
		"Cheese Promotion",
		filters={
			"company": company,
			"is_active": 1,
			"date_from": ["<=", str(date_to)],
			"date_to": [">=", str(date_from)],
		},
		fields=["name"],
		order_by="date_from asc",
	)
	out = []
	for r in rows:
		promo = frappe.get_doc("Cheese Promotion", r.name)
		if not promo.all_experiences:
			linked = [x.experience for x in (promo.experiences or [])]
			if experience_id not in linked:
				continue
		requirements = []
		for req in promo.requirements or []:
			g = group_map.get(req.age_group)
			requirements.append(
				{
					"min_people": cint(req.min_people),
					"age_group": req.age_group,
					"age_group_name": g["group_name"] if g else None,
					"min_age": g["min_age"] if g else None,
					"max_age": g["max_age"] if g else None,
				}
			)
		out.append(
			{
				"promotion_id": promo.name,
				"promo_name": promo.promo_name,
				"discount_type": promo.discount_type,
				"percent": flt(promo.percent),
				"free_tickets": cint(promo.free_tickets),
				"date_from": str(promo.date_from),
				"date_to": str(promo.date_to),
				"requirements": requirements,
			}
		)
	return out


def _custom_prices_in_range(experience_id, date_from, date_to):
	"""Active layer-4 custom prices overlapping [date_from, date_to] for the
	experience, each with its overriding base and matrix lines. Most recently
	modified first (first match wins per day)."""
	rows = frappe.get_all(
		"Cheese Custom Price",
		filters={
			"experience": experience_id,
			"is_active": 1,
			"date_from": ["<=", str(date_to)],
			"date_to": [">=", str(date_from)],
		},
		fields=[
			"name", "custom_price_name", "date_from", "date_to",
			"participates_in_promotions", "affected_by_seasons",
			"individual_price", "route_price", "price_per_night",
		],
		order_by="modified desc",
	)
	out = []
	for r in rows:
		cp_lines = frappe.get_all(
			"Cheese Experience Price",
			filters={"parent": r.name, "parenttype": "Cheese Custom Price"},
			fields=["day_type", "day_range", "age_group", "price", "route_price"],
		)
		out.append(
			{
				"name": r.name,
				"custom_price_name": r.custom_price_name,
				"date_from": str(r.date_from),
				"date_to": str(r.date_to),
				"participates_in_promotions": bool(r.participates_in_promotions),
				"affected_by_seasons": bool(r.affected_by_seasons),
				"individual_price": flt(r.individual_price),
				"route_price": flt(r.route_price),
				"price_per_night": flt(r.price_per_night),
				"lines": [
					{
						"day_type": l.day_type,
						"day_range": l.day_range,
						"age_group": l.age_group,
						"price": l.price,
						"route_price": l.route_price,
					}
					for l in cp_lines
				],
			}
		)
	return out


def get_experience_price_calendar(experience_doc, date_from, date_to):
	"""Per-day resolved prices of an experience over [date_from, date_to].

	For every day it returns the day type (WEEKDAY/WEEKEND), the active season
	(if any), the active promotions (date-covered — their party requirements are
	shown but not applied, since a calendar has no party), and one price row per
	relevant variant: one per company age group (when the experience carries
	age-specific lines) plus a base/other-ages row, or a single general/base row.
	Each row shows the layer-1/layer-2 resolved price and its season-adjusted
	effective value, for both individual and in-route prices, in the experience
	currency. Purely informational — booking math stays in compute_party_prices.
	"""
	from frappe.utils import add_days
	from cheese.cheese.utils.currency_rates import get_company_currency

	company = experience_doc.company
	d_from, d_to = getdate(date_from), getdate(date_to)

	age_groups_raw = frappe.get_all(
		"Cheese Age Group",
		filters={"company": company},
		fields=["name", "group_name", "min_age", "max_age"],
		order_by="min_age asc",
	)
	age_groups = [
		{"name": g.name, "group_name": g.group_name, "min_age": g.min_age, "max_age": g.max_age}
		for g in age_groups_raw
	]
	group_map = {g["name"]: g for g in age_groups}

	day_ranges = _company_day_ranges(company)
	lines = [
		{
			"day_type": row.day_type,
			"day_range": row.day_range,
			"age_group": row.age_group,
			"price": row.price,
			"route_price": row.route_price,
		}
		for row in (experience_doc.get("price_lines") or [])
	]
	diff_wd = cint(experience_doc.get("differentiate_by_weekday"))
	diff_age = cint(experience_doc.get("differentiate_by_age_group"))
	use_matrix = bool(lines) and bool(diff_wd or diff_age)
	has_age_lines = any(l.get("age_group") for l in lines)

	is_hotel = experience_doc.get("experience_type") == "HOTEL"
	base_ind = flt(experience_doc.get("price_per_night")) if is_hotel else flt(experience_doc.get("individual_price"))
	base_route = flt(experience_doc.get("route_price"))

	currency = (
		experience_doc.get("currency") or get_company_currency(company) or "UYU"
	)

	seasons = _seasons_in_range(company, experience_doc.name, d_from, d_to)
	promotions = _promotions_in_range(company, experience_doc.name, d_from, d_to, group_map)
	customs = _custom_prices_in_range(experience_doc.name, d_from, d_to)

	def _l4(custom, day_type, age_group, weekday=None):
		"""Layer-4 (custom) resolved individual/route price for a variant, or
		(None, None) when no custom price covers the day."""
		if not custom:
			return (None, None)
		c_base_ind = custom["price_per_night"] if is_hotel else custom["individual_price"]
		ci = _match_price_line(custom["lines"], day_type, age_group, False, weekday=weekday, day_ranges=day_ranges)
		cr = _match_price_line(custom["lines"], day_type, age_group, True, weekday=weekday, day_ranges=day_ranges)
		return (ci if ci is not None else c_base_ind, cr if cr is not None else custom["route_price"])

	def _row(kind, group, l1_ind, l1_rte, l2_ind, l2_rte, l4_ind, l4_rte, factor):
		# Layer 1 = base; layer 2 = matched matrix line (None -> falls back to
		# layer 1); layer 4 = active custom-price override (None -> none). Layer 3
		# (season) applies on top of whichever wins, giving the effective value.
		has_l4 = l4_ind is not None or l4_rte is not None
		resolved_ind = l1_ind if l2_ind is None else l2_ind
		resolved_rte = l1_rte if l2_rte is None else l2_rte
		final_ind = l4_ind if has_l4 else resolved_ind
		final_rte = l4_rte if has_l4 else resolved_rte
		return {
			"kind": kind,
			"age_group": group["name"] if group else None,
			"age_group_name": group["group_name"] if group else None,
			"min_age": group["min_age"] if group else None,
			"max_age": group["max_age"] if group else None,
			# Layer 1 (base)
			"layer1_individual": flt(l1_ind, 2),
			"layer1_route": flt(l1_rte, 2),
			# Layer 2 (day/age matrix line; None when it falls back to layer 1)
			"layer2_individual": flt(l2_ind, 2) if l2_ind is not None else None,
			"layer2_route": flt(l2_rte, 2) if l2_rte is not None else None,
			"has_layer2": l2_ind is not None or l2_rte is not None,
			# Layer 4 (custom-price override; None when no custom covers the day)
			"layer4_individual": flt(l4_ind, 2) if l4_ind is not None else None,
			"layer4_route": flt(l4_rte, 2) if l4_rte is not None else None,
			"has_layer4": has_l4,
			# Final = (layer 4 if present, else layer 2/1) with layer-3 season on top
			"individual_base": flt(final_ind, 2),
			"individual_effective": flt(flt(final_ind) * factor, 2),
			"route_base": flt(final_rte, 2),
			"route_effective": flt(flt(final_rte) * factor, 2),
		}

	days = []
	cur = d_from
	while cur <= d_to:
		day_str = str(cur)
		day_type = "WEEKEND" if cur.weekday() >= 5 else "WEEKDAY"
		weekday = cur.weekday()

		season = next((s for s in seasons if s["date_from"] <= day_str <= s["date_to"]), None)
		custom = next((c for c in customs if c["date_from"] <= day_str <= c["date_to"]), None)
		season_applies = bool(season and season.get("percent")) and (
			custom is None or custom["affected_by_seasons"]
		)
		factor = (1 + flt(season["percent"]) / 100.0) if season_applies else 1.0

		rows = []
		if use_matrix and diff_age and has_age_lines and age_groups:
			for g in age_groups:
				ci, cr = _l4(custom, day_type, g["name"], weekday)
				rows.append(
					_row("age_group", g, base_ind, base_route,
						_match_price_line(lines, day_type, g["name"], False, weekday=weekday, day_ranges=day_ranges),
						_match_price_line(lines, day_type, g["name"], True, weekday=weekday, day_ranges=day_ranges), ci, cr, factor)
				)
			ci, cr = _l4(custom, day_type, None, weekday)
			rows.append(
				_row("base_other", None, base_ind, base_route,
					_match_price_line(lines, day_type, None, False, weekday=weekday, day_ranges=day_ranges),
					_match_price_line(lines, day_type, None, True, weekday=weekday, day_ranges=day_ranges), ci, cr, factor)
			)
		elif use_matrix:
			ci, cr = _l4(custom, day_type, None, weekday)
			rows.append(
				_row("general", None, base_ind, base_route,
					_match_price_line(lines, day_type, None, False, weekday=weekday, day_ranges=day_ranges),
					_match_price_line(lines, day_type, None, True, weekday=weekday, day_ranges=day_ranges), ci, cr, factor)
			)
		else:
			ci, cr = _l4(custom, day_type, None, weekday)
			rows.append(_row("base", None, base_ind, base_route, None, None, ci, cr, factor))

		day_promos = [p for p in promotions if p["date_from"] <= day_str <= p["date_to"]]
		prices = [r["individual_effective"] for r in rows if r["individual_effective"]]
		days.append(
			{
				"date": day_str,
				"day_type": day_type,
				"season": season,
				"season_applies": season_applies,
				"custom_price": (
					{
						"name": custom["name"],
						"custom_price_name": custom["custom_price_name"],
						"participates_in_promotions": custom["participates_in_promotions"],
						"affected_by_seasons": custom["affected_by_seasons"],
					}
					if custom else None
				),
				"promotions": day_promos,
				"promo_count": len(day_promos),
				"promotions_apply": custom is None or custom["participates_in_promotions"],
				"rows": rows,
				"min_price": min(prices) if prices else 0.0,
				"max_price": max(prices) if prices else 0.0,
			}
		)
		cur = add_days(cur, 1)

	return {
		"experience_id": experience_doc.name,
		"company": company,
		"currency": currency,
		"experience_type": experience_doc.get("experience_type"),
		"differentiate_by_weekday": bool(diff_wd),
		"differentiate_by_age_group": bool(diff_age),
		"has_age_lines": has_age_lines,
		"date_from": str(d_from),
		"date_to": str(d_to),
		"age_groups": age_groups,
		"day_ranges": [
			{
				"name": r.name,
				"range_name": r.range_name,
				"day_from": r.day_from,
				"day_to": r.day_to,
			}
			for r in day_ranges.values()
		],
		# Raw current prices of the experience, so the "custom price" form can
		# pre-fill each field with the value it overrides.
		"experience": {
			"individual_price": flt(experience_doc.get("individual_price")),
			"route_price": base_route,
			"price_per_night": flt(experience_doc.get("price_per_night")),
			"experience_type": experience_doc.get("experience_type"),
			"price_lines": [
				{
					"day_type": (l["day_type"] or "ALL"),
					"day_range": l.get("day_range"),
					"day_range_name": (
						day_ranges[l["day_range"]].range_name
						if l.get("day_range") and l["day_range"] in day_ranges
						else None
					),
					"age_group": l["age_group"],
					"age_group_name": (group_map.get(l["age_group"]) or {}).get("group_name"),
					"price": flt(l["price"]),
					"route_price": flt(l["route_price"]),
				}
				for l in lines
			],
		},
		"days": days,
	}
