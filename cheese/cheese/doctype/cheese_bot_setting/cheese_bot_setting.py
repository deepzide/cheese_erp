# Copyright (c) 2024
# License: MIT

import frappe
from frappe.model.document import Document


class CheeseBotSetting(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		bot_default_language: DF.Data | None
		bot_notes: DF.SmallText | None
		webhook_api_key: DF.Password | None
		webhook_enabled: DF.Check
		webhook_url: DF.Data | None
	# end: auto-generated types

	pass


def get_bot_settings():
	"""
	Return the Cheese Bot Setting singleton values as a dict.

	Usage:
		from cheese.cheese.doctype.cheese_bot_setting.cheese_bot_setting import get_bot_settings
		settings = get_bot_settings()
		url = settings.get("webhook_url")
		api_key = settings.get("webhook_api_key")
	"""
	try:
		doc = frappe.get_single("Cheese Bot Setting")
		return {
			"webhook_url": doc.webhook_url or "",
			"webhook_api_key": doc.get_password("webhook_api_key") or "",
			"webhook_enabled": bool(doc.webhook_enabled),
			"bot_default_language": doc.bot_default_language or "es",
		}
	except Exception:
		return {
			"webhook_url": "",
			"webhook_api_key": "",
			"webhook_enabled": False,
			"bot_default_language": "es",
		}
