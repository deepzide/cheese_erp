# Copyright (c) 2026
# License: MIT
"""Provision one scoped "bot" user per establishment (Company).

Each per-establishment bot deployment authenticates to the ERP as its own user.
That user carries the ``Cheese Establishment User`` + ``Cheese Booking Agent``
roles and a ``User Permission`` on a single ``Company`` — so the existing
tenant-isolation layer (``cheese.cheese.utils.access``) scopes every query and
booking to that establishment automatically.

Usage (from the bench directory):

    # One company
    bench --site <site> execute \
        cheese.cheese.utils.provision_bot_users.provision_bot_user \
        --kwargs "{'company': 'Los Criollitos'}"

    # Every active company at once
    bench --site <site> execute \
        cheese.cheese.utils.provision_bot_users.provision_all

Each call prints the credentials the bot needs in its ``.env``:
``ERP_USER`` (email), ``ERP_PASSWORD``, plus the derived ``api_key`` / ``api_secret``.
Passwords are auto-generated unless one is supplied; store them in the bot's
secret manager.
"""

from __future__ import annotations

import re

import frappe
from frappe.utils.password import get_decrypted_password, update_password

# Roles that grant single-company scoping (via the Company User Permission) plus
# the doctype read/write access the bot needs. Mirrors user_controller.create_user
# and the roles exercised by cheese/test_access_isolation.py.
BOT_ROLES = (
    "Cheese Establishment User",
    "Cheese Booking Agent",
    "Establishment User",
)

# Central/aggregator company that is not a real establishment; skipped by
# provision_all so we don't create an unscoped bot user by accident.
CENTRAL_COMPANY = "Ruta del Queso"

BOT_EMAIL_DOMAIN = "cheesebot.local"


def _slug(company: str) -> str:
    """Filesystem/email-safe slug for a company name."""
    slug = re.sub(r"[^a-z0-9]+", "-", company.lower()).strip("-")
    return slug or "establishment"


def _default_email(company: str) -> str:
    return f"bot.{_slug(company)}@{BOT_EMAIL_DOMAIN}"


def _ensure_roles(user_doc) -> bool:
    """Append any missing bot roles that exist as Role docs. Returns True if changed."""
    existing = {r.role for r in user_doc.roles}
    changed = False
    for role in BOT_ROLES:
        if role in existing:
            continue
        if not frappe.db.exists("Role", role):
            # Establishment User may not exist on every site; skip silently.
            continue
        user_doc.append("roles", {"role": role})
        changed = True
    return changed


def _ensure_company_permission(email: str, company: str) -> None:
    """Ensure the user has exactly one Company User Permission for *company*."""
    # Remove any Company permission pointing elsewhere (keeps scoping to one company).
    for perm in frappe.get_all(
        "User Permission",
        filters={"user": email, "allow": "Company"},
        fields=["name", "for_value"],
    ):
        if perm.for_value != company:
            frappe.delete_doc("User Permission", perm.name, ignore_permissions=True)

    if not frappe.db.exists(
        "User Permission",
        {"user": email, "allow": "Company", "for_value": company},
    ):
        frappe.get_doc(
            {
                "doctype": "User Permission",
                "user": email,
                "allow": "Company",
                "for_value": company,
                "apply_to_all_doctypes": 1,
            }
        ).insert(ignore_permissions=True)


def _ensure_api_credentials(user_doc) -> tuple[str, str]:
    """Ensure the user has an api_key/api_secret pair; return ``(api_key, api_secret)``."""
    changed = False
    if not user_doc.api_key:
        user_doc.api_key = frappe.generate_hash(length=15)
        changed = True

    api_secret = None
    try:
        api_secret = get_decrypted_password("User", user_doc.name, "api_secret")
    except Exception:
        api_secret = None
    if not api_secret:
        api_secret = frappe.generate_hash(length=15)
        user_doc.api_secret = api_secret
        changed = True

    if changed:
        user_doc.save(ignore_permissions=True)
    return user_doc.api_key, api_secret


