# Copyright (c) 2024
# License: MIT

import frappe
from frappe import _
from frappe.utils import now_datetime
from cheese.api.common.responses import success, created, error, not_found, validation_error


@frappe.whitelist()
def create_survey_request(ticket_id):
	"""
	Create survey request - refactored version of send_survey
	
	Args:
		ticket_id: Ticket ID
		
	Returns:
		Success response with survey request data
	"""
	return send_survey(ticket_id)


@frappe.whitelist()
def submit_survey_response(ticket_id, rating, comment=None):
	"""
	Submit survey response - alias for submit_survey
	
	Args:
		ticket_id: Ticket ID
		rating: Rating (1-5)
		comment: Optional comment
		
	Returns:
		Success response with survey submission data
	"""
	return submit_survey(ticket_id, rating, comment)


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

		# Create support case if rating <= 2
		support_case_id = None
		if rating <= 2:
			try:
				ticket = frappe.get_doc("Cheese Ticket", ticket_id)
				support_case = frappe.get_doc({
					"doctype": "Cheese Support Case",
					"contact": ticket.contact,
					"ticket": ticket_id,
					"survey_response": survey.name,
					"description": f"Low rating survey response (Rating: {rating}). Comment: {comment or 'No comment'}",
					"status": "OPEN",
					"priority": "High" if rating == 1 else "Medium"
				})
				support_case.insert(ignore_permissions=True)
				support_case_id = support_case.name
				frappe.db.commit()
			except Exception as e:
				frappe.log_error(f"Failed to create support case for survey {survey.name}: {e}")

		return success(
			"Survey submitted successfully",
			{
				"survey_id": survey.name,
				"ticket_id": ticket_id,
				"rating": survey.rating,
				"comment": survey.comment,
				"answered_at": str(survey.answered_at),
				"is_new": is_new,
				"support_case_created": support_case_id is not None,
				"support_case_id": support_case_id
			}
		)
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except Exception as e:
		frappe.log_error(f"Error in submit_survey: {str(e)}")
		return error("Failed to submit survey", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def get_survey_analytics(date_from=None, date_to=None, route_id=None, establishment_id=None):
	"""
	Get survey analytics dashboard (US-SV-02)
	
	Args:
		date_from: Start date
		date_to: End date
		route_id: Filter by route
		establishment_id: Filter by establishment
		
	Returns:
		Success response with analytics data
	"""
	try:
		from frappe.utils import getdate, today, add_days
		from cheese.api.common.responses import success
		
		# Default to last 30 days if not specified
		if not date_from:
			date_from = add_days(today(), -30)
		if not date_to:
			date_to = today()
		
		date_from_obj = getdate(date_from)
		date_to_obj = getdate(date_to)
		
		# Build filters
		filters = {}
		
		# Get tickets matching filters
		ticket_filters = {}
		if establishment_id:
			ticket_filters["company"] = establishment_id
		if route_id:
			ticket_filters["route"] = route_id
		
		ticket_ids = []
		if ticket_filters:
			tickets = frappe.get_all(
				"Cheese Ticket",
				filters=ticket_filters,
				fields=["name"]
			)
			ticket_ids = [t.name for t in tickets]
		
		if ticket_ids:
			filters["ticket"] = ["in", ticket_ids]
		elif ticket_filters:
			# No tickets match, return empty analytics
			return success(
				"Survey analytics retrieved successfully",
				{
					"date_from": str(date_from_obj),
					"date_to": str(date_to_obj),
					"total_responses": 0,
					"average_rating": 0,
					"rating_distribution": {},
					"comments": []
				}
			)
		
		# Get survey responses
		surveys = frappe.get_all(
			"Cheese Survey Response",
			filters=filters,
			fields=["name", "ticket", "rating", "comment", "answered_at"]
		)
		
		# Filter by date
		surveys = [s for s in surveys if s.answered_at and getdate(s.answered_at) >= date_from_obj and getdate(s.answered_at) <= date_to_obj]
		
		# Calculate metrics
		total_responses = len(surveys)
		ratings = [s.rating for s in surveys if s.rating]
		average_rating = sum(ratings) / len(ratings) if ratings else 0
		
		# Rating distribution
		rating_distribution = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}
		for rating in ratings:
			if rating in rating_distribution:
				rating_distribution[rating] += 1
		
		# Get comments
		comments = [{"rating": s.rating, "comment": s.comment} for s in surveys if s.comment]
		
		return success(
			"Survey analytics retrieved successfully",
			{
				"date_from": str(date_from_obj),
				"date_to": str(date_to_obj),
				"total_responses": total_responses,
				"average_rating": round(average_rating, 2),
				"rating_distribution": rating_distribution,
				"comments": comments,
				"low_ratings_count": len([s for s in surveys if s.rating and s.rating <= 2])
			}
		)
	except Exception as e:
		frappe.log_error(f"Error in get_survey_analytics: {str(e)}")
		return error("Failed to get survey analytics", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def export_survey_results(format="CSV", filters=None):
	"""
	Export survey results (US-SV-02)
	
	Args:
		format: Export format (CSV/XLSX)
		filters: JSON filters
		
	Returns:
		Export data
	"""
	try:
		import json
		from cheese.api.common.responses import success
		
		filter_dict = {}
		if filters:
			try:
				filter_dict = json.loads(filters) if isinstance(filters, str) else filters
			except Exception:
				pass
		
		surveys = frappe.get_all(
			"Cheese Survey Response",
			filters=filter_dict,
			fields=["name", "ticket", "rating", "comment", "sent_at", "answered_at"]
		)
		
		# Enrich with ticket info
		result = []
		for survey in surveys:
			ticket = None
			if survey.ticket:
				ticket = frappe.db.get_value(
					"Cheese Ticket",
					survey.ticket,
					["experience", "company", "contact"],
					as_dict=True
				)
			
			result.append({
				"Survey ID": survey.name,
				"Ticket ID": survey.ticket,
				"Rating": survey.rating,
				"Comment": survey.comment,
				"Experience": ticket.experience if ticket else None,
				"Company": ticket.company if ticket else None,
				"Sent At": str(survey.sent_at) if survey.sent_at else None,
				"Answered At": str(survey.answered_at) if survey.answered_at else None
			})
		
		return success(
			f"Export data prepared ({format} format)",
			{
				"format": format,
				"count": len(result),
				"data": result,
				"note": "In production, this would return a downloadable file"
			}
		)
	except Exception as e:
		frappe.log_error(f"Error in export_survey_results: {str(e)}")
		return error("Failed to export survey results", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def create_support_ticket_from_survey(survey_id, complaint_text):
	"""
	Create support ticket from survey (US-SV-03)
	
	Args:
		survey_id: Survey ID
		complaint_text: Complaint text
		
	Returns:
		Created response with support case data
	"""
	try:
		if not survey_id:
			return validation_error("survey_id is required")
		if not complaint_text:
			return validation_error("complaint_text is required")
		
		if not frappe.db.exists("Cheese Survey Response", survey_id):
			return not_found("Survey", survey_id)
		
		survey = frappe.get_doc("Cheese Survey Response", survey_id)
		
		# Get ticket and contact
		if not survey.ticket:
			return validation_error("Survey has no associated ticket")
		
		ticket = frappe.get_doc("Cheese Ticket", survey.ticket)
		contact_id = ticket.contact
		
		# Create support case
		support_case = frappe.get_doc({
			"doctype": "Cheese Support Case",
			"contact": contact_id,
			"ticket": survey.ticket,
			"description": complaint_text,
			"status": "OPEN"
		})
		support_case.insert()
		frappe.db.commit()
		
		return created(
			"Support case created successfully",
			{
				"support_case_id": support_case.name,
				"contact_id": contact_id,
				"ticket_id": survey.ticket,
				"status": support_case.status
			}
		)
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except Exception as e:
		frappe.log_error(f"Error in create_support_ticket_from_survey: {str(e)}")
		return error("Failed to create support ticket", "SERVER_ERROR", {"error": str(e)}, 500)
