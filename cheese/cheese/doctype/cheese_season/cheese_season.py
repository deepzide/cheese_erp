# Copyright (c) 2024
# License: MIT

import frappe
from frappe import _
from frappe.model.document import Document


class CheeseSeason(Document):
	def validate(self):
		if self.date_to and self.date_from and str(self.date_to) < str(self.date_from):
			frappe.throw(_("Season date_to must be on or after date_from"))
