import frappe


def count_of(resp):
    data = resp.get("data") if isinstance(resp, dict) else resp
    if isinstance(data, dict) and "data" in data:
        data = data["data"]
    return len(data) if isinstance(data, list) else data


def run():
    from cheese.api.v1 import (
        experience_controller as exp,
        route_controller as rc,
        ticket_controller as tc,
        route_booking_controller as rbc,
        deposit_controller as dc,
        contact_controller as cc,
        lead_controller as lc,
        quotation_controller as qc,
        conversation_controller as conv,
        attendance_controller as ac,
        survey_controller as sc,
        complaint_controller as cpc,
        document_controller as doc,
    )

    calls = {
        "experiences": lambda: exp.list_experiences(page_size=500),
        "routes": lambda: rc.list_routes(page_size=500),
        "tickets": lambda: tc.list_tickets(page_size=500),
        "route_bookings": lambda: rbc.list_route_bookings(page_size=500),
        "deposits": lambda: dc.list_deposits(page_size=500),
        "contacts": lambda: cc.list_contacts(page_size=500),
        "leads": lambda: lc.list_leads(page_size=500),
        "quotations": lambda: qc.list_quotations(page_size=500),
        "conversations": lambda: conv.list_conversations(page_size=500),
        "attendance": lambda: ac.list_attendance(page_size=500),
        "surveys": lambda: sc.list_survey_responses(page_size=500),
        "complaints": lambda: cpc.list_complaints(page_size=500),
        "documents": lambda: doc.list_documents(page_size=500),
    }

    results = {}
    for user in ["Administrator", "yosef@yosef.com"]:
        frappe.set_user(user)
        results[user] = {}
        for label, fn in calls.items():
            try:
                results[user][label] = count_of(fn())
            except Exception as e:
                results[user][label] = f"ERR {type(e).__name__}: {e}"

    print("\n%-18s %12s %12s %s" % ("LIST", "ADMIN", "YOSEF", "LEAK?"))
    for label in calls:
        a = results["Administrator"][label]
        y = results["yosef@yosef.com"][label]
        leak = ""
        if isinstance(a, int) and isinstance(y, int):
            leak = "<-- LEAK" if (y == a and a > 0) else "ok"
        print("%-18s %12s %12s %s" % (label, a, y, leak))
