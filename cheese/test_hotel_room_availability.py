# Copyright (c) 2026
# License: MIT
"""Hotel availability and booking derive from physical rooms, never slots.

Covers the QA checklist for Get Hotel Availability and Book Hotel Room:
- availability mirrors the physical rooms, ignoring legacy Experience Slots
- MAINTENANCE / OUT_OF_SERVICE / BLOCKED rooms don't count as available
- auto-assignment picks a room that is truly free for the WHOLE stay range

Run with:
    bench --site <site> run-tests --app cheese --module cheese.test_hotel_room_availability
"""

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_days, getdate, today

from cheese.api.v1.hotel_controller import bot_book_hotel_room, get_hotel_availability
from cheese.api.v1.ticket_controller import create_pending_reservation
from cheese.cheese.utils.room_assignment import stays_for_ticket

EXP_NAME = "TEST-AVAIL-DOBLE"


class TestHotelRoomAvailability(FrappeTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		# Any company whose currency the experience doctype accepts.
		cls.company = frappe.db.get_value(
			"Company", {"default_currency": ["in", ["UYU", "USD", "EUR", "BRL", "ARS"]]}, "name"
		) or frappe.get_all("Company", limit=1, pluck="name")[0]
		cls.check_in = str(add_days(getdate(today()), 30))
		cls.check_out = str(add_days(getdate(today()), 34))  # 4 nights

	def setUp(self):
		super().setUp()
		frappe.set_user("Administrator")
		self.exp = self._make_experience()
		self.rooms = [self._make_room(n) for n in ("T1", "T2", "T3")]

	def _make_experience(self):
		# Idempotent fixture: wipe leftovers from previous tests/runs.
		room_names = frappe.get_all("Cheese Hotel Room", filters={"room_type": EXP_NAME}, pluck="name")
		if room_names:
			frappe.db.delete("Cheese Room Stay", {"room": ["in", room_names]})
			frappe.db.delete("Cheese Hotel Room", {"room_type": EXP_NAME})
		frappe.db.delete("Cheese Room Stay", {"ticket": ["like", "%"], "room": ["in", room_names or ["__none__"]]})
		tickets = frappe.get_all("Cheese Ticket", filters={"experience": EXP_NAME}, pluck="name")
		for tk in tickets:
			frappe.db.delete("Cheese Room Stay", {"ticket": tk})
			frappe.delete_doc("Cheese Ticket", tk, force=1, ignore_permissions=True, ignore_missing=True)
		frappe.db.delete("Cheese Experience Slot", {"experience": EXP_NAME})
		frappe.delete_doc("Cheese Experience", EXP_NAME, force=1, ignore_permissions=True, ignore_missing=True)
		exp = frappe.get_doc(
			{
				"doctype": "Cheese Experience",
				"experience_name": "Test Avail Doble",
				"company": self.company,
				"experience_type": "HOTEL",
				"status": "ONLINE",
				"currency": frappe.db.get_value("Company", self.company, "default_currency") or "UYU",
				"price_per_night": 100,
				"room_size": 2,
				"max_occupancy_per_unit": 2,
				"min_nights_stay": 1,
			}
		)
		exp.insert(ignore_permissions=True, set_name=EXP_NAME)
		return exp

	def _make_room(self, number, status="ACTIVE"):
		room = frappe.get_doc(
			{
				"doctype": "Cheese Hotel Room",
				"company": self.company,
				"room_type": EXP_NAME,
				"room_number": number,
				"status": status,
			}
		)
		room.insert(ignore_permissions=True)
		return room

	def _make_contact(self, phone):
		existing = frappe.db.get_value("Cheese Contact", {"phone": phone}, "name")
		if existing:
			return existing
		contact = frappe.get_doc(
			{"doctype": "Cheese Contact", "full_name": f"Test Guest {phone}", "phone": phone}
		)
		contact.insert(ignore_permissions=True)
		return contact.name

	def _availability(self):
		res = get_hotel_availability(EXP_NAME, self.check_in, self.check_out)
		self.assertTrue(res.get("success"), res)
		return res["data"]["nights"]

	# ------------------------------------------------------------------
	# Availability derives from rooms, not from legacy slots
	# ------------------------------------------------------------------

	def test_availability_derives_from_rooms_not_slots(self):
		# A legacy slot with absurd capacity must be completely ignored.
		slot = frappe.get_doc(
			{
				"doctype": "Cheese Experience Slot",
				"experience": EXP_NAME,
				"date_from": self.check_in,
				"date_to": self.check_out,
				"max_capacity": 99,
				"slot_status": "OPEN",
			}
		)
		slot.insert(ignore_permissions=True)

		nights = self._availability()
		self.assertEqual(len(nights), 4)
		for night in nights:
			self.assertEqual(night["available"], 3, night)
			self.assertEqual(night["max_capacity"], 3, night)
			# Synthetic per-night id, never the legacy slot id
			self.assertNotEqual(night["slot_id"], slot.name)

	def test_unavailable_room_statuses_do_not_count(self):
		frappe.db.set_value("Cheese Hotel Room", self.rooms[0].name, "status", "MAINTENANCE")
		frappe.db.set_value("Cheese Hotel Room", self.rooms[1].name, "status", "OUT_OF_SERVICE")

		nights = self._availability()
		for night in nights:
			self.assertEqual(night["available"], 1, night)

		# Block the remaining room for the whole range -> zero availability
		frappe.get_doc(
			{
				"doctype": "Cheese Room Stay",
				"room": self.rooms[2].name,
				"status": "BLOCKED",
				"check_in": self.check_in,
				"check_out": self.check_out,
				"reason": "test block",
			}
		).insert(ignore_permissions=True)

		nights = self._availability()
		for night in nights:
			self.assertEqual(night["available"], 0, night)

	# ------------------------------------------------------------------
	# Auto-selection picks a room truly free for the whole range
	# ------------------------------------------------------------------

	def test_booking_auto_selects_really_free_room(self):
		# Rooms T1/T2 are unusable for part or all of the range; only T3 is
		# free for EVERY night, so auto-assignment must pick T3.
		frappe.db.set_value("Cheese Hotel Room", self.rooms[0].name, "status", "MAINTENANCE")
		frappe.get_doc(
			{
				"doctype": "Cheese Room Stay",
				"room": self.rooms[1].name,
				"status": "BLOCKED",
				# Overlaps only one middle night — still disqualifies the room
				"check_in": str(add_days(getdate(self.check_in), 1)),
				"check_out": str(add_days(getdate(self.check_in), 2)),
				"reason": "partial block",
			}
		).insert(ignore_permissions=True)

		contact = self._make_contact("+59890000001")
		res = create_pending_reservation(
			contact_id=contact,
			experience_id=EXP_NAME,
			party_size=2,
			check_in_date=self.check_in,
			check_out_date=self.check_out,
			rooms_requested=1,
		)
		self.assertTrue(res.get("success"), res)
		ticket_id = res["data"]["ticket_id"]

		stays = stays_for_ticket(ticket_id)
		self.assertEqual(len(stays), 1, stays)
		self.assertEqual(stays[0].room, self.rooms[2].name)
		self.assertEqual(stays[0].status, "RESERVED")
		self.assertEqual(str(stays[0].check_in), self.check_in)
		self.assertEqual(str(stays[0].check_out), self.check_out)

	def test_second_booking_takes_the_other_room_then_full(self):
		frappe.db.set_value("Cheese Hotel Room", self.rooms[2].name, "status", "OUT_OF_SERVICE")

		c1 = self._make_contact("+59890000002")
		c2 = self._make_contact("+59890000003")
		c3 = self._make_contact("+59890000004")

		r1 = create_pending_reservation(
			contact_id=c1, experience_id=EXP_NAME, party_size=1,
			check_in_date=self.check_in, check_out_date=self.check_out, rooms_requested=1,
		)
		r2 = create_pending_reservation(
			contact_id=c2, experience_id=EXP_NAME, party_size=1,
			check_in_date=self.check_in, check_out_date=self.check_out, rooms_requested=1,
		)
		self.assertTrue(r1.get("success"), r1)
		self.assertTrue(r2.get("success"), r2)

		room1 = stays_for_ticket(r1["data"]["ticket_id"])[0].room
		room2 = stays_for_ticket(r2["data"]["ticket_id"])[0].room
		self.assertNotEqual(room1, room2)

		# No rooms left for the range -> booking must fail with a reason
		r3 = create_pending_reservation(
			contact_id=c3, experience_id=EXP_NAME, party_size=1,
			check_in_date=self.check_in, check_out_date=self.check_out, rooms_requested=1,
		)
		self.assertFalse(r3.get("success"), r3)
		self.assertIn("No availability", str(r3))

		# Availability endpoint agrees: zero free rooms every night
		for night in self._availability():
			self.assertEqual(night["available"], 0, night)

	def test_bot_book_hotel_room_creates_reserved_stays(self):
		res = bot_book_hotel_room(
			contact_phone="+59890000005",
			room_id=EXP_NAME,
			date_from=self.check_in,
			date_to=self.check_out,
			rooms_requested=2,
			guests=4,
		)
		self.assertTrue(res.get("success"), res)
		ticket_id = res["data"]["ticket_id"]

		stays = stays_for_ticket(ticket_id)
		self.assertEqual(len(stays), 2, stays)
		self.assertTrue(all(s.status == "RESERVED" for s in stays))
		self.assertEqual(len({s.room for s in stays}), 2)

		# Availability drops accordingly (3 rooms - 2 reserved = 1)
		for night in self._availability():
			self.assertEqual(night["available"], 1, night)
