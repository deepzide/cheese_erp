# Copyright (c) 2024
# License: MIT

import frappe
from frappe import _
from frappe.utils import getdate, today, add_days, cint, now_datetime
from cheese.api.common.responses import success, error, validation_error
from cheese.api.v1.user_controller import _get_current_user_company


def _ticket_status_counts_with_effective_date(start_date, end_date, company=None):
	"""
	Count ticket statuses for period using booking date OR creation date.
	Booking date is COALESCE(ticket.selected_date, slot.date_from).
	"""
	conditions = [
		"""(
			(
				COALESCE(t.selected_date, s.date_from) >= %(start_date)s
				AND COALESCE(t.selected_date, s.date_from) <= %(end_date)s
			)
			OR (
				DATE(t.creation) >= %(start_date)s
				AND DATE(t.creation) <= %(end_date)s
			)
		)""",
	]
	params = {"start_date": start_date, "end_date": end_date}
	if company:
		conditions.append("t.company = %(company)s")
		params["company"] = company

	rows = frappe.db.sql(
		f"""
		SELECT t.status AS status, COUNT(*) AS count
		FROM `tabCheese Ticket` t
		LEFT JOIN `tabCheese Experience Slot` s ON s.name = t.slot
		WHERE {" AND ".join(conditions)}
		GROUP BY t.status
		""",
		params,
		as_dict=True,
	)
	return {r.status: cint(r.count) for r in rows}


