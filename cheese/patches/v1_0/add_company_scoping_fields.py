"""
Multi-tenant scoping (issues #270 / #271 / #261).

Adds a `company` column to the doctypes that didn't have one yet and backfills
the value from the linked parent records. Also reloads `Cheese Contact` so the
new `companies` child table appears, and seeds it from existing tickets.

It is safe to re-run.
"""

import frappe
from frappe.utils import now_datetime


def execute():
    for module_doctype in [
        "conversation",
        "cheese_booking_policy",
        "cheese_experience_slot",
        "cheese_attendance",
        "cheese_qr_token",
        "cheese_contact_company",
        "cheese_contact",
        "cheese_ticket",
    ]:
        try:
            frappe.reload_doc("cheese", "doctype", module_doctype)
        except Exception as exc:  # pragma: no cover - migration robustness
            frappe.log_error(
                f"add_company_scoping_fields: failed to reload {module_doctype}: {exc}",
                "Cheese Migration",
            )

    _backfill_conversation_company()
    _backfill_slot_company()
    _backfill_attendance_company()
    _backfill_qr_token_company()
    _backfill_booking_policy_company()
    _backfill_contact_companies()
    _backfill_lead_company()

    frappe.db.commit()


def _backfill_lead_company():
    if not _exists_field("Cheese Lead", "company"):
        return
    rows = frappe.db.sql(
        """
        SELECT l.name, l.contact
        FROM `tabCheese Lead` l
        WHERE COALESCE(l.company, '') = ''
        """,
        as_dict=True,
    )
    for row in rows:
        company = None
        if row.contact:
            company = frappe.db.get_value(
                "Cheese Contact Company",
                {"parent": row.contact, "parenttype": "Cheese Contact"},
                "company",
                order_by="idx asc",
            )
        if company:
            frappe.db.set_value(
                "Cheese Lead", row.name, "company", company, update_modified=False
            )


def _exists_field(doctype, fieldname):
    try:
        meta = frappe.get_meta(doctype)
    except Exception:
        return False
    return any(df.fieldname == fieldname for df in meta.fields)


def _backfill_conversation_company():
    if not _exists_field("Conversation", "company"):
        return

    rows = frappe.db.sql(
        """
        SELECT c.name, c.contact, c.ticket, c.lead
        FROM `tabConversation` c
        WHERE COALESCE(c.company, '') = ''
        """,
        as_dict=True,
    )
    for row in rows:
        company = None
        if row.ticket:
            company = frappe.db.get_value("Cheese Ticket", row.ticket, "company")
        if not company and row.lead:
            try:
                company = frappe.db.get_value("Cheese Lead", row.lead, "company")
            except Exception:
                company = None
        if not company and row.contact:
            company = frappe.db.get_value(
                "Cheese Contact Company",
                {"parent": row.contact, "parenttype": "Cheese Contact"},
                "company",
                order_by="idx asc",
            )
        if company:
            frappe.db.set_value(
                "Conversation", row.name, "company", company, update_modified=False
            )


def _backfill_slot_company():
    if not _exists_field("Cheese Experience Slot", "company"):
        return
    frappe.db.sql(
        """
        UPDATE `tabCheese Experience Slot` s
        JOIN `tabCheese Experience` e ON e.name = s.experience
        SET s.company = e.company
        WHERE COALESCE(s.company, '') = ''
          AND COALESCE(e.company, '') <> ''
        """
    )


def _backfill_attendance_company():
    if not _exists_field("Cheese Attendance", "company"):
        return
    frappe.db.sql(
        """
        UPDATE `tabCheese Attendance` a
        JOIN `tabCheese Ticket` t ON t.name = a.ticket
        SET a.company = t.company
        WHERE COALESCE(a.company, '') = ''
          AND COALESCE(t.company, '') <> ''
        """
    )


def _backfill_qr_token_company():
    if not _exists_field("Cheese QR Token", "company"):
        return
    frappe.db.sql(
        """
        UPDATE `tabCheese QR Token` q
        JOIN `tabCheese Ticket` t ON t.name = q.ticket
        SET q.company = t.company
        WHERE COALESCE(q.company, '') = ''
          AND COALESCE(t.company, '') <> ''
        """
    )


def _backfill_booking_policy_company():
    if not _exists_field("Cheese Booking Policy", "company"):
        return
    # Use the legacy `experience` back-ref as a starting point; the operator
    # can adjust the company afterwards if they reuse the policy across
    # multiple establishments.
    frappe.db.sql(
        """
        UPDATE `tabCheese Booking Policy` p
        JOIN `tabCheese Experience` e ON e.name = p.experience
        SET p.company = e.company
        WHERE COALESCE(p.company, '') = ''
          AND COALESCE(e.company, '') <> ''
        """
    )


def _backfill_contact_companies():
    """Seed Cheese Contact.companies from every distinct (contact, company)
    pair found in Cheese Ticket. Idempotent."""
    if not frappe.db.has_table("tabCheese Contact Company"):
        return

    pairs = frappe.db.sql(
        """
        SELECT DISTINCT t.contact, t.company
        FROM `tabCheese Ticket` t
        WHERE COALESCE(t.contact, '') <> '' AND COALESCE(t.company, '') <> ''
        """,
        as_dict=True,
    )

    inserted = 0
    for pair in pairs:
        already = frappe.db.exists(
            "Cheese Contact Company",
            {
                "parent": pair.contact,
                "parenttype": "Cheese Contact",
                "company": pair.company,
            },
        )
        if already:
            continue
        try:
            contact = frappe.get_doc("Cheese Contact", pair.contact)
        except frappe.DoesNotExistError:
            continue
        contact.append(
            "companies",
            {"company": pair.company, "linked_at": now_datetime()},
        )
        contact.save(ignore_permissions=True)
        inserted += 1

    if inserted:
        print(
            f"add_company_scoping_fields: linked {inserted} (contact, company) pairs "
            f"in Cheese Contact.companies"
        )
