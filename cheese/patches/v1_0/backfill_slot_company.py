"""Backfill Cheese Experience Slot.company from its linked experience.

Older slots were created before the `set_slot_company` validate hook landed,
so they live in the DB with `company = NULL`. Tenant-scoped permission checks
in `cheese.cheese.utils.access.assert_slot_access` then reject delete/update
calls from Establishment Users even when their company matches the slot's
parent experience (issue #265).

This patch is idempotent: it only touches rows where `company` is empty.
"""

import frappe


def execute():
    frappe.reload_doc("cheese", "doctype", "cheese_experience_slot")

    rows = frappe.db.sql(
        """
        SELECT s.name, e.company
        FROM `tabCheese Experience Slot` s
        LEFT JOIN `tabCheese Experience` e ON s.experience = e.name
        WHERE (s.company IS NULL OR s.company = '')
          AND e.company IS NOT NULL
          AND e.company <> ''
        """,
        as_dict=True,
    )

    if not rows:
        return

    for row in rows:
        frappe.db.set_value(
            "Cheese Experience Slot",
            row.name,
            "company",
            row.company,
            update_modified=False,
        )

    frappe.db.commit()
    print(f"backfill_slot_company: synced company on {len(rows)} slot(s)")
