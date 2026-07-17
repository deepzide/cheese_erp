# Copyright (c) 2024
# License: MIT

import frappe
from frappe import _
from frappe.model.document import Document


class CheesePromotion(Document):
	def validate(self):
		if self.date_to and self.date_from and str(self.date_to) < str(self.date_from):
			frappe.throw(_("Promotion date_to must be on or after date_from"))
		if self.discount_type == "PERCENT" and not (0 < (self.percent or 0) <= 100):
			frappe.throw(_("Discount percent must be between 0 and 100"))
		if self.discount_type == "FREE_TICKETS" and (self.free_tickets or 0) < 1:
			frappe.throw(_("Free tickets must be at least 1"))
		if not self.all_experiences and not (self.experiences or []):
			frappe.throw(_("Select at least one experience or mark all experiences"))
