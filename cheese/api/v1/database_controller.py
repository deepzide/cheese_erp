# Copyright (c) 2024
# License: MIT

import glob
import json
import os
from datetime import datetime

import frappe
from cheese.api.common.responses import error, success, validation_error


def check_admin_access():
	"""Verify that the current user is Administrator or has System Manager role."""
	if frappe.session.user != "Administrator" and "System Manager" not in frappe.get_roles():
		frappe.throw("No tienes permisos para acceder a las herramientas de base de datos.", frappe.PermissionError)


@frappe.whitelist()
def get_backup_list():
	"""
	List all site backups from sites/{site}/private/backups/
	sorted by creation date descending.
	"""
	try:
		check_admin_access()
		site = frappe.local.site
		backups_dir = frappe.get_site_path("private", "backups")
		
		if not os.path.exists(backups_dir):
			return success("No se encontró la carpeta de respaldos", {"backups": []})
		
		files = []
		for f in glob.glob(os.path.join(backups_dir, "*")):
			if os.path.isfile(f):
				stat = os.stat(f)
				name = os.path.basename(f)
				
				# Determine type based on naming convention
				b_type = "Database"
				if "private-files" in name:
					b_type = "Private Files"
				elif "files" in name:
					b_type = "Public Files"
				
				# Parse modification time
				modified_time = datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d %H:%M:%S")
				
				files.append({
					"filename": name,
					"size": stat.st_size,
					"size_readable": f"{stat.st_size / (1024*1024):.2f} MB",
					"type": b_type,
					"modified": modified_time
				})
		
		# Sort newest first
		files = sorted(files, key=lambda x: x["modified"], reverse=True)
		return success("Respaldos obtenidos con éxito", {"backups": files})
	except Exception as e:
		frappe.log_error(f"Error in get_backup_list: {str(e)}")
		return error(f"Error al obtener lista de respaldos: {str(e)}")


@frappe.whitelist()
def take_backup():
	"""
	Trigger a new site backup (database and files) using BackupService.
	"""
	try:
		check_admin_access()
		from frappe_helpers.services.backup_service import BackupService
		
		site = frappe.local.site
		backup_service = BackupService()
		
		# Run backup (includes database, public and private files)
		success_flag = backup_service.backup_site(site, with_files=True)
		
		if success_flag:
			return success("Copia de seguridad (salva) creada correctamente")
		else:
			return error("Error al generar la copia de seguridad. Revisa los logs de bench.")
	except Exception as e:
		frappe.log_error(f"Error in take_backup: {str(e)}")
		return error(f"Error al crear copia de seguridad: {str(e)}")


@frappe.whitelist()
def get_preservable_doctypes():
	"""
	List standard/custom non-child DocTypes to show in the reset checklist.
	"""
	try:
		check_admin_access()
		
		# Get standard active DocTypes
		doctypes = frappe.get_all(
			"DocType",
			filters={
				"istable": 0,
				"issingle": 0,
			},
			fields=["name", "module"]
		)
		
		# Filter out system logs or irrelevant tracking tables to keep list clean
		ignored_prefixes = ["__", "Version", "Error Log", "Activity Log", "Email Queue", "Prepared Report"]
		filtered_doctypes = [
			dt for dt in doctypes
			if not any(dt["name"].startswith(p) for p in ignored_prefixes)
		]
		
		sorted_doctypes = sorted(filtered_doctypes, key=lambda x: x["name"])
		return success("DocTypes obtenidos con éxito", {"doctypes": sorted_doctypes})
	except Exception as e:
		frappe.log_error(f"Error in get_preservable_doctypes: {str(e)}")
		return error(f"Error al obtener DocTypes: {str(e)}")


@frappe.whitelist()
def reset_environment(doctypes, resolve_deps=True, dry_run=False, skip_backup=False):
	"""
	Executes the environment reset orchestrator (env-reset).
	WARNING: This is a highly destructive operation!
	"""
	try:
		check_admin_access()
		
		# Parse arguments
		if isinstance(doctypes, str):
			doctypes = json.loads(doctypes)
		
		if not doctypes or not isinstance(doctypes, list):
			return validation_error("Debe proporcionar una lista no vacía de DocTypes a preservar.")
		
		resolve_deps = frappe.parse_json(resolve_deps)
		dry_run = frappe.parse_json(dry_run)
		skip_backup = frappe.parse_json(skip_backup)
		
		from frappe_helpers.services.env_reset_orchestrator import EnvResetOrchestrator
		
		site = frappe.local.site
		orchestrator = EnvResetOrchestrator(site)
		
		# 1. Create plan
		plan = orchestrator.create_plan(
			requested_doctypes=doctypes,
			resolve_dependencies=resolve_deps
		)
		
		if dry_run:
			return success("Plan de reseteo generado correctamente (Simulación)", {
				"plan": {
					"requested_doctypes": plan.requested_doctypes,
					"all_doctypes": plan.all_doctypes,
					"import_order": plan.import_order,
					"total_doctypes": plan.total_doctypes,
					"dependency_count": plan.dependency_count
				}
			})
		
		# 2. Execute full workflow (Wipe & Restore)
		result = orchestrator.execute(
			plan=plan,
			skip_backup=skip_backup
		)
		
		if result.success:
			return success("Restablecimiento del entorno completado con éxito", {
				"doctypes_processed": result.doctypes_processed,
				"records_imported": result.records_imported,
				"records_failed": result.records_failed,
				"output_dir": result.output_dir
			})
		else:
			return error(f"Fallo en el restablecimiento: {result.error_message}")
			
	except Exception as e:
		frappe.log_error(f"Error in reset_environment: {str(e)}")
		return error(f"Error crítico al ejecutar el reseteo: {str(e)}")
