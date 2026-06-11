# Copyright (c) 2024
# License: MIT

import frappe
from frappe.utils import now_datetime
import json


def log_event(entity_type, entity_id, event_type, payload=None):
	"""
	Log an event to System Event DocType
	
	Args:
		entity_type: Type of entity (e.g., "Cheese Ticket")
		entity_id: ID of the entity
		event_type: Type of event (e.g., "status_change")
		payload: Optional dictionary with event data
	"""
	try:
		event = frappe.get_doc({
			"doctype": "Cheese System Event",
			"entity_type": entity_type,
			"entity_id": entity_id,
			"event_type": event_type,
			"payload_json": json.dumps(payload) if payload else None,
			"triggered_by": frappe.session.user,
			"created_at": now_datetime()
		})
		event.insert(ignore_permissions=True)
		frappe.db.commit()
	except Exception as e:
		frappe.log_error(f"Failed to log event: {e}", "Event Logging Error")


def get_events(entity_type, entity_id, event_type=None):
	"""
	Get events for an entity
	
	Args:
		entity_type: Type of entity
		entity_id: ID of the entity
		event_type: Optional filter by event type
		
	Returns:
		List of event documents
	"""
	filters = {
		"entity_type": entity_type,
		"entity_id": entity_id
	}
	
	if event_type:
		filters["event_type"] = event_type
	
	return frappe.get_all(
		"Cheese System Event",
		filters=filters,
		order_by="created_at desc"
	)


def update_route_booking_status(doc, method):
	"""
	Update RouteBooking status when ticket status changes
	
	Args:
		doc: Cheese Ticket document
		method: Method name (on_update)
	"""
	try:
		# Only update if status changed
		if not doc.has_value_changed("status"):
			return
		
		# Find route booking that contains this ticket
		route_booking_name = frappe.db.get_value(
			"Cheese Route Booking Ticket",
			{"ticket": doc.name},
			"parent"
		)
		
		if route_booking_name:
			route_booking = frappe.get_doc("Cheese Route Booking", route_booking_name)
			route_booking.calculate_status()
			if route_booking.has_value_changed("status"):
				route_booking.save(ignore_permissions=True)
				frappe.db.commit()
	except Exception as e:
		# Silently fail to avoid breaking ticket updates
		frappe.log_error(f"Failed to update route booking status: {e}", "Route Booking Update Error")


def on_ticket_created_notify_establishment(doc, method):
	"""
	Send email notification to establishment when a ticket is created.
	Triggered on 'after_insert' of Cheese Ticket.
	"""
	try:
		from cheese.cheese.utils.notifications import send_reservation_email_to_establishment
		# Use enqueue to avoid blocking the transaction
		frappe.enqueue(
			send_reservation_email_to_establishment,
			ticket_id=doc.name,
			queue="short",
			is_async=True
		)
	except Exception as e:
		frappe.log_error(f"Failed to enqueue reservation notification email: {e}", "Notification Error")


# ---------------------------------------------------------------------------
# Multi-tenant company auto-population
# ---------------------------------------------------------------------------
#
# Several Cheese doctypes carry a `company` field for tenant scoping but do not
# require it on the form (the user/API typically doesn't set it explicitly).
# These handlers run on validate / before_insert and derive `company` from the
# linked parent record (ticket, experience, contact, ...).  Without this the
# permission_query_conditions in cheese/utils/permissions.py would filter rows
# out for tenant users.


def _set_if_empty(doc, fieldname, value):
	if value and not getattr(doc, fieldname, None):
		setattr(doc, fieldname, value)


def set_ticket_company(doc, method=None):
	"""Cheese Ticket.company defaults to experience.company when omitted."""
	if doc.experience:
		company = frappe.db.get_value("Cheese Experience", doc.experience, "company")
		_set_if_empty(doc, "company", company)


def set_slot_company(doc, method=None):
	"""Cheese Experience Slot.company defaults to experience.company."""
	if doc.experience:
		company = frappe.db.get_value("Cheese Experience", doc.experience, "company")
		_set_if_empty(doc, "company", company)


