# Copyright (c) 2026
# License: MIT
"""Idempotent seed data for end-to-end testing of the Cheese SPA.

Creates a coherent multi-establishment, multi-currency dataset so the
booking, pricing and payment flows can be exercised in a browser:

    bench --site <site> execute cheese.e2e_seed.seed_e2e_data

The dataset deliberately exercises the currency paths:

* an experience priced in a currency different from its establishment's
  (Degustacion Premium: USD price inside a UYU establishment) so the
  conversion to the establishment currency is visible;
* a hotel room priced in USD inside a UYU hotel;
* a single-establishment route (converted total, one currency) and a
  cross-establishment route (mixed currencies, triggers the warning).

Re-running is safe: every record is looked up before being created.
"""

import frappe
from frappe.utils import add_days, nowdate

ACTIVITY_SLOT_DAYS = 21
HOTEL_SLOT_DAYS = 90

# Cheese Experience.event_duration is a Duration field: seconds, not "HH:MM".
HOURS = 3600


def _log(message):
	print(f"[e2e-seed] {message}")


def _set_if_column(doctype, name, values):
	"""Set custom fields only when the column exists on this site."""
	for field, value in values.items():
		if frappe.db.has_column(doctype, field):
			frappe.db.set_value(doctype, name, field, value, update_modified=False)


def ensure_company(company_name, abbr, currency, accepted, is_hotel=False):
	if not frappe.db.exists("Company", company_name):
		frappe.get_doc(
			{
				"doctype": "Company",
				"company_name": company_name,
				"abbr": abbr,
				"default_currency": currency,
				"country": "Uruguay",
			}
		).insert(ignore_permissions=True, ignore_if_duplicate=True)
		_log(f"company created: {company_name} ({currency})")
	else:
		frappe.db.set_value("Company", company_name, "default_currency", currency, update_modified=False)

	_set_if_column(
		"Company",
		company_name,
		{
			"accepted_currencies": accepted,
			"fx_tolerance_percent": 3,
			"cheese_is_hotel": 1 if is_hotel else 0,
		},
	)
	return company_name


def ensure_experience(name, company, currency, **fields):
	if frappe.db.exists("Cheese Experience", name):
		frappe.db.set_value(
			"Cheese Experience", name, {"company": company, "currency": currency, **fields},
			update_modified=False,
		)
		return name

	doc = frappe.get_doc(
		{
			"doctype": "Cheese Experience",
			"name": name,
			"company": company,
			"currency": currency,
			"status": "ONLINE",
			"package_mode": "Both",
			**fields,
		}
	)
	doc.insert(ignore_permissions=True, ignore_if_duplicate=True)
	_log(f"experience created: {name} ({currency}) @ {company}")
	return doc.name


def ensure_activity_slots(experience, days=ACTIVITY_SLOT_DAYS, time_from="10:00:00", time_to="12:00:00", capacity=20):
	"""One bookable slot per day so availability lookups return options."""
	created = 0
	for offset in range(1, days + 1):
		day = add_days(nowdate(), offset)
		if frappe.db.exists(
			"Cheese Experience Slot",
			{"experience": experience, "date_from": day, "time_from": time_from},
		):
			continue
		frappe.get_doc(
			{
				"doctype": "Cheese Experience Slot",
				"experience": experience,
				"date_from": day,
				"date_to": day,
				"time_from": time_from,
				"time_to": time_to,
				"max_capacity": capacity,
				"slot_status": "OPEN",
			}
		).insert(ignore_permissions=True, ignore_if_duplicate=True)
		created += 1
	if created:
		_log(f"slots created for {experience}: {created}")


def ensure_hotel_slot(experience, days=HOTEL_SLOT_DAYS, rooms=5):
	"""Hotels use one wide availability window; capacity counts rooms."""
	date_from = nowdate()
	date_to = add_days(nowdate(), days)
	if frappe.db.exists("Cheese Experience Slot", {"experience": experience, "date_from": date_from}):
		return
	frappe.get_doc(
		{
			"doctype": "Cheese Experience Slot",
			"experience": experience,
			"date_from": date_from,
			"date_to": date_to,
			"max_capacity": rooms,
			"slot_status": "OPEN",
		}
	).insert(ignore_permissions=True, ignore_if_duplicate=True)
	_log(f"hotel availability window created for {experience}: {date_from} -> {date_to}")


def ensure_route(name, short_description, description, experience_names):
	if frappe.db.exists("Cheese Route", name):
		return name
	doc = frappe.get_doc(
		{
			"doctype": "Cheese Route",
			"name": name,
			"short_description": short_description,
			"description": description,
			"status": "ONLINE",
			"price_mode": "Sum",
			"deposit_required": 1,
			"deposit_type": "%",
			"deposit_value": 20,
			"deposit_ttl_hours": 48,
			"experiences": [
				{"doctype": "Cheese Route Experience", "experience": exp, "sequence": idx + 1}
				for idx, exp in enumerate(experience_names)
			],
		}
	)
	doc.insert(ignore_permissions=True, ignore_if_duplicate=True)
	_log(f"route created: {name} ({len(experience_names)} experiences)")
	return doc.name


def ensure_contact(full_name, phone, email):
	existing = frappe.db.get_value("Cheese Contact", {"phone": phone}, "name")
	if existing:
		return existing
	doc = frappe.get_doc(
		{
			"doctype": "Cheese Contact",
			"full_name": full_name,
			"phone": phone,
			"email": email,
			"preferred_language": "Spanish",
			"preferred_channel": "WhatsApp",
		}
	).insert(ignore_permissions=True, ignore_if_duplicate=True)
	_log(f"contact created: {full_name} ({phone})")
	return doc.name


