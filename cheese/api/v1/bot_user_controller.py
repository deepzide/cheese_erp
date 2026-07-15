# Copyright (c) 2026
# License: MIT
"""Superadmin API over cheese.cheese.utils.provision_bot_users.

Exposes the per-establishment bot user provisioning script to the SPA and
lists the resulting credentials. Every endpoint is restricted to
Administrator / System Manager: the api_key/api_secret pair grants scoped
API access to an establishment, so it must never reach establishment users.
"""

import frappe
from frappe.utils.password import get_decrypted_password

from cheese.api.common.responses import error, not_found, success
from cheese.cheese.utils.provision_bot_users import (
	BOT_EMAIL_DOMAIN,
	CENTRAL_COMPANY,
	provision_bot_user,
)


def _check_superadmin():
	"""Verify that the current user is Administrator or has System Manager role."""
	if frappe.session.user != "Administrator" and "System Manager" not in frappe.get_roles():
		frappe.throw(
			"No tienes permisos para administrar los usuarios de bot.",
			frappe.PermissionError,
		)


def _get_bot_user_company_map():
	"""Map company -> bot user email using the Company User Permission of bot users."""
	bot_users = frappe.get_all(
		"User",
		filters={"email": ["like", f"%@{BOT_EMAIL_DOMAIN}"]},
		pluck="name",
	)
	company_map = {}
	if not bot_users:
		return company_map
	for perm in frappe.get_all(
		"User Permission",
		filters={"user": ["in", bot_users], "allow": "Company"},
		fields=["user", "for_value"],
	):
		company_map[perm.for_value] = perm.user
	return company_map


def _bot_user_row(company, email):
	"""Build the credentials row for one provisioned bot user."""
	user = frappe.db.get_value(
		"User", email, ["enabled", "api_key", "last_login"], as_dict=True
	)
	if not user:
		return {"company": company, "provisioned": False}

	try:
		api_secret = get_decrypted_password("User", email, "api_secret")
	except Exception:
		api_secret = None

	return {
		"company": company,
		"provisioned": True,
		"email": email,
		"enabled": bool(user.enabled),
		"api_key": user.api_key,
		"api_secret": api_secret,
		"last_login": str(user.last_login) if user.last_login else None,
		"roles": frappe.get_roles(email),
	}


@frappe.whitelist()
def list_bot_users():
	"""List every establishment with its bot user credentials (superadmin only).

	The login password is hashed and cannot be recovered here: it is returned
	exactly once by provision_bot_users (on creation or on password reset).
	"""
	try:
		_check_superadmin()

		company_map = _get_bot_user_company_map()
		companies = frappe.get_all(
			"Company",
			filters={"name": ["!=", CENTRAL_COMPANY]},
			pluck="name",
			order_by="name asc",
		)

		rows = []
		for company in companies:
			email = company_map.get(company)
			if email:
				rows.append(_bot_user_row(company, email))
			else:
				rows.append({"company": company, "provisioned": False})

		return success(
			"Usuarios de bot obtenidos con éxito",
			{
				"bot_users": rows,
				"total": len(rows),
				"provisioned_count": sum(1 for r in rows if r.get("provisioned")),
			},
		)
	except frappe.PermissionError:
		raise
	except Exception as e:
		frappe.log_error(f"Error in list_bot_users: {e!s}")
		return error(f"Error al listar los usuarios de bot: {e!s}")


@frappe.whitelist()
def provision_bot_users(company=None, reset_password=False):
	"""Run the bot-user provisioning script (superadmin only).

	Args:
		company: Provision only this establishment; when omitted, every active
			establishment (except the central company) is provisioned.
		reset_password: Generate and set a new login password even for
			existing users. The new password is included in the response and
			is not recoverable afterwards.

	Idempotent: existing users keep their password (unless reset_password),
	api_key and api_secret; missing roles/permissions are re-applied.
	"""
	try:
		_check_superadmin()

		from frappe.utils import sbool

		reset_password = bool(sbool(reset_password))

		if company:
			if not frappe.db.exists("Company", company):
				return not_found("Company", company)
			companies = [company]
		else:
			companies = frappe.get_all(
				"Company",
				filters={"name": ["!=", CENTRAL_COMPANY]},
				pluck="name",
				order_by="name asc",
			)

		results = []
		failures = []
		for name in companies:
			try:
				password = frappe.generate_hash(length=20) if reset_password else None
				results.append(provision_bot_user(name, password=password))
			except Exception as exc:
				frappe.log_error(f"provision_bot_user failed for {name}: {exc}")
				failures.append({"company": name, "error": str(exc)})

		return success(
			f"Aprovisionados {len(results)} usuario(s) de bot",
			{
				"results": results,
				"failures": failures,
				"provisioned_count": len(results),
				"failed_count": len(failures),
			},
		)
	except frappe.PermissionError:
		raise
	except Exception as e:
		frappe.log_error(f"Error in provision_bot_users: {e!s}")
		return error(f"Error al aprovisionar los usuarios de bot: {e!s}")
