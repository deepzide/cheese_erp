# Copyright (c) 2026
# License: MIT
"""
Multi-tenant permission helpers for the Cheese ERP.

Two roles drive visibility:
  * Route Administrator   - super admin, sees every establishment's data
  * Establishment User    - tenant user, sees only data belonging to companies
                            assigned to them via standard Frappe User Permission
                            (allow="Company", for_value=<Company name>)

Each public function follows the Frappe ``permission_query_conditions`` contract:
it returns a SQL-WHERE-fragment string (without leading "AND"/"WHERE") that
constrains list views and `frappe.get_list` queries, or returns an empty string
to mean "no extra restriction".

We also expose ``has_permission`` callables for direct ``frappe.get_doc`` access
checks. Together they prevent bypass via URL/API parameters.
"""

from typing import Iterable, List, Optional

import frappe


SUPER_ADMIN_ROLES = (
	"Route Administrator",
	"Administrator",
	"System Manager",
	"Central Admin",
)

# Tenant establishment roles (must stay in sync with user_controller / fixtures).
ESTABLISHMENT_USER_ROLES = ("Establishment User", "Cheese Establishment User")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _is_super_admin(user: Optional[str] = None) -> bool:
    user = user or frappe.session.user
    if user == "Administrator":
        return True
    roles = set(frappe.get_roles(user))
    return any(role in roles for role in SUPER_ADMIN_ROLES)


def get_user_companies(user: Optional[str] = None) -> List[str]:
    """Return the list of Company names the user has access to.

    Uses Frappe's standard `User Permission` rows with allow="Company".
    Returns an empty list when no permission is set (i.e. tenant user with
    no company yet — they should see nothing rather than everything).
    """
    user = user or frappe.session.user
    if not user or user == "Guest":
        return []
    if _is_super_admin(user):
        return []  # caller must treat empty + super-admin as "all companies"

    perms = frappe.get_all(
        "User Permission",
        filters={"user": user, "allow": "Company"},
        fields=["for_value"],
    )
    return [p.for_value for p in perms if p.for_value]


def _quote_list(values: Iterable[str]) -> str:
    """Safely quote a list of company names for inclusion in a SQL IN clause."""
    return ", ".join(frappe.db.escape(v) for v in values)


def _none_visible(table_alias: str) -> str:
    """Hide everything for a tenant user with no assigned company."""
    return f"`{table_alias}`.name = '__no_company_for_user__'"


# ---------------------------------------------------------------------------
# Generic builders
# ---------------------------------------------------------------------------


def _build_company_condition(doctype: str, user: str) -> str:
    """Restrict rows to those whose `company` matches the user's assigned companies."""
    if _is_super_admin(user):
        return ""

    companies = get_user_companies(user)
    table = f"tab{doctype}"

    if not companies:
        return _none_visible(table)

    quoted = _quote_list(companies)
    # NULL company is treated as "global / not yet assigned" and intentionally
    # hidden from tenant users. Super admins still see everything.
    return f"`{table}`.`company` IN ({quoted})"


def _build_via_link_condition(
    doctype: str,
    user: str,
    *,
    link_fieldname: str,
    link_doctype: str,
) -> str:
    """Restrict rows by following a Link field to a parent doctype that carries `company`.

    Used by Cheese Attendance / Cheese QR Token (linked through Cheese Ticket).
    """
    if _is_super_admin(user):
        return ""

    companies = get_user_companies(user)
    table = f"tab{doctype}"

    if not companies:
        return _none_visible(table)

    quoted = _quote_list(companies)
    return (
        f"`{table}`.`{link_fieldname}` IN "
        f"(SELECT name FROM `tab{link_doctype}` WHERE company IN ({quoted}))"
    )


def _build_dynamic_link_condition(doctype: str, user: str) -> str:
    """Restrict rows whose `entity_type`/`entity_id` resolves to a company-scoped record.

    Used by Cheese Bank Account and Cheese Document. The supported entity types are:
      * Company                — entity_id IS the company name (cheap match)
      * Cheese Experience      — join experience.company
      * Cheese Route           — routes are cross-establishment; never visible to
                                 a tenant user that didn't create them via a
                                 company-scoped flow. Use experience join.
      * Cheese Ticket          — join ticket.company
    """
    if _is_super_admin(user):
        return ""

    companies = get_user_companies(user)
    table = f"tab{doctype}"

    if not companies:
        return _none_visible(table)

    quoted = _quote_list(companies)
    return (
        f"("
        f"(`{table}`.`entity_type` = 'Company' AND `{table}`.`entity_id` IN ({quoted}))"
        f" OR (`{table}`.`entity_type` = 'Cheese Experience'"
        f"     AND `{table}`.`entity_id` IN ("
        f"         SELECT name FROM `tabCheese Experience` WHERE company IN ({quoted})))"
        f" OR (`{table}`.`entity_type` = 'Cheese Ticket'"
        f"     AND `{table}`.`entity_id` IN ("
        f"         SELECT name FROM `tabCheese Ticket` WHERE company IN ({quoted})))"
        f")"
    )


