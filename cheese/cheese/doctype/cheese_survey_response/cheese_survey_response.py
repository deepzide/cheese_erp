# Copyright (c) 2024
# License: MIT

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import now_datetime


class CheeseSurveyResponse(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		answered_at: DF.Datetime | None
		comment: DF.TextEditor | None
		rating: DF.Int
		sent_at: DF.Datetime | None
		ticket: DF.Link
	# end: auto-generated types

	def validate(self):
		"""Validate survey response data"""
		# Validate rating range (1-5)
		if self.rating < 1 or self.rating > 5:
			frappe.throw(_("Rating must be between 1 and 5"))

		# Set answered_at if not provided
		if not self.answered_at:
			self.answered_at = now_datetime()

		# Set sent_at if not provided (for new records)
		if self.is_new() and not self.sent_at:
			self.sent_at = now_datetime()