def ensure_payment_method(company, category, holder, bank, account, currency, **extra):
	if frappe.db.exists(
		"Cheese Bank Account",
		{"entity_type": "Company", "entity_id": company, "category": category},
	):
		return
	frappe.get_doc(
		{
			"doctype": "Cheese Bank Account",
			"entity_type": "Company",
			"entity_id": company,
			"category": category,
			"holder": holder,
			"bank": bank,
			"account": account,
			"currency": currency,
			"status": "ACTIVE",
			**extra,
		}
	).insert(ignore_permissions=True, ignore_if_duplicate=True)
	_log(f"payment method created: {category} @ {company} ({currency})")


@frappe.whitelist()
def seed_e2e_data():
	"""Create the full e2e dataset. Safe to re-run."""
	# --- Establishments -------------------------------------------------
	cumbre = ensure_company("Granja La Cumbre", "GLC", "UYU", "UYU,USD")
	bodega = ensure_company("Bodega Del Este", "BDE", "USD", "USD,UYU")
	hotel = ensure_company("Hotel Valle Eden", "HVE", "UYU", "UYU,USD", is_hotel=True)

	# --- Experiences ----------------------------------------------------
	# Same currency as its establishment -> no conversion.
	visita = ensure_experience(
		"Visita Guiada La Cumbre", cumbre, "UYU",
		experience_type="ACTIVITY",
		description="Recorrido por la queseria artesanal con degustacion final.",
		individual_price=350, route_price=300,
		deposit_required=1, deposit_type="%", deposit_value=20, deposit_ttl_hours=24,
		event_duration=2 * HOURS,
	)
	# Priced in USD inside a UYU establishment -> conversion path.
	degustacion = ensure_experience(
		"Degustacion Premium", cumbre, "USD",
		experience_type="ACTIVITY",
		description="Degustacion premium de quesos maduros. Precio en USD.",
		individual_price=25, route_price=20,
		deposit_required=1, deposit_type="Amount", deposit_value=5, deposit_ttl_hours=24,
		event_duration=int(1.5 * HOURS),
	)
	tour = ensure_experience(
		"Tour de Vinedos", bodega, "USD",
		experience_type="ACTIVITY",
		description="Recorrido por los vinedos con cata de vinos.",
		individual_price=40, route_price=35,
		deposit_required=1, deposit_type="%", deposit_value=25, deposit_ttl_hours=24,
		event_duration=int(2.5 * HOURS),
	)
	# Hotel room priced in USD inside a UYU hotel -> conversion path.
	habitacion = ensure_experience(
		"Habitacion Doble Valle Eden", hotel, "USD",
		experience_type="HOTEL",
		description="Habitacion doble con vista al valle. Precio por noche en USD.",
		price_per_night=80, route_price=70,
		is_room=1, room_size=2, max_occupancy_per_unit=2, min_nights_stay=1,
		deposit_required=1, deposit_type="%", deposit_value=30, deposit_ttl_days=2,
		cancel_days_before=3, modify_days_before=2, refund_policy="FULL",
	)

	# --- Availability ---------------------------------------------------
	ensure_activity_slots(visita, time_from="10:00:00", time_to="12:00:00", capacity=20)
	ensure_activity_slots(degustacion, time_from="15:00:00", time_to="16:30:00", capacity=12)
	ensure_activity_slots(tour, time_from="17:00:00", time_to="19:30:00", capacity=15)
	ensure_hotel_slot(habitacion, rooms=5)

	# --- Routes ---------------------------------------------------------
	# Single establishment, mixed experience currencies (UYU + USD) ->
	# total converts to the establishment currency (UYU).
	ensure_route(
		"Ruta Quesera Clasica",
		"Visita y degustacion en Granja La Cumbre",
		"Un dia completo en la queseria: recorrido guiado y degustacion premium.",
		[visita, degustacion],
	)
	# Cross-establishment (UYU + USD companies) -> mixed-currency route.
	ensure_route(
		"Ruta Vinos y Quesos",
		"Quesos artesanales y vinedos del este",
		"Combina la visita a la queseria con un tour de vinedos.",
		[visita, tour],
	)

	# --- Contacts -------------------------------------------------------
	ensure_contact("Ana Rodriguez", "+59899100200", "ana.rodriguez@example.com")
	ensure_contact("Bruno Fernandez", "+59899100201", "bruno.fernandez@example.com")
	ensure_contact("Carla Silva", "+59899100202", "carla.silva@example.com")

	# --- Payment methods (one per category) -----------------------------
	ensure_payment_method(cumbre, "BANK_ACCOUNT", "Granja La Cumbre SRL", "BROU", "110068534-00001", "UYU")
	ensure_payment_method(bodega, "PAYPAL", "Bodega Del Este SA", "PayPal", "pagos@bodegadeleste.com", "USD")
	ensure_payment_method(hotel, "MERCADO_PAGO", "Hotel Valle Eden SRL", "Mercado Pago", "valleeden.mp", "UYU")

	frappe.db.commit()
	_log("done")
	return {
		"companies": [cumbre, bodega, hotel],
		"experiences": [visita, degustacion, tour, habitacion],
		"routes": ["Ruta Quesera Clasica", "Ruta Vinos y Quesos"],
	}