def set_attendance_company(doc, method=None):
	"""Cheese Attendance.company defaults to ticket.company."""
	if doc.ticket:
		company = frappe.db.get_value("Cheese Ticket", doc.ticket, "company")
		_set_if_empty(doc, "company", company)


def set_qr_token_company(doc, method=None):
	"""Cheese QR Token.company defaults to ticket.company."""
	if doc.ticket:
		company = frappe.db.get_value("Cheese Ticket", doc.ticket, "company")
		_set_if_empty(doc, "company", company)


def _company_from_ticket(ticket_name):
	if not ticket_name:
		return None
	return frappe.db.get_value("Cheese Ticket", ticket_name, "company")


def _company_from_lead(lead_name):
	if not lead_name:
		return None
	# A Cheese Lead may have an explicit interested_company field; fall back to None.
	for field in ("company", "interested_company"):
		try:
			value = frappe.db.get_value("Cheese Lead", lead_name, field)
		except Exception:
			value = None
		if value:
			return value
	return None


def _company_from_contact(contact_name):
	"""Return the first (primary) company linked to a contact via the
	`companies` child table, if any. Returns None when not linked yet."""
	if not contact_name:
		return None
	row = frappe.db.get_value(
		"Cheese Contact Company",
		{"parent": contact_name, "parenttype": "Cheese Contact"},
		"company",
		order_by="idx asc",
	)
	return row or None


def set_conversation_company(doc, method=None):
	"""Conversation.company is auto-resolved from linked entities.

	Priority order:
	  1. Linked ticket's company   (strongest signal of tenant ownership)
	  2. Linked lead's company
	  3. Primary company on the linked Cheese Contact (if the contact is
	     only attached to one company, that's almost certainly the tenant)
	"""
	if doc.get("company"):
		return

	company = (
		_company_from_ticket(doc.ticket)
		or _company_from_lead(doc.lead)
		or _company_from_contact(doc.contact)
	)
	if company:
		doc.company = company


def set_lead_company(doc, method=None):
	"""Align Cheese Lead.company with the linked contact companies.

	If the lead has no company, use the contact's primary company.
	If the lead already has a company but that company is not linked to the
	contact, normalize it to the contact's primary company to avoid cross-tenant
	leakage caused by user default company values.
	"""
	company = _company_from_contact(doc.contact)
	if not company:
		return

	if not doc.get("company"):
		doc.company = company
		return

	if doc.company == company:
		return

	linked = set(
		frappe.get_all(
			"Cheese Contact Company",
			filters={"parent": doc.contact, "parenttype": "Cheese Contact"},
			pluck="company",
		)
	)
	if doc.company not in linked:
		doc.company = company


def set_booking_policy_company(doc, method=None):
	"""Cheese Booking Policy.company defaults to the legacy experience's company
	(when the legacy back-reference is filled in) so existing rows keep working
	until the operator picks an explicit company for the shared policy."""
	if doc.get("company"):
		return
	if doc.experience:
		company = frappe.db.get_value("Cheese Experience", doc.experience, "company")
		_set_if_empty(doc, "company", company)


def link_contact_to_ticket_company(doc, method=None):
	"""When a Cheese Ticket is created, make sure the Cheese Contact lists this
	ticket's company in its `companies` child table.

	This ensures multi-tenant visibility for contacts that book at several
	establishments — each company appears in the child table, and the
	cheese_contact_query restriction returns the contact for users of any of
	those companies.
	"""
	if not (doc.contact and doc.company):
		return
	try:
		contact = frappe.get_doc("Cheese Contact", doc.contact)
	except frappe.DoesNotExistError:
		return

	existing = {row.company for row in (contact.get("companies") or [])}
	if doc.company in existing:
		return

	contact.append(
		"companies",
		{"company": doc.company, "linked_at": now_datetime()},
	)
	contact.save(ignore_permissions=True)


def filter_contact_companies_for_user(doc, method=None):
	"""Hide other establishments' company links from establishment users."""
	from cheese.cheese.utils.permissions import _is_super_admin, get_user_companies

	if _is_super_admin(frappe.session.user):
		return

	companies = set(get_user_companies(frappe.session.user))
	if not companies:
		doc.companies = []
		return

	doc.companies = [
		row for row in (doc.get("companies") or []) if row.company in companies
	]
