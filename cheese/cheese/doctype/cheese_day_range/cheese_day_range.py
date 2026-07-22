# Copyright (c) 2026
# License: MIT

import frappe
from frappe import _
from frappe.model.document import Document


def day_range_set(day_from, day_to):
	"""Set of weekday indexes (0=Monday..6=Sunday) covered by an inclusive
	range. ``day_to < day_from`` wraps around the week (e.g. Fri-Mon)."""
	f, t = int(day_from), int(day_to)
	if f <= t:
		return set(range(f, t + 1))
	return set(range(f, 7)) | set(range(0, t + 1))


class CheeseDayRange(Document):
	def validate(self):
		if self.day_from is None or self.day_to is None:
			frappe.throw(_("Day from and day to are required"))
		if not (0 <= self.day_from <= 6) or not (0 <= self.day_to <= 6):
			frappe.throw(_("Days must be between 0 (Monday) and 6 (Sunday)"))
		# Unlike age groups, ranges of a company MAY overlap in the nomenclator
		# (alternative schemes can coexist, e.g. Mon-Fri and Mon-Thu). The
		# non-overlap restriction is enforced where ranges are USED: the price
		# lines of an experience / custom price.
