import frappe


def execute():
    frappe.reload_doc("cheese", "doctype", "cheese_route_experience")