# ---------------------------------------------------------------------------
# Public query-condition entrypoints (registered in hooks.py)
# ---------------------------------------------------------------------------


def cheese_ticket_query(user):
    return _build_company_condition("Cheese Ticket", user)


def cheese_experience_query(user):
    return _build_company_condition("Cheese Experience", user)


def cheese_experience_slot_query(user):
    return _build_company_condition("Cheese Experience Slot", user)


def cheese_booking_policy_query(user):
    return _build_company_condition("Cheese Booking Policy", user)


def cheese_survey_response_query(user):
    return _build_company_condition("Cheese Survey Response", user)


def cheese_support_case_query(user):
    return _build_company_condition("Cheese Support Case", user)


def conversation_query(user):
    return _build_company_condition("Conversation", user)


def cheese_attendance_query(user):
    # Attendance has its own company column (auto-populated from ticket), so
    # we can apply the cheap direct filter and avoid the join.
    return _build_company_condition("Cheese Attendance", user)


def cheese_qr_token_query(user):
    return _build_company_condition("Cheese QR Token", user)


def cheese_bank_account_query(user):
    return _build_dynamic_link_condition("Cheese Bank Account", user)


def cheese_document_query(user):
    return _build_dynamic_link_condition("Cheese Document", user)


def cheese_lead_query(user):
	"""Leads are scoped by explicit company or via the linked contact's companies."""
	if _is_super_admin(user):
		return ""

	companies = get_user_companies(user)
	table = "tabCheese Lead"
	if not companies:
		return _none_visible(table)

	quoted = _quote_list(companies)
	return (
		f"(`{table}`.`company` IN ({quoted})"
		f" OR `{table}`.contact IN ("
		f"SELECT parent FROM `tabCheese Contact Company` "
		f"WHERE parenttype = 'Cheese Contact' AND company IN ({quoted})"
		f"))"
	)


def cheese_contact_query(user):
    """Cheese Contact uses a child table `companies` for many-to-many visibility."""
    if _is_super_admin(user):
        return ""

    companies = get_user_companies(user)
    table = "tabCheese Contact"
    if not companies:
        return _none_visible(table)

    quoted = _quote_list(companies)
    return (
        f"`{table}`.name IN ("
        f"SELECT parent FROM `tabCheese Contact Company` "
        f"WHERE parenttype = 'Cheese Contact' AND company IN ({quoted})"
        f")"
    )


# ---------------------------------------------------------------------------
# has_permission callbacks (per-document checks for get_doc / form view)
# ---------------------------------------------------------------------------


def _doc_company(doc) -> Optional[str]:
    return getattr(doc, "company", None)


def has_company_permission(doc, ptype="read", user=None):
    """Generic has_permission: doc.company must match a user-assigned company."""
    user = user or frappe.session.user
    if _is_super_admin(user):
        return True

    companies = get_user_companies(user)
    if not companies:
        return False

    company = _doc_company(doc)
    return company in companies


def has_conversation_permission(doc, ptype="read", user=None):
    return has_company_permission(doc, ptype, user)


def has_lead_permission(doc, ptype="read", user=None):
	user = user or frappe.session.user
	if _is_super_admin(user):
		return True

	companies = get_user_companies(user)
	if not companies:
		return False

	if doc.get("company") and doc.company in companies:
		return True

	contact_companies = set()
	if doc.contact:
		rows = frappe.get_all(
			"Cheese Contact Company",
			filters={"parent": doc.contact, "parenttype": "Cheese Contact"},
			pluck="company",
		)
		contact_companies = set(rows)
	return bool(contact_companies & set(companies))


def has_contact_permission(doc, ptype="read", user=None):
    user = user or frappe.session.user
    if _is_super_admin(user):
        return True

    companies = get_user_companies(user)
    if not companies:
        return False

    contact_companies = {row.company for row in (doc.get("companies") or [])}
    return bool(contact_companies & set(companies))


def has_bank_account_permission(doc, ptype="read", user=None):
    user = user or frappe.session.user
    if _is_super_admin(user):
        return True

    companies = get_user_companies(user)
    if not companies:
        return False

    if doc.entity_type == "Company":
        return doc.entity_id in companies
    if doc.entity_type == "Cheese Experience":
        exp_company = frappe.db.get_value("Cheese Experience", doc.entity_id, "company")
        return exp_company in companies
    if doc.entity_type == "Cheese Ticket":
        tkt_company = frappe.db.get_value("Cheese Ticket", doc.entity_id, "company")
        return tkt_company in companies
    return False


def has_document_permission(doc, ptype="read", user=None):
    return has_bank_account_permission(doc, ptype, user)
