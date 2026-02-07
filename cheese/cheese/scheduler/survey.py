# Copyright (c) 2024
# License: MIT

import frappe
from frappe.utils import now_datetime, add_to_date


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

	completed_tickets = (
		frappe.qb.from_(ticket)
		.select(ticket.name)
		.where(ticket.status == "COMPLETED")
		.where(ticket.modified >= add_to_date(now_datetime(), days=-1, as_string=False))
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
			from cheese.cheese.api.v1.survey_controller import send_survey
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
			# Create support case
			support_case_doc = frappe.get_doc({
				"doctype": "Cheese Support Case",
				"contact": survey_data.contact,
				"ticket": survey_data.ticket,
				"survey_response": survey_data.name,
				"description": f"Low rating survey response (Rating: {survey_data.rating}). Comment: {survey_data.comment or 'No comment'}",
				"status": "OPEN",
				"priority": "High" if survey_data.rating == 1 else "Medium"
			})
			support_case_doc.insert(ignore_permissions=True)
			case_count += 1
		except Exception as e:
			frappe.log_error(f"Failed to create support case for survey {survey_data.name}: {e}")

	frappe.db.commit()

	if case_count > 0:
		frappe.logger().info(f"Created {case_count} support cases for low ratings")

	return case_count
