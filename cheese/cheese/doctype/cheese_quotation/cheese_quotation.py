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
