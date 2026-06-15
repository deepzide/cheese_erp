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

## Quick Links

| Environment | Branch | Image tag | Domain |
|-------------|--------|-----------|--------|
| Staging | `develop` | `demo` | `erp-cheese-dev.deepzide.com` |
| Production | `main` | `latest` | `erp-cheese.deepzide.com` |