def provision_bot_user(
    company: str,
    email: str | None = None,
    password: str | None = None,
) -> dict:
    """Create/update the scoped bot user for *company* and return its credentials.

    Idempotent: safe to run repeatedly. A new password is only set when one is
    provided or when the user is created for the first time.
    """
    if not frappe.db.exists("Company", company):
        frappe.throw(f"Company '{company}' does not exist")

    email = email or _default_email(company)
    created = False

    if frappe.db.exists("User", email):
        user_doc = frappe.get_doc("User", email)
    else:
        user_doc = frappe.get_doc(
            {
                "doctype": "User",
                "email": email,
                "first_name": f"Bot {company}",
                "enabled": 1,
                "user_type": "System User",
                "send_welcome_email": 0,
            }
        )
        user_doc.insert(ignore_permissions=True)
        created = True

    if _ensure_roles(user_doc):
        user_doc.save(ignore_permissions=True)

    _ensure_company_permission(email, company)

    # Set a password on creation (auto-generated) or when explicitly provided.
    set_password = password or (frappe.generate_hash(length=20) if created else None)
    if set_password:
        update_password(email, set_password)

    api_key, api_secret = _ensure_api_credentials(user_doc)
    frappe.db.commit()

    result = {
        "company": company,
        "email": email,
        "created": created,
        "password": set_password,  # None when an existing password was kept
        "api_key": api_key,
        "api_secret": api_secret,
        "roles": [r.role for r in user_doc.roles],
    }
    _print_result(result)
    return result


def provision_all(password: str | None = None) -> list[dict]:
    """Provision a scoped bot user for every active establishment Company."""
    companies = frappe.get_all(
        "Company",
        filters={"name": ["!=", CENTRAL_COMPANY]},
        pluck="name",
        order_by="name asc",
    )
    results = []
    for company in companies:
        try:
            results.append(provision_bot_user(company, password=password))
        except Exception as exc:  # noqa: BLE001 - keep going for the rest
            frappe.log_error(f"provision_bot_user failed for {company}: {exc}")
            print(f"  [ERROR] {company}: {exc}")
    print(f"\nProvisioned {len(results)} bot user(s).")
    return results


def verify_bot_scope(email: str) -> dict:
    """Smoke-check that *email* only sees its own establishment's data.

    Impersonates the bot user and reports how many experiences / routes /
    establishments are visible and which companies they belong to. Use after
    provisioning to confirm the scoping is effective end to end. Restores the
    Administrator session on exit.

        bench --site <site> execute \
            cheese.cheese.utils.provision_bot_users.verify_bot_scope \
            --kwargs "{'email': 'bot.los-criollitos@cheesebot.local'}"
    """
    from cheese.api.v1.user_controller import _get_current_user_company

    original_user = frappe.session.user
    try:
        frappe.set_user(email)
        scope_company = _get_current_user_company()
        exp = frappe.get_all(
            "Cheese Experience", fields=["name", "company"], limit_page_length=0
        )
        routes = frappe.get_all("Cheese Route", pluck="name", limit_page_length=0)
        exp_companies = sorted({e.company for e in exp if e.company})
        result = {
            "email": email,
            "scope_company": scope_company,
            "experiences_visible": len(exp),
            "experience_companies": exp_companies,
            "routes_visible": len(routes),
            "leak": [c for c in exp_companies if c != scope_company],
        }
    finally:
        frappe.set_user(original_user)

    print("\n" + "=" * 60)
    print(f"Bot user        : {result['email']}")
    print(f"Scope company   : {result['scope_company']}")
    print(f"Experiences     : {result['experiences_visible']} "
          f"(companies: {result['experience_companies']})")
    print(f"Routes visible  : {result['routes_visible']}")
    if result["leak"]:
        print(f"  [LEAK] sees other companies' experiences: {result['leak']}")
    else:
        print("  OK: no cross-company experience leak")
    print("=" * 60)
    return result


def _print_result(result: dict) -> None:
    print("\n" + "=" * 60)
    print(f"Establishment : {result['company']}")
    print(f"ERP_USER      : {result['email']}")
    if result["password"]:
        print(f"ERP_PASSWORD  : {result['password']}   <-- store this, shown once")
    else:
        print("ERP_PASSWORD  : (unchanged; existing password kept)")
    print(f"api_key       : {result['api_key']}")
    print(f"api_secret    : {result['api_secret']}")
    print(f"roles         : {', '.join(result['roles'])}")
    print("=" * 60)
