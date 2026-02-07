# Copyright (c) 2024
# License: MIT

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import getdate, today


class CheeseDocument(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		document_type: DF.Literal["PDF", "Image", "Link"]
		entity_id: DF.DynamicLink
		entity_type: DF.Literal["Experience", "Route", "Company"]
		file_url: DF.Data
		language: DF.Literal[
			"", "English", "Spanish", "French", "German", "Italian", "Portuguese", "Other"
		]
		status: DF.Literal["DRAFT", "PUBLISHED", "ARCHIVED"]
		tags: DF.SmallText | None
		title: DF.Data
		validity_date: DF.Date | None
		version: DF.Data | None
	# end: auto-generated types

	def validate(self):
		"""Validate document data"""
		# Validate entity exists
		if self.entity_type == "Experience":
			if not frappe.db.exists("Cheese Experience", self.entity_id):
				frappe.throw(_("Experience {0} does not exist").format(self.entity_id))
		elif self.entity_type == "Route":
			if not frappe.db.exists("Cheese Route", self.entity_id):
				frappe.throw(_("Route {0} does not exist").format(self.entity_id))
		elif self.entity_type == "Company":
			if not frappe.db.exists("Company", self.entity_id):
				frappe.throw(_("Company {0} does not exist").format(self.entity_id))

		# Validate file_url format based on document_type
		if self.document_type == "Link":
			if not (self.file_url.startswith("http://") or self.file_url.startswith("https://")):
				frappe.throw(_("Link documents must start with http:// or https://"))
		elif self.document_type in ["PDF", "Image"]:
			if not self.file_url:
				frappe.throw(_("File URL is required for {0} documents").format(self.document_type))

		# Check validity date
		if self.validity_date and self.validity_date < getdate(today()):
			frappe.throw(_("Validity date cannot be in the past"))

	def on_update(self):
		"""Handle post-update logic"""
		# If status changed to ARCHIVED, log event
		if self.has_value_changed("status") and self.status == "ARCHIVED":
			try:
				from cheese.cheese.utils.events import log_event
				log_event(
					entity_type="Cheese Document",
					entity_id=self.name,
					event_type="document_archived",
					payload={"title": self.title, "entity_type": self.entity_type, "entity_id": self.entity_id}
				)
			except Exception:
				pass
