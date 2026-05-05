import frappe

def execute():
    doctypes = frappe.get_all("DocType", filters={"module": "Cheese", "custom": 0}, pluck="name")
    for dt in doctypes:
        meta = frappe.get_meta(dt)
        has_company = any(f.fieldname == "company" for f in meta.fields)
        print(f"{dt}: {'HAS COMPANY' if has_company else 'NO COMPANY'}")
