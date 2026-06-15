"""
Issue #322: add `company` to Cheese Quotation for tenant scoping.

The doctype already exposes `establishment`; this patch adds the hidden
`company` column used by permission_query_conditions and backfills it from
establishment (and from the lead's company when establishment is empty).
Safe to re-run.
"""

import frappe


def execute():
	try:
		frappe.reload_doc("cheese", "doctype", "cheese_quotation")
	except Exception as exc:  # pragma: no cover - migration robustness
		frappe.log_error(
			f"add_quotation_company_field: failed to reload cheese_quotation: {exc}",
			"Cheese Migration",
		)

	if not _has_field("Cheese Quotation", "company"):
		return

	_backfill_from_establishment()
	_backfill_from_lead()
	_backfill_contact_companies_from_activity()
	frappe.db.commit()


def _has_field(doctype, fieldname):
	try:
		meta = frappe.get_meta(doctype)
	except Exception:
		return False
	return any(df.fieldname == fieldname for df in meta.fields)


def _backfill_from_establishment():
	frappe.db.sql(
		"""
		UPDATE `tabCheese Quotation`
		SET company = establishment
		WHERE COALESCE(company, '') = ''
		  AND COALESCE(establishment, '') <> ''
		"""
	)


def _backfill_from_lead():
	if not _has_field("Cheese Lead", "company"):
		return
	frappe.db.sql(
		"""
		UPDATE `tabCheese Quotation` q
		JOIN `tabCheese Lead` l ON l.name = q.lead
		SET q.company = l.company,
		    q.establishment = COALESCE(NULLIF(q.establishment, ''), l.company)
		WHERE COALESCE(q.company, '') = ''
		  AND COALESCE(l.company, '') <> ''
		"""
	)


def _backfill_contact_companies_from_activity():
	"""Issue #319: link contacts to companies via tickets/leads/messages."""
	if not frappe.db.has_table("tabCheese Contact Company"):
		return

	from frappe.utils import now_datetime

	pairs_sql = [
		"""
		SELECT DISTINCT t.contact, t.company
		FROM `tabCheese Ticket` t
		WHERE COALESCE(t.contact, '') <> '' AND COALESCE(t.company, '') <> ''
		""",
		"""
		SELECT DISTINCT l.contact, l.company
		FROM `tabCheese Lead` l
		WHERE COALESCE(l.contact, '') <> '' AND COALESCE(l.company, '') <> ''
		""",
	]
	if frappe.db.has_column("Cheese Message", "company"):
		pairs_sql.append(
			"""
			SELECT DISTINCT c.contact, m.company
			FROM `tabConversation` c
			INNER JOIN `tabCheese Message` m ON m.conversation = c.name
			WHERE COALESCE(c.contact, '') <> '' AND COALESCE(m.company, '') <> ''
			"""
		)

	seen = set()
	for query in pairs_sql:
		for pair in frappe.db.sql(query, as_dict=True):
			key = (pair.contact, pair.company)
			if key in seen:
				continue
			seen.add(key)
			if frappe.db.exists(
				"Cheese Contact Company",
				{
					"parent": pair.contact,
					"parenttype": "Cheese Contact",
					"company": pair.company,
				},
			):
				continue
			try:
				contact = frappe.get_doc("Cheese Contact", pair.contact)
			except frappe.DoesNotExistError:
				continue
			contact.append(
				"companies",
				{"company": pair.company, "linked_at": now_datetime()},
			)
			contact.save(ignore_permissions=True)
