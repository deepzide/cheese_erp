# Copyright (c) 2024
# License: MIT

import frappe
from frappe.model.document import Document
from frappe.utils import today, getdate, now_datetime, add_to_date


class CheeseSupportCase(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		contact: DF.Link
		description: DF.TextEditor
		incident_type: DF.Literal["LOCAL", "GENERAL"]
		status: DF.Literal["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]
		ticket: DF.Link | None
	# end: auto-generated types

	def on_update(self):
		"""Handle routing logic when support case is created or updated"""
		# Only process routing on insert or when incident_type changes
		if self.is_new() or self.has_value_changed("incident_type"):
			self.route_incident()
	
	def route_incident(self):
		"""Route incident based on type: LOCAL to establishment, GENERAL to admin"""
		try:
			if not self.incident_type:
				return
			
			if self.incident_type == "LOCAL":
				self._route_local_incident()
			elif self.incident_type == "GENERAL":
				self._route_general_incident()
		except Exception as e:
			frappe.log_error(f"Error routing incident {self.name}: {str(e)}", "Support Case Routing Error")
	
	def _route_local_incident(self):
		"""Route local incident to establishment if there's an active booking today"""
		try:
			# Check if there's a related ticket
			if not self.ticket:
				return
			
			# Get ticket details
			ticket = frappe.get_doc("Cheese Ticket", self.ticket)
			
			# Check if ticket is CONFIRMED and slot is today/upcoming
			if ticket.status != "CONFIRMED":
				return
			
			# Get slot information
			slot = frappe.get_doc("Cheese Experience Slot", ticket.slot)
			slot_date = getdate(slot.date_from)
			today_date = getdate(today())
			
			# Check if slot is today or in the next few hours
			if slot_date == today_date:
				# Check if slot time is upcoming (within next 6 hours)
				slot_datetime = frappe.utils.get_datetime(f"{slot.date_from} {slot.time_from}")
				now = now_datetime()
				hours_ahead = (slot_datetime - now).total_seconds() / 3600
				
				if 0 <= hours_ahead <= 6:
					# Send WhatsApp notification to establishment
					company_id = ticket.company
					booking_info = {
						"ticket_id": ticket.name,
						"slot_date": str(slot.date_from),
						"slot_time": str(slot.time_from)
					}
					
					from cheese.cheese.utils.notifications import send_support_notification_to_establishment
					send_support_notification_to_establishment(company_id, self.name, booking_info)
		except Exception as e:
			frappe.log_error(f"Error routing local incident: {str(e)}", "Local Incident Routing Error")
	
	def _route_general_incident(self):
		"""Route general incident to admin"""
		try:
			# Get admin user (System Manager role)
			admin_users = frappe.get_all(
				"Has Role",
				filters={"role": "System Manager", "parenttype": "User"},
				fields=["parent"],
				limit=1
			)
			
			if admin_users:
				# Assign to first admin user found
				self.assigned_to = admin_users[0].parent
				self.save()
				frappe.db.commit()
			
			# Log routing decision
			from cheese.cheese.utils.events import log_event
			log_event(
				entity_type="Cheese Support Case",
				entity_id=self.name,
				event_type="incident_routed",
				payload={
					"incident_type": self.incident_type,
					"routed_to": "admin",
					"assigned_to": self.assigned_to
				}
			)
		except Exception as e:
			frappe.log_error(f"Error routing general incident: {str(e)}", "General Incident Routing Error")
