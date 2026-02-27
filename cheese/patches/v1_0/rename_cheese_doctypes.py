# Copyright (c) 2024
# License: MIT

"""
Patch to rename all existing cheese doctype records to use new autoname formats
This patch should be run after the autoname changes are applied to the doctypes.
"""

import frappe
from frappe.utils import get_datetime, format_datetime, now_datetime


def execute():
	"""Rename all existing records to match new autoname formats"""
	
	# Mapping of doctype to rename function
	rename_functions = {
		"Cheese Contact": rename_cheese_contact,
		"Cheese Document": rename_cheese_document,
		"Cheese Lead": rename_cheese_lead,
		"Cheese Deposit": rename_cheese_deposit,
		"Cheese Quotation": rename_cheese_quotation,
		"Cheese Ticket": rename_cheese_ticket,
		"Cheese Experience Slot": rename_cheese_experience_slot,
		"Cheese Route Booking": rename_cheese_route_booking,
		"Cheese Route Booking Ticket": rename_cheese_route_booking_ticket,
		"Conversation": rename_conversation,
		"Cheese Support Case": rename_cheese_support_case,
		"Cheese System Event": rename_cheese_system_event,
		"Cheese Booking Policy": rename_cheese_booking_policy,
		"Cheese Bank Account": rename_cheese_bank_account,
		"Cheese QR Token": rename_cheese_qr_token,
		"Cheese Survey Response": rename_cheese_survey_response,
		"Cheese Attendance": rename_cheese_attendance,
		"Cheese Route Experience": rename_cheese_route_experience,
		"Cheese Contact Channel Opt In": rename_cheese_contact_channel_opt_in,
	}
	
	for doctype, rename_func in rename_functions.items():
		try:
			if frappe.db.exists("DocType", doctype):
				rename_func()
				frappe.db.commit()
		except Exception as e:
			frappe.log_error(f"Error renaming {doctype}: {str(e)}", f"Rename {doctype}")
			# Continue with other doctypes even if one fails
			frappe.db.rollback()


def rename_cheese_contact():
	"""Rename Cheese Contact using field:full_name"""
	contacts = frappe.get_all("Cheese Contact", fields=["name", "full_name"])
	for contact in contacts:
		if contact.full_name and contact.name != contact.full_name:
			try:
				# Make name URL-safe
				new_name = frappe.scrub(contact.full_name)
				if new_name and new_name != contact.name:
					frappe.rename_doc("Cheese Contact", contact.name, new_name, force=True, show_alert=False)
			except Exception as e:
				frappe.log_error(f"Error renaming contact {contact.name}: {str(e)}")


def rename_cheese_document():
	"""Rename Cheese Document using format:{entity_type}-{entity_id}-{title}"""
	documents = frappe.get_all("Cheese Document", fields=["name", "entity_type", "entity_id", "title"])
	for doc in documents:
		if doc.entity_type and doc.entity_id and doc.title:
			new_name = f"{doc.entity_type}-{doc.entity_id}-{frappe.scrub(doc.title)}"
			if new_name and new_name != doc.name:
				try:
					frappe.rename_doc("Cheese Document", doc.name, new_name, force=True, show_alert=False)
				except Exception as e:
					frappe.log_error(f"Error renaming document {doc.name}: {str(e)}")


def rename_cheese_lead():
	"""Rename Cheese Lead using format:{contact}-{status}-{creation}"""
	leads = frappe.get_all("Cheese Lead", fields=["name", "contact", "status", "creation"])
	for lead in leads:
		if lead.contact and lead.status:
			creation_str = format_datetime(get_datetime(lead.creation), "YYYYMMDDHHmmss")
			new_name = f"{lead.contact}-{lead.status}-{creation_str}"
			if new_name and new_name != lead.name:
				try:
					frappe.rename_doc("Cheese Lead", lead.name, new_name, force=True, show_alert=False)
				except Exception as e:
					frappe.log_error(f"Error renaming lead {lead.name}: {str(e)}")


