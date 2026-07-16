# Copyright (c) 2026
# License: MIT
"""Superadmin email diagnostics for the ERP instance.

Lets a superadmin verify which outgoing mail server (Email Account /
site_config SMTP) is configured and send a real test email through it,
directly from the Cheese SPA — no Desk access needed.
"""

import frappe
from frappe.utils import validate_email_address

from cheese.api.common.responses import error, success, validation_error


def _check_superadmin():
	"""Verify that the current user is Administrator or has System Manager role."""
	if frappe.session.user != "Administrator" and "System Manager" not in frappe.get_roles():
		frappe.throw(
			"No tienes permisos para administrar el servidor de correos.",
			frappe.PermissionError,
		)


@frappe.whitelist()
def get_email_server_status():
	"""Return the outgoing email configuration of this ERP instance (superadmin only).

	Reports every Email Account with outgoing enabled (passwords are never
	exposed) plus the site_config SMTP fallback, and whether the instance is
	actually able to send email right now.
	"""
	try:
		_check_superadmin()

		accounts = frappe.get_all(
			"Email Account",
			filters={"enable_outgoing": 1},
			fields=[
				"name",
				"email_id",
				"smtp_server",
				"smtp_port",
				"use_tls",
				"use_ssl_for_outgoing",
				"default_outgoing",
				"enable_outgoing",
				"awaiting_password",
				"service",
			],
			order_by="default_outgoing desc, name asc",
		)

		# Legacy/fallback SMTP straight from site_config.json
		site_config_smtp = None
		if frappe.conf.get("mail_server"):
			site_config_smtp = {
				"mail_server": frappe.conf.get("mail_server"),
				"mail_port": frappe.conf.get("mail_port"),
				"use_tls": bool(frappe.conf.get("use_tls") or frappe.conf.get("use_ssl")),
				"mail_login": frappe.conf.get("mail_login"),
			}

		default_account = next((a for a in accounts if a.default_outgoing), None)
		configured = bool(default_account) or bool(accounts) or bool(site_config_smtp)

		return success(
			"Configuración de correo obtenida con éxito",
			{
				"configured": configured,
				"has_default_outgoing": bool(default_account),
				"default_account": default_account,
				"outgoing_accounts": accounts,
				"site_config_smtp": site_config_smtp,
				"queue_paused": bool(frappe.conf.get("hold_queue")),
			},
		)
	except frappe.PermissionError:
		raise
	except Exception as e:
		frappe.log_error(f"Error in get_email_server_status: {e!s}")
		return error(f"Error al obtener la configuración de correo: {e!s}")


@frappe.whitelist()
def send_test_email(recipient, subject=None, message=None):
	"""Send a real email through the configured outgoing server (superadmin only).

	Sends synchronously (not via the email queue) so SMTP failures surface
	immediately in the response instead of dying silently in a background job.

	Args:
		recipient: Destination email address.
		subject: Optional subject; defaults to a test subject.
		message: Optional body; defaults to a test body.
	"""
	try:
		_check_superadmin()

		recipient = (recipient or "").strip()
		if not recipient:
			return validation_error("recipient es requerido")
		if not validate_email_address(recipient):
			return validation_error(f"'{recipient}' no es una dirección de correo válida")

		subject = (subject or "").strip() or "Correo de prueba — Cheese ERP"
		message = (message or "").strip() or (
			"Este es un correo de prueba enviado desde la instancia del Cheese ERP "
			f"por {frappe.session.user} para verificar el servidor de correo saliente."
		)

		default_account = frappe.db.get_value(
			"Email Account",
			{"default_outgoing": 1, "enable_outgoing": 1},
			["name", "email_id"],
			as_dict=True,
		)
		if not default_account and not frappe.conf.get("mail_server"):
			return validation_error(
				"No hay servidor de correo saliente configurado: define una Email Account "
				"con 'Default Outgoing' o configura SMTP en site_config.json"
			)

		frappe.sendmail(
			recipients=[recipient],
			subject=subject,
			message=message,
			now=True,
		)

		return success(
			"Correo de prueba enviado correctamente",
			{
				"recipient": recipient,
				"subject": subject,
				"sent_via": (default_account or {}).get("email_id")
				or frappe.conf.get("mail_login")
				or frappe.conf.get("mail_server"),
			},
		)
	except frappe.PermissionError:
		raise
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except Exception as e:
		# SMTP/auth errors surface here because the send is synchronous.
		frappe.log_error(f"Error in send_test_email: {e!s}")
		return error(
			f"No se pudo enviar el correo: {e!s}",
			"EMAIL_SEND_FAILED",
			{"recipient": recipient},
			502,
		)
