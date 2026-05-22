"""
Backfill Cheese Experience.booking_policy from the legacy 1-to-1 model.

Previously a Cheese Booking Policy held a `experience` Link (1 policy per experience).
The model is now many-to-one (one shared policy can serve many experiences), so the
authoritative link lives on Cheese Experience.booking_policy.

This patch:
  1. Reloads both doctypes so the new `booking_policy` field exists on Cheese Experience
     and the legacy `experience` field on Cheese Booking Policy is reflected as optional.
  2. For every experience that has no `booking_policy` yet, copies the existing legacy
     back-reference (Cheese Booking Policy.experience) into Cheese Experience.booking_policy.

It is safe to re-run: experiences that already have a booking_policy are skipped.
"""

import frappe


def execute():
    frappe.reload_doc("cheese", "doctype", "cheese_booking_policy")
    frappe.reload_doc("cheese", "doctype", "cheese_experience")

    policies = frappe.get_all(
        "Cheese Booking Policy",
        filters={"experience": ["is", "set"]},
        fields=["name", "experience"],
    )

    updated = 0
    for policy in policies:
        existing = frappe.db.get_value(
            "Cheese Experience", policy.experience, "booking_policy"
        )
        if existing:
            continue
        frappe.db.set_value(
            "Cheese Experience",
            policy.experience,
            "booking_policy",
            policy.name,
            update_modified=False,
        )
        updated += 1

    if updated:
        frappe.db.commit()
        print(
            f"backfill_experience_booking_policy: linked {updated} experiences to their policy"
        )
