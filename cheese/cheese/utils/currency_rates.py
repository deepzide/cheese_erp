# Copyright (c) 2024
# License: MIT

"""Multi-currency support: daily exchange rates and conversion helpers.

Rates come from the free open.er-api.com endpoint (no API key, ~160
currencies including UYU/ARS/BRL, daily updates) with a CDN fallback
(fawazahmed0/exchange-api). They are persisted in ERPNext's dated
``Currency Exchange`` doctype, so:

- conversions never call external APIs at request time,
- an admin can manually create/edit a Currency Exchange record and it
  naturally overrides the automatic rate (latest record for a date wins),
- every stored conversion is auditable (rate + date snapshot).
"""

import frappe
from frappe.utils import flt, nowdate

# Currencies the UI offers for monetary inputs (regional tourism scope)
SUPPORTED_CURRENCIES = ("UYU", "USD", "EUR", "BRL", "ARS")
BASE_CURRENCY = "USD"

PRIMARY_RATES_URL = "https://open.er-api.com/v6/latest/USD"
FALLBACK_RATES_URL = "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json"
RATES_REQUEST_TIMEOUT = 20
DEFAULT_FX_TOLERANCE_PERCENT = 3.0


def _fetch_usd_rates():
	"""Return {currency: units_per_USD} from the primary API or the CDN fallback."""
	import requests

	try:
		resp = requests.get(PRIMARY_RATES_URL, timeout=RATES_REQUEST_TIMEOUT)
		resp.raise_for_status()
		data = resp.json()
		if data.get("result") == "success" and data.get("rates"):
			return {k.upper(): flt(v) for k, v in data["rates"].items()}
	except Exception as e:
		frappe.log_error(f"Primary FX API failed: {e}", "Currency Rates")

	resp = requests.get(FALLBACK_RATES_URL, timeout=RATES_REQUEST_TIMEOUT)
	resp.raise_for_status()
	usd_map = resp.json().get("usd") or {}
	return {k.upper(): flt(v) for k, v in usd_map.items()}


def _upsert_exchange_record(date, from_currency, to_currency, rate):
	"""Create or update the Currency Exchange record for a pair on a date."""
	existing = frappe.db.get_value(
		"Currency Exchange",
		{"date": date, "from_currency": from_currency, "to_currency": to_currency},
		"name",
	)
	if existing:
		frappe.db.set_value("Currency Exchange", existing, "exchange_rate", rate, update_modified=True)
		return
	frappe.get_doc(
		{
			"doctype": "Currency Exchange",
			"date": date,
			"from_currency": from_currency,
			"to_currency": to_currency,
			"exchange_rate": rate,
			"for_buying": 1,
			"for_selling": 1,
		}
	).insert(ignore_permissions=True)


def sync_exchange_rates():
	"""
	Daily scheduler job: fetch USD-based rates and persist every supported
	pair (USD->X and X->USD) in Currency Exchange for today.
	"""
	try:
		rates = _fetch_usd_rates()
	except Exception as e:
		frappe.log_error(f"All FX rate sources failed: {e}", "Currency Rates")
		return 0

	today = nowdate()
	stored = 0
	for currency in SUPPORTED_CURRENCIES:
		# Make sure the Currency master is enabled so Link/Select fields work
		if frappe.db.exists("Currency", currency):
			frappe.db.set_value("Currency", currency, "enabled", 1, update_modified=False)
		if currency == BASE_CURRENCY:
			continue
		rate = rates.get(currency)
		if not rate:
			frappe.log_error(f"FX source returned no rate for {currency}", "Currency Rates")
			continue
		_upsert_exchange_record(today, BASE_CURRENCY, currency, rate)
		_upsert_exchange_record(today, currency, BASE_CURRENCY, 1.0 / rate)
		stored += 2

	frappe.db.commit()
	frappe.logger().info(f"Synced {stored} exchange rate records for {today}")
	return stored


def _latest_stored_rate(from_currency, to_currency):
	"""Most recent Currency Exchange rate for the pair (manual overrides win by date)."""
	row = frappe.get_all(
		"Currency Exchange",
		filters={"from_currency": from_currency, "to_currency": to_currency},
		fields=["exchange_rate", "date"],
		order_by="date desc, modified desc",
		limit=1,
	)
	return (flt(row[0].exchange_rate), str(row[0].date)) if row else (None, None)


def get_rate(from_currency, to_currency):
	"""
	Rate to convert from_currency -> to_currency using stored rates.

	Resolution order: direct pair, inverse pair, cross via USD. Triggers a
	live sync once if nothing is stored yet. Returns (rate, rate_date).
	Raises when no rate can be resolved.
	"""
	from_currency = (from_currency or "").upper()
	to_currency = (to_currency or "").upper()
	if not from_currency or not to_currency or from_currency == to_currency:
		return 1.0, nowdate()

	for attempt in range(2):
		rate, date = _latest_stored_rate(from_currency, to_currency)
		if rate:
			return rate, date

		inverse, date = _latest_stored_rate(to_currency, from_currency)
		if inverse:
			return 1.0 / inverse, date

		to_usd, d1 = _latest_stored_rate(from_currency, BASE_CURRENCY)
		from_usd, d2 = _latest_stored_rate(BASE_CURRENCY, to_currency)
		if to_usd and from_usd:
			return to_usd * from_usd, min(d1, d2)

		if attempt == 0:
			sync_exchange_rates()

	frappe.throw(
		f"No exchange rate available for {from_currency} -> {to_currency}. "
		"Run the rate sync or create a Currency Exchange record manually."
	)


def convert_amount(amount, from_currency, to_currency):
	"""
	Convert an amount between currencies with stored rates.

	Returns a snapshot dict for auditable persistence:
	{converted_amount, original_amount, from_currency, to_currency,
	 exchange_rate, rate_date}
	"""
	amount = flt(amount)
	rate, rate_date = get_rate(from_currency, to_currency)
	return {
		"converted_amount": flt(amount * rate, 2),
		"original_amount": amount,
		"from_currency": (from_currency or "").upper(),
		"to_currency": (to_currency or "").upper(),
		"exchange_rate": rate,
		"rate_date": rate_date,
	}


def get_company_currency(company):
	"""Preferred currency of an establishment (Company.default_currency)."""
	return (
		frappe.db.get_value("Company", company, "default_currency") or "UYU"
	) if company else "UYU"


def get_company_fx_tolerance(company):
	"""FX tolerance percent for deposit payments of an establishment."""
	if not company:
		return DEFAULT_FX_TOLERANCE_PERCENT
	value = frappe.db.get_value("Company", company, "fx_tolerance_percent")
	return flt(value) if value not in (None, "", 0) else DEFAULT_FX_TOLERANCE_PERCENT


def get_company_accepted_currencies(company):
	"""Currencies the establishment accepts; empty config = all supported.

	The preferred currency is always part of the accepted set.
	"""
	raw = frappe.db.get_value("Company", company, "accepted_currencies") if company else None
	items = [c.strip().upper() for c in (raw or "").split(",") if c.strip()]
	valid = [c for c in items if c in SUPPORTED_CURRENCIES]
	if not valid:
		return list(SUPPORTED_CURRENCIES)
	default = get_company_currency(company)
	if default and default not in valid:
		valid.append(default)
	return valid


@frappe.whitelist()
def sync_rates_now():
	"""Manual trigger (System Manager) for the daily rate sync."""
	if frappe.session.user != "Administrator" and "System Manager" not in frappe.get_roles():
		frappe.throw("Not permitted", frappe.PermissionError)
	return {"stored": sync_exchange_rates()}