def rename_cheese_deposit():
	"""Rename Cheese Deposit using format:{entity_type}-{entity_id}-{creation}"""
	deposits = frappe.get_all("Cheese Deposit", fields=["name", "entity_type", "entity_id", "creation"])
	for deposit in deposits:
		if deposit.entity_type and deposit.entity_id:
			creation_str = format_datetime(get_datetime(deposit.creation), "YYYYMMDDHHmmss")
			new_name = f"{deposit.entity_type}-{deposit.entity_id}-{creation_str}"
			if new_name and new_name != deposit.name:
				try:
					frappe.rename_doc("Cheese Deposit", deposit.name, new_name, force=True, show_alert=False)
				except Exception as e:
					frappe.log_error(f"Error renaming deposit {deposit.name}: {str(e)}")


def rename_cheese_quotation():
	"""Rename Cheese Quotation using format:QUO-.YYYY.-.MM.-.#####"""
	from frappe.utils import getdate
	quotations = frappe.get_all("Cheese Quotation", fields=["name", "creation"], order_by="creation")
	counter_map = {}  # Track counters per year-month
	
	for quotation in quotations:
		try:
			creation_date = getdate(quotation.creation)
			year = creation_date.strftime("%Y")
			month = creation_date.strftime("%m")
			key = f"{year}-{month}"
			
			# Initialize or increment counter for this year-month
			if key not in counter_map:
				# Get the highest number for this series
				series = f"QUO-{year}-{month}-"
				last_number = frappe.db.sql("""
					SELECT CAST(SUBSTRING_INDEX(name, '-', -1) AS UNSIGNED) as num
					FROM `tabCheese Quotation`
					WHERE name LIKE %s
					ORDER BY num DESC LIMIT 1
				""", (series + "%",))
				counter_map[key] = (last_number[0][0] + 1) if last_number and last_number[0][0] else 1
			else:
				counter_map[key] += 1
			
			series = f"QUO-{year}-{month}-"
			new_name = f"{series}{counter_map[key]:05d}"
			if new_name and new_name != quotation.name:
				frappe.rename_doc("Cheese Quotation", quotation.name, new_name, force=True, show_alert=False)
		except Exception as e:
			frappe.log_error(f"Error renaming quotation {quotation.name}: {str(e)}")


def rename_cheese_ticket():
	"""Rename Cheese Ticket using format:TKT-.YYYY.-.MM.-.#####"""
	from frappe.utils import getdate
	tickets = frappe.get_all("Cheese Ticket", fields=["name", "creation"], order_by="creation")
	counter_map = {}  # Track counters per year-month
	
	for ticket in tickets:
		try:
			creation_date = getdate(ticket.creation)
			year = creation_date.strftime("%Y")
			month = creation_date.strftime("%m")
			key = f"{year}-{month}"
			
			# Initialize or increment counter for this year-month
			if key not in counter_map:
				# Get the highest number for this series
				series = f"TKT-{year}-{month}-"
				last_number = frappe.db.sql("""
					SELECT CAST(SUBSTRING_INDEX(name, '-', -1) AS UNSIGNED) as num
					FROM `tabCheese Ticket`
					WHERE name LIKE %s
					ORDER BY num DESC LIMIT 1
				""", (series + "%",))
				counter_map[key] = (last_number[0][0] + 1) if last_number and last_number[0][0] else 1
			else:
				counter_map[key] += 1
			
			series = f"TKT-{year}-{month}-"
			new_name = f"{series}{counter_map[key]:05d}"
			if new_name and new_name != ticket.name:
				frappe.rename_doc("Cheese Ticket", ticket.name, new_name, force=True, show_alert=False)
		except Exception as e:
			frappe.log_error(f"Error renaming ticket {ticket.name}: {str(e)}")


