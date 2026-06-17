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
		
		# 2. Execute full workflow in a detached background process to prevent WSGI connection/session drop errors
		import subprocess
		import sys
		import shutil
		
		# Resolve site and bench root
		site = frappe.local.site
		if not site:
			raise ValueError("No se pudo identificar el sitio actual (frappe.local.site es None)")
		bench_root = os.path.abspath(os.path.join(frappe.get_site_path(), "..", ".."))
		
		# Find the bench executable path
		bench_cmd = "bench"
		candidates = [
			"bench",
			os.path.join(bench_root, "env", "bin", "bench"),
			"/usr/local/bin/bench",
			"/home/frappe/.local/bin/bench",
			os.path.expanduser("~/.local/bin/bench")
		]
		if sys.platform == "win32":
			candidates.extend([
				os.path.join(bench_root, "env", "Scripts", "bench.exe"),
				os.path.join(bench_root, "env", "Scripts", "bench")
			])
		for c in candidates:
			if os.path.isabs(c):
				if os.path.exists(c):
					bench_cmd = c
					break
			else:
				resolved = shutil.which(c)
				if resolved:
					bench_cmd = resolved
					break
		
		# Build command line
		cmd = [bench_cmd, "--site", site, "env-reset"]
		for dt in doctypes:
			cmd.extend(["-s", dt])
		if not resolve_deps:
			cmd.append("--no-deps")
		if skip_backup:
			cmd.append("--skip-backup")
		
		# Bypass the CLI click confirmation prompts using the new --yes flag
		cmd.append("--yes")
		
		try:
			sys.stderr.write(f"DEBUG: Launching background reset command: {cmd} with cwd={bench_root}\n")
			sys.stderr.flush()
			
			if sys.platform == "win32":
				# Windows detached process flags
				DETACHED_PROCESS = 0x00000008
				subprocess.Popen(
					cmd,
					cwd=bench_root,
					creationflags=DETACHED_PROCESS,
					close_fds=True
				)
			else:
				# Unix detached process using start_new_session (safer than preexec_fn)
				subprocess.Popen(
					cmd,
					cwd=bench_root,
					start_new_session=True,
					close_fds=True
				)
			
			sys.stderr.write("DEBUG: Background reset command launched successfully.\n")
			sys.stderr.flush()
			return success("El restablecimiento del entorno ha sido iniciado en segundo plano. El sistema se reiniciará en unos momentos y tu sesión se cerrará automáticamente.")
		except Exception as err:
			import traceback
			sys.stderr.write(f"ERROR: Exception while launching subprocess: {str(err)}\n")
			traceback.print_exc(file=sys.stderr)
			sys.stderr.flush()
			try:
				frappe.log_error(f"Failed to launch background env-reset process: {str(err)}")
			except Exception as log_err:
				sys.stderr.write(f"ERROR: Failed to write to Frappe DB error log: {str(log_err)}\n")
				sys.stderr.flush()
			return error(f"No se pudo iniciar el proceso de reseteo en segundo plano: {str(err)}")
			
	except Exception as e:
		import traceback
		import sys
		sys.stderr.write(f"ERROR: Exception in reset_environment: {str(e)}\n")
		traceback.print_exc(file=sys.stderr)
		sys.stderr.flush()
		try:
			frappe.log_error(f"Error in reset_environment: {str(e)}")
		except Exception as log_err:
			sys.stderr.write(f"ERROR: Failed to write to Frappe DB error log: {str(log_err)}\n")
			sys.stderr.flush()
		return error(f"Error crítico al ejecutar el reseteo: {str(e)}")