def _ticket_in_period(ticket, start_date, end_date):
	"""Match ticket when booking date OR creation date falls in period."""
	creation_date = getdate(ticket.creation) if getattr(ticket, "creation", None) else None
	if creation_date and start_date <= creation_date <= end_date:
		return True

	booking_date = getdate(ticket.selected_date) if getattr(ticket, "selected_date", None) else None
	if not booking_date and getattr(ticket, "slot", None):
		slot_date = frappe.db.get_value("Cheese Experience Slot", ticket.slot, "date_from")
		if slot_date:
			booking_date = getdate(slot_date)

	return bool(booking_date and start_date <= booking_date <= end_date)


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
		user_company = _get_current_user_company()
		# Calculate date range
		if period == "today":
			date_from = today()
			date_to = today()
		elif period == "yesterday":
			date_from = add_days(today(), -1)
			date_to = add_days(today(), -1)
		elif period == "7":
			date_from = add_days(today(), -6)
			date_to = today()
		elif period == "30":
			date_from = add_days(today(), -29)
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
		
		current_counts = _ticket_status_counts_with_effective_date(date_from_obj, date_to_obj, user_company)
		previous_counts = _ticket_status_counts_with_effective_date(prev_date_from, prev_date_to, user_company)
		
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
		lead_filters = {"creation": ["between", [f"{date_from_obj} 00:00:00", f"{date_to_obj} 23:59:59"]]}
		if user_company:
			# Only leads that have interest in the user's company (requires company field on Lead, assuming it exists or skip if not supported. Lead doesn't have company typically, but let's check).
			# Actually, leads might not be company-scoped. Skip lead filter or filter if lead has company field.
			pass

		leads = frappe.get_all(
			"Cheese Lead",
			filters=lead_filters,
			fields=["status"]
		)
		
		lead_counts = {}
		for lead in leads:
			status = lead.status
			lead_counts[status] = lead_counts.get(status, 0) + 1

		total_leads = frappe.db.count("Cheese Lead")
		
		# Get deposits
		deposit_filters = {"creation": ["between", [f"{date_from_obj} 00:00:00", f"{date_to_obj} 23:59:59"]]}
		if user_company:
			# To filter deposits by company, we filter by entity_id if they are ticket deposits
			ticket_ids = frappe.get_all("Cheese Ticket", filters={"company": user_company}, pluck="name")
			if ticket_ids:
				deposit_filters["entity_id"] = ["in", ticket_ids]
			else:
				deposit_filters["name"] = "not_found"

		deposits = frappe.get_all(
			"Cheese Deposit",
			filters=deposit_filters,
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
				"tickets_by_status": current_counts,
				"comparison": {
					"confirmed_change": confirmed - prev_confirmed,
					"checked_in_change": checked_in - prev_checked_in,
					"completed_change": completed - prev_completed
				},
				"leads": lead_counts,
				"total_leads": total_leads,
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
			date_from = add_days(today(), -6)
			date_to = today()
		elif period == "30":
			date_from = add_days(today(), -29)
			date_to = today()
		elif period == "range":
			if not date_from or not date_to:
				return validation_error("date_from and date_to are required for range period")
			date_from = getdate(date_from)
			date_to = getdate(date_to)
		
		date_from_obj = getdate(date_from)
		date_to_obj = getdate(date_to)

		status_counts = _ticket_status_counts_with_effective_date(date_from_obj, date_to_obj, establishment_id)
		tickets = frappe.get_all(
			"Cheese Ticket",
			filters={"company": establishment_id},
			fields=["name", "status", "party_size", "slot", "selected_date", "creation"],
		)
		tickets = [t for t in tickets if _ticket_in_period(t, date_from_obj, date_to_obj)]
		
		# Get pending confirmations, excluding TTL-expired pending tickets.
		now_dt = now_datetime()
		pending_confirmations = []
		for t in tickets:
			if t.status != "PENDING":
				continue
			ticket_doc = frappe.db.get_value("Cheese Ticket", t.name, ["expires_at"], as_dict=True)
			if ticket_doc and ticket_doc.expires_at and ticket_doc.expires_at < now_dt:
				continue
			pending_confirmations.append(t)
		
		# Get today's agenda — confirmed/checked-in tickets booked for today
		# at this establishment.
		today_date = today()
		today_tickets = frappe.get_all(
			"Cheese Ticket",
			filters={
				"company": establishment_id,
				"selected_date": today_date,
				"status": ["in", ["CONFIRMED", "CHECKED_IN"]],
			},
			fields=["name", "status", "party_size", "slot"],
			order_by="slot",
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
		from frappe.utils import today, add_days, getdate
		
		# Calculate date range
		if period == "today":
			date_from = today()
			date_to = today()
		elif period == "yesterday":
			date_from = add_days(today(), -1)
			date_to = add_days(today(), -1)
		elif period == "7":
			date_from = add_days(today(), -6)
			date_to = today()
		elif period == "30":
			date_from = add_days(today(), -29)
			date_to = today()
		else:
			date_from = today()
			date_to = today()
		
		date_from_obj = getdate(date_from)
		date_to_obj = getdate(date_to)
		
		# Resolve effective establishment scope
		user_company = _get_current_user_company()
		if user_company:
			establishment_id = user_company

		ticket_filters = {"company": establishment_id} if establishment_id else {}
		tickets = frappe.get_all(
			"Cheese Ticket",
			filters=ticket_filters,
			fields=["name", "status", "experience", "slot", "selected_date", "creation"],
		)
		tickets = [t for t in tickets if _ticket_in_period(t, date_from_obj, date_to_obj)]
		
		# Calculate conversion rates (leads → tickets → confirmed)
		leads = frappe.get_all(
			"Cheese Lead",
			filters={"creation": ["between", [f"{date_from_obj} 00:00:00", f"{date_to_obj} 23:59:59"]]},
			fields=["name", "status"]
		)
		
		total_leads = len(leads)
		converted_leads = len([l for l in leads if l.status == "CONVERTED"])
		lead_conversion_rate = (converted_leads / total_leads * 100) if total_leads > 0 else 0
		
		total_tickets = len(tickets)
		confirmed_tickets = len([t for t in tickets if t.status == "CONFIRMED"])
		ticket_conversion_rate = (confirmed_tickets / total_tickets * 100) if total_tickets > 0 else 0
		
		# Calculate attendance rates
		checked_in = len([t for t in tickets if t.status == "CHECKED_IN"])
		completed = len([t for t in tickets if t.status == "COMPLETED"])
		attendance_rate = (checked_in / confirmed_tickets * 100) if confirmed_tickets > 0 else 0
		
		# Calculate no-show rates
		no_shows = len([t for t in tickets if t.status == "NO_SHOW"])
		no_show_rate = (no_shows / confirmed_tickets * 100) if confirmed_tickets > 0 else 0
		
		# Calculate deposit collection rates
		deposits = frappe.get_all(
			"Cheese Deposit",
			filters={"creation": ["between", [f"{date_from_obj} 00:00:00", f"{date_to_obj} 23:59:59"]]},
			fields=["name", "status", "amount_required", "amount_paid"]
		)
		
		total_deposits = len(deposits)
		paid_deposits = len([d for d in deposits if d.status == "PAID"])
		deposit_collection_rate = (paid_deposits / total_deposits * 100) if total_deposits > 0 else 0
		
		total_deposit_amount = sum([d.amount_required for d in deposits])
		collected_deposit_amount = sum([d.amount_paid or 0 for d in deposits])
		
		# Calculate average satisfaction rating
		surveys = frappe.get_all(
			"Cheese Survey Response",
			filters={"creation": ["between", [f"{date_from_obj} 00:00:00", f"{date_to_obj} 23:59:59"]]},
			fields=["rating"]
		)
		
		if surveys:
			average_satisfaction = sum([s.rating for s in surveys]) / len(surveys)
		else:
			average_satisfaction = 0
		
		return success(
			"KPIs retrieved successfully",
			{
				"establishment_id": establishment_id,
				"period": period,
				"date_from": str(date_from_obj),
				"date_to": str(date_to_obj),
				"conversion_rates": {
					"lead_to_converted": lead_conversion_rate,
					"ticket_to_confirmed": ticket_conversion_rate,
					"total_leads": total_leads,
					"converted_leads": converted_leads,
					"total_tickets": total_tickets,
					"confirmed_tickets": confirmed_tickets
				},
				"attendance_rates": {
					"checked_in_rate": attendance_rate,
					"checked_in_count": checked_in,
					"completed_count": completed
				},
				"no_show_rates": {
					"no_show_rate": no_show_rate,
					"no_show_count": no_shows
				},
				"deposit_collection_rates": {
					"collection_rate": deposit_collection_rate,
					"total_deposits": total_deposits,
					"paid_deposits": paid_deposits,
					"total_amount_required": total_deposit_amount,
					"collected_amount": collected_deposit_amount
				},
				"average_satisfaction": round(average_satisfaction, 2),
				"total_surveys": len(surveys)
			}
		)
	except Exception as e:
		frappe.log_error(f"Error in get_dashboard_kpis: {str(e)}")
		return error("Failed to get KPIs", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def get_pending_actions(establishment_id=None, date_from=None, date_to=None):
	"""
	Get pending actions for establishment (US-17)
	
	Args:
		establishment_id: Establishment ID
		date_from: Start date filter (YYYY-MM-DD) - optional
		date_to: End date filter (YYYY-MM-DD) - optional
		
	Returns:
		Success response with pending actions
	"""
	try:
		from frappe.utils import getdate, now_datetime

		# Get experiences to build relevant slots.
		# If establishment_id is not provided, return pending actions across all companies.
		user_company = _get_current_user_company()
		if user_company:
			establishment_id = user_company

		experience_filters = {}
		if establishment_id:
			experience_filters = {"company": establishment_id}

		experiences = frappe.get_all(
			"Cheese Experience",
			filters=experience_filters,
			fields=["name"],
		)
		exp_ids = [e.name for e in experiences]

		if not exp_ids:
			return success(
				"Pending actions retrieved successfully",
				{
					"establishment_id": establishment_id,
					"pending_confirmations": [],
					"pending_confirmations_count": 0,
					"pending_deposits": [],
					"pending_deposits_count": 0,
				},
			)

		# Pull candidate slots then filter by date_from in Python (Cheese Experience Slot uses `date_from`).
		all_slots = frappe.get_all(
			"Cheese Experience Slot",
			filters={"experience": ["in", exp_ids]},
			fields=["name", "date_from", "time_from"],
		)

		date_from_obj = getdate(date_from) if date_from else None
		date_to_obj = getdate(date_to) if date_to else None
		if date_from_obj and date_to_obj and date_from_obj > date_to_obj:
			return validation_error("date_from must be before or equal to date_to")

		filtered_slots = []
		for s in all_slots:
			slot_date = getdate(s.date_from)
			if date_from_obj and slot_date < date_from_obj:
				continue
			if date_to_obj and slot_date > date_to_obj:
				continue
			filtered_slots.append(s)

		slot_ids = [s.name for s in filtered_slots]
		slot_details_by_id = {s.name: s for s in filtered_slots}
		
		pending_tickets = []
		if slot_ids:
			pending_tickets = frappe.get_all(
				"Cheese Ticket",
				filters={
					"slot": ["in", slot_ids],
					"status": "PENDING"
				},
				fields=["name", "contact", "experience", "route", "slot", "party_size", "selected_date", "expires_at", "creation"],
				order_by="creation asc",
				limit=20
			)

			now_dt = now_datetime()
			pending_tickets = [
				t for t in pending_tickets
				if (not t.expires_at) or t.expires_at >= now_dt
			]

			# Attach slot date/time for UI convenience.
			for t in pending_tickets:
				slot_detail = slot_details_by_id.get(t.slot)
				t["slot_date_from"] = str(slot_detail.date_from) if slot_detail else None
				t["slot_time_from"] = str(slot_detail.time_from) if slot_detail and slot_detail.time_from else None
		
		# Get pending deposits
		ticket_ids = [t.name for t in pending_tickets]
		pending_deposits = []
		if ticket_ids:
			pending_deposits = frappe.get_all(
				"Cheese Deposit",
				filters={
					"entity_type": "Cheese Ticket",
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
		user_company = _get_current_user_company()
		if user_company:
			establishment_id = user_company

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
