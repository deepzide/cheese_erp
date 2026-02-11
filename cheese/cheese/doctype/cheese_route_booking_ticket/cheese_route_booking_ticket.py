# Copyright (c) 2024
# License: MIT

import frappe
from frappe.model.document import Document


class CheeseRouteBookingTicket(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		experience: DF.Link | None
		parent: DF.Data
		parentfield: DF.Data
		parenttype: DF.Data
		party_size: DF.Int | None
		slot: DF.Link | None
		status: DF.Data | None
		ticket: DF.Link
	# end: auto-generated types

	pass
