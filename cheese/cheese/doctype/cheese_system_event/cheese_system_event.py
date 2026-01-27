# Copyright (c) 2024
# License: MIT

import frappe
from frappe.model.document import Document
from frappe.utils import now_datetime
import json


class CheeseSystemEvent(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		created_at: DF.Datetime | None
		entity_id: DF.Data
		entity_type: DF.Data
		event_type: DF.Data
		payload_json: DF.JSON | None
		triggered_by: DF.Link | None
	# end: auto-generated types

	def validate(self):
		"""Set created_at and triggered_by if not provided"""
		if not self.created_at:
			self.created_at = now_datetime()
		
		if not self.triggered_by:
			self.triggered_by = frappe.session.user
