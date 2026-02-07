# Copyright (c) 2024
# License: MIT

import frappe
from frappe.utils import now_datetime, add_days, add_hours, getdate, get_datetime
from datetime import datetime, timedelta
import random


def after_install():
	"""Run after app installation to seed mock data"""
	frappe.log_error("Starting mock data seeding for Cheese app (after_install)", "Cheese Install")
	
	try:
		seed_mock_data()
		frappe.db.commit()
		frappe.log_error("Mock data seeding completed successfully", "Cheese Install")
	except Exception as e:
		frappe.log_error(f"Error seeding mock data: {str(e)}", "Cheese Install")
		frappe.db.rollback()
		raise


def after_migrate():
	"""Run after migration to seed mock data if needed"""
	frappe.log_error("Checking for mock data after migration", "Cheese Install")
	
	try:
		# Only seed if no data exists
		if frappe.db.count("Cheese Contact") == 0:
			frappe.log_error("No contacts found, seeding mock data after migrate", "Cheese Install")
			seed_mock_data()
			frappe.db.commit()
			frappe.log_error("Mock data seeding completed successfully after migrate", "Cheese Install")
		else:
			frappe.log_error("Mock data already exists, skipping seed after migrate", "Cheese Install")
	except Exception as e:
		frappe.log_error(f"Error seeding mock data after migrate: {str(e)}", "Cheese Install")
		frappe.db.rollback()


@frappe.whitelist()
def seed_mock_data_manual():
	"""
	Manually seed mock data - can be called via bench console or API
	Usage in bench console:
		frappe.call("cheese.install.seed_mock_data_manual")
	"""
	frappe.log_error("Manual mock data seeding requested", "Cheese Install")
	
	try:
		# Check if data already exists
		if frappe.db.count("Cheese Contact") > 0:
			return {
				"success": False,
				"message": "Mock data already exists. Delete existing data first if you want to reseed."
			}
		
		seed_mock_data()
		frappe.db.commit()
		
		return {
			"success": True,
			"message": "Mock data seeded successfully"
		}
	except Exception as e:
		frappe.log_error(f"Error in manual mock data seeding: {str(e)}", "Cheese Install")
		frappe.db.rollback()
		return {
			"success": False,
			"message": f"Error seeding mock data: {str(e)}"
		}


def seed_mock_data():
	"""Seed comprehensive mock data for all Cheese doctypes"""
	
	# Check if data already exists
	if frappe.db.count("Cheese Contact") > 0:
		frappe.log_error("Mock data already exists. Skipping seed.", "Cheese Install")
		return
	
	frappe.log_error("Seeding mock data...", "Cheese Install")
	
	# 1. Ensure Company exists (required for experiences)
	company = ensure_company()
	
	# 2. Create Contacts
	contacts = create_contacts()
	
	# 3. Create Experiences
	experiences = create_experiences(company)
	
	# 4. Create Experience Slots
	slots = create_experience_slots(experiences)
	
	# 5. Create Routes
	routes = create_routes(experiences)
	
	# 6. Create Conversations
	conversations = create_conversations(contacts)
	
	# 7. Create Leads
	leads = create_leads(contacts, conversations)
	
	# 8. Create Tickets
	tickets = create_tickets(contacts, experiences, slots, company)
	
	# 9. Create Deposits
	deposits = create_deposits(tickets)
	
	# 10. Create Quotations
	quotations = create_quotations(leads, conversations, routes, experiences)
	
	# 11. Create QR Tokens
	qr_tokens = create_qr_tokens(tickets)
	
	# 12. Create Survey Responses
	survey_responses = create_survey_responses(tickets)
	
	# 13. Create Support Cases
	support_cases = create_support_cases(contacts, tickets)
	
	# 14. Create Attendance
	attendance = create_attendance(tickets)
	
	# 15. Create Booking Policies
	booking_policies = create_booking_policies(experiences)
	
	# 16. Create System Events
	create_system_events(contacts, conversations, tickets)
	
	frappe.log_error(f"Created: {len(contacts)} contacts, {len(experiences)} experiences, {len(slots)} slots, {len(routes)} routes", "Cheese Install")


