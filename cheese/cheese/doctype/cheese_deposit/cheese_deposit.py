# Copyright (c) 2024
# License: MIT

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import now_datetime, getdate
import json


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

		# Validate OCR payload if provided
		if verification_method == "OCR" and ocr_payload:
			self.validate_ocr_payload(ocr_payload, amount)

		self.amount_paid = (self.amount_paid or 0) + amount
		self.verification_method = verification_method
		
		if ocr_payload:
			# Store OCR payload as JSON
			if isinstance(ocr_payload, str):
				self.ocr_payload = ocr_payload
			else:
				self.ocr_payload = json.dumps(ocr_payload)

		if self.amount_paid >= self.amount_required:
			self.status = "PAID"
			self.paid_at = now_datetime()

		self.save()

	def validate_ocr_payload(self, ocr_payload, amount):
		"""Validate OCR payload structure and data"""
		# Parse OCR payload if string
		if isinstance(ocr_payload, str):
			try:
				ocr_data = json.loads(ocr_payload)
			except json.JSONDecodeError:
				frappe.throw(_("Invalid OCR payload JSON format"))
		else:
			ocr_data = ocr_payload

		# Required fields in OCR payload
		required_fields = ["account", "amount", "date"]
		for field in required_fields:
			if field not in ocr_data:
				frappe.throw(_("OCR payload missing required field: {0}").format(field))

		# Validate amount matches
		ocr_amount = float(ocr_data.get("amount", 0))
		if abs(ocr_amount - amount) > 0.01:  # Allow small floating point differences
			frappe.throw(
				_("OCR amount ({0}) does not match payment amount ({1})").format(
					ocr_amount, amount
				)
			)

		# Validate date format (if provided as string)
		if "date" in ocr_data:
			try:
				ocr_date = getdate(ocr_data["date"])
				# Date should not be too far in the future
				if ocr_date > getdate(now_datetime()):
					frappe.throw(_("OCR date cannot be in the future"))
			except Exception:
				frappe.throw(_("Invalid date format in OCR payload"))

	@frappe.whitelist()
	def reconcile_ocr_payment(self, bank_account_number=None):
		"""Reconcile OCR payment against expected bank account"""
		if not self.ocr_payload:
			frappe.throw(_("No OCR payload available for reconciliation"))

		# Parse OCR payload
		if isinstance(self.ocr_payload, str):
			ocr_data = json.loads(self.ocr_payload)
		else:
			ocr_data = self.ocr_payload

		# Get expected bank account if entity is Route Booking
		if self.entity_type == "Cheese Route Booking":
			route_booking = frappe.get_doc("Cheese Route Booking", self.entity_id)
			route = frappe.get_doc("Cheese Route", route_booking.route)
			
			# Get bank account for route
			bank_account = frappe.db.get_value(
				"Cheese Bank Account",
				{"route": route.name, "status": "ACTIVE"},
				["account", "iban"],
				as_dict=True
			)
			
			if bank_account:
				expected_account = bank_account.account or bank_account.iban
				ocr_account = ocr_data.get("account", "").replace(" ", "").upper()
				expected_account_clean = expected_account.replace(" ", "").upper()
				
				# Check if accounts match (allowing partial matches for account numbers)
				if expected_account_clean not in ocr_account and ocr_account not in expected_account_clean:
					frappe.throw(
						_("OCR account ({0}) does not match expected account ({1})").format(
							ocr_account, expected_account
						)
					)

		# Validate amount
		ocr_amount = float(ocr_data.get("amount", 0))
		if abs(ocr_amount - self.amount_required) > 0.01:
			frappe.throw(
				_("OCR amount ({0}) does not match required amount ({1})").format(
					ocr_amount, self.amount_required
				)
			)

		# If all validations pass, mark as reconciled
		return {
			"reconciled": True,
			"ocr_data": ocr_data,
			"message": "Payment reconciled successfully"
		}
