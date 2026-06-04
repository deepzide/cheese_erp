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

# Impossible Company value used to "fail closed": injected as a normal company
# filter so a tenant user with no resolvable company sees nothing instead of
# everything. Shared by the query-condition builders and the custom-endpoint
# scoping helper (user_controller._get_current_user_company).
NO_COMPANY_SENTINEL = "__no_company_for_user__"


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
    """Return scoped Company names for the current user.

    Uses Frappe's standard `User Permission` rows with allow="Company".
    For establishment-level users we intentionally scope to exactly one
    company (the earliest assigned permission). This enforces strict tenant
    isolation even when stale extra User Permission rows exist.
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
        order_by="creation desc",
    )
    company_values = [p.for_value for p in perms if p.for_value]
    if not company_values:
        return []

    roles = set(frappe.get_roles(user))
    if any(role in roles for role in ESTABLISHMENT_USER_ROLES):
        # Level-2 users must operate in a single-establishment context.
        return [company_values[0]]

    return company_values


def _quote_list(values: Iterable[str]) -> str:
    """Safely quote a list of company names for inclusion in a SQL IN clause."""
    return ", ".join(frappe.db.escape(v) for v in values)


def _none_visible(table_alias: str) -> str:
    """Hide everything for a tenant user with no assigned company."""
    return f"`{table_alias}`.name = '{NO_COMPANY_SENTINEL}'"


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
	"""Conversations visible when the tenant has uploaded messages for them."""
	if _is_super_admin(user):
		return ""

	companies = get_user_companies(user)
	table = "tabConversation"
	if not companies:
		return _none_visible(table)

	quoted = _quote_list(companies)
	return (
		f"`{table}`.name IN ("
		f"SELECT DISTINCT conversation FROM `tabCheese Message` "
		f"WHERE conversation IS NOT NULL AND conversation != '' "
		f"AND company IN ({quoted}))"
	)


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


def cheese_route_booking_query(user):
    """Scope route bookings through their child tickets' companies."""
    if _is_super_admin(user):
        return ""

    companies = get_user_companies(user)
    table = "tabCheese Route Booking"
    if not companies:
        return _none_visible(table)

    quoted = _quote_list(companies)
    return (
        f"`{table}`.name IN ("
        f"SELECT parent FROM `tabCheese Route Booking Ticket` "
        f"WHERE parenttype = 'Cheese Route Booking' "
        f"AND ticket IN (SELECT name FROM `tabCheese Ticket` WHERE company IN ({quoted}))"
        f")"
    )


def company_query(user):
	"""Scope Company docs to the establishment user's assigned companies."""
	if _is_super_admin(user):
		return ""
	companies = get_user_companies(user)
	table = "tabCompany"
	if not companies:
		return _none_visible(table)
	quoted = _quote_list(companies)
	return f"`{table}`.`name` IN ({quoted})"


def cheese_route_query(user):
	"""Scope routes to those linked to at least one allowed-company experience."""
	if _is_super_admin(user):
		return ""
	companies = get_user_companies(user)
	table = "tabCheese Route"
	if not companies:
		return _none_visible(table)
	quoted = _quote_list(companies)
	return (
		f"`{table}`.`name` IN ("
		f"SELECT re.parent FROM `tabCheese Route Experience` re "
		f"INNER JOIN `tabCheese Experience` ce ON ce.name = re.experience "
		f"WHERE ce.company IN ({quoted})"
		f")"
	)


def cheese_quotation_query(user):
	return _build_company_condition("Cheese Quotation", user)


def cheese_deposit_query(user):
	"""Scope deposits via linked ticket / route-booking ticket companies."""
	if _is_super_admin(user):
		return ""
	companies = get_user_companies(user)
	table = "tabCheese Deposit"
	if not companies:
		return _none_visible(table)
	quoted = _quote_list(companies)
	return (
		f"("
		f"(`{table}`.`entity_type` = 'Cheese Ticket' "
		f" AND `{table}`.`entity_id` IN (SELECT name FROM `tabCheese Ticket` WHERE company IN ({quoted})))"
		f" OR "
		f"(`{table}`.`entity_type` = 'Cheese Route Booking' "
		f" AND `{table}`.`entity_id` IN ("
		f"   SELECT rbt.parent FROM `tabCheese Route Booking Ticket` rbt "
		f"   INNER JOIN `tabCheese Ticket` t ON t.name = rbt.ticket "
		f"   WHERE t.company IN ({quoted})"
		f" ))"
		f")"
	)


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


