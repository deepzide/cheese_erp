# Copyright (c) 2024
# License: MIT
"""
Consolidated test file for Cheese app.
This file automatically discovers and runs all tests.
Execute with: python -m frappe.tests.utils or bench --site <site> run-tests --app cheese
"""

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_to_date, now_datetime, get_datetime, add_days, getdate


# ============================================================================
# Test Record Creation Functions
# ============================================================================

def _make_test_experience_records(verbose=None):
	"""Create test experiences - handles autoname field:name correctly"""
	records = []
	experience_data = [
		{
			"name": "Desert Safari Adventure",
			"company": "_Test Company",
			"description": "Experience the thrill of dune bashing and camel riding in the desert",
			"individual_price": 150.00,
			"route_price": 120.00,
			"min_acts_for_route_price": 3,
			"package_mode": "Both",
			"deposit_required": 1,
			"deposit_type": "%",
			"deposit_value": 20.0,
			"deposit_ttl_hours": 24,
			"status": "ONLINE"
		},
		{
			"name": "City Tour Experience",
			"company": "_Test Company",
			"description": "Explore the city's landmarks and cultural sites",
			"individual_price": 80.00,
			"route_price": 65.00,
			"min_acts_for_route_price": 2,
			"package_mode": "Both",
			"deposit_required": 1,
			"deposit_type": "Amount",
			"deposit_value": 15.0,
			"deposit_ttl_hours": 48,
			"status": "ONLINE"
		},
		{
			"name": "Water Sports Package",
			"company": "_Test Company",
			"description": "Jet skiing, parasailing, and water activities",
			"individual_price": 200.00,
			"route_price": 170.00,
			"min_acts_for_route_price": 3,
			"package_mode": "Package",
			"deposit_required": 1,
			"deposit_type": "%",
			"deposit_value": 25.0,
			"deposit_ttl_hours": 24,
			"status": "ONLINE"
		},
		{
			"name": "Cultural Heritage Walk",
			"company": "_Test Company",
			"description": "Guided walking tour through historical sites",
			"individual_price": 60.00,
			"route_price": 50.00,
			"min_acts_for_route_price": 2,
			"package_mode": "Public",
			"deposit_required": 0,
			"status": "ONLINE"
		},
		{
			"name": "Sunset Cruise",
			"company": "_Test Company",
			"description": "Evening cruise with dinner and entertainment",
			"individual_price": 120.00,
			"route_price": 100.00,
			"min_acts_for_route_price": 2,
			"package_mode": "Both",
			"deposit_required": 1,
			"deposit_type": "Amount",
			"deposit_value": 30.0,
			"deposit_ttl_hours": 36,
			"status": "ONLINE"
		}
	]
	
	for data in experience_data:
		exp_name = data.pop("name")
		doc = frappe.get_doc({
			"doctype": "Cheese Experience",
			"name": exp_name,
			**data
		})
		doc.set_new_name()
		
		if not frappe.db.exists("Cheese Experience", doc.name):
			doc.insert(ignore_if_duplicate=True)
			records.append(doc)
	
	return records


def _make_test_route_records(verbose=None):
	"""Create test routes - handles autoname field:name correctly"""
	records = []
	route_data = [
		{
			"name": "Adventure Combo",
			"description": "Combine desert safari and water sports for an action-packed day",
			"status": "ONLINE",
			"price_mode": "Sum",
			"deposit_required": 1,
			"deposit_type": "%",
			"deposit_value": 20.0,
			"deposit_ttl_hours": 24,
			"experiences": [
				{
					"doctype": "Cheese Route Experience",
					"experience": "Desert Safari Adventure",
					"sequence": 1
				},
				{
					"doctype": "Cheese Route Experience",
					"experience": "Water Sports Package",
					"sequence": 2
				}
			]
		},
		{
			"name": "City Explorer Route",
			"description": "City tour and cultural heritage walk",
			"status": "ONLINE",
			"price_mode": "Sum",
			"deposit_required": 1,
			"deposit_type": "Amount",
			"deposit_value": 20.0,
			"deposit_ttl_hours": 48,
			"experiences": [
				{
					"doctype": "Cheese Route Experience",
					"experience": "City Tour Experience",
					"sequence": 1
				},
				{
					"doctype": "Cheese Route Experience",
					"experience": "Cultural Heritage Walk",
					"sequence": 2
				}
			]
		},
		{
			"name": "Complete Experience",
			"description": "Full day experience with all activities",
			"status": "ONLINE",
			"price_mode": "Manual",
			"price": 400.00,
			"deposit_required": 1,
			"deposit_type": "%",
			"deposit_value": 25.0,
			"deposit_ttl_hours": 24,
			"experiences": [
				{
					"doctype": "Cheese Route Experience",
					"experience": "Desert Safari Adventure",
					"sequence": 1
				},
				{
					"doctype": "Cheese Route Experience",
					"experience": "City Tour Experience",
					"sequence": 2
				},
				{
					"doctype": "Cheese Route Experience",
					"experience": "Sunset Cruise",
					"sequence": 3
				}
			]
		}
	]
	
	for data in route_data:
		route_name = data.pop("name")
		doc = frappe.get_doc({
			"doctype": "Cheese Route",
			"name": route_name,
			**data
		})
		doc.set_new_name()
		
		if not frappe.db.exists("Cheese Route", doc.name):
			doc.insert(ignore_if_duplicate=True)
			records.append(doc)
	
	return records


