# Copyright (c) 2024
# License: MIT

import time
from urllib.parse import urlsplit, urlunsplit

import frappe
from frappe.utils import sbool
from cheese.api.common.responses import error, success, validation_error


def _check_settings_access():
	"""Verify that the current user is Administrator or has System Manager role."""
	if frappe.session.user != "Administrator" and "System Manager" not in frappe.get_roles():
		frappe.throw(
			"No tienes permisos para administrar la configuración del webhook.",
			frappe.PermissionError,
		)


def _derive_ping_url(webhook_url):
	"""
	Build the bot's authenticated availability URL (GET /erp/ping) from the
	configured webhook URL (normally .../erp/ticket-status).
	"""
	parts = urlsplit(webhook_url)
	path = (parts.path or "").rstrip("/")

	if path.endswith("/ticket-status"):
		ping_path = path[: -len("ticket-status")] + "ping"
	elif "/erp" in path:
		ping_path = path[: path.rindex("/erp") + len("/erp")] + "/ping"
	else:
		# Assume a base URL was configured
		ping_path = f"{path}/erp/ping"

	return urlunsplit((parts.scheme, parts.netloc, ping_path, "", ""))


@frappe.whitelist()
def get_webhook_settings():
	"""Return the bot webhook configuration (the API key itself is never exposed)."""
	try:
		_check_settings_access()
		doc = frappe.get_single("Cheese Bot Setting")

		try:
			has_api_key = bool(doc.get_password("webhook_api_key", raise_exception=False))
		except Exception:
			has_api_key = False

		try:
			has_openai_api_key = bool(doc.get_password("openai_api_key", raise_exception=False))
		except Exception:
			has_openai_api_key = False

		return success(
			"Configuración obtenida con éxito",
			{
				"webhook_url": doc.webhook_url or "",
				"webhook_enabled": bool(doc.webhook_enabled),
				"has_api_key": has_api_key,
				"embeddings_enabled": bool(getattr(doc, "embeddings_enabled", 0)),
				"embedding_model": getattr(doc, "embedding_model", None) or "text-embedding-3-small",
				"has_openai_api_key": has_openai_api_key,
			},
		)
	except frappe.PermissionError:
		raise
	except Exception as e:
		frappe.log_error(f"Error in get_webhook_settings: {str(e)}")
		return error(f"Error al obtener la configuración del webhook: {str(e)}")


@frappe.whitelist()
def update_webhook_settings(
	webhook_url=None,
	webhook_api_key=None,
	webhook_enabled=None,
	embeddings_enabled=None,
	openai_api_key=None,
	embedding_model=None,
):
	"""
	Update the bot webhook and AI configuration in Cheese Bot Setting.

	Args:
		webhook_url: Full endpoint that receives the ticket status webhooks
			(e.g. https://bot.example.com/erp/ticket-status)
		webhook_api_key: New X-API-Key value. Leave empty/None to keep the stored one.
		webhook_enabled: Enable/disable webhook sending.
		embeddings_enabled: Enable/disable document vectorization and semantic search.
		openai_api_key: New OpenAI key for embeddings. Leave empty/None to keep the stored one.
		embedding_model: OpenAI embeddings model name.
	"""
	try:
		_check_settings_access()

		if webhook_url is not None:
			webhook_url = (webhook_url or "").strip()
			if webhook_url and not webhook_url.lower().startswith(("http://", "https://")):
				return validation_error(
					"La URL del webhook debe comenzar con http:// o https://",
					{"webhook_url": "URL inválida"},
				)

		doc = frappe.get_single("Cheese Bot Setting")

		if webhook_url is not None:
			doc.webhook_url = webhook_url

		# Only replace the key when a non-empty value is sent
		if webhook_api_key:
			doc.webhook_api_key = webhook_api_key.strip()

		if webhook_enabled is not None:
			doc.webhook_enabled = 1 if sbool(webhook_enabled) else 0

		if embeddings_enabled is not None:
			doc.embeddings_enabled = 1 if sbool(embeddings_enabled) else 0

		if openai_api_key:
			doc.openai_api_key = openai_api_key.strip()

		if embedding_model is not None and (embedding_model or "").strip():
			doc.embedding_model = embedding_model.strip()

		doc.save()

		return success(
			"Configuración del webhook guardada correctamente",
			{
				"webhook_url": doc.webhook_url or "",
				"webhook_enabled": bool(doc.webhook_enabled),
				"has_api_key": bool(doc.get_password("webhook_api_key", raise_exception=False)),
				"embeddings_enabled": bool(getattr(doc, "embeddings_enabled", 0)),
				"embedding_model": getattr(doc, "embedding_model", None) or "text-embedding-3-small",
				"has_openai_api_key": bool(doc.get_password("openai_api_key", raise_exception=False)),
			},
		)
	except frappe.PermissionError:
		raise
	except Exception as e:
		frappe.log_error(f"Error in update_webhook_settings: {str(e)}")
		return error(f"Error al guardar la configuración del webhook: {str(e)}")


@frappe.whitelist()
def test_webhook(webhook_url=None, webhook_api_key=None):
	"""
	Test connectivity and authentication against the bot API using GET /erp/ping.

	Accepts unsaved form values so the configuration can be verified before
	saving; any missing value falls back to what is stored in Cheese Bot Setting.
	Always returns a success envelope with `ok` describing the test result.
	"""
	try:
		_check_settings_access()

		doc = frappe.get_single("Cheese Bot Setting")
		url = (webhook_url or "").strip() or (doc.webhook_url or "").strip()
		api_key = (webhook_api_key or "").strip() or (
			doc.get_password("webhook_api_key", raise_exception=False) or ""
		)

		if not url:
			return validation_error(
				"Configura primero la URL del webhook",
				{"webhook_url": "Requerido"},
			)
		if not url.lower().startswith(("http://", "https://")):
			return validation_error(
				"La URL del webhook debe comenzar con http:// o https://",
				{"webhook_url": "URL inválida"},
			)

		ping_url = _derive_ping_url(url)

		import requests

		result = {
			"ping_url": ping_url,
			"ok": False,
			"http_status": None,
			"latency_ms": None,
			"detail": "",
		}

		start = time.monotonic()
		try:
			resp = requests.get(
				ping_url,
				headers={"X-API-Key": api_key},
				timeout=10,
			)
		except requests.exceptions.Timeout:
			result["detail"] = "El bot no respondió en 10 segundos (timeout)."
			return success("Prueba de webhook completada", result)
		except requests.exceptions.ConnectionError:
			result["detail"] = "No se pudo conectar con el bot. Verifica que la URL sea correcta y el servicio esté activo."
			return success("Prueba de webhook completada", result)

		result["latency_ms"] = int((time.monotonic() - start) * 1000)
		result["http_status"] = resp.status_code

		if resp.ok:
			result["ok"] = True
			result["detail"] = "El bot respondió correctamente y la API key es válida."
		elif resp.status_code == 401:
			result["detail"] = "El bot rechazó la petición: falta la API key (401)."
		elif resp.status_code == 403:
			result["detail"] = "El bot rechazó la API key configurada (403). Verifica el valor de la key."
		elif resp.status_code == 404:
			result["detail"] = f"El endpoint {ping_url} no existe (404). Verifica la URL del webhook."
		else:
			body = (resp.text or "")[:300]
			result["detail"] = f"El bot respondió con HTTP {resp.status_code}: {body}"

		return success("Prueba de webhook completada", result)
	except frappe.PermissionError:
		raise
	except Exception as e:
		frappe.log_error(f"Error in test_webhook: {str(e)}")
		return error(f"Error al probar el webhook: {str(e)}")
