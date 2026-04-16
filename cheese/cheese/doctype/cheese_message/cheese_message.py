# Copyright (c) 2024
# License: MIT

import frappe
from frappe.model.document import Document


class CheeseMessage(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		contact: DF.Link
		content: DF.TextEditor
		conversation: DF.Link | None
		message_order: DF.Int
		phone_number: DF.Data
		role: DF.Literal["user", "assistant"]
		timestamp: DF.Datetime
	# end: auto-generated types

	pass