def rename_cheese_experience_slot():
	"""Rename Cheese Experience Slot using format:{experience}-{date}-{time}"""
	slots = frappe.get_all("Cheese Experience Slot", fields=["name", "experience", "date", "time"])
	for slot in slots:
		if slot.experience and slot.date:
			date_str = str(slot.date).replace("-", "")
			time_str = str(slot.time).replace(":", "") if slot.time else "000000"
			new_name = f"{slot.experience}-{date_str}-{time_str}"
			if new_name and new_name != slot.name:
				try:
					frappe.rename_doc("Cheese Experience Slot", slot.name, new_name, force=True, show_alert=False)
				except Exception as e:
					frappe.log_error(f"Error renaming slot {slot.name}: {str(e)}")


def rename_cheese_route_booking():
	"""Rename Cheese Route Booking using format:{route}-{contact}-{creation}"""
	bookings = frappe.get_all("Cheese Route Booking", fields=["name", "route", "contact", "creation"])
	for booking in bookings:
		if booking.route and booking.contact:
			creation_str = format_datetime(get_datetime(booking.creation), "YYYYMMDDHHmmss")
			new_name = f"{booking.route}-{booking.contact}-{creation_str}"
			if new_name and new_name != booking.name:
				try:
					frappe.rename_doc("Cheese Route Booking", booking.name, new_name, force=True, show_alert=False)
				except Exception as e:
					frappe.log_error(f"Error renaming route booking {booking.name}: {str(e)}")


def rename_cheese_route_booking_ticket():
	"""Rename Cheese Route Booking Ticket using format:{ticket}-{experience}"""
	tickets = frappe.get_all("Cheese Route Booking Ticket", fields=["name", "ticket", "experience"])
	for ticket in tickets:
		if ticket.ticket and ticket.experience:
			new_name = f"{ticket.ticket}-{ticket.experience}"
			if new_name and new_name != ticket.name:
				try:
					frappe.rename_doc("Cheese Route Booking Ticket", ticket.name, new_name, force=True, show_alert=False)
				except Exception as e:
					frappe.log_error(f"Error renaming route booking ticket {ticket.name}: {str(e)}")


def rename_conversation():
	"""Rename Conversation using format:CONV-{contact}-{creation}"""
	conversations = frappe.get_all("Conversation", fields=["name", "contact", "creation"])
	for conv in conversations:
		if conv.contact:
			creation_str = format_datetime(get_datetime(conv.creation), "YYYYMMDDHHmmss")
			new_name = f"CONV-{conv.contact}-{creation_str}"
			if new_name and new_name != conv.name:
				try:
					frappe.rename_doc("Conversation", conv.name, new_name, force=True, show_alert=False)
				except Exception as e:
					frappe.log_error(f"Error renaming conversation {conv.name}: {str(e)}")


def rename_cheese_support_case():
	"""Rename Cheese Support Case using format:CASE-{contact}-{creation}"""
	cases = frappe.get_all("Cheese Support Case", fields=["name", "contact", "creation"])
	for case in cases:
		if case.contact:
			creation_str = format_datetime(get_datetime(case.creation), "YYYYMMDDHHmmss")
			new_name = f"CASE-{case.contact}-{creation_str}"
			if new_name and new_name != case.name:
				try:
					frappe.rename_doc("Cheese Support Case", case.name, new_name, force=True, show_alert=False)
				except Exception as e:
					frappe.log_error(f"Error renaming support case {case.name}: {str(e)}")


def rename_cheese_system_event():
	"""Rename Cheese System Event using format:{entity_type}-{entity_id}-{event_type}-{creation}"""
	events = frappe.get_all("Cheese System Event", fields=["name", "entity_type", "entity_id", "event_type", "created_at"])
	for event in events:
		if event.entity_type and event.entity_id and event.event_type:
			creation_str = format_datetime(get_datetime(event.created_at or now_datetime()), "YYYYMMDDHHmmss")
			new_name = f"{event.entity_type}-{event.entity_id}-{event.event_type}-{creation_str}"
			if new_name and new_name != event.name:
				try:
					frappe.rename_doc("Cheese System Event", event.name, new_name, force=True, show_alert=False)
				except Exception as e:
					frappe.log_error(f"Error renaming system event {event.name}: {str(e)}")


