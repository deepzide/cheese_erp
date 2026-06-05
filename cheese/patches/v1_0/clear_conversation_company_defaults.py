"""Clear legacy Conversation.company values that block tenant list views.

Establishment users are scoped via Cheese Message.company. Frappe also applies
User Permission on Conversation.company when that field is populated (often from
the bot/API user's default Company), which hides conversations even when the
establishment has uploaded messages for them.
"""

import frappe


def execute():
	if not frappe.db.has_column("Conversation", "company"):
		return

	frappe.db.sql(
		"""
		UPDATE `tabConversation`
		SET company = NULL
		WHERE COALESCE(company, '') <> ''
		"""
	)
	frappe.db.commit()
