# Copyright (c) 2026
# License: MIT
"""Permission tests for the centralized tenant-isolation helpers.

These exercise ``cheese.cheese.utils.access`` directly to confirm that a
Level-2 "Establishment User" is scoped to a single company while super admins
(Administrator / Route Administrator) remain unrestricted.

Run with: bench --site <site> run-tests --app cheese \
    --module cheese.test_access_isolation
"""

import frappe
from frappe.tests.utils import FrappeTestCase

from cheese.cheese.utils.access import (
	assert_company_value,
	assert_contact_access,
	assert_experience_access,
	assert_record_access,
	assert_route_access,
	current_scope_company,
	scope_filters,
)
from cheese.cheese.utils.permissions import NO_COMPANY_SENTINEL

COMPANY_A = "Cheese ISO Company A"
COMPANY_B = "Cheese ISO Company B"
EST_USER = "cheese_iso_est_user@example.com"
# Establishment user deliberately left WITHOUT a Company User Permission.
EST_USER_NO_COMPANY = "cheese_iso_est_user_nocompany@example.com"
# Roles a real establishment user receives (see user_controller.create_user):
# "Cheese Establishment User" drives single-company scoping, "Cheese Booking
# Agent" grants the doctype read access tested below.
EST_ROLES = ("Establishment User", "Cheese Establishment User", "Cheese Booking Agent")


def _ensure_company(name, abbr):
	if frappe.db.exists("Company", name):
		return name
	frappe.get_doc(
		{
			"doctype": "Company",
			"company_name": name,
			"abbr": abbr,
			"default_currency": "USD",
			"country": "United States",
		}
	).insert(ignore_permissions=True, ignore_if_duplicate=True)
	return name


def _ensure_experience(name, company):
	if frappe.db.exists("Cheese Experience", name):
		frappe.db.set_value("Cheese Experience", name, "company", company)
		return name
	doc = frappe.get_doc(
		{
			"doctype": "Cheese Experience",
			"name": name,
			"company": company,
			"description": f"{name} desc",
			"individual_price": 100.0,
			"package_mode": "Both",
			"status": "ONLINE",
		}
	)
	doc.set_new_name()
	doc.insert(ignore_permissions=True, ignore_if_duplicate=True)
	return doc.name


def _ensure_route(name, experience):
	if frappe.db.exists("Cheese Route", name):
		return name
	doc = frappe.get_doc(
		{
			"doctype": "Cheese Route",
			"name": name,
			"short_description": name,
			"description": f"{name} desc",
			"status": "ONLINE",
			"price_mode": "Sum",
			"experiences": [
				{
					"doctype": "Cheese Route Experience",
					"experience": experience,
					"sequence": 1,
				}
			],
		}
	)
	doc.insert(ignore_permissions=True, ignore_if_duplicate=True)
	return doc.name


def _ensure_system_event(experience):
	doc = frappe.get_doc(
		{
			"doctype": "Cheese System Event",
			"entity_type": "Cheese Experience",
			"entity_id": experience,
			"event_type": "TICKET_CREATED",
			"payload_json": "{}",
			"created_at": frappe.utils.now_datetime(),
		}
	)
	doc.insert(ignore_permissions=True)
	return doc.name


def _ensure_contact(phone, company):
	existing = frappe.get_all("Cheese Contact", filters={"phone": phone}, pluck="name")
	if existing:
		return existing[0]
	doc = frappe.get_doc(
		{
			"doctype": "Cheese Contact",
			"full_name": f"Contact {phone}",
			"phone": phone,
			"companies": [{"doctype": "Cheese Contact Company", "company": company}],
		}
	)
	doc.insert(ignore_permissions=True)
	return doc.name


