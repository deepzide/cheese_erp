# Copyright (c) 2024
# License: MIT

import frappe
from frappe.utils import now_datetime, add_to_date


def send_post_completion_surveys():
	"""
	Send surveys for COMPLETED tickets that don't have a survey response yet
	Run daily

	Uses plain frappe.get_all + Python filtering instead of query-builder
	functions (TimestampDiff / Exists are not available in every pypika
	version bundled with frappe, and crashed this job on build).
	"""
	from cheese.api.v1.survey_controller import send_survey
	from cheese.cheese.scheduler.completion import _ticket_effective_end

	# Only send surveys for tickets that have been COMPLETED for at least 30
	# minutes AND whose experience end (slot end / hotel checkout) has passed.
	survey_delay_minutes = 30
	now = now_datetime()

	completed_tickets = frappe.get_all(
		"Cheese Ticket",
		filters={
			"status": "COMPLETED",
			"modified": [">=", add_to_date(now, days=-1, as_string=False)],
		},
		fields=["name", "slot", "selected_date", "experience", "check_out_date"],
	)
	if not completed_tickets:
		return 0

	already_surveyed = set(
		frappe.get_all(
			"Cheese Survey Response",
			filters={"ticket": ["in", [t.name for t in completed_tickets]]},
			pluck="ticket",
		)
	)

	survey_count = 0

	for ticket_data in completed_tickets:
		if ticket_data.name in already_surveyed:
			continue
		try:
			# Same end-of-experience semantics as the auto-complete scheduler
			# (slot end for activities, checkout time for hotels).
			effective_end = _ticket_effective_end(ticket_data)
			if not effective_end:
				continue
			if (now - effective_end).total_seconds() < survey_delay_minutes * 60:
				continue

			send_survey(ticket_data.name)
			survey_count += 1
		except Exception as e:
			frappe.log_error(f"Failed to send survey for ticket {ticket_data.name}: {e}")

	frappe.db.commit()

	if survey_count > 0:
		frappe.logger().info(f"Sent {survey_count} post-completion surveys")

	return survey_count


def create_support_cases_for_low_ratings():
	"""
	Create support cases for survey responses with rating <= 2
	Run daily
	"""
	low_rating_surveys = frappe.get_all(
		"Cheese Survey Response",
		filters={"rating": ["<=", 2]},
		fields=["name", "ticket", "contact", "rating", "comment"],
	)
	if not low_rating_surveys:
		return 0

	surveys_with_case = set(
		frappe.get_all(
			"Cheese Support Case",
			filters={"survey_response": ["in", [s.name for s in low_rating_surveys]]},
			pluck="survey_response",
		)
	)

	case_count = 0

	for survey_data in low_rating_surveys:
		if survey_data.name in surveys_with_case:
			continue
		try:
			# Enrich with ticket context for better support case information
			ticket_info = {}
			if survey_data.ticket:
				ticket_info = frappe.db.get_value(
					"Cheese Ticket", survey_data.ticket,
					["experience", "company", "route", "contact", "total_price", "party_size"],
					as_dict=True
				) or {}

			experience_name = ticket_info.get("experience") or ""
			company_name = ticket_info.get("company") or ""

			# Build enriched description
			desc_parts = [
				f"⭐ Rating: {survey_data.rating}/5",
				f"💬 Comment: {survey_data.comment or 'No comment provided'}",
			]
			if experience_name:
				desc_parts.append(f"🎯 Experience: {experience_name}")
			if company_name:
				desc_parts.append(f"🏢 Establishment: {company_name}")
			if ticket_info.get("party_size"):
				desc_parts.append(f"👥 Party Size: {ticket_info['party_size']}")
			if ticket_info.get("total_price"):
				desc_parts.append(f"💰 Total Price: ${ticket_info['total_price']}")

			description = "\n".join(desc_parts)

			# Create support case with full context. Survey rows created via
			# submit_survey have no contact of their own — fall back to the ticket's.
			support_case_doc = frappe.get_doc({
				"doctype": "Cheese Support Case",
				"contact": survey_data.contact or ticket_info.get("contact"),
				"ticket": survey_data.ticket,
				"survey_response": survey_data.name,
				"description": description,
				"status": "OPEN",
				"priority": "High" if survey_data.rating == 1 else "Medium",
				"route": ticket_info.get("route"),
				"company": company_name,
			})
			support_case_doc.insert(ignore_permissions=True)
			case_count += 1
		except Exception as e:
			frappe.log_error(f"Failed to create support case for survey {survey_data.name}: {e}")

	frappe.db.commit()

	if case_count > 0:
		frappe.logger().info(f"Created {case_count} support cases for low ratings")

	return case_count
