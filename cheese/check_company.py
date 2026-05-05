import frappe

def execute():
    for dt in ["Cheese Ticket", "Cheese Experience", "Cheese Route", "Cheese Route Booking"]:
        meta = frappe.get_meta(dt)
        has_company = any(f.fieldname == "company" for f in meta.fields)
        print(f"{dt} has company: {has_company}")
