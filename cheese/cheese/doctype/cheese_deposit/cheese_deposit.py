# Copyright (c) 2024
# License: MIT

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import now_datetime


class CheeseDeposit(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		amount_paid: DF.Currency | None
		amount_required: DF.Currency
		due_at: DF.Datetime | None
		entity_id: DF.DynamicLink
		entity_type: DF.Literal["Ticket", "Route Booking"]
		ocr_payload: DF.JSON | None
		paid_at: DF.Datetime | None
		status: DF.Literal["PENDING", "PAID", "OVERDUE", "ADJUSTED", "REFUNDED"]
		verification_method: DF.Literal["", "Manual", "OCR"]
	# end: auto-generated types

	def validate(self):
		"""Validate deposit data"""
		# Validate amount
		if self.amount_paid and self.amount_paid < 0:
			frappe.throw(_("Amount Paid cannot be negative"))

		if self.amount_required <= 0:
			frappe.throw(_("Amount Required must be greater than 0"))

		# Update status based on payment
		if self.amount_paid and self.amount_paid >= self.amount_required:
			if self.status == "PENDING":
				self.status = "PAID"
				if not self.paid_at:
					self.paid_at = now_datetime()

		# Check overdue
		if self.status == "PENDING" and self.due_at and self.due_at < now_datetime():
			self.status = "OVERDUE"

	def on_update(self):
		"""Handle post-update logic"""
		# Log status changes
		if self.has_value_changed("status"):
			self.log_status_change()

	def log_status_change(self):
		"""Log status change to System Event"""
		try:
			from cheese.cheese.utils.events import log_event
			log_event(
				entity_type="Cheese Deposit",
				entity_id=self.name,
				event_type="status_change",
				payload={"old_status": self._doc_before_save.status, "new_status": self.status}
			)
		except Exception:
			# Silently fail if event logging fails
			pass

	@frappe.whitelist()
	def record_payment(self, amount, verification_method="Manual", ocr_payload=None):
		"""Record a payment for this deposit"""
		if self.status in ["PAID", "REFUNDED"]:
			frappe.throw(_("Cannot record payment for {0} deposit").format(self.status))

		self.amount_paid = (self.amount_paid or 0) + amount
		self.verification_method = verification_method
		
		if ocr_payload:
			self.ocr_payload = ocr_payload

		if self.amount_paid >= self.amount_required:
			self.status = "PAID"
			self.paid_at = now_datetime()

		self.save()
