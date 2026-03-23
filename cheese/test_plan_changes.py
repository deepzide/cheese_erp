import inspect

import frappe
from frappe.tests.utils import FrappeTestCase

from cheese.api.v1 import complaint_controller, qr_controller


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
