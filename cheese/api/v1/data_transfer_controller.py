# Copyright (c) 2024
# License: MIT

"""Entity-level data export / import — copy production data into a test
instance. Superadmin only. Each entity exports to JSON (records with their
child tables; documents also carry the file bytes). Import upserts by name.

This is a data-migration convenience, not a full backup: it does not export
accounting, permissions or schema. Core doctypes (Company, User) are copied
best-effort with link validation relaxed, and may need their dependencies
(chart of accounts, roles) to already exist on the target instance.
"""

import base64
import json

import frappe
from frappe.utils import now

from cheese.api.common.responses import error, success, validation_error

# Order matters for import: a doctype must come after the doctypes it links to.
ENTITIES = [
	{"key": "companies", "doctype": "Company", "label": "Empresas", "core": True},
	{"key": "age_groups", "doctype": "Cheese Age Group", "label": "Grupos etarios"},
	{"key": "experiences", "doctype": "Cheese Experience", "label": "Experiencias y precios"},
	{"key": "custom_prices", "doctype": "Cheese Custom Price", "label": "Precios personalizados"},
	{"key": "promotions", "doctype": "Cheese Promotion", "label": "Promociones"},
	{"key": "seasons", "doctype": "Cheese Season", "label": "Precios por temporada"},
	{"key": "experience_slots", "doctype": "Cheese Experience Slot", "label": "Turnos de experiencias"},
	{"key": "routes", "doctype": "Cheese Route", "label": "Rutas / paquetes"},
	{"key": "booking_policies", "doctype": "Cheese Booking Policy", "label": "Políticas de reserva"},
	{"key": "bank_accounts", "doctype": "Cheese Bank Account", "label": "Métodos de pago"},
	{"key": "hotel_rooms", "doctype": "Cheese Hotel Room", "label": "Habitaciones de hotel"},
	{"key": "contacts", "doctype": "Cheese Contact", "label": "Contactos"},
	{"key": "leads", "doctype": "Cheese Lead", "label": "Leads"},
	{"key": "users", "doctype": "User", "label": "Usuarios", "core": True},
	{"key": "quotations", "doctype": "Cheese Quotation", "label": "Cotizaciones"},
	{"key": "tickets", "doctype": "Cheese Ticket", "label": "Tickets"},
	{"key": "room_stays", "doctype": "Cheese Room Stay", "label": "Estadías de habitación"},
	{"key": "route_bookings", "doctype": "Cheese Route Booking", "label": "Reservas de ruta"},
	{"key": "deposits", "doctype": "Cheese Deposit", "label": "Depósitos"},
	{"key": "conversations", "doctype": "Conversation", "label": "Conversaciones"},
	{"key": "messages", "doctype": "Cheese Message", "label": "Mensajes"},
	{"key": "documents", "doctype": "Cheese Document", "label": "Documentos e imágenes", "files": True},
	{"key": "survey_responses", "doctype": "Cheese Survey Response", "label": "Encuestas"},
	{"key": "support_cases", "doctype": "Cheese Support Case", "label": "Casos de soporte"},
	{"key": "attendance", "doctype": "Cheese Attendance", "label": "Asistencia"},
]

_BY_KEY = {e["key"]: e for e in ENTITIES}
_ORDER = {e["key"]: i for i, e in enumerate(ENTITIES)}

# Volatile / audit fields stripped from every exported record and child row.
_STRIP = {
	"modified", "modified_by", "creation", "owner", "docstatus",
	"_user_tags", "_comments", "_assign", "_liked_by", "_seen", "__onload",
	"__last_sync_on",
}

# Never export these User records (system accounts).
_SKIP_USERS = {"Administrator", "Guest"}


def _assert_admin():
	if "System Manager" not in frappe.get_roles():
		frappe.throw("Only a system administrator can transfer data", frappe.PermissionError)


def _clean(value):
	if isinstance(value, dict):
		return {k: _clean(v) for k, v in value.items() if k not in _STRIP}
	if isinstance(value, list):
		return [_clean(v) for v in value]
	return value


def _export_doctype(entity):
	doctype = entity["doctype"]
	if not frappe.db.exists("DocType", doctype):
		return []
	names = frappe.get_all(doctype, pluck="name")
	records = []
	for name in names:
		if doctype == "User" and name in _SKIP_USERS:
			continue
		doc = frappe.get_doc(doctype, name)
		rec = _clean(doc.as_dict())
		if entity.get("files"):
			_attach_file(rec)
		records.append(rec)
	return records


def _attach_file(rec):
	"""Embed the bytes of the record's attached file (documents/images)."""
	url = rec.get("file_url")
	if not url:
		return
	f = frappe.get_all("File", filters={"file_url": url}, fields=["name"], limit=1)
	if not f:
		return
	try:
		filedoc = frappe.get_doc("File", f[0].name)
		content = filedoc.get_content()
		if isinstance(content, str):
			content = content.encode("utf-8")
		rec["__file"] = {
			"file_name": filedoc.file_name or "file",
			"is_private": filedoc.is_private or 0,
			"content_b64": base64.b64encode(content).decode(),
		}
	except Exception:
		frappe.log_error(f"data_transfer: could not read file for {url}")


def _restore_file(doctype, docname, meta):
	from frappe.utils.file_manager import save_file

	content = base64.b64decode(meta["content_b64"])
	saved = save_file(
		meta["file_name"], content, doctype, docname,
		is_private=meta.get("is_private", 0),
	)
	return saved.file_url


