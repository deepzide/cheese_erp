# Copyright (c) 2024
# License: MIT

import frappe
from frappe.utils import add_to_date

from cheese.cheese.utils.time import utcnow


def send_post_completion_surveys():
	"""
	Send surveys for COMPLETED tickets that don't have a survey response yet
	Run daily
	"""
	# Get completed tickets from last 24 hours without survey
	from frappe.query_builder import functions as fn
	from frappe.query_builder import DocType

	ticket = DocType("Cheese Ticket")
	survey = DocType("Cheese Survey Response")
	slot = DocType("Cheese Experience Slot")

	# Only send surveys for tickets that have been COMPLETED for at least 30 minutes
	# AND whose slot end time has definitively passed
	survey_delay_minutes = 30
	now = utcnow()

	effective_date = fn.Coalesce(ticket.selected_date, slot.date_to, slot.date_from)
	effective_end = fn.Concat(effective_date, " ", fn.Coalesce(slot.time_to, "23:59:59"))

	completed_tickets = (
		frappe.qb.from_(ticket)
		.left_join(slot).on(ticket.slot == slot.name)
		.select(ticket.name)
		.where(ticket.status == "COMPLETED")
		.where(ticket.modified >= add_to_date(now, days=-1, as_string=False))
		.where(
			# Ensure the slot end time has actually passed + buffer
			fn.TimestampDiff("MINUTE", effective_end, now) >= survey_delay_minutes
		)
		.where(
			~fn.Exists(
				frappe.qb.from_(survey)
				.select("*")
				.where(survey.ticket == ticket.name)
			)
		)
	).run(as_dict=True)

	survey_count = 0

	for ticket_data in completed_tickets:
		try:
			# Import here to avoid circular dependency
			from cheese.api.v1.survey_controller import send_survey
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
	# Get survey responses with rating <= 2 that don't have a support case
	from frappe.query_builder import functions as fn
	from frappe.query_builder import DocType

	survey = DocType("Cheese Survey Response")
	support_case = DocType("Cheese Support Case")

	low_rating_surveys = (
		frappe.qb.from_(survey)
		.select(survey.name, survey.ticket, survey.contact, survey.rating, survey.comment)
		.where(survey.rating <= 2)
		.where(
			~fn.Exists(
				frappe.qb.from_(support_case)
				.select("*")
				.where(support_case.survey_response == survey.name)
			)
		)
	).run(as_dict=True)

	case_count = 0

	for survey_data in low_rating_surveys:
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

			# Create support case with full context
			support_case_doc = frappe.get_doc({
				"doctype": "Cheese Support Case",
				"contact": survey_data.contact,
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