def cheese_message_query(user):
	"""Messages are scoped by their own company field."""
	return _build_company_condition("Cheese Message", user)


def cheese_complaint_query(user):
    """Complaints are scoped via the linked ticket's company or contact's companies."""
    if _is_super_admin(user):
        return ""

    companies = get_user_companies(user)
    table = "tabCheese Complaint"
    if not companies:
        return _none_visible(table)

    quoted = _quote_list(companies)
    return (
        f"(`{table}`.ticket IN ("
        f"SELECT name FROM `tabCheese Ticket` WHERE company IN ({quoted}))"
        f" OR `{table}`.contact IN ("
        f"SELECT parent FROM `tabCheese Contact Company` "
        f"WHERE parenttype = 'Cheese Contact' AND company IN ({quoted})))"
    )


def cheese_system_event_query(user):
    """Audit events scoped via their dynamic entity link.

    Events whose ``entity_type`` is not a recognised tenant-scoped doctype are
    hidden from establishment users (fail closed). Super admins see everything.
    """
    if _is_super_admin(user):
        return ""

    companies = get_user_companies(user)
    table = "tabCheese System Event"
    if not companies:
        return _none_visible(table)

    quoted = _quote_list(companies)
    return (
        f"("
        f"(`{table}`.entity_type = 'Company' AND `{table}`.entity_id IN ({quoted}))"
        f" OR (`{table}`.entity_type = 'Cheese Experience' AND `{table}`.entity_id IN ("
        f"   SELECT name FROM `tabCheese Experience` WHERE company IN ({quoted})))"
        f" OR (`{table}`.entity_type = 'Cheese Ticket' AND `{table}`.entity_id IN ("
        f"   SELECT name FROM `tabCheese Ticket` WHERE company IN ({quoted})))"
		f" OR (`{table}`.entity_type = 'Conversation' AND `{table}`.entity_id IN ("
		f"   SELECT DISTINCT conversation FROM `tabCheese Message` "
		f"   WHERE conversation IS NOT NULL AND conversation != '' "
		f"   AND company IN ({quoted})))"
        f" OR (`{table}`.entity_type = 'Cheese Contact' AND `{table}`.entity_id IN ("
        f"   SELECT parent FROM `tabCheese Contact Company` "
        f"   WHERE parenttype = 'Cheese Contact' AND company IN ({quoted})))"
        f")"
    )


def cheese_route_experience_query(user):
    """Route-experience child rows scoped via the linked experience's company."""
    if _is_super_admin(user):
        return ""

    companies = get_user_companies(user)
    table = "tabCheese Route Experience"
    if not companies:
        return _none_visible(table)

    quoted = _quote_list(companies)
    return f"`{table}`.experience IN (SELECT name FROM `tabCheese Experience` WHERE company IN ({quoted}))"


def cheese_quotation_experience_query(user):
    """Quotation-experience child rows scoped via the linked experience's company."""
    if _is_super_admin(user):
        return ""

    companies = get_user_companies(user)
    table = "tabCheese Quotation Experience"
    if not companies:
        return _none_visible(table)

    quoted = _quote_list(companies)
    return f"`{table}`.experience IN (SELECT name FROM `tabCheese Experience` WHERE company IN ({quoted}))"


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
	user = user or frappe.session.user
	if _is_super_admin(user):
		return True

	companies = get_user_companies(user)
	if not companies:
		return False

	return bool(
		frappe.db.exists(
			"Cheese Message",
			{"conversation": doc.name, "company": ["in", companies]},
		)
	)


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


def has_route_booking_permission(doc, ptype="read", user=None):
    user = user or frappe.session.user
    if _is_super_admin(user):
        return True

    companies = set(get_user_companies(user))
    if not companies:
        return False

    ticket_ids = [row.ticket for row in (doc.get("tickets") or []) if row.ticket]
    if not ticket_ids:
        return False

    ticket_companies = set(
        frappe.get_all(
            "Cheese Ticket",
            filters={"name": ["in", ticket_ids]},
            pluck="company",
        )
    )
    return bool(ticket_companies & companies)


