# Copyright (c) 2024
# License: MIT

import frappe
from frappe.model.document import Document


class CheeseRouteExperience(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		experience: DF.Link
		parent: DF.Data
		parentfield: DF.Data
		parenttype: DF.Data
		sequence: DF.Int
	# end: auto-generated types

	pass