def _upsert(doctype, record, conflict):
	"""Insert or update a single record by name. Returns 'created'|'updated'|'skipped'."""
	record = dict(record)
	record.pop("doctype", None)
	name = record.get("name")
	exists = name and frappe.db.exists(doctype, name)

	if exists and conflict == "skip":
		return "skipped"

	if exists:
		doc = frappe.get_doc(doctype, name)
		doc.update(record)
		doc.flags.ignore_permissions = True
		doc.flags.ignore_mandatory = True
		doc.flags.ignore_links = True
		doc.flags.ignore_version = True
		doc.save()
		return "updated"

	record["doctype"] = doctype
	doc = frappe.get_doc(record)
	if name:
		doc.name = name
		doc.flags.name_set = True
	doc.flags.ignore_permissions = True
	doc.flags.ignore_mandatory = True
	doc.flags.ignore_links = True
	doc.insert(ignore_permissions=True)
	return "created"


def _import_entity(entity, records, conflict):
	doctype = entity["doctype"]
	res = {"created": 0, "updated": 0, "skipped": 0, "failed": []}
	if not frappe.db.exists("DocType", doctype):
		res["failed"].append({"name": "*", "error": f"DocType {doctype} not found on this instance"})
		return res
	for record in records:
		record = dict(record)
		file_meta = record.pop("__file", None)
		name = record.get("name")
		try:
			status = _upsert(doctype, record, conflict)
			res[status] = res.get(status, 0) + 1
			if file_meta and status in ("created", "updated") and name:
				new_url = _restore_file(doctype, name, file_meta)
				frappe.db.set_value(doctype, name, "file_url", new_url, update_modified=False)
		except Exception as e:
			res["failed"].append({"name": name, "error": str(e)})
	frappe.db.commit()
	return res


# ---------------------------------------------------------------------------
# Whitelisted API
# ---------------------------------------------------------------------------


@frappe.whitelist()
def list_entities():
	"""The transferable entities with their current record counts."""
	try:
		_assert_admin()
		out = []
		for e in ENTITIES:
			count = frappe.db.count(e["doctype"]) if frappe.db.exists("DocType", e["doctype"]) else 0
			out.append({
				"key": e["key"], "label": e["label"], "doctype": e["doctype"],
				"count": count, "core": bool(e.get("core")), "files": bool(e.get("files")),
			})
		return success("Entities", {"entities": out})
	except frappe.PermissionError as e:
		return error(str(e), "FORBIDDEN", {}, 403)
	except Exception as e:
		frappe.log_error(f"Error in list_entities: {e}")
		return error("Failed to list entities", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def export_entity(entity):
	"""Export a single entity as a JSON payload."""
	try:
		_assert_admin()
		e = _BY_KEY.get(entity)
		if not e:
			return validation_error(f"Unknown entity: {entity}")
		records = _export_doctype(e)
		return success("Exported", {
			"kind": "entity",
			"version": 1,
			"exported_at": now(),
			"entity": e["key"],
			"doctype": e["doctype"],
			"count": len(records),
			"records": records,
		})
	except frappe.PermissionError as ex:
		return error(str(ex), "FORBIDDEN", {}, 403)
	except Exception as ex:
		frappe.log_error(f"Error in export_entity: {ex}")
		return error("Failed to export entity", "SERVER_ERROR", {"error": str(ex)}, 500)


@frappe.whitelist()
def export_all(entities=None):
	"""Export every (or the given) entity into a single bundle."""
	try:
		_assert_admin()
		keys = None
		if entities:
			keys = entities if isinstance(entities, list) else json.loads(entities)
		blocks = []
		for e in ENTITIES:
			if keys is not None and e["key"] not in keys:
				continue
			records = _export_doctype(e)
			blocks.append({
				"entity": e["key"], "doctype": e["doctype"], "count": len(records), "records": records,
			})
		return success("Exported", {
			"kind": "bundle",
			"version": 1,
			"exported_at": now(),
			"entities": blocks,
		})
	except frappe.PermissionError as ex:
		return error(str(ex), "FORBIDDEN", {}, 403)
	except Exception as ex:
		frappe.log_error(f"Error in export_all: {ex}")
		return error("Failed to export data", "SERVER_ERROR", {"error": str(ex)}, 500)


@frappe.whitelist()
def import_data(payload, conflict="update"):
	"""Import a single-entity payload or a full bundle. conflict: update|skip."""
	try:
		_assert_admin()
		if isinstance(payload, str):
			payload = json.loads(payload)
		if not isinstance(payload, dict):
			return validation_error("payload must be a JSON object")
		conflict = conflict if conflict in ("update", "skip") else "update"

		if payload.get("kind") == "bundle" or "entities" in payload:
			blocks = payload.get("entities") or []
			# Import in dependency order regardless of the file's order.
			blocks = sorted(blocks, key=lambda b: _ORDER.get(b.get("entity"), 999))
			results = []
			for b in blocks:
				e = _BY_KEY.get(b.get("entity"))
				if not e:
					results.append({"entity": b.get("entity"), "skipped_unknown": True})
					continue
				r = _import_entity(e, b.get("records") or [], conflict)
				r["entity"] = e["key"]
				results.append(r)
			return success("Imported", {"kind": "bundle", "results": results})

		# Single entity payload
		e = _BY_KEY.get(payload.get("entity"))
		if not e:
			return validation_error(f"Unknown entity: {payload.get('entity')}")
		r = _import_entity(e, payload.get("records") or [], conflict)
		r["entity"] = e["key"]
		return success("Imported", {"kind": "entity", "results": [r]})
	except frappe.PermissionError as ex:
		return error(str(ex), "FORBIDDEN", {}, 403)
	except Exception as ex:
		frappe.log_error(f"Error in import_data: {ex}")
		return error("Failed to import data", "SERVER_ERROR", {"error": str(ex)}, 500)
