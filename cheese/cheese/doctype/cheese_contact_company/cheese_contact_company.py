# Copyright (c) 2026
# License: MIT

from frappe.model.document import Document


class CheeseContactCompany(Document):
    """Child table linking a Cheese Contact to one or more Companies.

    Enables many-to-many visibility: super admins see the full contact,
    establishment users see the contact only if their company is in the list.
    """
    pass
