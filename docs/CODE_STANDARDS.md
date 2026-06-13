# Code & Standards

## 1. Repository Layout Conventions

| Path | Convention |
|------|------------|
| `cheese/api/v1/<domain>_controller.py` | One controller per business domain; only `@frappe.whitelist()` functions are public API |
| `cheese/cheese/doctype/<snake_name>/` | DocType JSON + Python controller + optional JS |
| `cheese/cheese/utils/<topic>.py` | Shared logic imported by controllers and DocType classes |
| `cheese/cheese/scheduler/<job>.py` | Background jobs registered in `hooks.py` |
| `cheese/patches/v1_0/` | Idempotent migration scripts referenced in `patches.txt` |
| `frontend/src/pages/` | Route-level React components |
| `frontend/src/components/` | Reusable UI primitives |

---

## 2. Python Style

Configuration lives in `pyproject.toml` under `[tool.ruff]`.

| Rule | Standard |
|------|----------|
| Line length | 110 characters |
| Indentation | Tabs (Frappe convention) |
| Quotes | Double quotes |
| Target Python | 3.10+ |
| Imports | Sorted by Ruff (`I` rule); group stdlib → third-party → frappe → local |
| Type hints | Used on new helpers; DocType classes include auto-generated `TYPE_CHECKING` blocks |

### 2.1 Naming

| Element | Pattern | Example |
|---------|---------|---------|
| DocType | Title Case with `Cheese` prefix | `Cheese Ticket` |
| DocType module folder | snake_case | `cheese_ticket/` |
| Python class | PascalCase matching DocType | `class CheeseTicket(Document)` |
| Whitelisted API | snake_case verb phrases | `create_pending_ticket` |
| Private helpers | Leading underscore | `_resolve_lead_company` |
| Constants | UPPER_SNAKE_CASE | `SUPER_ADMIN_ROLES`, `NO_COMPANY_SENTINEL` |

### 2.2 Controller Pattern

Controllers are thin orchestration layers: validate input, call utils/DocType methods, return a JSON envelope.

```python
@frappe.whitelist()
def create_pending_ticket(contact_id, experience_id, slot_id, party_size=1, **kwargs):
	"""Create a PENDING Cheese Ticket and lock slot capacity."""
	# 1. Validate & normalize inputs (validation.py helpers)
	# 2. Enforce company access (access.py / permissions.py)
	# 3. Delegate to DocType or util
	# 4. Log system event (events.log_event)
	return {"success": True, "message": _("Ticket created"), "data": payload}
```

**Rules:**

- Never bypass permissions with `ignore_permissions=True` in controllers unless the operation is system-level (scheduler, event logging).
- Prefer `frappe.get_doc` + `.insert()` / `.save()` over raw SQL for business mutations.
- Use `frappe.throw(_("…"))` for user-facing errors; log unexpected exceptions with `frappe.log_error`.

### 2.3 DocType Pattern

Business invariants belong on the DocType class:

```python
class CheeseTicket(Document):
	VALID_TRANSITIONS = {
		"PENDING": ["CONFIRMED", "CANCELLED", "EXPIRED", "REJECTED"],
		# ...
	}

	def validate(self):
		if not self.is_new():
			self.validate_status_transition()
		self.validate_duplicate_active_ticket()
```

Document hooks that span DocTypes (e.g., syncing route booking status) live in `cheese/cheese/utils/events.py` and are wired in `hooks.py` under `doc_events`.

### 2.4 Patches

- One file per migration under `cheese/patches/v1_0/`.
- Register in `cheese/patches.txt`.
- Must be **idempotent** (safe to re-run).
- Use `frappe.db.exists` / column checks before altering schema.

---

## 3. JavaScript / Frontend Style

| Rule | Standard |
|------|----------|
| Framework | React 18 functional components + hooks |
| Styling | Tailwind CSS utility classes; `cn()` helper for conditional classes |
| Components | Radix UI primitives for accessibility |
| Data fetching | TanStack React Query (`useQuery`, `useMutation`) |
| Routing | React Router v7 (`frontend/src/pages/`) |
| API calls | Centralized in `frontend/src/api/client.js` |

### 3.1 API Client Usage

```javascript
import { apiRequest } from '../api/client';

// GET whitelisted method
const data = await apiRequest(
  'cheese.api.v1.ticket_controller.list_tickets',
  { page: 1, status: 'PENDING' }
);

// POST with JSON body
const result = await apiRequest(
  'cheese.api.v1.ticket_controller.create_pending_ticket',
  { contact_id, experience_id, slot_id, party_size: 2 },
  'POST'
);
```

