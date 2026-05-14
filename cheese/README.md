# Per-establishment data isolation — Developer onboarding

**Repo**: `deepzide/cheese_erp` · branch `main` · live spec: **v2.3 (May 2026)**

This pack is the onboarding documentation for developers joining the **per-establishment isolation** sprint in Viventi (Cheese ERP). Your job: separate data and users between the establishments in the pilot, without breaking the bot or the API already in production.

---

## What problem we're solving

Today any operator with role `Cheese Booking Manager` can see **all data from all companies** in the system. No `permission_query_conditions` are declared. The contact, lead, and conversation doctypes don't have a `company` field — they're global by design (one customer who inquires across multiple establishments is a single record), but **there's no visibility layer** deciding who can see what.

What we're building:

1. **Bridge table** `Cheese Contact Establishment Link` — records which establishments have visibility on each contact, maintained automatically by hooks.
2. **Permission queries** — filter list views via SQL `WHERE` at the Frappe layer.
3. **Bypass role for the bot** — `Cheese Bot Service` — so the `cheese.api.v1.*` API keeps working as before.
4. **Conditional Hotel module** — hidden for non-hotel establishments.
5. **Capabilities endpoint + multi-establishment filter** — the frontend filters the sidebar based on role and establishment type, and offers a multi-select establishment filter for users assigned to multiple companies.

---

## Reading order (≈1.5 hours)

Read in order. Each builds on the previous.

| # | Doc | Time | What for |
|---|---|---|---|
| 1 | [`01-onboarding.md`](./01-onboarding.md) | 25 min | Stack, glossary, repo map, local setup |
| 2 | [`02-architecture.md`](./02-architecture.md) | 15 min | The architectural decision and why |
| 3 | [`03-doctypes.md`](./03-doctypes.md) | 15 min | New doctypes + fields to denormalize |
| 4 | [`04-roles-and-permissions.md`](./04-roles-and-permissions.md) | 20 min | Roles, permission queries, has_permission |
| 5 | [`05-hooks-events.md`](./05-hooks-events.md) | 10 min | Auto-maintenance of the link table |
| 6 | [`06-bot-and-api.md`](./06-bot-and-api.md) | 10 min | How NOT to break the bot |
| 7 | [`07-frontend.md`](./07-frontend.md) | 15 min | Capabilities + dynamic sidebar + multi-establishment filter |
| 8 | [`08-migration.md`](./08-migration.md) | 10 min | Deploy order + backfill |
| 9 | [`09-tests.md`](./09-tests.md) | 10 min | pytest suite + CI gates |
| 10 | [`10-do-not-touch.md`](./10-do-not-touch.md) | 5 min | Forbidden zones + PR checklist |

> **Recommendation**: read all 10 before touching code. Each takes under 30 minutes. The upfront investment saves you undoing later.

---

## Source of truth

This documentation is an onboarding guide. When there's a conflict, **the original spec wins**:

- `spec_aislamiento_v2_3.html` — **current spec** (v2.3, May 2026). Primary source.
- `spec_aislamiento_establecimientos.html` — v1, May 2026. Historically useful; some decisions changed in v2.3.

When a note here says *"see §X"*, it refers to the corresponding section of the v2.3 HTML.

---

## Local setup (5 minutes)

You need a Frappe v15+ bench running locally.

```bash
git clone https://github.com/deepzide/cheese_erp.git
cd cheese_erp
bench --site <site-name> install-app cheese
bench --site <site-name> migrate

# Frontend
cd frontend && pnpm i && pnpm dev
```

To test against the pilot environment: `https://erp-cheese.deepzide.com` — ask Naya for credentials.

---

## Project contacts

- **Naya** (founder, product owner) — product decisions, priorities, scope
- **Yousef** (current dev of the Frappe repo) — existing architecture, API contracts, historical context
- **Bot repo** (`cheese_route_bot`) — **do not touch**. If anything bot-related blocks you, comment with Naya before doing anything.

---

## Golden rules

1. **Don't break the bot.** The `cheese.api.v1.*` contracts are immutable (changes must be backward-compatible only).
2. **Specs before code.** When something is unclear, raise it in spec/PR comments first, implement second.
3. **Don't expand scope.** If you find a bug outside isolation — note it, don't fix it in this sprint.
4. **Tests are mandatory.** Nothing merges without the green pytest suite (`09-tests.md`).
5. **Audit before merging.** See checklist in [`10-do-not-touch.md`](./10-do-not-touch.md).