class TestTenantIsolationHelpers(FrappeTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		_ensure_company(COMPANY_A, "CISOA")
		_ensure_company(COMPANY_B, "CISOB")

		cls.exp_a = _ensure_experience("Cheese ISO Exp A", COMPANY_A)
		cls.exp_b = _ensure_experience("Cheese ISO Exp B", COMPANY_B)
		cls.route_a = _ensure_route("Cheese ISO Route A", cls.exp_a)
		cls.route_b = _ensure_route("Cheese ISO Route B", cls.exp_b)
		cls.contact_a = _ensure_contact("+100000000001", COMPANY_A)
		cls.contact_b = _ensure_contact("+100000000002", COMPANY_B)

		cls.event_a = _ensure_system_event(cls.exp_a)
		cls.event_b = _ensure_system_event(cls.exp_b)

		for role in EST_ROLES:
			if not frappe.db.exists("Role", role):
				frappe.get_doc({"doctype": "Role", "role_name": role}).insert(
					ignore_permissions=True, ignore_if_duplicate=True
				)

		if not frappe.db.exists("User", EST_USER):
			user = frappe.get_doc(
				{
					"doctype": "User",
					"email": EST_USER,
					"first_name": "ISO",
					"last_name": "Establishment",
					"enabled": 1,
					"user_type": "System User",
					"send_welcome_email": 0,
				}
			)
			user.insert(ignore_permissions=True)
		else:
			user = frappe.get_doc("User", EST_USER)
		_existing_roles = {r.role for r in user.roles}
		_added = False
		for role in EST_ROLES:
			if role not in _existing_roles:
				user.append("roles", {"role": role})
				_added = True
		if _added:
			user.save(ignore_permissions=True)

		if not frappe.db.exists(
			"User Permission", {"user": EST_USER, "allow": "Company", "for_value": COMPANY_A}
		):
			frappe.get_doc(
				{
					"doctype": "User Permission",
					"user": EST_USER,
					"allow": "Company",
					"for_value": COMPANY_A,
					"apply_to_all_doctypes": 1,
				}
			).insert(ignore_permissions=True)

		# Establishment user with NO company assignment: must fail CLOSED.
		if not frappe.db.exists("User", EST_USER_NO_COMPANY):
			nc_user = frappe.get_doc(
				{
					"doctype": "User",
					"email": EST_USER_NO_COMPANY,
					"first_name": "ISO",
					"last_name": "NoCompany",
					"enabled": 1,
					"user_type": "System User",
					"send_welcome_email": 0,
				}
			)
			nc_user.insert(ignore_permissions=True)
		else:
			nc_user = frappe.get_doc("User", EST_USER_NO_COMPANY)
		_nc_roles = {r.role for r in nc_user.roles}
		_nc_added = False
		for role in EST_ROLES:
			if role not in _nc_roles:
				nc_user.append("roles", {"role": role})
				_nc_added = True
		if _nc_added:
			nc_user.save(ignore_permissions=True)
		frappe.db.delete(
			"User Permission", {"user": EST_USER_NO_COMPANY, "allow": "Company"}
		)

		frappe.db.commit()

	def tearDown(self):
		frappe.set_user("Administrator")

	# -- establishment user is scoped to company A -------------------------

	def test_current_scope_company_for_establishment_user(self):
		frappe.set_user(EST_USER)
		self.assertEqual(current_scope_company(), COMPANY_A)

	def test_scope_filters_injects_company(self):
		frappe.set_user(EST_USER)
		self.assertEqual(scope_filters({"status": "PENDING"}), {"status": "PENDING", "company": COMPANY_A})

	def test_assert_company_value_blocks_other_company(self):
		frappe.set_user(EST_USER)
		assert_company_value(COMPANY_A)  # own company: no raise
		with self.assertRaises(frappe.PermissionError):
			assert_company_value(COMPANY_B)

	def test_assert_experience_access(self):
		frappe.set_user(EST_USER)
		assert_experience_access(self.exp_a)
		with self.assertRaises(frappe.PermissionError):
			assert_experience_access(self.exp_b)

	def test_assert_record_access_experience(self):
		frappe.set_user(EST_USER)
		assert_record_access("Cheese Experience", self.exp_a)
		with self.assertRaises(frappe.PermissionError):
			assert_record_access("Cheese Experience", self.exp_b)

	def test_assert_route_access(self):
		frappe.set_user(EST_USER)
		assert_route_access(self.route_a)
		with self.assertRaises(frappe.PermissionError):
			assert_route_access(self.route_b)

	def test_assert_contact_access(self):
		frappe.set_user(EST_USER)
		assert_contact_access(self.contact_a)
		with self.assertRaises(frappe.PermissionError):
			assert_contact_access(self.contact_b)

	# -- list views never expose another company's rows -------------------

	def test_experience_list_is_scoped(self):
		frappe.set_user(EST_USER)
		names = frappe.get_list("Cheese Experience", pluck="name", limit_page_length=0)
		self.assertIn(self.exp_a, names)
		self.assertNotIn(self.exp_b, names)

	def test_route_list_is_scoped(self):
		frappe.set_user(EST_USER)
		names = frappe.get_list("Cheese Route", pluck="name", limit_page_length=0)
		self.assertIn(self.route_a, names)
		self.assertNotIn(self.route_b, names)

	def test_system_event_list_is_scoped(self):
		frappe.set_user(EST_USER)
		names = frappe.get_list("Cheese System Event", pluck="name", limit_page_length=0)
		self.assertIn(self.event_a, names)
		self.assertNotIn(self.event_b, names)

	def test_conversation_visible_after_company_scoped_message_upload(self):
		"""Establishment users see conversations only after a scoped message upload."""
		from cheese.api.v1.conversation_controller import open_or_resume_conversation
		from cheese.api.v1.message_controller import upload_message_transcript

		phone = "+100000000099"
		contact_id = _ensure_contact(phone, COMPANY_A)
		frappe.set_user("Administrator")

		result = open_or_resume_conversation(contact_id, "WhatsApp", "ACTIVE")
		conv_id = result["data"]["conversation_id"]
		self.assertIsNone(frappe.db.get_value("Conversation", conv_id, "company"))

		upload = upload_message_transcript(
			phone,
			[{"role": "user", "content": "hello"}],
			COMPANY_A,
			conv_id,
		)
		self.assertTrue(upload.get("success"))
		frappe.db.commit()

		frappe.set_user(EST_USER)
		names = frappe.get_list("Conversation", pluck="name", limit_page_length=0)
		self.assertIn(conv_id, names)

	# -- establishment user with NO company fails CLOSED ------------------

	def test_no_company_user_scope_is_sentinel(self):
		frappe.set_user(EST_USER_NO_COMPANY)
		# Must NOT be None (that would mean "all companies" / fail open).
		self.assertEqual(current_scope_company(), NO_COMPANY_SENTINEL)

	def test_no_company_user_scope_filters_blocks(self):
		frappe.set_user(EST_USER_NO_COMPANY)
		self.assertEqual(
			scope_filters({"status": "PENDING"}),
			{"status": "PENDING", "company": NO_COMPANY_SENTINEL},
		)

	def test_no_company_user_sees_no_experiences(self):
		frappe.set_user(EST_USER_NO_COMPANY)
		names = frappe.get_list("Cheese Experience", pluck="name", limit_page_length=0)
		self.assertNotIn(self.exp_a, names)
		self.assertNotIn(self.exp_b, names)

	# -- super admins are never scoped ------------------------------------

	def test_admin_is_unscoped(self):
		frappe.set_user("Administrator")
		self.assertIsNone(current_scope_company())
		self.assertEqual(scope_filters({"status": "PENDING"}), {"status": "PENDING"})
		# No raises regardless of company.
		assert_company_value(COMPANY_B)
		assert_experience_access(self.exp_b)
		assert_record_access("Cheese Experience", self.exp_b)
		assert_route_access(self.route_b)
		assert_contact_access(self.contact_b)
