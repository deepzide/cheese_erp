# Copyright (c) 2026
# License: MIT

from frappe.model.document import Document


class CheeseLeadCompany(Document):
	"""Child table linking a Cheese Lead to one or more Companies.

	Enables many-to-many visibility: super admins see the full lead,
	establishment users see the lead only if their company is in the list.
	"""
	pass