def _make_test_ticket_records(verbose=None):
	"""Create test tickets with proper slot assignments"""
	from frappe.test_runner import make_test_objects
	
	slots_by_experience = {}
	for experience in ["Desert Safari Adventure", "City Tour Experience", "Water Sports Package", "Cultural Heritage Walk", "Sunset Cruise"]:
		slots = frappe.get_all(
			"Cheese Experience Slot",
			filters={"experience": experience},
			fields=["name"],
			limit=2
		)
		if slots:
			slots_by_experience[experience] = [s.name for s in slots]
	
	ticket_records = [
		{
			"doctype": "Cheese Ticket",
			"contact": "_Test Contact 1",
			"company": "_Test Company",
			"experience": "Desert Safari Adventure",
			"slot": slots_by_experience.get("Desert Safari Adventure", [None])[0] if slots_by_experience.get("Desert Safari Adventure") else None,
			"party_size": 2,
			"status": "PENDING",
			"expires_at": add_to_date(now_datetime(), hours=24, as_string=False)
		},
		{
			"doctype": "Cheese Ticket",
			"contact": "_Test Contact 2",
			"company": "_Test Company",
			"experience": "City Tour Experience",
			"slot": slots_by_experience.get("City Tour Experience", [None])[0] if slots_by_experience.get("City Tour Experience") else None,
			"party_size": 3,
			"status": "CONFIRMED",
			"expires_at": add_to_date(now_datetime(), hours=24, as_string=False)
		},
		{
			"doctype": "Cheese Ticket",
			"contact": "_Test Contact 3",
			"company": "_Test Company",
			"experience": "Water Sports Package",
			"slot": slots_by_experience.get("Water Sports Package", [None])[0] if slots_by_experience.get("Water Sports Package") else None,
			"party_size": 1,
			"status": "CHECKED_IN",
			"expires_at": add_to_date(now_datetime(), hours=24, as_string=False)
		},
		{
			"doctype": "Cheese Ticket",
			"contact": "_Test Contact 4",
			"company": "_Test Company",
			"experience": "Cultural Heritage Walk",
			"slot": slots_by_experience.get("Cultural Heritage Walk", [None])[0] if slots_by_experience.get("Cultural Heritage Walk") else None,
			"party_size": 4,
			"status": "COMPLETED",
			"expires_at": add_to_date(now_datetime(), hours=24, as_string=False)
		},
		{
			"doctype": "Cheese Ticket",
			"contact": "_Test Contact 5",
			"company": "_Test Company",
			"experience": "Sunset Cruise",
			"slot": slots_by_experience.get("Sunset Cruise", [None])[0] if slots_by_experience.get("Sunset Cruise") else None,
			"party_size": 2,
			"status": "PENDING",
			"expires_at": add_to_date(now_datetime(), hours=24, as_string=False)
		},
		{
			"doctype": "Cheese Ticket",
			"contact": "_Test Contact 1",
			"company": "_Test Company",
			"experience": "Desert Safari Adventure",
			"slot": slots_by_experience.get("Desert Safari Adventure", [None])[-1] if slots_by_experience.get("Desert Safari Adventure") and len(slots_by_experience.get("Desert Safari Adventure", [])) > 1 else slots_by_experience.get("Desert Safari Adventure", [None])[0] if slots_by_experience.get("Desert Safari Adventure") else None,
			"party_size": 3,
			"status": "CONFIRMED",
			"expires_at": add_to_date(now_datetime(), hours=24, as_string=False)
		},
		{
			"doctype": "Cheese Ticket",
			"contact": "_Test Contact 2",
			"company": "_Test Company",
			"experience": "City Tour Experience",
			"slot": slots_by_experience.get("City Tour Experience", [None])[-1] if slots_by_experience.get("City Tour Experience") and len(slots_by_experience.get("City Tour Experience", [])) > 1 else slots_by_experience.get("City Tour Experience", [None])[0] if slots_by_experience.get("City Tour Experience") else None,
			"party_size": 2,
			"status": "CHECKED_IN",
			"expires_at": add_to_date(now_datetime(), hours=24, as_string=False)
		},
		{
			"doctype": "Cheese Ticket",
			"contact": "_Test Contact 6",
			"company": "_Test Company",
			"experience": "Desert Safari Adventure",
			"slot": slots_by_experience.get("Desert Safari Adventure", [None])[0] if slots_by_experience.get("Desert Safari Adventure") else None,
			"party_size": 1,
			"status": "COMPLETED",
			"expires_at": add_to_date(now_datetime(), hours=24, as_string=False)
		}
	]
	
	ticket_records = [t for t in ticket_records if t.get("slot")]
	
	return make_test_objects("Cheese Ticket", ticket_records, verbose=verbose)


