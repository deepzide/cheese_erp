# Copyright (c) 2024
# License: MIT

"""ERP → bot proxy for live conversation control from /cheese/conversations.

Reads the bot base URL + API key from Cheese Bot Setting and calls the bot's
/erp control/messaging endpoints server-side, so the SPA never handles the key
and there is no cross-origin call. Works for the messaging channels the bot
speaks — WhatsApp, Telegram and Instagram — using the conversation's contact
phone as the per-channel key (phone for WhatsApp, chat_id for Telegram,
``ig_<igsid>`` for Instagram). The 24-hour window only applies to WhatsApp.
"""

from urllib.parse import urlsplit, urlunsplit

import frappe

from cheese.api.common.responses import error, not_found, success, validation_error
from cheese.cheese.utils.access import assert_record_access

BOT_TIMEOUT = 15
_MESSAGING = ("whatsapp", "telegram", "instagram")


def _bot_base_and_key():
	"""Return (base_url_ending_in_/erp, api_key) from Cheese Bot Setting, or (None, None)."""
	doc = frappe.get_single("Cheese Bot Setting")
	url = (doc.webhook_url or "").strip()
	try:
		key = doc.get_password("webhook_api_key", raise_exception=False) or ""
	except Exception:
		key = ""
	if not url:
		return None, None
	parts = urlsplit(url)
	path = (parts.path or "").rstrip("/")
	if "/erp" in path:
		base_path = path[: path.rindex("/erp") + len("/erp")]
	elif path.endswith("/ticket-status"):
		base_path = path[: -len("/ticket-status")]
	else:
		base_path = f"{path}/erp"
	base = urlunsplit((parts.scheme, parts.netloc, base_path, "", ""))
	return base, key


def _bot_post(path, payload):
	import requests

	base, key = _bot_base_and_key()
	if not base:
		return None, "El bot no está configurado (falta la URL en la configuración del bot)."
	try:
		resp = requests.post(
			f"{base}{path}", json=payload, headers={"X-API-Key": key}, timeout=BOT_TIMEOUT
		)
		return resp, None
	except requests.exceptions.RequestException as e:
		return None, f"No se pudo conectar con el bot: {e}"


def _forward(resp, err, ok_message):
	if err:
		return error(err, "BOT_UNREACHABLE", {}, 502)
	try:
		data = resp.json()
	except Exception:
		data = {"raw": (resp.text or "")[:300]}
	if resp.ok:
		return success(ok_message, data if isinstance(data, dict) else {"data": data})
	detail = data.get("detail") if isinstance(data, dict) else None
	code = resp.status_code if 400 <= resp.status_code < 600 else 502
	return error(detail or f"El bot respondió HTTP {resp.status_code}", "BOT_ERROR", {"http_status": resp.status_code}, code)


def _resolve(conversation_id):
	"""Return ({contact, channel, phone}, None) or (None, error_response)."""
	if not conversation_id or not frappe.db.exists("Conversation", conversation_id):
		return None, not_found("Conversation", conversation_id)
	try:
		assert_record_access("Conversation", conversation_id)
	except frappe.PermissionError:
		return None, error("No autorizado para esta conversación", "UNAUTHORIZED", {}, 403)
	convo = frappe.db.get_value("Conversation", conversation_id, ["contact", "channel"], as_dict=True) or {}
	phone = frappe.db.get_value("Cheese Contact", convo.get("contact"), "phone") if convo.get("contact") else None
	return {"contact": convo.get("contact"), "channel": (convo.get("channel") or "").strip().lower(), "phone": phone}, None


def _require_messaging(info):
	if info["channel"] not in _MESSAGING:
		return validation_error("Esta acción solo está disponible para conversaciones de WhatsApp, Telegram o Instagram.")
	if not info["phone"]:
		return validation_error("El contacto de la conversación no tiene identificador de canal registrado.")
	return None