def ensure_company():
	"""Ensure a Company exists, create if not"""
	company_name = frappe.db.get_value("Company", {"name": "Test Company"})
	if not company_name:
		company = frappe.get_doc({
			"doctype": "Company",
			"company_name": "Test Company",
			"abbr": "TC",
			"default_currency": "USD",
			"country": "United States"
		})
		company.insert(ignore_permissions=True)
		frappe.db.commit()
		return company.name
	return company_name


def create_contacts():
	"""Create mock contacts"""
	contacts = []
	contact_data = [
		{"full_name": "John Doe", "phone": "+1234567890", "email": "john.doe@example.com", "preferred_language": "English", "preferred_channel": "WhatsApp"},
		{"full_name": "Jane Smith", "phone": "+1234567891", "email": "jane.smith@example.com", "preferred_language": "English", "preferred_channel": "Email"},
		{"full_name": "Carlos Rodriguez", "phone": "+1234567892", "email": "carlos.r@example.com", "preferred_language": "Spanish", "preferred_channel": "WhatsApp"},
		{"full_name": "Marie Dubois", "phone": "+1234567893", "email": "marie.d@example.com", "preferred_language": "French", "preferred_channel": "Email"},
		{"full_name": "Ahmed Hassan", "phone": "+1234567894", "email": "ahmed.h@example.com", "preferred_language": "English", "preferred_channel": "Web"},
	]
	
	for data in contact_data:
		try:
			contact = frappe.get_doc({
				"doctype": "Cheese Contact",
				**data,
				"opt_in_status": "OPT_IN"
			})
			contact.insert(ignore_permissions=True)
			contacts.append(contact.name)
		except Exception as e:
			frappe.log_error(f"Error creating contact {data['full_name']}: {str(e)}", "Cheese Install")
	
	frappe.db.commit()
	return contacts


def create_experiences(company):
	"""Create mock experiences"""
	experiences = []
	experience_data = [
		{
			"name": "Desert Safari Adventure",
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
		try:
			exp = frappe.get_doc({
				"doctype": "Cheese Experience",
				"company": company,
				**data
			})
			exp.insert(ignore_permissions=True)
			experiences.append(exp.name)
		except Exception as e:
			frappe.log_error(f"Error creating experience {data['name']}: {str(e)}", "Cheese Install")
	
	frappe.db.commit()
	return experiences


def create_experience_slots(experiences):
	"""Create mock experience slots for the next 30 days"""
	slots = []
	today = getdate()
	
	for experience in experiences:
		# Create 2-3 slots per day for next 30 days
		for day_offset in range(30):
			slot_date = add_days(today, day_offset)
			times = ["09:00:00", "14:00:00", "18:00:00"]
			
			for time_str in times[:random.randint(2, 3)]:
				try:
					slot = frappe.get_doc({
						"doctype": "Cheese Experience Slot",
						"experience": experience,
						"date": slot_date,
						"time": time_str,
						"max_capacity": random.randint(10, 30),
						"reserved_capacity": 0,
						"slot_status": "OPEN"
					})
					slot.insert(ignore_permissions=True)
					slots.append(slot.name)
				except Exception as e:
					frappe.log_error(f"Error creating slot: {str(e)}", "Cheese Install")
	
	frappe.db.commit()
	return slots


def create_routes(experiences):
	"""Create mock routes"""
	routes = []
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
			"experience_names": ["Desert Safari Adventure", "Water Sports Package"]
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
			"experience_names": ["City Tour Experience", "Cultural Heritage Walk"]
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
			"experience_names": ["Desert Safari Adventure", "City Tour Experience", "Sunset Cruise"]
		}
	]
	
	for data in route_data:
		try:
			route = frappe.get_doc({
				"doctype": "Cheese Route",
				"name": data["name"],
				"description": data["description"],
				"status": data["status"],
				"price_mode": data["price_mode"],
				"deposit_required": data.get("deposit_required", 0),
				"deposit_type": data.get("deposit_type"),
				"deposit_value": data.get("deposit_value"),
				"deposit_ttl_hours": data.get("deposit_ttl_hours")
			})
			
			if "price" in data:
				route.price = data["price"]
			
			# Add experiences to route
			sequence = 1
			for exp_name in data["experience_names"]:
				exp_id = frappe.db.get_value("Cheese Experience", {"name": exp_name}, "name")
				if exp_id:
					route.append("experiences", {
						"experience": exp_id,
						"sequence": sequence
					})
					sequence += 1
			
			route.insert(ignore_permissions=True)
			routes.append(route.name)
		except Exception as e:
			frappe.log_error(f"Error creating route {data['name']}: {str(e)}", "Cheese Install")
	
	frappe.db.commit()
	return routes


