# Copyright (c) 2024
# License: MIT

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import add_to_date, now_datetime
import json


class CheeseTicket(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		company: DF.Link
		contact: DF.Link
		conversation: DF.Link | None
		deposit_amount: DF.Currency | None
		deposit_required: DF.Check
		experience: DF.Link
		expires_at: DF.Datetime | None
		party_size: DF.Int
		policy_snapshot: DF.JSON | None
		price_snapshot: DF.JSON | None
		route: DF.Link | None
		slot: DF.Link
		status: DF.Literal[
			"PENDING",
			"CONFIRMED",
			"CHECKED_IN",
			"COMPLETED",
			"EXPIRED",
			"REJECTED",
			"CANCELLED",
			"NO_SHOW",
		]
	# end: auto-generated types

	# Valid status transitions
	VALID_TRANSITIONS = {
		"PENDING": ["CONFIRMED", "EXPIRED", "REJECTED"],
		"CONFIRMED": ["CHECKED_IN", "CANCELLED", "NO_SHOW"],
		"CHECKED_IN": ["COMPLETED"],
		"COMPLETED": [],  # Terminal
		"EXPIRED": [],  # Terminal
		"REJECTED": [],  # Terminal
		"CANCELLED": [],  # Terminal
		"NO_SHOW": [],  # Terminal
	}

	def validate(self):
		"""Validate ticket data and enforce status machine"""
		# Validate status transitions
		if not self.is_new():
			self.validate_status_transition()

		# Validate capacity
		self.validate_capacity()

		# Create snapshots on creation
		if self.is_new():
			self.create_snapshots()
			self.set_expires_at()

		# Update capacity on status change
		if not self.is_new() and self.has_value_changed("status"):
			self.update_capacity()

	def validate_status_transition(self):
		"""Validate status transitions according to state machine"""
		previous_status = frappe.db.get_value("Cheese Ticket", self.name, "status")
		
		if previous_status and self.status != previous_status:
			allowed_statuses = self.VALID_TRANSITIONS.get(previous_status, [])
			
			if self.status not in allowed_statuses:
				frappe.throw(
					_("Invalid status transition from {0} to {1}. Allowed transitions: {2}").format(
						previous_status,
						self.status,
						", ".join(allowed_statuses) if allowed_statuses else "None"
					),
					frappe.ValidationError
				)

	def validate_capacity(self):
		"""Validate slot capacity"""
		if not self.slot:
			return

		slot = frappe.get_doc("Cheese Experience Slot", self.slot)
		available_capacity = slot.get_available_capacity()

		if self.party_size > available_capacity:
			frappe.throw(
				_("Party size ({0}) exceeds available capacity ({1}) for slot {2}").format(
					self.party_size, available_capacity, self.slot
				),
				frappe.ValidationError
			)

	def create_snapshots(self):
		"""Create snapshots of policy and pricing"""
		# Policy snapshot
		policy = frappe.db.get_value(
			"Cheese Booking Policy",
			{"experience": self.experience},
			["cancel_until_hours_before", "modify_until_hours_before", "min_hours_before_booking"],
			as_dict=True
		)
		if policy:
			self.policy_snapshot = json.dumps(policy)

		# Price snapshot
		experience = frappe.get_doc("Cheese Experience", self.experience)
		price_data = {
			"individual_price": experience.individual_price,
			"route_price": experience.route_price,
			"min_acts_for_route_price": experience.min_acts_for_route_price,
		}
		self.price_snapshot = json.dumps(price_data)

	def set_expires_at(self):
		"""Set expiration time for PENDING tickets"""
		if self.status == "PENDING":
			# Default TTL: 24 hours
			ttl_hours = 24
			
			# Check if experience has deposit TTL
			experience = frappe.get_doc("Cheese Experience", self.experience)
			if experience.deposit_ttl_hours:
				ttl_hours = experience.deposit_ttl_hours
			
			self.expires_at = add_to_date(now_datetime(), hours=ttl_hours, as_string=False)

	def update_capacity(self):
		"""Update slot capacity when ticket status changes"""
		if not self.slot:
			return

		slot = frappe.get_doc("Cheese Experience Slot", self.slot)
		slot.calculate_reserved_capacity()
		slot.update_slot_status()
		slot.save()

	def on_update(self):
		"""Handle post-update logic"""
		# Log status changes to System Event
		if self.has_value_changed("status"):
			self.log_status_change()

	def log_status_change(self):
		"""Log status change to System Event"""
		try:
			from cheese.cheese.utils.events import log_event
			log_event(
				entity_type="Cheese Ticket",
				entity_id=self.name,
				event_type="status_change",
				payload={"old_status": self._doc_before_save.status, "new_status": self.status}
			)
		except Exception:
			# Silently fail if event logging fails
			pass

	@frappe.whitelist()
	def confirm(self):
		"""Confirm a PENDING ticket"""
		if self.status != "PENDING":
			frappe.throw(_("Only PENDING tickets can be confirmed"))

		self.status = "CONFIRMED"
		self.save()

	@frappe.whitelist()
	def reject(self):
		"""Reject a PENDING ticket"""
		if self.status != "PENDING":
			frappe.throw(_("Only PENDING tickets can be rejected"))

		self.status = "REJECTED"
		self.save()

	@frappe.whitelist()
	def cancel(self):
		"""Cancel a CONFIRMED ticket"""
		if self.status != "CONFIRMED":
			frappe.throw(_("Only CONFIRMED tickets can be cancelled"))

		self.status = "CANCELLED"
		self.save()

	@frappe.whitelist()
	def check_in(self):
		"""Check in a CONFIRMED ticket"""
		if self.status != "CONFIRMED":
			frappe.throw(_("Only CONFIRMED tickets can be checked in"))

		self.status = "CHECKED_IN"
		self.save()

	@frappe.whitelist()
	def complete(self):
		"""Complete a CHECKED_IN ticket"""
		if self.status != "CHECKED_IN":
			frappe.throw(_("Only CHECKED_IN tickets can be completed"))

		self.status = "COMPLETED"
		self.save()
