import inspect

import frappe
from frappe.tests.utils import FrappeTestCase

from cheese.api.v1 import complaint_controller, qr_controller
from cheese.api.v1.bank_account_controller import (
	get_active_company_bank_accounts_list,
	serialize_company_bank_account_row,
)
from cheese.api.v1 import deposit_controller, establishment_controller


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

	def test_establishment_create_delete_archive_exist(self):
		for name in ("create_establishment", "delete_establishment", "archive_establishment", "unarchive_establishment"):
			self.assertTrue(hasattr(establishment_controller, name))