def create_conversations(contacts):
	"""Create mock conversations"""
	conversations = []
	channels = ["WhatsApp", "Web", "Agent"]
	
	for contact in contacts[:3]:  # Create conversations for first 3 contacts
		channel = random.choice(channels)
		try:
			conversation = frappe.get_doc({
				"doctype": "Conversation",
				"contact": contact,
				"channel": channel,
				"status": "ACTIVE",
				"summary": f"Conversation with customer via {channel}"
			})
			conversation.insert(ignore_permissions=True)
			conversations.append(conversation.name)
		except Exception as e:
			frappe.log_error(f"Error creating conversation: {str(e)}", "Cheese Install")
	
	frappe.db.commit()
	return conversations


def create_leads(contacts, conversations):
	"""Create mock leads"""
	leads = []
	interest_types = ["Route", "Experience"]
	statuses = ["OPEN", "IN_PROGRESS", "CONVERTED"]
	
	for i, contact in enumerate(contacts[:4]):
		try:
			lead = frappe.get_doc({
				"doctype": "Cheese Lead",
				"contact": contact,
				"conversation": conversations[i] if i < len(conversations) else None,
				"interest_type": random.choice(interest_types),
				"status": random.choice(statuses),
				"last_interaction_at": now_datetime()
			})
			lead.insert(ignore_permissions=True)
			leads.append(lead.name)
		except Exception as e:
			frappe.log_error(f"Error creating lead: {str(e)}", "Cheese Install")
	
	frappe.db.commit()
	return leads


def create_tickets(contacts, experiences, slots, company):
	"""Create mock tickets"""
	tickets = []
	statuses = ["PENDING", "CONFIRMED", "CHECKED_IN", "COMPLETED"]
	
	# Get some slots for today and tomorrow
	today = getdate()
	tomorrow = add_days(today, 1)
	available_slots = frappe.get_all(
		"Cheese Experience Slot",
		filters={"date": ["in", [today, tomorrow]]},
		fields=["name", "experience"],
		limit=10
	)
	
	for i, slot_data in enumerate(available_slots[:5]):
		contact = contacts[i % len(contacts)]
		experience = slot_data.experience
		slot = slot_data.name
		
		try:
			expires_at = add_hours(now_datetime(), 24)
			ticket = frappe.get_doc({
				"doctype": "Cheese Ticket",
				"contact": contact,
				"company": company,
				"experience": experience,
				"slot": slot,
				"party_size": random.randint(1, 4),
				"status": random.choice(statuses),
				"expires_at": expires_at
			})
			ticket.insert(ignore_permissions=True)
			tickets.append(ticket.name)
		except Exception as e:
			frappe.log_error(f"Error creating ticket: {str(e)}", "Cheese Install")
	
	frappe.db.commit()
	return tickets