Credentials are set after login via `setStoredCredentials()`; all subsequent requests send `Authorization: token <key>:<secret>`.

### 3.2 Build & Asset Pipeline

```bash
cd frontend
npm ci
npm run build   # vite build + copy to cheese/public/frontend/
```

In Docker, the Dockerfile runs `npm run build` and `bench build --app cheese` during the image build stage.

---

## 4. Applied Patterns

| Pattern | Where | Purpose |
|---------|-------|---------|
| **Status machine** | `CheeseTicket`, `CheeseRouteBooking` | Prevent invalid lifecycle transitions |
| **Fail-closed tenancy** | `permissions.py` | Users without company assignment see zero rows |
| **Policy snapshot** | Ticket `policy_snapshot` JSON | Immutable cancel/modify rules at booking time |
| **Price snapshot** | Ticket `price_snapshot` JSON | Audit trail for quoted vs. charged amounts |
| **System events** | `events.log_event` | Append-only audit log decoupled from DocType versions |
| **Idempotent contact resolution** | `contact_controller.find_or_create_contact` | Bots can safely retry without duplicates |
| **Preview / confirm** | Modification endpoints | Two-phase changes (`modify_*_preview` → `confirm_*`) |
| **Scheduler expiration** | `scheduler/expiration.py` | Time-based state transitions without user action |

---

## 5. Comments & Documentation

### 5.1 When to Comment

Add docstrings or comments when logic is **non-obvious**:

- Permission scoping rules (`permissions.py` module docstring is the reference).
- Status propagation across linked documents (`events.update_route_booking_status`).
- Capacity locking and slot recurrence edge cases.
- OCR / deposit reconciliation math in `deposit_controller.py`.

Avoid narrating what the code already states (`# increment counter`).

### 5.2 Critical Functions (documented in code)

| Function | File | Purpose |
|----------|------|---------|
| `log_event` | `utils/events.py` | Writes immutable `Cheese System Event` rows |
| `update_route_booking_status` | `utils/events.py` | Aggregates child ticket statuses into route booking |
| `get_user_companies` | `utils/permissions.py` | Resolves tenant scope from User Permissions |
| `cheese_ticket_query` | `utils/permissions.py` | SQL fragment for list-view isolation |
| `_compute_effective_balance` | `api/v1/deposit_controller.py` | Deposit phase and remaining balance logic |
| `_find_valid_combinations_for_date` | `api/v1/route_booking_controller.py` | Route slot combinatorics |

### 5.3 Usage Examples

**Local bench development**

```bash
# Install app on a bench site
bench --site mysite.local install-app cheese
bench --site mysite.local migrate

# Load demo data
bench --site mysite.local execute cheese.demo.setup_demo_data

# Run a whitelisted method from CLI
bench --site mysite.local execute cheese.api.v1.ticket_controller.list_tickets --kwargs '{"page": 1}'
```

**Create a pending ticket via HTTP**

```bash
curl -s -X POST "https://erp-cheese-dev.deepzide.com/api/method/cheese.api.v1.auth_controller.token" \
  -H "Content-Type: application/json" \
  -d '{"grant_type":"password","username":"user@example.com","password":"secret"}'

curl -s -X POST "https://erp-cheese-dev.deepzide.com/api/method/cheese.api.v1.ticket_controller.create_pending_ticket" \
  -H "Authorization: token KEY:SECRET" \
  -H "Content-Type: application/json" \
  -d '{"contact_id":"CONTACT-001","experience_id":"EXP-001","slot_id":"SLOT-001","party_size":2}'
```

**Run linter**

```bash
cd apps/cheese
ruff check .
ruff format --check .
```

---

## 6. Testing

| Test | Location | Scope |
|------|----------|-------|
| Access isolation | `cheese/test_access_isolation.py` | Multi-tenant permission boundaries |
| Manual / Postman | `Cheese_Bot_API.postman_collection.json` | End-to-end API flows |

Run tests:

```bash
bench --site mysite.local run-tests --app cheese
```

When adding tenant-scoped features, extend `test_access_isolation.py` to prove establishment users cannot read peer company data.

---

## 7. Git & Branching

| Branch | Image tag | Deploy target |
|--------|-----------|---------------|
| `develop` | `demo` | Staging (`erp-cheese-dev.deepzide.com`) |
| `main` | `latest` | Production servers |

Feature work branches from `develop`. Production releases merge `develop` → `main` after QA sign-off.
