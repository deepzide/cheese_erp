# Copyright (c) 2024
# License: MIT

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import now_datetime, add_to_date


class CheeseRouteBooking(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF
		from cheese.cheese.doctype.cheese_route_booking_ticket.cheese_route_booking_ticket import CheeseRouteBookingTicket

		contact: DF.Link
		conversation: DF.Link | None
		deposit_amount: DF.Currency | None
		deposit_required: DF.Check
		expires_at: DF.Datetime | None
		route: DF.Link
		status: DF.Literal["PENDING", "PARTIALLY_CONFIRMED", "CONFIRMED", "CANCELLED"]
		tickets: DF.Table[CheeseRouteBookingTicket]
		total_price: DF.Currency | None
	# end: auto-generated types

	def validate(self):
		"""Validate route booking data"""
		# Validate route exists
		if self.route and not frappe.db.exists("Cheese Route", self.route):
			frappe.throw(_("Route {0} does not exist").format(self.route))

		# Validate contact exists
		if self.contact and not frappe.db.exists("Cheese Contact", self.contact):
			frappe.throw(_("Contact {0} does not exist").format(self.contact))

		# Calculate status from tickets if tickets exist
		if self.tickets and len(self.tickets) > 0:
			self.calculate_status()

		# Set expiration if status is PENDING
		if self.status == "PENDING" and not self.expires_at:
			route = frappe.get_doc("Cheese Route", self.route)
			if route.deposit_ttl_hours:
				self.expires_at = add_to_date(now_datetime(), hours=route.deposit_ttl_hours, as_string=False)
			else:
				# Default 24 hours
				self.expires_at = add_to_date(now_datetime(), hours=24, as_string=False)

	def calculate_status(self):
		"""Calculate status based on child ticket statuses"""
		if not self.tickets or len(self.tickets) == 0:
			return

		# Get actual ticket statuses
		ticket_statuses = []
		for ticket_row in self.tickets:
			if ticket_row.ticket:
				ticket = frappe.get_doc("Cheese Ticket", ticket_row.ticket)
				ticket_statuses.append(ticket.status)
				# Update child table row with current ticket data
				ticket_row.experience = ticket.experience
				ticket_row.slot = ticket.slot
				ticket_row.party_size = ticket.party_size
				ticket_row.status = ticket.status

		if not ticket_statuses:
			return

		# Determine overall status
		confirmed_count = ticket_statuses.count("CONFIRMED")
		pending_count = ticket_statuses.count("PENDING")
		cancelled_count = ticket_statuses.count("CANCELLED") + ticket_statuses.count("EXPIRED")
		total_count = len(ticket_statuses)

		if cancelled_count == total_count:
			self.status = "CANCELLED"
		elif confirmed_count == total_count:
			self.status = "CONFIRMED"
		elif confirmed_count > 0:
			self.status = "PARTIALLY_CONFIRMED"
		else:
			self.status = "PENDING"

	def on_update(self):
		"""Handle post-update logic"""
		# Log status changes to System Event
		if self.has_value_changed("status"):
			self.log_status_change()
			# Auto-convert lead when route booking becomes CONFIRMED
			if self.status == "CONFIRMED":
				self.convert_associated_lead()
				# Send confirmation notification
				self.send_status_notification("confirmed")
			elif self.status == "CANCELLED":
				self.send_status_notification("rejected")
			elif self.status == "EXPIRED":
				self.send_status_notification("expired")

	def log_status_change(self):
		"""Log status change to System Event"""
		try:
			from cheese.cheese.utils.events import log_event
			log_event(
				entity_type="Cheese Route Booking",
				entity_id=self.name,
				event_type="status_change",
				payload={"old_status": self._doc_before_save.status if hasattr(self, "_doc_before_save") else None, "new_status": self.status}
			)
		except Exception:
			# Silently fail if event logging fails
			pass

	@frappe.whitelist()
	def refresh_ticket_statuses(self):
		"""Refresh ticket statuses from actual tickets"""
		self.calculate_status()
		self.save()
		return self.status

	def convert_associated_lead(self):
		"""Automatically convert associated lead to CONVERTED when route booking is confirmed"""
		try:
			if not self.contact:
				return
			
			# Find active lead for this contact (OPEN or IN_PROGRESS)
			active_lead = frappe.db.get_value(
				"Cheese Lead",
				{
					"contact": self.contact,
					"status": ["in", ["OPEN", "IN_PROGRESS"]]
				},
				"name",
				order_by="modified desc"
			)
			
			if active_lead:
				lead = frappe.get_doc("Cheese Lead", active_lead)
				if lead.status != "CONVERTED":
					lead.status = "CONVERTED"
					lead.last_interaction_at = now_datetime()
					lead.save(ignore_permissions=True)
					frappe.db.commit()
		except Exception as e:
			# Silently fail if lead conversion fails
			frappe.log_error(f"Failed to auto-convert lead for route booking {self.name}: {e}", "Lead Conversion Error")

	def send_status_notification(self, notification_type):
		"""Send notification about status change"""
		try:
			from cheese.cheese.utils.notifications import send_route_booking_notification
			send_route_booking_notification(self.name, notification_type)
		except Exception as e:
			# Silently fail if notification fails
			frappe.log_error(f"Failed to send notification for route booking {self.name}: {e}", "Notification Error")
