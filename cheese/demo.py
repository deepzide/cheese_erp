# Copyright (c) 2024
# License: MIT

import json
import os
from random import randint

import frappe
from frappe import _
from frappe.utils import add_days, getdate


@frappe.whitelist()
def setup_demo_data():
	"""Setup demo data for Cheese app - can be called via execute command"""
	# Check if demo data already exists
	if frappe.db.count("Cheese Contact") > 0:
		return {
			"success": False,
			"message": "Demo data already exists. Use clear_demo_data() first if you want to recreate it."
		}
	
	try:
		company = ensure_demo_company()
		process_masters()
		make_transactions(company)
		frappe.db.commit()
		frappe.cache.delete_keys("bootinfo")
		frappe.publish_realtime("demo_data_complete")
		return {
			"success": True,
			"message": "Demo data setup completed successfully!"
		}
	except Exception as e:
		frappe.db.rollback()
		error_traceback = frappe.get_traceback()
		frappe.log_error(f"Failed to create demo data: {str(e)}\n{error_traceback}", "Cheese Demo")
		return {
			"success": False,
			"message": f"Failed to create demo data: {str(e)}"
		}


@frappe.whitelist()
def clear_demo_data():
	"""Clear demo data - can be called via API"""
	frappe.only_for("System Manager")
	
	try:
		# Clear transactions first (they reference masters)
		clear_all_transactions()
		# Then clear masters
		clear_all_masters()
		frappe.db.commit()
		frappe.msgprint(_("Demo data cleared successfully!"))
	except Exception as e:
		frappe.db.rollback()
		frappe.log_error(f"Failed to erase demo data: {str(e)}", "Cheese Demo")
		frappe.throw(
			_("Failed to erase demo data. Please check error logs."),
			title=_("Could Not Delete Demo Data"),
		)


def clear_all_transactions():
	"""Clear all transaction doctypes"""
	for doctype in frappe.get_hooks("demo_transaction_doctypes"):
		clear_all_records(doctype)


def clear_all_masters():
	"""Clear all master doctypes"""
	for doctype in frappe.get_hooks("demo_master_doctypes"):
		clear_all_records(doctype)


def clear_all_records(doctype):
	"""Clear all records of a doctype"""
	# Convert snake_case to Title Case (e.g., cheese_contact -> Cheese Contact)
	doctype_name = doctype.replace("_", " ").title()
	
	try:
		all_records = frappe.get_all(doctype_name, pluck="name", limit=1000)
		for name in all_records:
			try:
				frappe.delete_doc(doctype_name, name, ignore_permissions=True, force=True)
			except Exception as e:
				# Log but continue
				pass
	except Exception as e:
		frappe.log_error(f"Error clearing {doctype_name}: {str(e)}", "Cheese Demo Clear")


def ensure_demo_company():
	"""Ensure a Company exists for demo data"""
	companies = frappe.get_all("Company", limit=1)
	if companies:
		return companies[0].name
	
	# Create a demo company if none exists
	company = frappe.new_doc("Company")
	company.company_name = "Demo Company"
	company.abbr = "DEMO"
	company.default_currency = "USD"
	company.country = "United States"
	company.insert(ignore_permissions=True)
	frappe.db.commit()
	return company.name


def resolve_reference(doctype, value, field="name"):
	"""Resolve a reference value to actual document name"""
	if not value:
		return None
	
	# Try to find by the specified field
	result = frappe.db.get_value(doctype, {field: value}, "name")
	if result:
		return result
	
	# Try by name directly
	if frappe.db.exists(doctype, value):
		return value
	
	return None


def process_masters():
	"""Process master doctypes from hooks"""
	company = ensure_demo_company()
	slot_templates = {}  # Store slot templates by experience
	
	for doctype in frappe.get_hooks("demo_master_doctypes"):
		data = read_data_file_using_hooks(doctype)
		if data:
			for item in json.loads(data):
				# Add company to experiences (required field)
				if item.get("doctype") == "Cheese Experience":
					# Ensure company is set
					if "company" not in item or not item.get("company"):
						item["company"] = company
				
				# Collect experience slot templates
				if item.get("doctype") == "Cheese Experience Slot":
					exp_name = item.get("experience")
					if exp_name:
						if exp_name not in slot_templates:
							slot_templates[exp_name] = []
						slot_templates[exp_name].append(item)
					continue  # Don't create the template record yet
				
				create_demo_record(item)
	
	# After all experiences are created, create slots for each experience
	for exp_name, templates in slot_templates.items():
		exp_docname = resolve_reference("Cheese Experience", exp_name, "name")
		if exp_docname:
			create_experience_slots(exp_docname, templates)


def create_experience_slots(experience_name, slot_templates):
	"""Create experience slots for the next 30 days from templates"""
	from frappe.utils import add_days, getdate
	
	today = getdate()
	for day_offset in range(30):
		slot_date = add_days(today, day_offset)
		for template in slot_templates:
			slot_data = template.copy()
			slot_data["experience"] = experience_name
			slot_data["date"] = slot_date
			create_demo_record(slot_data)


def create_demo_record(doctype):
	"""Create a demo record from JSON data"""
	try:
		doc_type = doctype.get("doctype")
		
		# Use standard approach for all doctypes (autoname is now "prompt" for Cheese Experience)
		frappe.get_doc(doctype).insert(ignore_permissions=True)
	except frappe.exceptions.DuplicateEntryError:
		# Skip if record already exists
		pass
	except Exception as e:
		error_msg = f"Error creating {doc_type} '{doctype.get('name', 'N/A')}': {str(e)}"
		frappe.log_error(error_msg, "Cheese Demo")
		raise


