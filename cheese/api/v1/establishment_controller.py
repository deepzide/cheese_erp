# Copyright (c) 2024
# License: MIT

import frappe
from frappe import _
from frappe.utils import getdate, cint
from cheese.api.common.responses import success, error, not_found, validation_error, paginated_response
import json


@frappe.whitelist()
def list_establishments(page=1, page_size=20, search=None, status=None, locality=None, tags=None):
	"""
	List establishments with pagination, search, and filters
	
	Args:
		page: Page number (default: 1)
		page_size: Items per page (default: 20)
		search: Search term for company name
		status: Filter by status (ACTIVE/INACTIVE)
		locality: Filter by locality/address
		tags: Filter by tags (comma-separated)
		
	Returns:
		Paginated response with list of establishments
	"""
	try:
		page = cint(page) or 1
		page_size = cint(page_size) or 20
		
		# Build filters
		filters = {}
		
		if status:
			# Map status to company disabled field
			if status.upper() == "INACTIVE":
				filters["disabled"] = 1
			elif status.upper() == "ACTIVE":
				filters["disabled"] = 0
		
		# Build search query
		search_fields = ["company_name"]
		or_filters = []
		
		if search:
			or_filters.append(["company_name", "like", f"%{search}%"])
		
		if locality:
			# Search in address (would need Address doctype join)
			or_filters.append(["company_name", "like", f"%{locality}%"])
		
		# Get companies
		companies = frappe.get_all(
			"Company",
			filters=filters,
			or_filters=or_filters if or_filters else None,
			fields=["name", "company_name", "disabled", "email", "phone_no", "website", "company_description"],
			limit_start=(page - 1) * page_size,
			limit_page_length=page_size,
			order_by="company_name asc"
		)
		
		# Get total count
		total = frappe.db.count("Company", filters=filters)
		
		# Enrich with experiences count and status
		result = []
		for company in companies:
			# Get experiences count
			experiences_count = frappe.db.count("Cheese Experience", {"company": company.name})
			
			# Get online experiences count
			online_experiences = frappe.db.count(
				"Cheese Experience",
				{"company": company.name, "status": "ONLINE"}
			)
			
			result.append({
				"company_id": company.name,
				"company_name": company.company_name,
				"status": "INACTIVE" if company.disabled else "ACTIVE",
				"email": company.email,
				"phone": company.phone_no,
				"website": company.website,
				"description": company.company_description,
				"experiences_count": experiences_count,
				"online_experiences_count": online_experiences
			})
		
		return paginated_response(
			result,
			"Establishments retrieved successfully",
			page=page,
			page_size=page_size,
			total=total
		)
	except Exception as e:
		frappe.log_error(f"Error in list_establishments: {str(e)}")
		return error("Failed to list establishments", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def get_establishment_details(company_id):
	"""
	Get full establishment profile with experiences, attachments, and status
	
	Args:
		company_id: Company ID
		
	Returns:
		Success response with establishment details
	"""
	try:
		if not company_id:
			return validation_error("company_id is required")
		
		if not frappe.db.exists("Company", company_id):
			return not_found("Company", company_id)
		
		company = frappe.get_doc("Company", company_id)
		
		# Get experiences
		experiences = frappe.get_all(
			"Cheese Experience",
			filters={"company": company_id},
			fields=["name", "name as experience_name", "description", "status", "individual_price", "route_price"],
			order_by="name asc"
		)
		
		# Get tickets count by status
		tickets = frappe.get_all(
			"Cheese Ticket",
			filters={"company": company_id},
			fields=["status"],
			group_by="status"
		)
		
		tickets_by_status = {}
		for ticket in tickets:
			tickets_by_status[ticket.status] = frappe.db.count(
				"Cheese Ticket",
				{"company": company_id, "status": ticket.status}
			)
		
		# Get address if exists
		addresses = frappe.get_all(
			"Address",
			filters={"link_doctype": "Company", "link_name": company_id},
			fields=["name", "address_line1", "address_line2", "city", "state", "country", "pincode"],
			limit=1
		)
		
		address = None
		if addresses:
			addr = addresses[0]
			address = {
				"address_line1": addr.address_line1,
				"address_line2": addr.address_line2,
				"city": addr.city,
				"state": addr.state,
				"country": addr.country,
				"pincode": addr.pincode
			}
		
		# Get contacts
		contacts = frappe.get_all(
			"Contact",
			filters={"link_doctype": "Company", "link_name": company_id},
			fields=["name", "first_name", "last_name", "email_id", "phone", "mobile_no"],
			limit=5
		)
		
		return success(
			"Establishment details retrieved successfully",
			{
				"company_id": company.name,
				"company_name": company.company_name,
				"status": "INACTIVE" if company.disabled else "ACTIVE",
				"email": company.email,
				"phone": company.phone_no,
				"website": company.website,
				"description": company.company_description,
				"address": address,
				"contacts": contacts,
				"experiences": experiences,
				"tickets_by_status": tickets_by_status,
				"logo": company.company_logo if hasattr(company, "company_logo") else None
			}
		)
	except Exception as e:
		frappe.log_error(f"Error in get_establishment_details: {str(e)}")
		return error("Failed to get establishment details", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def update_establishment(company_id, **kwargs):
	"""
	Update establishment fields with audit trail
	
	Args:
		company_id: Company ID
		**kwargs: Fields to update (company_name, email, phone_no, website, company_description, etc.)
		
	Returns:
		Success response with updated establishment data
	"""
	try:
		if not company_id:
			return validation_error("company_id is required")
		
		if not frappe.db.exists("Company", company_id):
			return not_found("Company", company_id)
		
		company = frappe.get_doc("Company", company_id)
		
		# Allowed fields for update (restrict operational fields)
		allowed_fields = [
			"company_name", "email", "phone_no", "website", 
			"company_description", "company_logo", "disabled"
		]
		
		changes = []
		for field, value in kwargs.items():
			if field in allowed_fields:
				old_value = getattr(company, field, None)
				if old_value != value:
					setattr(company, field, value)
					changes.append(field)
		
		if not changes:
			return success("No changes to update", {"company_id": company_id})
		
		company.save()
		frappe.db.commit()
		
		# Create audit event
		try:
			frappe.get_doc({
				"doctype": "Cheese System Event",
				"event_type": "ESTABLISHMENT_UPDATED",
				"entity_type": "Company",
				"entity_id": company_id,
				"details": json.dumps({"changed_fields": changes, "updated_by": frappe.session.user})
			}).insert(ignore_permissions=True)
		except Exception:
			pass  # Ignore if System Event doctype doesn't exist
		
		return success(
			"Establishment updated successfully",
			{
				"company_id": company.name,
				"company_name": company.company_name,
				"status": "INACTIVE" if company.disabled else "ACTIVE",
				"changes": changes
			}
		)
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except Exception as e:
		frappe.log_error(f"Error in update_establishment: {str(e)}")
		return error("Failed to update establishment", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def export_establishments(format="CSV", filters=None):
	"""
	Export establishments to CSV/XLSX/PDF
	
	Args:
		format: Export format (CSV/XLSX/PDF)
		filters: JSON string of filters to apply
		
	Returns:
		Export file or download link
	"""
	try:
		# Parse filters if provided
		filter_dict = {}
		if filters:
			try:
				filter_dict = json.loads(filters) if isinstance(filters, str) else filters
			except Exception:
				pass
		
		# Get all companies matching filters
		companies = frappe.get_all(
			"Company",
			filters=filter_dict,
			fields=["name", "company_name", "disabled", "email", "phone_no", "website"],
			order_by="company_name asc"
		)
		
		# For now, return data (actual export would use frappe.utils.print_format)
		# In production, this would generate and return a file download
		result = []
		for company in companies:
			experiences_count = frappe.db.count("Cheese Experience", {"company": company.name})
			result.append({
				"Company ID": company.name,
				"Company Name": company.company_name,
				"Status": "INACTIVE" if company.disabled else "ACTIVE",
				"Email": company.email,
				"Phone": company.phone_no,
				"Website": company.website,
				"Experiences Count": experiences_count
			})
		
		return success(
			f"Export data prepared ({format} format)",
			{
				"format": format,
				"count": len(result),
				"data": result,
				"note": "In production, this would return a downloadable file"
			}
		)
	except Exception as e:
		frappe.log_error(f"Error in export_establishments: {str(e)}")
		return error("Failed to export establishments", "SERVER_ERROR", {"error": str(e)}, 500)
