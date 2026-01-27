# Copyright (c) 2024
# License: MIT

import frappe
from frappe.model.document import Document


class CheeseSupportCase(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		contact: DF.Link
		description: DF.TextEditor
		status: DF.Literal["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]
		ticket: DF.Link | None
	# end: auto-generated types

	pass