def _control_payload(info):
	"""Body for take/release-control, keyed as the bot expects per channel."""
	if info["channel"] == "telegram":
		return {"chat_id": info["phone"]}
	return {"phone": info["phone"]}  # whatsapp + instagram both use `phone`


@frappe.whitelist()
def take_control(conversation_id):
	"""Disable the bot's automatic responses for this conversation (take control)."""
	info, err = _resolve(conversation_id)
	if err:
		return err
	v = _require_messaging(info)
	if v:
		return v
	resp, e = _bot_post(f"/take-control/{info['channel']}", _control_payload(info))
	return _forward(resp, e, "Control tomado")


@frappe.whitelist()
def release_control(conversation_id):
	"""Re-enable the bot's automatic responses for this conversation (give control back)."""
	info, err = _resolve(conversation_id)
	if err:
		return err
	v = _require_messaging(info)
	if v:
		return v
	resp, e = _bot_post(f"/release-control/{info['channel']}", _control_payload(info))
	return _forward(resp, e, "Control cedido al bot")


@frappe.whitelist()
def control_status(conversation_id):
	"""Whether the bot's automatic responses are currently disabled for this conversation."""
	info, err = _resolve(conversation_id)
	if err:
		return err
	if info["channel"] not in _MESSAGING or not info["phone"]:
		return success("No aplica", {"applicable": False, "controlled": False})
	resp, e = _bot_post("/control-status", {"channel": info["channel"], "identifier": info["phone"]})
	res = _forward(resp, e, "OK")
	if isinstance(res, dict) and res.get("success"):
		res["data"]["applicable"] = True
	return res


@frappe.whitelist()
def whatsapp_window(conversation_id):
	"""Whether the META 24-hour messaging window is active (WhatsApp only)."""
	info, err = _resolve(conversation_id)
	if err:
		return err
	# Only WhatsApp has a 24h free-form window; other channels are always open.
	if info["channel"] != "whatsapp" or not info["phone"]:
		return success("No aplica", {"applicable": False, "active": True})
	resp, e = _bot_post("/whatsapp-window", {"phone": info["phone"]})
	res = _forward(resp, e, "OK")
	if isinstance(res, dict) and res.get("success"):
		res["data"]["applicable"] = True
	return res


@frappe.whitelist()
def resend_ticket_qr(ticket_id):
	"""Re-send the ticket's check-in QR to the customer through the bot.

	The bot resolves the customer's channel (WhatsApp/Telegram/Instagram) from
	the conversation history and enforces the WhatsApp 24-hour window.
	"""
	if not ticket_id or not frappe.db.exists("Cheese Ticket", ticket_id):
		return not_found("Ticket", ticket_id)
	try:
		assert_record_access("Cheese Ticket", ticket_id)
	except frappe.PermissionError:
		return error("No autorizado para este ticket", "UNAUTHORIZED", {}, 403)
	ticket_status = frappe.db.get_value("Cheese Ticket", ticket_id, "status")
	if ticket_status not in ("CONFIRMED", "CHECKED_IN"):
		return validation_error(
			"El QR de check-in solo está disponible para tickets confirmados o con check-in."
		)
	resp, e = _bot_post("/resend-qr", {"ticket_id": ticket_id})
	return _forward(resp, e, "QR reenviado")


@frappe.whitelist()
def send_message(conversation_id, message):
	"""Send a message to the conversation's channel on behalf of the bot.

	For WhatsApp the bot rejects the send (422) if the 24-hour window is closed.
	"""
	info, err = _resolve(conversation_id)
	if err:
		return err
	if not (message or "").strip():
		return validation_error("El mensaje no puede estar vacío.")
	v = _require_messaging(info)
	if v:
		return v
	channel = info["channel"]
	# send-whatsapp resolves the phone from the ERP contact; telegram/instagram
	# take the channel key directly (stored as the contact phone).
	contact_id = info["contact"] if channel == "whatsapp" else info["phone"]
	resp, e = _bot_post(f"/send-{channel}", {"contact_id": contact_id, "message": message})
	return _forward(resp, e, "Mensaje enviado")