def make_transactions(company):
	"""Process transaction doctypes from hooks"""
	# Get a start date (30 days ago)
	start_date = add_days(getdate(), -30)
	
	# Process transactions in order - tickets first, then deposits (which reference tickets)
	transaction_order = []
	for doctype in frappe.get_hooks("demo_transaction_doctypes"):
		if doctype == "cheese_deposit":
			transaction_order.append(doctype)
		else:
			transaction_order.insert(0, doctype)  # Put deposits at the end
	
	for doctype in transaction_order:
		data = read_data_file_using_hooks(doctype)
		if data:
			for item in json.loads(data):
				create_transaction(item, company, start_date)


def create_transaction(doctype, company, start_date):
	"""Create a transaction record with random dates"""
	document_type = doctype.get("doctype")
	
	# Add random posting date within the last 30 days
	days_offset = randint(0, 30)
	posting_date = add_days(start_date, days_offset)
	
	# Resolve references for linked fields - especially for Cheese Ticket
	if document_type == "Cheese Ticket":
		# Resolve contact reference by full_name
		if doctype.get("contact"):
			contact_name = resolve_reference("Cheese Contact", doctype["contact"], "full_name")
			if contact_name:
				doctype["contact"] = contact_name
		
		# Resolve experience reference by name
		if doctype.get("experience"):
			exp_name = resolve_reference("Cheese Experience", doctype["experience"], "name")
			if exp_name:
				doctype["experience"] = exp_name
		
		# Resolve slot reference - use first available slot for the experience
		if doctype.get("experience") and not doctype.get("slot"):
			slots = frappe.get_all(
				"Cheese Experience Slot",
				filters={"experience": doctype["experience"], "slot_status": "OPEN"},
				limit=1
			)
			if slots:
				doctype["slot"] = slots[0].name
		
		# Add company (required field)
		doctype["company"] = company
		
		# Set expiration date if not provided
		if not doctype.get("expires_at"):
			from frappe.utils import add_to_date, now_datetime
			doctype["expires_at"] = add_to_date(now_datetime(), hours=24)
	
	elif document_type == "Cheese Lead":
		# Resolve contact reference
		if doctype.get("contact"):
			contact_name = resolve_reference("Cheese Contact", doctype["contact"], "full_name")
			if contact_name:
				doctype["contact"] = contact_name
	
	elif document_type == "Cheese Deposit":
		# Resolve entity_id - find an actual ticket to reference
		entity_type = doctype.get("entity_type")
		if entity_type == "Ticket":
			tickets = frappe.get_all("Cheese Ticket", limit=1)
			if tickets:
				doctype["entity_id"] = tickets[0].name
			else:
				# Skip if no tickets exist yet
				return
		else:
			# For other entity types, skip if entity_id not provided
			if not doctype.get("entity_id"):
				return
	
	# Update doctype with dates if applicable
	if "transaction_date" in doctype or "posting_date" in doctype:
		doctype.update({
			"set_posting_time": 1,
			"transaction_date": posting_date,
			"posting_date": posting_date,
		})
	
	doc = frappe.get_doc(doctype)
	doc.save(ignore_permissions=True)
	
	# Don't submit Cheese Lead - it has status transition validation that prevents direct conversion
	# Submit other doctypes if they support it
	if document_type != "Cheese Lead" and hasattr(doc, "submit") and doc.docstatus == 0:
		try:
			doc.submit()
		except Exception:
			# If submission fails, just save it
			pass


def clear_masters():
	"""Clear master doctypes in reverse order"""
	# First clear transactions, then masters
	# Clear transactions first
	for doctype in frappe.get_hooks("demo_transaction_doctypes")[::-1]:
		data = read_data_file_using_hooks(doctype)
		if data:
			for item in json.loads(data):
				clear_demo_record(item)
	
	# Then clear masters
	for doctype in frappe.get_hooks("demo_master_doctypes")[::-1]:
		data = read_data_file_using_hooks(doctype)
		if data:
			for item in json.loads(data):
				clear_demo_record(item)


def clear_demo_record(document):
	"""Clear a demo record"""
	document_type = document.get("doctype")
	del document["doctype"]
	
	valid_columns = frappe.get_meta(document_type).get_valid_columns()
	
	filters = document
	for key in list(filters):
		if key not in valid_columns:
			filters.pop(key, None)
	
	try:
		doc = frappe.get_doc(document_type, filters)
		# Use force delete to bypass link checks
		frappe.delete_doc(document_type, doc.name, ignore_permissions=True, force=True)
	except frappe.exceptions.DoesNotExistError:
		pass
	except frappe.exceptions.LinkExistsError:
		# Skip if linked, will be handled by deleting parent first
		pass
	except Exception as e:
		# Log but continue with other records
		frappe.log_error(f"Error deleting {document_type}: {str(e)}", "Cheese Demo Clear")


def read_data_file_using_hooks(doctype):
	"""Read demo data JSON file"""
	path = os.path.join(os.path.dirname(__file__), "demo_data")
	file_path = os.path.join(path, doctype + ".json")
	
	if os.path.exists(file_path):
		with open(file_path) as f:
			data = f.read()
		return data
	return None