def _make_test_attendance_records(verbose=None):
	"""Create test attendance records for checked-in tickets"""
	from frappe.test_runner import make_test_objects
	
	tickets = frappe.get_all(
		"Cheese Ticket",
		filters={"status": ["in", ["CHECKED_IN", "COMPLETED"]]},
		fields=["name", "experience", "slot"],
		limit=2
	)
	
	if not tickets:
		return []
	
	attendance_records = []
	for ticket in tickets:
		if ticket.slot:
			slot_doc = frappe.get_doc("Cheese Experience Slot", ticket.slot)
			check_in_time = get_datetime(f"{slot_doc.date} {slot_doc.time}")
			
			attendance_records.append({
				"doctype": "Cheese Attendance",
				"ticket": ticket.name,
				"experience": ticket.experience,
				"check_in_time": check_in_time,
				"method": "QR",
				"status": "PRESENT"
			})
	
	return make_test_objects("Cheese Attendance", attendance_records, verbose=verbose)


def _make_test_deposit_records(verbose=None):
	"""Create test deposits for tickets"""
	from frappe.test_runner import make_test_objects
	
	tickets = frappe.get_all(
		"Cheese Ticket",
		filters={"deposit_required": 1},
		fields=["name", "deposit_amount"],
		limit=3
	)
	
	if not tickets:
		return []
	
	deposit_records = []
	for ticket in tickets:
		deposit_records.append({
			"doctype": "Cheese Deposit",
			"entity_type": "Ticket",
			"entity_id": ticket.name,
			"amount_required": ticket.deposit_amount or 50.00,
			"amount_paid": 0,
			"status": "PENDING",
			"due_at": add_to_date(now_datetime(), hours=24, as_string=False)
		})
	
	return make_test_objects("Cheese Deposit", deposit_records, verbose=verbose)


def _make_test_support_case_records(verbose=None):
	"""Create test support cases"""
	from frappe.test_runner import make_test_objects
	
	contacts = frappe.get_all("Cheese Contact", fields=["name"], limit=2)
	tickets = frappe.get_all("Cheese Ticket", fields=["name"], limit=2)
	
	if not contacts:
		return []
	
	support_records = []
	descriptions = [
		"Need to modify booking date",
		"Question about deposit refund",
		"Request for additional information",
		"Complaint about service quality"
	]
	
	for i, contact in enumerate(contacts):
		support_records.append({
			"doctype": "Cheese Support Case",
			"contact": contact.name,
			"ticket": tickets[i].name if i < len(tickets) else None,
			"description": descriptions[i % len(descriptions)],
			"status": ["OPEN", "IN_PROGRESS", "RESOLVED"][i % 3],
			"priority": ["Low", "Medium", "High"][i % 3]
		})
	
	return make_test_objects("Cheese Support Case", support_records, verbose=verbose)


