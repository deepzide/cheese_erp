"""Force-reload Cheese Ticket / Cheese Experience Slot / Cheese Booking Policy.

A few sprint-mayo-18-25 fixes landed in the doctype JSON without bumping the
`modified` timestamp, so deployed sites kept the old schema:
 - Cheese Ticket got a `notes` field (issue #268) that operators report as missing.
 - Cheese Experience Slot got the recurrence fields used by the
   Google-Calendar-style edit modal (issue #260).
 - Cheese Booking Policy got the deprecated-but-kept `experience` description.

`reload_doc` re-runs `import-doc` for the JSON file, which is what `bench
migrate` would do if the timestamp changed. Running it here guarantees the
new fields exist regardless of the modified-timestamp history.
"""

import frappe


def execute():
    frappe.reload_doc("cheese", "doctype", "cheese_ticket")
    frappe.reload_doc("cheese", "doctype", "cheese_experience_slot")
    frappe.reload_doc("cheese", "doctype", "cheese_booking_policy")
    frappe.reload_doc("cheese", "doctype", "cheese_experience")
    frappe.db.commit()
