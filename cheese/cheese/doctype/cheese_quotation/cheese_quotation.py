# Copyright (c) 2024
# License: MIT

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import get_datetime, now_datetime


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
		# Check expiration
		if self.valid_until and get_datetime(self.valid_until) < now_datetime():
			if self.status != "EXPIRED":
				self.status = "EXPIRED"

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
		ticket.party_size = 1 # Default
		ticket.status = "PENDING"
		
		ticket.insert(ignore_permissions=True)
		tickets.append(ticket.name)
		
	return tickets