def create_deposits(tickets):
	"""Create mock deposits for tickets"""
	deposits = []
	
	for ticket in tickets[:3]:  # Create deposits for first 3 tickets
		ticket_doc = frappe.get_doc("Cheese Ticket", ticket)
		if ticket_doc.deposit_required:
			try:
				due_at = add_hours(now_datetime(), 24)
				deposit = frappe.get_doc({
					"doctype": "Cheese Deposit",
					"entity_type": "Ticket",
					"entity_id": ticket,
					"amount_required": ticket_doc.deposit_amount or 50.00,
					"amount_paid": 0,
					"status": "PENDING",
					"due_at": due_at
				})
				deposit.insert(ignore_permissions=True)
				deposits.append(deposit.name)
			except Exception as e:
				frappe.log_error(f"Error creating deposit: {str(e)}", "Cheese Install")
	
	frappe.db.commit()
	return deposits


def create_quotations(leads, conversations, routes, experiences):
	"""Create mock quotations"""
	quotations = []
	
	for i, lead in enumerate(leads[:2]):
		try:
			route = routes[i] if i < len(routes) else None
			quotation = frappe.get_doc({
				"doctype": "Cheese Quotation",
				"lead": lead,
				"conversation": conversations[i] if i < len(conversations) else None,
				"route": route,
				"status": "DRAFT",
				"party_size": random.randint(2, 4),
				"valid_until": add_hours(now_datetime(), 48)
			})
			
			# Add experience if no route
			if not route and experiences:
				quotation.append("experiences", {
					"experience": experiences[0],
					"quantity": 1
				})
			
			quotation.insert(ignore_permissions=True)
			quotations.append(quotation.name)
		except Exception as e:
			frappe.log_error(f"Error creating quotation: {str(e)}", "Cheese Install")
	
	frappe.db.commit()
	return quotations


def create_qr_tokens(tickets):
	"""Create mock QR tokens for confirmed tickets"""
	qr_tokens = []
	
	confirmed_tickets = frappe.get_all(
		"Cheese Ticket",
		filters={"status": ["in", ["CONFIRMED", "CHECKED_IN", "COMPLETED"]]},
		fields=["name"],
		limit=3
	)
	
	for ticket_data in confirmed_tickets:
		try:
			qr = frappe.get_doc({
				"doctype": "Cheese QR Token",
				"ticket": ticket_data.name,
				"token": frappe.generate_hash(length=32),
				"status": "ACTIVE",
				"expires_at": add_days(now_datetime(), 1)
			})
			qr.insert(ignore_permissions=True)
			qr_tokens.append(qr.name)
		except Exception as e:
			frappe.log_error(f"Error creating QR token: {str(e)}", "Cheese Install")
	
	frappe.db.commit()
	return qr_tokens


def create_survey_responses(tickets):
	"""Create mock survey responses"""
	survey_responses = []
	
	completed_tickets = frappe.get_all(
		"Cheese Ticket",
		filters={"status": "COMPLETED"},
		fields=["name"],
		limit=2
	)
	
	for ticket_data in completed_tickets:
		try:
			survey = frappe.get_doc({
				"doctype": "Cheese Survey Response",
				"ticket": ticket_data.name,
				"rating": random.randint(3, 5),
				"comment": random.choice([
					"Great experience!",
					"Very enjoyable, would recommend",
					"Amazing service and activities",
					"Had a wonderful time"
				]),
				"submitted_at": now_datetime()
			})
			survey.insert(ignore_permissions=True)
			survey_responses.append(survey.name)
		except Exception as e:
			frappe.log_error(f"Error creating survey response: {str(e)}", "Cheese Install")
	
	frappe.db.commit()
	return survey_responses


def create_support_cases(contacts, tickets):
	"""Create mock support cases"""
	support_cases = []
	
	for i, contact in enumerate(contacts[:2]):
		ticket = tickets[i] if i < len(tickets) else None
		try:
			case = frappe.get_doc({
				"doctype": "Cheese Support Case",
				"contact": contact,
				"ticket": ticket,
				"description": random.choice([
					"Need to modify booking date",
					"Question about deposit refund",
					"Request for additional information",
					"Complaint about service quality"
				]),
				"status": random.choice(["OPEN", "IN_PROGRESS", "RESOLVED"]),
				"priority": random.choice(["Low", "Medium", "High"])
			})
			case.insert(ignore_permissions=True)
			support_cases.append(case.name)
		except Exception as e:
			frappe.log_error(f"Error creating support case: {str(e)}", "Cheese Install")
	
	frappe.db.commit()
	return support_cases