def _make_test_qr_token_records(verbose=None):
	"""Create test QR tokens for confirmed tickets"""
	from frappe.test_runner import make_test_objects
	
	tickets = frappe.get_all(
		"Cheese Ticket",
		filters={"status": ["in", ["CONFIRMED", "CHECKED_IN", "COMPLETED"]]},
		fields=["name"],
		limit=3
	)
	
	if not tickets:
		return []
	
	qr_records = []
	for ticket in tickets:
		qr_records.append({
			"doctype": "Cheese QR Token",
			"ticket": ticket.name,
			"token": frappe.generate_hash(length=32),
			"status": "ACTIVE",
			"expires_at": add_days(now_datetime(), 1)
		})
	
	return make_test_objects("Cheese QR Token", qr_records, verbose=verbose)


def _make_test_system_event_records(verbose=None):
	"""Create test system events"""
	from frappe.test_runner import make_test_objects
	
	contacts = frappe.get_all("Cheese Contact", fields=["name"], limit=2)
	conversations = frappe.get_all("Conversation", fields=["name"], limit=2)
	tickets = frappe.get_all("Cheese Ticket", fields=["name"], limit=2)
	
	event_records = []
	
	for contact in contacts[:2]:
		event_records.append({
			"doctype": "Cheese System Event",
			"entity_type": "Cheese Contact",
			"entity_id": contact.name,
			"event_type": "CONTACT_CREATED",
			"payload_json": '{"source": "test_records"}',
			"created_at": now_datetime()
		})
	
	for conversation in conversations[:2]:
		event_records.append({
			"doctype": "Cheese System Event",
			"entity_type": "Conversation",
			"entity_id": conversation.name,
			"event_type": "CONVERSATION_OPENED",
			"payload_json": '{"channel": "WhatsApp"}',
			"created_at": now_datetime()
		})
	
	for ticket in tickets[:2]:
		event_records.append({
			"doctype": "Cheese System Event",
			"entity_type": "Cheese Ticket",
			"entity_id": ticket.name,
			"event_type": "TICKET_CREATED",
			"payload_json": '{"status": "PENDING"}',
			"created_at": now_datetime()
		})
	
	return make_test_objects("Cheese System Event", event_records, verbose=verbose)


def _make_test_quotation_records(verbose=None):
	"""Create test quotations with proper lead assignments"""
	from frappe.test_runner import make_test_objects
	
	leads = frappe.get_all("Cheese Lead", fields=["name"], limit=2)
	if not leads:
		return []
	
	quotation_records = [
		{
			"doctype": "Cheese Quotation",
			"lead": leads[0].name,
			"status": "DRAFT",
			"total_price": 300.00,
			"deposit_amount": 60.00,
			"valid_until": add_to_date(now_datetime(), hours=48, as_string=False),
			"experiences": [
				{
					"doctype": "Cheese Quotation Experience",
					"experience": "Desert Safari Adventure",
					"quantity": 1
				}
			]
		}
	]
	
	if len(leads) > 1:
		quotation_records.append({
			"doctype": "Cheese Quotation",
			"lead": leads[1].name,
			"route": "Adventure Combo",
			"status": "SENT",
			"total_price": 350.00,
			"deposit_amount": 70.00,
			"valid_until": add_to_date(now_datetime(), hours=48, as_string=False)
		})
	
	return make_test_objects("Cheese Quotation", quotation_records, verbose=verbose)


