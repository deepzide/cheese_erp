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
