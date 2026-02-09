# Copyright (c) 2024
# License: MIT

import frappe
from frappe.model.document import Document


class CheeseContactChannelOptIn(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		channel: DF.Literal["", "WhatsApp", "Email", "SMS", "Phone", "Web"]
		opt_in_status: DF.Literal["OPT_IN", "OPT_OUT"]
		parent: DF.Data
		parentfield: DF.Data
		parenttype: DF.Data
		updated_at: DF.Datetime | None
	# end: auto-generated types

	pass
