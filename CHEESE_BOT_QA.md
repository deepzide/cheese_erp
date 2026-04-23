# Cheese Bot API — manual QA

## Per-day slot capacity

1. Create or pick a `Cheese Experience Slot` with `date_from` & `date_to` spanning multiple days and `max_capacity` N.
2. Call `availability_controller.get_availability` (or `get_available_slots`) with `date_from` / `date_to` covering those days. Expect **one row per calendar day** per slot (`selected_date`, `available_capacity` for that day).
3. `ticket_controller.create_pending_ticket` with `selected_date` = day A and `party_size` &lt; N; repeat `get_availability` for day A — `available_capacity` should drop by `party_size`; **other days** unchanged.
4. `experience_controller.list_time_slots` with a date window: rows include `calendar_date` and per-day `available_capacity`.

## Route time selection

1. `availability_controller.get_route_availability` with `route_id`, `date_from`, `date_to`, `party_size` — inspect `experiences[].available_slots` (each entry has `selected_date`).
2. `route_booking_controller.get_available_slots_for_route` with `route_id`, `selected_date` (or range), `party_size` — pick slot ids per experience.
3. `route_booking_controller.create_route_reservation` with `experiences_with_slots` from step 2, or rely on auto-selection via `date_from` / `date_to`.

## Deposit vs balance (`payment_type`)

1. `deposit_controller.get_deposit_instructions` with `ticket_id` and `payment_type`: `"Deposit"` or `"Balance"`.
2. `deposit_controller.record_deposit_payment` with the same `payment_type` (form field) plus amount / receipt as required.
3. Optional: `get_payment_link_or_instructions` with `payment_type` in JSON body.

## Establishment details documents

1. `establishment_controller.get_establishment_details` — includes `Cheese Document` rows for `entity_type` = Company **and** published documents linked to experiences of that company.
2. Demo helper: `cheese.demo.populate_establishment_and_experience_test_values` — returns `populated_company_ids` for tracker rows (e.g. row 150).

## Demo / seed data

- `cheese.demo.populate_establishment_and_experience_test_values()` — fills establishment cheese fields and sample link + experience image documents; response lists affected companies.
