# Copyright (c) 2024
# License: MIT

import frappe
from frappe import _
from frappe.utils import now_datetime
from cheese.api.common.responses import success, created, error, not_found, validation_error


@frappe.whitelist()
def send_survey(ticket_id):
	"""
	Send survey for a completed ticket
	
	Args:
		ticket_id: ID of the ticket
		
	Returns:
		Success response with survey data
	"""
	try:
		if not ticket_id:
			return validation_error("ticket_id is required")

		if not frappe.db.exists("Cheese Ticket", ticket_id):
			return not_found("Ticket", ticket_id)

		ticket = frappe.get_doc("Cheese Ticket", ticket_id)
		
		if ticket.status != "COMPLETED":
			return validation_error(
				f"Survey can only be sent for COMPLETED tickets. Current status: {ticket.status}",
				{"current_status": ticket.status}
			)

		# Check if survey already exists
		existing = frappe.db.get_value(
			"Cheese Survey Response",
			{"ticket": ticket_id},
			["name", "sent_at", "answered_at"],
			as_dict=True
		)

		if existing:
			return success(
				"Survey already sent",
				{
					"survey_id": existing.name,
					"ticket_id": ticket_id,
					"sent_at": str(existing.sent_at) if existing.sent_at else None,
					"answered_at": str(existing.answered_at) if existing.answered_at else None,
					"is_answered": bool(existing.answered_at),
					"is_new": False
				}
			)

		# Create survey response
		survey = frappe.get_doc({
			"doctype": "Cheese Survey Response",
			"ticket": ticket_id,
			"sent_at": now_datetime()
		})
		survey.insert()
		frappe.db.commit()

		return created(
			"Survey sent successfully",
			{
				"survey_id": survey.name,
				"ticket_id": ticket_id,
				"sent_at": str(survey.sent_at),
				"is_new": True
			}
		)
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except Exception as e:
		frappe.log_error(f"Error in send_survey: {str(e)}")
		return error("Failed to send survey", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def submit_survey(ticket_id, rating, comment=None):
	"""
	Submit survey response
	
	Args:
		ticket_id: ID of the ticket
		rating: Rating (1-5)
		comment: Optional comment
		
	Returns:
		Success response with survey submission data
	"""
	try:
		if not ticket_id:
			return validation_error("ticket_id is required")
		if not rating:
			return validation_error("rating is required")
		
		try:
			rating = int(rating)
			if rating < 1 or rating > 5:
				return validation_error("rating must be between 1 and 5")
		except (ValueError, TypeError):
			return validation_error("rating must be a number between 1 and 5")

		if not frappe.db.exists("Cheese Ticket", ticket_id):
			return not_found("Ticket", ticket_id)

		# Get or create survey response
		survey_name = frappe.db.get_value(
			"Cheese Survey Response",
			{"ticket": ticket_id},
			"name"
		)

		if not survey_name:
			# Create new survey response
			survey = frappe.get_doc({
				"doctype": "Cheese Survey Response",
				"ticket": ticket_id,
				"rating": rating,
				"comment": comment,
				"sent_at": now_datetime(),
				"answered_at": now_datetime()
			})
			survey.insert()
			frappe.db.commit()
			is_new = True
		else:
			# Update existing survey
			survey = frappe.get_doc("Cheese Survey Response", survey_name)
			survey.rating = rating
			survey.comment = comment
			survey.answered_at = now_datetime()
			survey.save()
			frappe.db.commit()
			is_new = False

		return success(
			"Survey submitted successfully",
			{
				"survey_id": survey.name,
				"ticket_id": ticket_id,
				"rating": survey.rating,
				"comment": survey.comment,
				"answered_at": str(survey.answered_at),
				"is_new": is_new
			}
		)
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except Exception as e:
		frappe.log_error(f"Error in submit_survey: {str(e)}")
		return error("Failed to submit survey", "SERVER_ERROR", {"error": str(e)}, 500)
