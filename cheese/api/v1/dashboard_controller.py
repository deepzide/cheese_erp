# Copyright (c) 2024
# License: MIT

import frappe
from frappe import _
from frappe.utils import getdate, today, add_days, cint
from cheese.api.common.responses import success, error, validation_error


@frappe.whitelist()
def get_central_dashboard(period="today", date_from=None, date_to=None):
	"""
	Get central admin dashboard (US-17)
	
	Args:
		period: Period (today/yesterday/7/30/range)
		date_from: Start date (if period is range)
		date_to: End date (if period is range)
		
	Returns:
		Success response with dashboard data
	"""
	try:
		# Calculate date range
		if period == "today":
			date_from = today()
			date_to = today()
		elif period == "yesterday":
			date_from = add_days(today(), -1)
			date_to = add_days(today(), -1)
		elif period == "7":
			date_from = add_days(today(), -7)
			date_to = today()
		elif period == "30":
			date_from = add_days(today(), -30)
			date_to = today()
		elif period == "range":
			if not date_from or not date_to:
				return validation_error("date_from and date_to are required for range period")
			date_from = getdate(date_from)
			date_to = getdate(date_to)
		else:
			return validation_error(f"Invalid period: {period}")
		
		date_from_obj = getdate(date_from)
		date_to_obj = getdate(date_to)
		
		# Get previous period for comparison
		days_diff = (date_to_obj - date_from_obj).days + 1
		prev_date_from = add_days(date_from_obj, -days_diff)
		prev_date_to = add_days(date_from_obj, -1)
		
		# Get tickets by status
		def get_tickets_by_status(start_date, end_date):
			# Get slots in date range
			slots = frappe.get_all(
				"Cheese Experience Slot",
				filters={
					"date": [">=", start_date],
					"date": ["<=", end_date]
				},
				fields=["name"]
			)
			
			if not slots:
				return {}
			
			slot_ids = [s.name for s in slots]
			tickets = frappe.get_all(
				"Cheese Ticket",
				filters={"slot": ["in", slot_ids]},
				fields=["status"]
			)
			
			status_counts = {}
			for ticket in tickets:
				status = ticket.status
				status_counts[status] = status_counts.get(status, 0) + 1
			
			return status_counts
		
		current_counts = get_tickets_by_status(date_from_obj, date_to_obj)
		previous_counts = get_tickets_by_status(prev_date_from, prev_date_to)
		
		# Calculate KPIs
		confirmed = current_counts.get("CONFIRMED", 0)
		checked_in = current_counts.get("CHECKED_IN", 0)
		completed = current_counts.get("COMPLETED", 0)
		cancelled = current_counts.get("CANCELLED", 0) + current_counts.get("EXPIRED", 0)
		pending = current_counts.get("PENDING", 0)
		
		prev_confirmed = previous_counts.get("CONFIRMED", 0)
		prev_checked_in = previous_counts.get("CHECKED_IN", 0)
		prev_completed = previous_counts.get("COMPLETED", 0)
		
		# Get leads
		leads = frappe.get_all(
			"Cheese Lead",
			fields=["status"]
		)
		
		lead_counts = {}
		for lead in leads:
			status = lead.status
			lead_counts[status] = lead_counts.get(status, 0) + 1
		
		# Get deposits
		deposits = frappe.get_all(
			"Cheese Deposit",
			fields=["status"]
		)
		
		deposit_counts = {}
		for deposit in deposits:
			status = deposit.status
			deposit_counts[status] = deposit_counts.get(status, 0) + 1
		
		return success(
			"Central dashboard retrieved successfully",
			{
				"period": period,
				"date_from": str(date_from_obj),
				"date_to": str(date_to_obj),
				"tickets": {
					"confirmed": confirmed,
					"checked_in": checked_in,
					"completed": completed,
					"cancelled": cancelled,
					"pending": pending,
					"total": sum(current_counts.values())
				},
				"comparison": {
					"confirmed_change": confirmed - prev_confirmed,
					"checked_in_change": checked_in - prev_checked_in,
					"completed_change": completed - prev_completed
				},
				"leads": lead_counts,
				"deposits": {
					"pending": deposit_counts.get("PENDING", 0),
					"paid": deposit_counts.get("PAID", 0),
					"overdue": deposit_counts.get("OVERDUE", 0)
				}
			}
		)
	except Exception as e:
		frappe.log_error(f"Error in get_central_dashboard: {str(e)}")
		return error("Failed to get central dashboard", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def get_establishment_dashboard(establishment_id, period="today", date_from=None, date_to=None):
	"""
	Get establishment dashboard (US-17)
	
	Args:
		establishment_id: Establishment (company) ID
		period: Period
		date_from: Start date
		date_to: End date
		
	Returns:
		Success response with establishment dashboard data
	"""
	try:
		if not establishment_id:
			return validation_error("establishment_id is required")
		
		if not frappe.db.exists("Company", establishment_id):
			return error("Establishment not found", "NOT_FOUND", {}, 404)
		
		# Calculate date range (same logic as central dashboard)
		if period == "today":
			date_from = today()
			date_to = today()
		elif period == "yesterday":
			date_from = add_days(today(), -1)
			date_to = add_days(today(), -1)
		elif period == "7":
			date_from = add_days(today(), -7)
			date_to = today()
		elif period == "30":
			date_from = add_days(today(), -30)
			date_to = today()
		elif period == "range":
			if not date_from or not date_to:
				return validation_error("date_from and date_to are required for range period")
			date_from = getdate(date_from)
			date_to = getdate(date_to)
		
		date_from_obj = getdate(date_from)
		date_to_obj = getdate(date_to)
		
		# Get tickets for this establishment
		slots = frappe.get_all(
			"Cheese Experience Slot",
			filters={
				"date": [">=", date_from_obj],
				"date": ["<=", date_to_obj]
			},
			fields=["name", "experience"]
		)
		
		# Filter by establishment experiences
		experiences = frappe.get_all(
			"Cheese Experience",
			filters={"company": establishment_id},
			fields=["name"]
		)
		exp_ids = [e.name for e in experiences]
		
		establishment_slots = [s for s in slots if s.experience in exp_ids]
		slot_ids = [s.name for s in establishment_slots]
		
		tickets = []
		if slot_ids:
			tickets = frappe.get_all(
				"Cheese Ticket",
				filters={"slot": ["in", slot_ids]},
				fields=["name", "status", "party_size", "slot"]
			)
		
		# Group by status
		status_counts = {}
		for ticket in tickets:
			status = ticket.status
			status_counts[status] = status_counts.get(status, 0) + 1
		
		# Get pending confirmations
		pending_confirmations = [t for t in tickets if t.status == "PENDING"]
		
		# Get today's agenda
		today_date = today()
		today_slots = frappe.get_all(
			"Cheese Experience Slot",
			filters={
				"date": today_date,
				"experience": ["in", exp_ids]
			},
			fields=["name", "time"]
		)
		
		today_tickets = []
		if today_slots:
			today_slot_ids = [s.name for s in today_slots]
			today_tickets = frappe.get_all(
				"Cheese Ticket",
				filters={
					"slot": ["in", today_slot_ids],
					"status": ["in", ["CONFIRMED", "CHECKED_IN"]]
				},
				fields=["name", "status", "party_size", "slot"],
				order_by="slot"
			)
		
		return success(
			"Establishment dashboard retrieved successfully",
			{
				"establishment_id": establishment_id,
				"period": period,
				"date_from": str(date_from_obj),
				"date_to": str(date_to_obj),
				"tickets_by_status": status_counts,
				"pending_confirmations": len(pending_confirmations),
				"pending_confirmations_list": pending_confirmations[:10],  # Limit to 10
				"today_agenda": today_tickets,
				"today_count": len(today_tickets)
			}
		)
	except Exception as e:
		frappe.log_error(f"Error in get_establishment_dashboard: {str(e)}")
		return error("Failed to get establishment dashboard", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def get_dashboard_kpis(establishment_id=None, period="today"):
	"""
	Get KPI metrics (US-17)
	
	Args:
		establishment_id: Establishment ID (optional, for establishment-specific KPIs)
		period: Period
		
	Returns:
		Success response with KPI data
	"""
	try:
		# Similar logic to dashboard endpoints
		# Calculate conversion rates, attendance rates, etc.
		
		return success(
			"KPIs retrieved successfully",
			{
				"establishment_id": establishment_id,
				"period": period,
				"note": "KPI calculation logic would be implemented here"
			}
		)
	except Exception as e:
		frappe.log_error(f"Error in get_dashboard_kpis: {str(e)}")
		return error("Failed to get KPIs", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def get_pending_actions(establishment_id):
	"""
	Get pending actions for establishment (US-17)
	
	Args:
		establishment_id: Establishment ID
		
	Returns:
		Success response with pending actions
	"""
	try:
		if not establishment_id:
			return validation_error("establishment_id is required")
		
		# Get pending confirmations
		experiences = frappe.get_all(
			"Cheese Experience",
			filters={"company": establishment_id},
			fields=["name"]
		)
		exp_ids = [e.name for e in experiences]
		
		slots = frappe.get_all(
			"Cheese Experience Slot",
			filters={"experience": ["in", exp_ids]},
			fields=["name"]
		)
		slot_ids = [s.name for s in slots]
		
		pending_tickets = []
		if slot_ids:
			pending_tickets = frappe.get_all(
				"Cheese Ticket",
				filters={
					"slot": ["in", slot_ids],
					"status": "PENDING"
				},
				fields=["name", "experience", "slot", "party_size", "created"],
				order_by="created asc",
				limit=20
			)
		
		# Get pending deposits
		ticket_ids = [t.name for t in pending_tickets]
		pending_deposits = []
		if ticket_ids:
			pending_deposits = frappe.get_all(
				"Cheese Deposit",
				filters={
					"entity_type": "Ticket",
					"entity_id": ["in", ticket_ids],
					"status": "PENDING"
				},
				fields=["name", "entity_id", "amount_required", "due_at"]
			)
		
		return success(
			"Pending actions retrieved successfully",
			{
				"establishment_id": establishment_id,
				"pending_confirmations": pending_tickets,
				"pending_confirmations_count": len(pending_tickets),
				"pending_deposits": pending_deposits,
				"pending_deposits_count": len(pending_deposits)
			}
		)
	except Exception as e:
		frappe.log_error(f"Error in get_pending_actions: {str(e)}")
		return error("Failed to get pending actions", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def get_day_agenda(establishment_id, date=None):
	"""
	Get day agenda for establishment (US-17)
	
	Args:
		establishment_id: Establishment ID
		date: Date (YYYY-MM-DD), defaults to today
		
	Returns:
		Success response with day agenda
	"""
	try:
		if not establishment_id:
			return validation_error("establishment_id is required")
		
		target_date = getdate(date) if date else today()
		
		# Get experiences
		experiences = frappe.get_all(
			"Cheese Experience",
			filters={"company": establishment_id},
			fields=["name"]
		)
		exp_ids = [e.name for e in experiences]
		
		# Get slots for the date
		slots = frappe.get_all(
			"Cheese Experience Slot",
			filters={
				"date": target_date,
				"experience": ["in", exp_ids]
			},
			fields=["name", "time", "experience"],
			order_by="time asc"
		)
		
		slot_ids = [s.name for s in slots]
		
		# Get tickets
		tickets = []
		if slot_ids:
			tickets = frappe.get_all(
				"Cheese Ticket",
				filters={"slot": ["in", slot_ids]},
				fields=["name", "status", "party_size", "slot", "contact"]
			)
		
		# Group by slot
		agenda = []
		for slot in slots:
			slot_tickets = [t for t in tickets if t.slot == slot.name]
			agenda.append({
				"slot_id": slot.name,
				"time": str(slot.time),
				"experience_id": slot.experience,
				"tickets": slot_tickets,
				"tickets_count": len(slot_tickets)
			})
		
		return success(
			"Day agenda retrieved successfully",
			{
				"establishment_id": establishment_id,
				"date": str(target_date),
				"agenda": agenda,
				"total_tickets": len(tickets)
			}
		)
	except Exception as e:
		frappe.log_error(f"Error in get_day_agenda: {str(e)}")
		return error("Failed to get day agenda", "SERVER_ERROR", {"error": str(e)}, 500)