def create_attendance(tickets):
	"""Create mock attendance records"""
	attendance_records = []
	
	checked_in_tickets = frappe.get_all(
		"Cheese Ticket",
		filters={"status": ["in", ["CHECKED_IN", "COMPLETED"]]},
		fields=["name", "experience", "slot"],
		limit=2
	)
	
	for ticket_data in checked_in_tickets:
		try:
			slot = frappe.get_doc("Cheese Experience Slot", ticket_data.slot)
			attendance = frappe.get_doc({
				"doctype": "Cheese Attendance",
				"ticket": ticket_data.name,
				"experience": ticket_data.experience,
				"check_in_time": get_datetime(f"{slot.date} {slot.time}"),
				"status": "PRESENT"
			})
			attendance.insert(ignore_permissions=True)
			attendance_records.append(attendance.name)
		except Exception as e:
			frappe.log_error(f"Error creating attendance: {str(e)}", "Cheese Install")
	
	frappe.db.commit()
	return attendance_records


def create_booking_policies(experiences):
	"""Create mock booking policies"""
	policies = []
	
	for experience in experiences[:3]:
		try:
			policy = frappe.get_doc({
				"doctype": "Cheese Booking Policy",
				"experience": experience,
				"modify_until_hours_before": 24,
				"cancel_until_hours_before": 48,
				"no_show_hours_after": 2
			})
			policy.insert(ignore_permissions=True)
			policies.append(policy.name)
		except Exception as e:
			frappe.log_error(f"Error creating booking policy: {str(e)}", "Cheese Install")
	
	frappe.db.commit()
	return policies


def create_system_events(contacts, conversations, tickets):
	"""Create mock system events"""
	events = []
	event_types = ["CONTACT_CREATED", "CONVERSATION_OPENED", "TICKET_CREATED", "TICKET_CONFIRMED"]
	
	# Create events for contacts
	for contact in contacts[:2]:
		try:
			event = frappe.get_doc({
				"doctype": "Cheese System Event",
				"entity_type": "Cheese Contact",
				"entity_id": contact,
				"event_type": "CONTACT_CREATED",
				"payload_json": '{"source": "mock_data"}',
				"created_at": now_datetime()
			})
			event.insert(ignore_permissions=True)
			events.append(event.name)
		except Exception as e:
			frappe.log_error(f"Error creating system event: {str(e)}", "Cheese Install")
	
	# Create events for conversations
	for conversation in conversations[:2]:
		try:
			event = frappe.get_doc({
				"doctype": "Cheese System Event",
				"entity_type": "Conversation",
				"entity_id": conversation,
				"event_type": "CONVERSATION_OPENED",
				"payload_json": '{"channel": "WhatsApp"}',
				"created_at": now_datetime()
			})
			event.insert(ignore_permissions=True)
			events.append(event.name)
		except Exception as e:
			frappe.log_error(f"Error creating system event: {str(e)}", "Cheese Install")
	
	# Create events for tickets
	for ticket in tickets[:2]:
		try:
			event = frappe.get_doc({
				"doctype": "Cheese System Event",
				"entity_type": "Cheese Ticket",
				"entity_id": ticket,
				"event_type": "TICKET_CREATED",
				"payload_json": '{"status": "PENDING"}',
				"created_at": now_datetime()
			})
			event.insert(ignore_permissions=True)
			events.append(event.name)
		except Exception as e:
			frappe.log_error(f"Error creating system event: {str(e)}", "Cheese Install")
	
	frappe.db.commit()
	return events
