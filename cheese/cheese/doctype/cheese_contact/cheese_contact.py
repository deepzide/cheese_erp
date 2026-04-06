# Copyright (c) 2024
# License: MIT

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import now_datetime

ALLOWED_PREFERRED_LANGUAGES = {
	"English",
	"Spanish",
	"French",
	"German",
	"Italian",
	"Portuguese",
	"Other",
}
ALLOWED_PREFERRED_CHANNELS = {"WhatsApp", "Email", "SMS", "Phone", "Web"}
LEGACY_LANGUAGE_CODE_MAP = {
	"EN": "English",
	"ES": "Spanish",
	"FR": "French",
	"DE": "German",
	"IT": "Italian",
	"PT": "Portuguese",
}
LEGACY_CHANNEL_CODE_MAP = {
	"WHATSAPP": "WhatsApp",
	"EMAIL": "Email",
	"SMS": "SMS",
	"PHONE": "Phone",
	"WEB": "Web",
}


class CheeseContact(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		do_not_contact: DF.Check
		email: DF.Data | None
		full_name: DF.Data
		opt_in_status: DF.Literal["OPT_IN", "OPT_OUT"]
		phone: DF.Data | None
		preferred_channel: DF.Literal["", "WhatsApp", "Email", "SMS", "Phone", "Web"]
		preferred_language: DF.Literal[
			"", "English", "Spanish", "French", "German", "Italian", "Portuguese", "Other"
		]
		privacy_notes: DF.SmallText | None
		erpnext_contact: DF.Link | None
	# end: auto-generated types

	def autoname(self):
		"""Primary key is phone — full_name may duplicate across contacts."""
		if self.phone:
			self.name = str(self.phone).strip()
		else:
			# Phone is required before insert; fallback avoids empty name if autoname runs early.
			self.name = frappe.generate_hash(length=12)

	def validate(self):
		"""Validate contact data and enforce deduplication rules"""
		# Ensure at least phone or email is provided
		if not self.phone and not self.email:
			frappe.throw(_("Either Phone or Email must be provided"))

		self.normalize_preference_fields()
		self.validate_preference_fields()

		# Check for duplicates by phone OR email
		self.check_duplicates()

		# Update channel opt-in timestamps
		self.update_channel_opt_in_timestamps()

	def after_rename(self, old_name, new_name, merge=False):
		"""Called after document is renamed"""
		pass

	def on_update(self):
		"""Keep document name in sync with phone only — never rename when full_name changes."""
		if not self.phone:
			return
		expected = str(self.phone).strip()
		if expected and self.name != expected:
			frappe.rename_doc("Cheese Contact", self.name, expected, merge=False, force=True)

	def check_duplicates(self):
		"""Check for duplicate contacts by phone or email"""
		or_filters = []
		
		if self.phone:
			or_filters.append(["phone", "=", self.phone])
		if self.email:
			or_filters.append(["email", "=", self.email])
		
		if not or_filters:
			return

		# Exclude current document
		filters = {}
		if not self.is_new():
			filters["name"] = ["!=", self.name]

		duplicates = frappe.get_all(
			"Cheese Contact",
			filters=filters,
			or_filters=or_filters,
			limit=1
		)
		
		if duplicates:
			frappe.throw(
				_("Contact with this phone or email already exists: {0}").format(
					duplicates[0].name
				),
				frappe.DuplicateEntryError
			)

	def normalize_preference_fields(self):
		if self.preferred_language:
			self.preferred_language = LEGACY_LANGUAGE_CODE_MAP.get(
				self.preferred_language.upper(), self.preferred_language
			)

		if self.preferred_channel:
			self.preferred_channel = LEGACY_CHANNEL_CODE_MAP.get(
				self.preferred_channel.upper(), self.preferred_channel
			)

	def validate_preference_fields(self):
		if self.preferred_language and self.preferred_language not in ALLOWED_PREFERRED_LANGUAGES:
			frappe.throw(
				_(
					'Preferred Language cannot be "{0}". It should be one of "English", "Spanish", "French", "German", "Italian", "Portuguese", "Other"'
				).format(self.preferred_language)
			)

		if self.preferred_channel and self.preferred_channel not in ALLOWED_PREFERRED_CHANNELS:
			frappe.throw(
				_(
					'Preferred Channel cannot be "{0}". It should be one of "WhatsApp", "Email", "SMS", "Phone", "Web"'
				).format(self.preferred_channel)
			)

	def update_channel_opt_in_timestamps(self):
		"""Update updated_at timestamp for channel opt-ins that changed"""
		if hasattr(self, "channel_opt_ins") and self.channel_opt_ins:
			for opt_in in self.channel_opt_ins:
				if opt_in.has_value_changed("opt_in_status"):
					opt_in.updated_at = now_datetime()

	@frappe.whitelist()
	def get_channel_opt_in_status(self, channel):
		"""Get opt-in status for a specific channel"""
		if hasattr(self, "channel_opt_ins") and self.channel_opt_ins:
			for opt_in in self.channel_opt_ins:
				if opt_in.channel == channel:
					return opt_in.opt_in_status
		
		# Fallback to global opt_in_status if no channel-specific setting
		return self.opt_in_status

	@frappe.whitelist()
	def set_channel_opt_in(self, channel, opt_in_status):
		"""Set opt-in status for a specific channel"""
		if opt_in_status not in ["OPT_IN", "OPT_OUT"]:
			frappe.throw(_("Invalid opt_in_status. Must be OPT_IN or OPT_OUT"))

		if not hasattr(self, "channel_opt_ins"):
			self.channel_opt_ins = []

		# Get old status
		old_status = self.get_channel_opt_in_status(channel)

		# Find existing opt-in for this channel
		found = False
		for opt_in in self.channel_opt_ins:
			if opt_in.channel == channel:
				opt_in.opt_in_status = opt_in_status
				opt_in.updated_at = now_datetime()
				found = True
				break

		# Create new if not found
		if not found:
			self.append("channel_opt_ins", {
				"channel": channel,
				"opt_in_status": opt_in_status,
				"updated_at": now_datetime()
			})

		return old_status
