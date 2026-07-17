# Cheese — Technical Documentation

Cheese is a multi-company reservation and route-booking platform built on **Frappe Framework v15** and **ERPNext**. It serves establishment operators, route administrators, and conversational bots (WhatsApp/Telegram) through a REST API and a React SPA.

## Documentation Index

| Document | Contents |
|----------|----------|
| [Architecture & Design](./ARCHITECTURE.md) | Module structure, data flows, API surface, framework choices |
| [Code & Standards](./CODE_STANDARDS.md) | Naming, patterns, linting, comments, usage examples |
| [Configuration & Deployment](./DEPLOYMENT.md) | Environment variables, Docker stack, CI/CD, staging/QA/production |

## Related Resources

- [Developer setup (Docker)](../README.md) — `apps.json`, `custom.txt`, container bootstrap
- [Postman collection](../Cheese_Bot_API.postman_collection.json) — full Bot API reference
- [Demo data](../cheese/demo_data/README.md) — local seed data for development

## External Services

### Currency exchange rates (multi-currency)

Prices and deposit payments entered in any accepted currency are converted to the
establishment's preferred currency (`Company.default_currency`) using free, no-API-key
rate sources. A daily scheduler job (`cheese.cheese.utils.currency_rates.sync_exchange_rates`)
fetches USD-based rates and persists them in ERPNext's dated `Currency Exchange` doctype, so
conversions read stored rates at request time (no live API call per request) and an admin can
override any rate by editing a `Currency Exchange` record.

| Role | Provider | Endpoint | Notes |
|------|----------|----------|-------|
| Primary | ExchangeRate-API (open access) | `https://open.er-api.com/v6/latest/USD` | Free, no API key, ~160 currencies (incl. UYU/ARS/BRL/EUR), daily updates |
| Fallback | fawazahmed0 / exchange-api (jsDelivr CDN) | `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json` | Free, no API key; used only if the primary source fails |

Supported currencies: UYU, USD, EUR, BRL, ARS. See
[`cheese/cheese/utils/currency_rates.py`](./cheese/cheese/utils/currency_rates.py).

## Quick Links

| Environment | Branch | Image tag | Domain |
|-------------|--------|-----------|--------|
| Staging | `develop` | `demo` | `erp-cheese-dev.deepzide.com` |
| Production | `main` | `latest` | `erp-cheese.deepzide.com` |
