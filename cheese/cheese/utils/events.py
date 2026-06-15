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


def _contact_company_list(contact_name):
	if not contact_name:
		return []
	return frappe.get_all(
		"Cheese Contact Company",
		filters={"parent": contact_name, "parenttype": "Cheese Contact"},
		pluck="company",
		order_by="idx asc",
	)


def _lead_company_rows(doc):
	return list(doc.get("companies") or [])


def _lead_company_set(doc):
	return {row.company for row in _lead_company_rows(doc) if row.company}


def set_lead_company(doc, method=None):
	"""Sync Cheese Lead companies child table and primary `company` field.

	On new leads, copy contact company links when the lead has none yet.
	Ensure the primary `company` field matches a row in the child table and
	remains one of the linked contact's companies when possible.
	"""
	contact_companies = _contact_company_list(doc.contact)
	lead_companies = _lead_company_set(doc)

	lead_status = doc.get("status") or "OPEN"

	if doc.is_new() and not lead_companies and contact_companies:
		for company in contact_companies:
			doc.append(
				"companies",
				{
					"company": company,
					"status": lead_status,
					"linked_at": now_datetime(),
					"last_interaction_at": doc.get("last_interaction_at") or now_datetime(),
				},
			)
			lead_companies = _lead_company_set(doc)

	if doc.get("company") and doc.company not in lead_companies:
		if doc.company in contact_companies or not contact_companies:
			doc.append(
				"companies",
				{
					"company": doc.company,
					"status": lead_status,
					"linked_at": now_datetime(),
					"last_interaction_at": doc.get("last_interaction_at") or now_datetime(),
				},
			)
			lead_companies = _lead_company_set(doc)
		elif contact_companies:
			doc.company = contact_companies[0]

	if not doc.get("company"):
		if lead_companies:
			doc.company = _lead_company_rows(doc)[0].company
		elif contact_companies:
			doc.company = contact_companies[0]
			doc.append(
				"companies",
				{
					"company": doc.company,
					"status": lead_status,
					"linked_at": now_datetime(),
					"last_interaction_at": doc.get("last_interaction_at") or now_datetime(),
				},
			)

	if doc.get("company") and doc.company not in _lead_company_set(doc):
		doc.append(
			"companies",
			{
				"company": doc.company,
				"status": lead_status,
				"linked_at": now_datetime(),
				"last_interaction_at": doc.get("last_interaction_at") or now_datetime(),
			},
		)

	# Normalize invalid primary company to the first child row.
	linked = _lead_company_set(doc)
	if linked and doc.get("company") and doc.company not in linked:
		doc.company = _lead_company_rows(doc)[0].company
	elif linked and doc.get("company") and doc.company in contact_companies:
		pass
	elif linked and contact_companies and doc.get("company") not in contact_companies:
		doc.company = next(
			(c for c in contact_companies if c in linked),
			_lead_company_rows(doc)[0].company,
		)

	from cheese.cheese.utils.lead_company import sync_company_rows_from_parent

	sync_company_rows_from_parent(doc)


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


def filter_lead_companies_for_user(doc, method=None):
	"""Hide other establishments' company links from establishment users."""
	from cheese.cheese.utils.permissions import _is_super_admin, get_user_companies

	if _is_super_admin(frappe.session.user):
		return

	companies = set(get_user_companies(frappe.session.user))
	if not companies:
		doc.companies = []
		return

	filtered = [
		row for row in (doc.get("companies") or []) if row.company in companies
	]
	doc.companies = filtered

	if len(filtered) == 1:
		from cheese.cheese.utils.lead_company import apply_company_row_to_parent

		apply_company_row_to_parent(doc, filtered[0].company)
	elif filtered:
		from cheese.api.v1.user_controller import _get_current_user_company

		user_company = _get_current_user_company()
		if user_company and user_company in companies:
			from cheese.cheese.utils.lead_company import apply_company_row_to_parent

			apply_company_row_to_parent(doc, user_company)