def _make_test_route_booking_records(verbose=None):
	"""Create test route bookings with tickets"""
	from frappe.test_runner import make_test_objects
	
	contacts = frappe.get_all("Cheese Contact", fields=["name"], limit=2)
	routes = frappe.get_all("Cheese Route", fields=["name"], limit=2)
	
	if not contacts or not routes:
		return []
	
	route_bookings = []
	
	for i, route_name in enumerate(routes[:2]):
		if i >= len(contacts):
			break
		
		contact = contacts[i]
		route_doc = frappe.get_doc("Cheese Route", route_name.name)
		
		route_slots = {}
		for exp_row in route_doc.experiences:
			exp_id = exp_row.experience
			slots = frappe.get_all(
				"Cheese Experience Slot",
				filters={"experience": exp_id},
				fields=["name"],
				limit=1
			)
			if slots:
				route_slots[exp_id] = slots[0].name
		
		if len(route_slots) == len(route_doc.experiences):
			party_size = 2
			
			if route_doc.price_mode == "Manual" and route_doc.price:
				total_price = route_doc.price * party_size
			elif route_doc.price_mode == "Sum":
				total_price = 0
				for exp_row in route_doc.experiences:
					exp = frappe.get_doc("Cheese Experience", exp_row.experience)
					total_price += exp.route_price * party_size
			else:
				total_price = 0
			
			deposit_required = route_doc.deposit_required or False
			deposit_amount = 0
			if deposit_required:
				if route_doc.deposit_type == "Amount":
					deposit_amount = route_doc.deposit_value or 0
				elif route_doc.deposit_type == "%":
					deposit_amount = (total_price * (route_doc.deposit_value or 0)) / 100
			
			tickets_data = []
			for exp_row in route_doc.experiences:
				exp_id = exp_row.experience
				slot_id = route_slots.get(exp_id)
				
				if slot_id:
					ticket = frappe.get_doc({
						"doctype": "Cheese Ticket",
						"contact": contact,
						"company": "_Test Company",
						"experience": exp_id,
						"slot": slot_id,
						"route": route_name.name,
						"party_size": party_size,
						"status": "CONFIRMED",
						"expires_at": add_to_date(now_datetime(), hours=24, as_string=False)
					})
					ticket.insert(ignore_permissions=True)
					frappe.db.commit()
					
					tickets_data.append({
						"doctype": "Cheese Route Booking Ticket",
						"ticket": ticket.name,
						"experience": exp_id,
						"slot": slot_id,
						"party_size": party_size,
						"status": ticket.status
					})
			
			if tickets_data:
				route_bookings.append({
					"doctype": "Cheese Route Booking",
					"contact": contact,
					"route": route_name.name,
					"status": "CONFIRMED",
					"total_price": total_price,
					"deposit_required": deposit_required,
					"deposit_amount": deposit_amount,
					"expires_at": add_to_date(now_datetime(), hours=24, as_string=False),
					"tickets": tickets_data
				})
	
	return make_test_objects("Cheese Route Booking", route_bookings, verbose=verbose)


def _make_test_survey_response_records(verbose=None):
	"""Create test survey responses for completed tickets"""
	from frappe.test_runner import make_test_objects
	
	tickets = frappe.get_all(
		"Cheese Ticket",
		filters={"status": "COMPLETED"},
		fields=["name"],
		limit=2
	)
	
	if not tickets:
		return []
	
	survey_records = []
	comments = [
		"Great experience!",
		"Very enjoyable, would recommend",
		"Amazing service and activities",
		"Had a wonderful time"
	]
	
	for i, ticket in enumerate(tickets):
		survey_records.append({
			"doctype": "Cheese Survey Response",
			"ticket": ticket.name,
			"rating": 4 + (i % 2),
			"comment": comments[i % len(comments)],
			"submitted_at": now_datetime()
		})
	
	return make_test_objects("Cheese Survey Response", survey_records, verbose=verbose)


# ============================================================================
# Test Classes
# ============================================================================

class TestCheeseExperience(FrappeTestCase):
	pass


class TestCheeseRoute(FrappeTestCase):
	pass


class TestCheeseTicket(FrappeTestCase):
	pass


class TestCheeseAttendance(FrappeTestCase):
	pass


class TestCheeseDeposit(FrappeTestCase):
	pass


class TestCheeseSupportCase(FrappeTestCase):
	pass


class TestCheeseQRToken(FrappeTestCase):
	pass


class TestCheeseSystemEvent(FrappeTestCase):
	pass


class TestCheeseQuotation(FrappeTestCase):
	pass


class TestCheeseRouteBooking(FrappeTestCase):
	pass


class TestCheeseSurveyResponse(FrappeTestCase):
	pass


class TestCheeseItemQuickCreate(FrappeTestCase):
	pass


# ============================================================================
# Main execution
# ============================================================================

if __name__ == "__main__":
	import unittest
	import sys
	
	# Discover and run all tests
	loader = unittest.TestLoader()
	suite = loader.loadTestsFromModule(sys.modules[__name__])
	runner = unittest.TextTestRunner(verbosity=2)
	result = runner.run(suite)
	
	sys.exit(0 if result.wasSuccessful() else 1)