def has_company_doc_permission(doc, ptype="read", user=None):
	user = user or frappe.session.user
	if _is_super_admin(user):
		return True
	companies = set(get_user_companies(user))
	if not companies:
		return False
	return doc.name in companies


def has_route_permission(doc, ptype="read", user=None):
	user = user or frappe.session.user
	if _is_super_admin(user):
		return True
	companies = set(get_user_companies(user))
	if not companies:
		return False
	exp_ids = [row.experience for row in (doc.get("experiences") or []) if row.experience]
	if not exp_ids:
		return False
	exp_companies = set(
		frappe.get_all(
			"Cheese Experience",
			filters={"name": ["in", exp_ids]},
			pluck="company",
		)
	)
	return bool(exp_companies & companies)


def has_deposit_permission(doc, ptype="read", user=None):
	user = user or frappe.session.user
	if _is_super_admin(user):
		return True
	companies = set(get_user_companies(user))
	if not companies:
		return False
	if doc.entity_type == "Cheese Ticket":
		company = frappe.db.get_value("Cheese Ticket", doc.entity_id, "company")
		return company in companies
	if doc.entity_type == "Cheese Route Booking":
		ticket_ids = frappe.get_all(
			"Cheese Route Booking Ticket",
			filters={"parent": doc.entity_id},
			pluck="ticket",
		)
		if not ticket_ids:
			return False
		ticket_companies = set(
			frappe.get_all(
				"Cheese Ticket",
				filters={"name": ["in", ticket_ids]},
				pluck="company",
			)
		)
		return bool(ticket_companies & companies)
	return False


def _contact_companies(contact: Optional[str]) -> set:
	if not contact:
		return set()
	return set(
		frappe.get_all(
			"Cheese Contact Company",
			filters={"parent": contact, "parenttype": "Cheese Contact"},
			pluck="company",
		)
	)


def has_message_permission(doc, ptype="read", user=None):
	user = user or frappe.session.user
	if _is_super_admin(user):
		return True
	companies = set(get_user_companies(user))
	if not companies:
		return False
	return doc.get("company") in companies


def has_complaint_permission(doc, ptype="read", user=None):
	user = user or frappe.session.user
	if _is_super_admin(user):
		return True
	companies = set(get_user_companies(user))
	if not companies:
		return False
	if doc.get("ticket"):
		ticket_company = frappe.db.get_value("Cheese Ticket", doc.ticket, "company")
		if ticket_company in companies:
			return True
	return bool(_contact_companies(doc.get("contact")) & companies)


def has_system_event_permission(doc, ptype="read", user=None):
	user = user or frappe.session.user
	if _is_super_admin(user):
		return True
	companies = set(get_user_companies(user))
	if not companies:
		return False
	entity_type, entity_id = doc.get("entity_type"), doc.get("entity_id")
	if not entity_type or not entity_id:
		return False
	if entity_type == "Company":
		return entity_id in companies
	if entity_type in ("Cheese Experience", "Cheese Ticket"):
		return frappe.db.get_value(entity_type, entity_id, "company") in companies
	if entity_type == "Conversation":
		return bool(
			frappe.db.exists(
				"Cheese Message",
				{"conversation": entity_id, "company": ["in", list(companies)]},
			)
		)
	if entity_type == "Cheese Contact":
		return bool(_contact_companies(entity_id) & companies)
	return False


def _experience_company_in(experience: Optional[str], companies: set) -> bool:
	if not experience:
		return False
	return frappe.db.get_value("Cheese Experience", experience, "company") in companies


def has_route_experience_permission(doc, ptype="read", user=None):
	user = user or frappe.session.user
	if _is_super_admin(user):
		return True
	companies = set(get_user_companies(user))
	if not companies:
		return False
	return _experience_company_in(doc.get("experience"), companies)


def has_quotation_experience_permission(doc, ptype="read", user=None):
	return has_route_experience_permission(doc, ptype, user)
