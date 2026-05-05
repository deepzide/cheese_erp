import inspect
from types import SimpleNamespace
from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from cheese.api.v1 import complaint_controller, qr_controller
from cheese.api.v1.bank_account_controller import (
	get_active_company_bank_accounts_list,
	serialize_company_bank_account_row,
)
from cheese.api.v1 import availability_controller, deposit_controller, establishment_controller
from cheese.api.v1 import route_booking_controller


class TestPlanChanges(FrappeTestCase):
	def test_bank_account_supports_dynamic_entity_fields(self):
		meta = frappe.get_meta("Cheese Bank Account")
		self.assertIsNotNone(meta.get_field("entity_type"))
		self.assertIsNotNone(meta.get_field("entity_id"))

	def test_support_case_has_route_and_company_fields(self):
		meta = frappe.get_meta("Cheese Support Case")
		self.assertIsNotNone(meta.get_field("route"))
		self.assertIsNotNone(meta.get_field("company"))

	def test_survey_response_has_route_and_company_fields(self):
		meta = frappe.get_meta("Cheese Survey Response")
		self.assertIsNotNone(meta.get_field("route"))
		self.assertIsNotNone(meta.get_field("company"))

	def test_support_list_signature_has_route_and_company_filters(self):
		sig = inspect.signature(complaint_controller.list_support_cases)
		self.assertIn("route_id", sig.parameters)
		self.assertIn("company_id", sig.parameters)

	def test_qr_get_qr_signature_supports_allow_pending(self):
		sig = inspect.signature(qr_controller.get_qr)
		self.assertIn("allow_pending", sig.parameters)
		self.assertIn("send_notification", sig.parameters)

	def test_serialize_company_bank_account_row_bot_keys(self):
		row = {
			"name": "cba-1",
			"account": "001234",
			"bank": "Test Bank",
			"currency": "USD",
			"holder": "Holder",
			"iban": None,
		}
		d = serialize_company_bank_account_row(row)
		self.assertEqual(d["account_number"], "001234")
		self.assertEqual(d["bank_name"], "Test Bank")
		self.assertEqual(d["currency"], "USD")
		self.assertEqual(d["bank_account_id"], "cba-1")

	def test_get_active_company_bank_accounts_list_empty_for_invalid(self):
		self.assertEqual(get_active_company_bank_accounts_list(""), [])
		self.assertEqual(get_active_company_bank_accounts_list(None), [])

	def test_record_deposit_payment_accepts_attach_receipt(self):
		sig = inspect.signature(deposit_controller.record_deposit_payment)
		self.assertIn("attach_receipt", sig.parameters)

	def test_payment_link_signature_accepts_payment_type(self):
		sig = inspect.signature(deposit_controller.get_payment_link_or_instructions)
		self.assertIn("payment_type", sig.parameters)

	def test_select_open_deposit_honors_payment_phase(self):
		deposits = [
			SimpleNamespace(name="DEP-ADV", status="PAID"),
			SimpleNamespace(name="DEP-BAL", status="PENDING"),
		]
		with patch.object(deposit_controller, "_get_deposits_for_entity", return_value=deposits):
			self.assertIsNone(
				deposit_controller._select_open_deposit("Cheese Ticket", "TICK-1", payment_type="Deposit")
			)
			self.assertEqual(
				deposit_controller._select_open_deposit("Cheese Ticket", "TICK-1", payment_type="Balance"),
				"DEP-BAL",
			)

	def test_cancelled_deposit_has_no_remaining_amount(self):
		deposit = SimpleNamespace(status="CANCELLED", amount_required=100, amount_paid=0)
		self.assertEqual(deposit_controller._amount_remaining_for_deposit(deposit), 0)

	def test_route_time_normalization_pads_hour(self):
		self.assertEqual(route_booking_controller._normalize_time_filter("9:00:00"), "09:00:00")

	def test_availability_accepts_hotel_guest_filters(self):
		sig = inspect.signature(availability_controller.get_available_slots)
		self.assertIn("guests", sig.parameters)
		self.assertIn("rooms_requested", sig.parameters)

	def test_create_establishment_accepts_is_hotel_alias(self):
		sig = inspect.signature(establishment_controller.create_establishment)
		self.assertIn("is_hotel", sig.parameters)
		self.assertIn("cheese_is_hotel", sig.parameters)

	def test_establishment_create_delete_archive_exist(self):
		for name in ("create_establishment", "delete_establishment", "archive_establishment", "unarchive_establishment"):
			self.assertTrue(hasattr(establishment_controller, name))
