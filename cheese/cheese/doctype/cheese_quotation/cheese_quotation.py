# Copyright (c) 2024
# License: MIT

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import get_datetime, now_datetime, getdate, today


class CheeseQuotation(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		conversation: DF.Link | None
		deposit_amount: DF.Currency | None
		lead: DF.Link | None
		snapshot_json: DF.JSON | None
		status: DF.Literal["DRAFT", "SENT", "ACCEPTED", "EXPIRED"]
		total_price: DF.Currency | None
		valid_until: DF.Datetime | None
	# end: auto-generated types

	def validate(self):
		"""Validate quotation data"""
		self.sync_company_from_establishment()
		# Auto-calculate pricing from experiences
		self.calculate_totals()
		self.validate_relationships()
		self.validate_slots_not_expired()

		# Enforce validity date in present/future processing window
		if self.valid_until and get_datetime(self.valid_until) < now_datetime():
			frappe.throw(
				_("Quotation validity date cannot be in the past."),
				frappe.ValidationError,
			)

	def sync_company_from_establishment(self):
		"""Keep tenant-scoping `company` in sync with the visible establishment field."""
		if self.establishment:
			self.company = self.establishment
		elif self.company and not self.establishment:
			self.establishment = self.company

	def validate_relationships(self):
		"""Validate route/experience/slot/establishment relationships."""
		if not self.experiences:
			return

		route_experience_ids = set()
		if self.route:
			route_doc = frappe.get_doc("Cheese Route", self.route)
			route_experience_ids = {row.experience for row in (route_doc.experiences or []) if row.experience}

		for row in self.experiences:
			if not row.experience:
				continue

			experience_doc = frappe.get_doc("Cheese Experience", row.experience)

			if self.route and row.experience not in route_experience_ids:
				frappe.throw(
					_("Experience {0} is not part of Route {1}").format(row.experience, self.route),
					frappe.ValidationError,
				)

			if self.establishment and experience_doc.company and experience_doc.company != self.establishment:
				frappe.throw(
					_("Experience {0} belongs to Establishment {1}, not {2}").format(
						row.experience, experience_doc.company, self.establishment
					),
					frappe.ValidationError,
				)

			if row.slot:
				slot_doc = frappe.get_doc("Cheese Experience Slot", row.slot)
				if slot_doc.experience != row.experience:
					frappe.throw(
						_("Slot {0} does not belong to Experience {1}").format(row.slot, row.experience),
						frappe.ValidationError,
					)

	def validate_slots_not_expired(self):
		"""Prevent quotations from using past/expired slot date-time."""
		now_dt = now_datetime()
		for row in self.experiences or []:
			if row.date and getdate(row.date) < getdate(today()):
				frappe.throw(
					_("Experience date {0} cannot be in the past.").format(row.date),
					frappe.ValidationError,
				)
			if not row.slot:
				continue
			slot_doc = frappe.get_doc("Cheese Experience Slot", row.slot)
			slot_end = get_datetime(f"{slot_doc.date_to} {slot_doc.time_to or '23:59:59'}")
			if slot_end < now_dt:
				frappe.throw(
					_("Slot {0} has expired and cannot be used in a quotation.").format(row.slot),
					frappe.ValidationError,
				)

	def calculate_totals(self):
		"""Calculate total_price and deposit_amount from linked experiences"""
		if not self.experiences:
			return

		party_size = int(getattr(self, "party_size", None) or 1)

		total_price = 0
		total_deposit = 0

		for exp_row in self.experiences:
			if not exp_row.experience:
				continue

			experience = frappe.get_doc("Cheese Experience", exp_row.experience)

			# Use route_price if the quotation has a route, otherwise individual_price
			if self.route:
				price_per_person = experience.route_price or 0
			else:
				price_per_person = experience.individual_price or 0

			total_price += price_per_person * party_size

			# Calculate deposit for this experience
			if experience.deposit_required:
				if experience.deposit_type == "%":
					total_deposit += (price_per_person * party_size) * (experience.deposit_value or 0) / 100
				else:
					total_deposit += experience.deposit_value or 0

		self.total_price = total_price
		self.deposit_amount = total_deposit

	def on_trash(self):
		"""Allow deletion only while quotation is in DRAFT."""
		if self.status != "DRAFT":
			frappe.throw(_("Only DRAFT quotations can be deleted."), frappe.ValidationError)

@frappe.whitelist()
def make_tickets(source_name, target_doc=None):
	quo = frappe.get_doc("Cheese Quotation", source_name)
	
	if not quo.experiences:
		frappe.throw(_("No experiences in this quotation to generate tickets for."))
		
	lead = frappe.get_doc("Cheese Lead", quo.lead) if quo.lead else None
	contact = lead.contact if lead else None
	
	if not contact:
		frappe.throw(_("A valid Contact from the Lead is required to generate Tickets."))

	tickets = []
	for exp in quo.experiences:
		ticket = frappe.new_doc("Cheese Ticket")
		ticket.contact = contact
		
		if quo.establishment:
			ticket.company = quo.establishment
			
		ticket.experience = exp.experience
		ticket.route = quo.route
		ticket.slot = exp.slot
		ticket.party_size = int(getattr(quo, "party_size", None) or 1)
		ticket.status = "PENDING"

		experience_doc = frappe.get_doc("Cheese Experience", exp.experience)
		ticket.deposit_required = 1 if experience_doc.deposit_required else 0
		ticket.deposit_amount = 0
		if experience_doc.deposit_required:
			if experience_doc.deposit_type == "Amount":
				ticket.deposit_amount = experience_doc.deposit_value or 0
			elif experience_doc.deposit_type == "%":
				price_per_person = experience_doc.route_price if quo.route else experience_doc.individual_price
				row_total = (price_per_person or 0) * ticket.party_size
				ticket.deposit_amount = row_total * (experience_doc.deposit_value or 0) / 100.0
		
		ticket.insert(ignore_permissions=True)
		tickets.append(ticket.name)
		
	return tickets
