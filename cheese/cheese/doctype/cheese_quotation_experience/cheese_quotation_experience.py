# Copyright (c) 2024
# License: MIT

import frappe
from frappe.model.document import Document


class CheeseQuotationExperience(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		date: DF.Date | None
		experience: DF.Link
		parent: DF.Data
		parentfield: DF.Data
		parenttype: DF.Data
		sequence: DF.Int
		slot: DF.Link | None
	# end: auto-generated types

	pass
