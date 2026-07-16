# Copyright (c) 2024
# License: MIT

import json

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import add_to_date, cint, getdate, now_datetime

from cheese.cheese.utils.pricing import calculate_deposit_amount, calculate_ticket_price


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
		"PENDING": ["CONFIRMED", "CANCELLED", "EXPIRED", "REJECTED"],
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

		# Prevent duplicate active tickets for same contact + experience + slot
		self.validate_duplicate_active_ticket()

		# Set nights before capacity checks
		experience_doc = frappe.get_doc("Cheese Experience", self.experience) if self.experience else None
		if experience_doc and experience_doc.experience_type == "HOTEL":
			if self.check_in_date and self.check_out_date:
				from frappe.utils import date_diff

				if str(self.check_out_date) <= str(self.check_in_date):
					frappe.throw(_("Check-out date must be after check-in date"))
				self.nights = date_diff(self.check_out_date, self.check_in_date)
			else:
				frappe.throw(_("Check-in and Check-out dates are required for Hotel reservations"))
			if not self.rooms_requested or self.rooms_requested < 1:
				frappe.throw(_("Rooms requested must be at least 1 for Hotel reservations"))

		# Validate capacity
		self.validate_capacity(experience_doc)

		# Create snapshots on creation
		if self.is_new():
			self.apply_experience_deposit_policy()
			self.create_snapshots()
			self.apply_auto_confirmation(experience_doc)
			self.set_expires_at()
			# Update slot capacity when ticket is created
			self.update_capacity()

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
						", ".join(allowed_statuses) if allowed_statuses else "None",
					),
					frappe.ValidationError,
				)

	def validate_duplicate_active_ticket(self):
		"""Prevent multiple active tickets with same contact+experience+slot+selected_date.

		If selected_date is set, two tickets on the same slot but different dates are allowed
		(e.g. multi-day or recurring slots where the user picks a specific date).
		"""
		if not (self.contact and self.experience and self.slot):
			return

		# Only consider tickets that are not terminal/cancelled
		excluded_statuses = ["CANCELLED", "EXPIRED", "REJECTED", "NO_SHOW"]

		experience_type = frappe.db.get_value("Cheese Experience", self.experience, "experience_type")
		if experience_type == "HOTEL":
			# Hotel reservations should only conflict when the stay windows overlap.
			# Same contact can book the same room type again for a different date range.
			if not (self.check_in_date and self.check_out_date):
				return

			new_check_in = getdate(self.check_in_date)
			new_check_out = getdate(self.check_out_date)
			candidates = frappe.get_all(
				"Cheese Ticket",
				filters={
					"contact": self.contact,
					"experience": self.experience,
					"name": ["!=", self.name] if self.name else ["!=", ""],
					"status": ["not in", excluded_statuses],
				},
				fields=["name", "check_in_date", "check_out_date"],
			)

			for row in candidates:
				if not row.check_in_date or not row.check_out_date:
					continue
				existing_check_in = getdate(row.check_in_date)
				existing_check_out = getdate(row.check_out_date)
				# Half-open ranges [check_in, check_out): overlap only when windows intersect.
				if new_check_in < existing_check_out and new_check_out > existing_check_in:
					frappe.throw(
						_("A ticket already exists for this contact, experience, and overlapping dates: {0}").format(row.name),
						frappe.ValidationError,
					)
			return

		filters = {
			"contact": self.contact,
			"experience": self.experience,
			"slot": self.slot,
			"name": ["!=", self.name] if self.name else ["!=", ""],
			"status": ["not in", excluded_statuses],
		}

		# If this ticket has a selected_date, scope the check to the same date only.
		# A booking for the same slot on a different selected_date is a distinct booking.
		if self.selected_date:
			filters["selected_date"] = self.selected_date
		else:
			# When no selected_date is set, only flag conflicts with other tickets
			# that also have no selected_date (avoids blocking tickets that differ by date).
			filters["selected_date"] = ["is", "not set"]

		exists = frappe.db.exists("Cheese Ticket", filters)
		if exists:
			frappe.throw(
				_("A ticket already exists for this contact, experience, and slot: {0}").format(exists),
				frappe.ValidationError,
			)

	def validate_capacity(self, experience_doc=None):
		"""Validate slot capacity for the ticket's selected calendar day (multi-day slots) or across check-in/out range."""
		if not self.slot:
			return

		from cheese.cheese.utils.capacity import get_available_capacity

		slot = frappe.get_doc("Cheese Experience Slot", self.slot)

		if not experience_doc:
			experience_doc = frappe.get_doc("Cheese Experience", self.experience)

		if experience_doc.experience_type == "HOTEL":
			from frappe.utils import add_days, cint

			room_size = cint(
				getattr(experience_doc, "room_size", 0)
				or getattr(experience_doc, "max_occupancy_per_unit", 0)
				or 0
			)
			if room_size < 1:
				frappe.throw(_("Room Size must be configured for hotel room reservations"))
			max_guests = room_size * (self.rooms_requested or 1)
			if (self.party_size or 1) > max_guests:
				frappe.throw(
					_("Guest count ({0}) exceeds room capacity ({1}) for {2} room(s)").format(
						self.party_size, max_guests, self.rooms_requested or 1
					),
					frappe.ValidationError,
				)
			current_date = getdate(self.check_in_date)
			end_date = getdate(self.check_out_date)

			while current_date < end_date:
				# Find the slot that covers this specific night to get its max_capacity
				night_slots = frappe.get_all(
					"Cheese Experience Slot",
					filters={
						"experience": self.experience,
						"date_from": ["<=", current_date],
						"date_to": [">=", current_date],
						"slot_status": ["in", ["OPEN", "CLOSED"]],
					},
					fields=["name"],
					order_by="date_from asc",
					limit=1,
				)
				if not night_slots:
					frappe.throw(
						_("No available slot found for night {0}").format(current_date),
						frappe.ValidationError,
					)
				night_slot_name = night_slots[0].name
				available_capacity = get_available_capacity(night_slot_name, current_date)
				if self.rooms_requested > available_capacity:
					frappe.throw(
						_("Not enough rooms available on {0}. Requested: {1}, Available: {2}").format(
							current_date, self.rooms_requested, available_capacity
						),
						frappe.ValidationError,
					)
				current_date = add_days(current_date, 1)
			return

		from cheese.cheese.utils.capacity import get_available_capacity

		slot = frappe.get_doc("Cheese Experience Slot", self.slot)
		sel = self.selected_date
		if not sel:
			if getdate(slot.date_from) == getdate(slot.date_to):
				sel = slot.date_from
			else:
				frappe.throw(
					_("Selected date is required for multi-day slot {0}").format(self.slot),
					frappe.ValidationError,
				)

		available_capacity = get_available_capacity(self.slot, getdate(sel))

		if self.party_size > available_capacity:
			frappe.throw(
				_("Party size ({0}) exceeds available capacity ({1}) for slot {2}").format(
					self.party_size, available_capacity, self.slot
				),
				frappe.ValidationError,
			)

	def create_snapshots(self):
		"""Create snapshots of policy and pricing"""
		# Price snapshot — record the effective unit price used for calculation
		experience = frappe.get_doc("Cheese Experience", self.experience)

		# Hotel policy
		if experience.experience_type == "HOTEL":
			policy_data = {
				"cancel_days_before": experience.cancel_days_before,
				"modify_days_before": experience.modify_days_before,
				"refund_policy": experience.refund_policy,
			}
			self.policy_snapshot = json.dumps(policy_data)
		else:
			# Activity Policy snapshot
			policy = frappe.db.get_value(
				"Cheese Booking Policy",
				{"experience": self.experience},
				["cancel_until_hours_before", "modify_until_hours_before", "min_hours_before_booking"],
				as_dict=True,
			)
			if policy:
				self.policy_snapshot = json.dumps(policy)

		if self.route:
			# Route tickets should always snapshot the per-experience route_price.
			effective_unit_price = experience.route_price or 0
		else:
			effective_unit_price = experience.individual_price or 0

		if experience.experience_type == "HOTEL":
			# Hotels within a route package are priced at the configured Route
			# Price per night, not the standalone nightly price.
			if self.route:
				effective_per_night = experience.route_price if experience.route_price is not None else 0
			else:
				effective_per_night = experience.price_per_night or 0
			price_data = {
				"price_per_night": effective_per_night,
				"nights": self.nights,
				"rooms": self.rooms_requested,
				"effective_unit_price": effective_per_night,
				"individual_price": experience.price_per_night,
				"route_price": experience.route_price,
			}
		else:
			price_data = {
				"individual_price": experience.individual_price,
				"route_price": experience.route_price,
				"effective_unit_price": effective_unit_price,
			}
		# Currency snapshot: establishment currency + rate used when the
		# experience prices are expressed in a different currency.
		from cheese.cheese.utils.currency_rates import get_company_currency, get_rate

		company_currency = get_company_currency(self.company or experience.company)
		source_currency = (getattr(experience, "currency", None) or company_currency).upper()
		price_data["currency"] = company_currency
		price_data["source_currency"] = source_currency
		if source_currency != company_currency:
			try:
				rate, rate_date = get_rate(source_currency, company_currency)
				price_data["exchange_rate"] = rate
				price_data["rate_date"] = rate_date
			except Exception:
				pass
		self.price_snapshot = json.dumps(price_data)

	def apply_experience_deposit_policy(self):
		"""Derive ticket deposit settings using shared route-aware pricing helpers."""
		if not self.experience:
			return
		experience_doc = frappe.get_doc("Cheese Experience", self.experience)
		if experience_doc.experience_type == "HOTEL":
			party_size = self.rooms_requested or 1
		else:
			party_size = self.party_size or 1

		price_data = calculate_ticket_price(self.experience, party_size, route_id=self.route, ticket=self)
		total_price = price_data.get("total_price", 0)
		self.total_price = total_price
		self.deposit_amount = calculate_deposit_amount(self.experience, total_price, route_id=self.route)
		self.deposit_required = 1 if self.deposit_amount > 0 else 0

	def apply_auto_confirmation(self, experience_doc=None):
		"""Auto-confirm tickets born PENDING when the experience does not require
		manual confirmation.

		Lives on the doctype (not the API controller) so every creation origin —
		bot API, SPA resource API, desk — gets identical behaviour.
		"""
		if self.status != "PENDING":
			return
		if not experience_doc:
			experience_doc = frappe.get_doc("Cheese Experience", self.experience)
		if not cint(experience_doc.manual_confirmation):
			self.status = "CONFIRMED"
			self.flags.status_change_trigger = "auto_confirm_on_create"

	def set_expires_at(self):
		"""Set expiration time for PENDING tickets"""
		if self.status == "PENDING":
			experience = frappe.get_doc("Cheese Experience", self.experience)

			if experience.experience_type == "HOTEL":
				ttl_days = experience.deposit_ttl_days or 1  # default 1 day for hotels
				self.expires_at = add_to_date(now_datetime(), days=ttl_days, as_string=False)
			else:
				# Default TTL: 24 hours for activities
				ttl_hours = 24

				# Check if experience has deposit TTL
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
			# Auto-convert lead when ticket becomes CONFIRMED
			if self.status == "CONFIRMED":
				self.convert_associated_lead()
				# Send confirmation notification
				self.send_status_notification("confirmed")
			elif self.status == "REJECTED":
				self.send_status_notification("rejected")
			elif self.status == "EXPIRED":
				self.send_status_notification("expired")

			# Fire bot webhook for all relevant status changes
			try:
				from cheese.cheese.utils.notifications import enqueue_ticket_status_webhook

				enqueue_ticket_status_webhook(self.name, self.status)
			except Exception as e:
				frappe.log_error(
					f"enqueue_ticket_status_webhook failed for {self.name}: {e}",
					"Ticket Webhook",
				)

	def log_status_change(self):
		"""Log status change to System Event, including what triggered it.

		`old_status` is None on insert (the ticket is born in its first status).
		`trigger` distinguishes automatic transitions (scheduler jobs,
		auto-confirmation) from manual ones so status changes can be audited;
		automatic callers must set `doc.flags.status_change_trigger` before save.
		"""
		try:
			from cheese.cheese.utils.events import log_event

			before = getattr(self, "_doc_before_save", None)
			trigger_source = self.flags.get("status_change_trigger")
			log_event(
				entity_type="Cheese Ticket",
				entity_id=self.name,
				event_type="status_change",
				payload={
					"old_status": before.status if before else None,
					"new_status": self.status,
					"trigger": "automatic" if trigger_source else "manual",
					"trigger_source": trigger_source or frappe.session.user,
				},
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

	def convert_associated_lead(self):
		"""Automatically convert associated lead to CONVERTED when ticket is confirmed"""
		try:
			if not self.contact:
				return

			# Find active lead for this contact (OPEN or IN_PROGRESS)
			active_lead = frappe.db.get_value(
				"Cheese Lead",
				{"contact": self.contact, "status": ["in", ["OPEN", "IN_PROGRESS"]]},
				"name",
				order_by="modified desc",
			)

			if active_lead:
				from cheese.cheese.utils.lead_company import advance_lead_company_status

				# No mid-save commit here: the conversion must live and die with
				# the enclosing transaction, otherwise it seals half-created
				# documents (e.g. route bookings inserted with zeroed totals).
				advance_lead_company_status(active_lead, self.company, "CONVERTED")
		except Exception as e:
			# Silently fail if lead conversion fails
			frappe.log_error(
				f"Failed to auto-convert lead for ticket {self.name}: {e}", "Lead Conversion Error"
			)

	def send_status_notification(self, notification_type):
		"""Send notification about status change"""
		try:
			from cheese.cheese.utils.notifications import send_ticket_notification

			send_ticket_notification(self.name, notification_type)
		except Exception as e:
			# Silently fail if notification fails
			frappe.log_error(f"Failed to send notification for ticket {self.name}: {e}", "Notification Error")


@frappe.whitelist()
def make_route_booking(source_name, target_doc=None):
	from frappe.model.mapper import get_mapped_doc

	def set_missing_values(source, target):
		target.status = "PENDING"

		if source.route:
			route = frappe.get_doc("Cheese Route", source.route)
			target.total_price = route.price
			target.deposit_required = route.deposit_required

			if route.deposit_required:
				if route.deposit_type == "Amount":
					target.deposit_amount = route.deposit_value
				elif route.deposit_type == "%" and route.price:
					target.deposit_amount = (route.price * route.deposit_value) / 100.0

	doclist = get_mapped_doc(
		"Cheese Ticket",
		source_name,
		{
			"Cheese Ticket": {
				"doctype": "Cheese Route Booking",
				"field_map": {"contact": "contact", "route": "route", "conversation": "conversation"},
			}
		},
		target_doc,
		set_missing_values,
	)

	source = frappe.get_doc("Cheese Ticket", source_name)
	doclist.append(
		"tickets",
		{
			"ticket": source.name,
			"experience": source.experience,
			"slot": source.slot,
			"party_size": source.party_size,
			"status": source.status,
		},
	)

	return doclist