def rename_cheese_booking_policy():
	"""Rename Cheese Booking Policy using format:{experience}-POLICY"""
	policies = frappe.get_all("Cheese Booking Policy", fields=["name", "experience"])
	for policy in policies:
		if policy.experience:
			new_name = f"{policy.experience}-POLICY"
			if new_name and new_name != policy.name:
				try:
					frappe.rename_doc("Cheese Booking Policy", policy.name, new_name, force=True, show_alert=False)
				except Exception as e:
					frappe.log_error(f"Error renaming booking policy {policy.name}: {str(e)}")


def rename_cheese_bank_account():
	"""Rename Cheese Bank Account using field:route"""
	accounts = frappe.get_all("Cheese Bank Account", fields=["name", "route"])
	for account in accounts:
		if account.route and account.name != account.route:
			try:
				frappe.rename_doc("Cheese Bank Account", account.name, account.route, force=True, show_alert=False)
			except Exception as e:
				frappe.log_error(f"Error renaming bank account {account.name}: {str(e)}")


def rename_cheese_qr_token():
	"""Rename Cheese QR Token using field:token"""
	tokens = frappe.get_all("Cheese QR Token", fields=["name", "token"])
	for token in tokens:
		if token.token and token.name != token.token:
			try:
				frappe.rename_doc("Cheese QR Token", token.name, token.token, force=True, show_alert=False)
			except Exception as e:
				frappe.log_error(f"Error renaming QR token {token.name}: {str(e)}")


def rename_cheese_survey_response():
	"""Rename Cheese Survey Response using field:ticket"""
	responses = frappe.get_all("Cheese Survey Response", fields=["name", "ticket"])
	for response in responses:
		if response.ticket and response.name != response.ticket:
			try:
				frappe.rename_doc("Cheese Survey Response", response.name, response.ticket, force=True, show_alert=False)
			except Exception as e:
				frappe.log_error(f"Error renaming survey response {response.name}: {str(e)}")


def rename_cheese_attendance():
	"""Rename Cheese Attendance using field:ticket"""
	attendances = frappe.get_all("Cheese Attendance", fields=["name", "ticket"])
	for attendance in attendances:
		if attendance.ticket and attendance.name != attendance.ticket:
			try:
				frappe.rename_doc("Cheese Attendance", attendance.name, attendance.ticket, force=True, show_alert=False)
			except Exception as e:
				frappe.log_error(f"Error renaming attendance {attendance.name}: {str(e)}")


def rename_cheese_route_experience():
	"""Rename Cheese Route Experience using format:{experience}-{sequence}"""
	# This is a child table, so we need to get parent records first
	experiences = frappe.db.sql("""
		SELECT name, experience, sequence, parent
		FROM `tabCheese Route Experience`
	""", as_dict=True)
	
	for exp in experiences:
		if exp.experience and exp.sequence is not None:
			new_name = f"{exp.experience}-{exp.sequence}"
			if new_name and new_name != exp.name:
				try:
					frappe.rename_doc("Cheese Route Experience", exp.name, new_name, force=True, show_alert=False)
				except Exception as e:
					frappe.log_error(f"Error renaming route experience {exp.name}: {str(e)}")


def rename_cheese_contact_channel_opt_in():
	"""Rename Cheese Contact Channel Opt In using format:{channel}-{opt_in_status}"""
	opt_ins = frappe.db.sql("""
		SELECT name, channel, opt_in_status, parent
		FROM `tabCheese Contact Channel Opt In`
	""", as_dict=True)
	
	for opt_in in opt_ins:
		if opt_in.channel and opt_in.opt_in_status:
			new_name = f"{opt_in.channel}-{opt_in.opt_in_status}"
			if new_name and new_name != opt_in.name:
				try:
					frappe.rename_doc("Cheese Contact Channel Opt In", opt_in.name, new_name, force=True, show_alert=False)
				except Exception as e:
					frappe.log_error(f"Error renaming contact channel opt in {opt_in.name}: {str(e)}")
