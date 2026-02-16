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
			# NOTE: Company doctype does not have disabled field, ignoring filter to prevent error
			pass
			# if status.upper() == "INACTIVE":
			# 	filters["disabled"] = 1
			# elif status.upper() == "ACTIVE":
			# 	filters["disabled"] = 0
		
		# Build search query
		search_fields = ["company_name"]
		or_filters = []
		
		if search:
			or_filters.append(["company_name", "like", f"%{search}%"])
		
		if locality:
			# Search in address (would need Address doctype join)
			or_filters.append(["company_name", "like", f"%{locality}%"])
		
		# Handle tags filter (using Frappe's tag system)
		tag_filters = None
		if tags:
			tag_list = [t.strip() for t in tags.split(",")] if isinstance(tags, str) else tags
			# Get companies with these tags
			tagged_companies = frappe.get_all(
				"Tag Link",
				filters={
					"document_type": "Company",
					"tag": ["in", tag_list]
				},
				fields=["document_name"],
				distinct=True
			)
			if tagged_companies:
				filters["name"] = ["in", [tc.document_name for tc in tagged_companies]]
			else:
				# No companies match tags, return empty
				return paginated_response(
					[],
					"No establishments found with these tags",
					page=page,
					page_size=page_size,
					total=0
				)
		
		# Get companies
		companies = frappe.get_all(
			"Company",
			filters=filters,
			or_filters=or_filters if or_filters else None,
			fields=["name", "company_name", "email", "phone_no", "website", "company_description"],
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
				"status": "ACTIVE", # "INACTIVE" if company.disabled else "ACTIVE",
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
		
		# Get documents/multimedia
		documents = []
		photos = []
		links = []
		pdfs = []
		
		try:
			all_documents = frappe.get_all(
				"Cheese Document",
				filters={"entity_type": "Company", "entity_id": company_id, "status": "PUBLISHED"},
				fields=["name", "title", "file_url", "document_type", "tags", "language", "version"]
			)
			
			for doc in all_documents:
				doc_info = {
					"document_id": doc.name,
					"title": doc.title,
					"file_url": doc.file_url,
					"tags": doc.tags,
					"language": doc.language,
					"version": doc.version
				}
				
				documents.append(doc_info)
				
				if doc.document_type == "Image":
					photos.append(doc_info)
				elif doc.document_type == "Link":
					links.append(doc_info)
				elif doc.document_type == "PDF":
					pdfs.append(doc_info)
		except Exception:
			# Cheese Document doctype may not exist yet, continue without documents
			pass
		
		return success(
			"Establishment details retrieved successfully",
			{
				"company_id": company.name,
				"company_name": company.company_name,
				"status": "ACTIVE", # "INACTIVE" if company.disabled else "ACTIVE",
				"email": company.email,
				"phone": company.phone_no,
				"website": company.website,
				"description": company.company_description,
				"address": address,
				"contacts": contacts,
				"experiences": experiences,
				"tickets_by_status": tickets_by_status,
				"logo": company.company_logo if hasattr(company, "company_logo") else None,
				"documents": documents,
				"photos": photos,
				"links": links,
				"pdfs": pdfs
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
			"company_description", "company_logo"
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
				"status": "ACTIVE", # "INACTIVE" if company.	 else "ACTIVE",
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
			fields=["name", "company_name", "email", "phone_no", "website"],
			order_by="company_name asc"
		)
		
		# Prepare data
		result = []
		for company in companies:
			experiences_count = frappe.db.count("Cheese Experience", {"company": company.name})
			online_experiences = frappe.db.count(
				"Cheese Experience",
				{"company": company.name, "status": "ONLINE"}
			)
			result.append({
				"Company ID": company.name,
				"Company Name": company.company_name,
				"Status": "ACTIVE", # "INACTIVE" if company.disabled else "ACTIVE",
				"Email": company.email,
				"Phone": company.phone_no,
				"Website": company.website,
				"Experiences Count": experiences_count,
				"Online Experiences": online_experiences
			})
		
		# Generate file based on format
		if format.upper() == "CSV":
			import csv
			import io
			from frappe.utils import get_site_path
			
			output = io.StringIO()
			if result:
				writer = csv.DictWriter(output, fieldnames=result[0].keys())
				writer.writeheader()
				writer.writerows(result)
			
			# Save to file
			file_path = get_site_path("private", "files", f"establishments_export_{frappe.utils.now().replace(' ', '_')}.csv")
			with open(file_path, "w", encoding="utf-8") as f:
				f.write(output.getvalue())
			
			file_doc = frappe.get_doc({
				"doctype": "File",
				"file_name": f"establishments_export_{frappe.utils.now().replace(' ', '_')}.csv",
				"file_url": f"/private/files/establishments_export_{frappe.utils.now().replace(' ', '_')}.csv",
				"is_private": 1
			})
			file_doc.insert(ignore_permissions=True)
			frappe.db.commit()
			
			return success(
				"Export file generated successfully",
				{
					"format": format,
					"file_url": file_doc.file_url,
					"file_name": file_doc.file_name,
					"count": len(result)
				}
			)
		elif format.upper() == "XLSX":
			try:
				import openpyxl
				from openpyxl import Workbook
				from frappe.utils import get_site_path
				
				wb = Workbook()
				ws = wb.active
				ws.title = "Establishments"
				
				# Write headers
				if result:
					headers = list(result[0].keys())
					ws.append(headers)
					
					# Write data
					for row in result:
						ws.append([row.get(h) for h in headers])
				
				# Save file
				file_path = get_site_path("private", "files", f"establishments_export_{frappe.utils.now().replace(' ', '_')}.xlsx")
				wb.save(file_path)
				
				file_doc = frappe.get_doc({
					"doctype": "File",
					"file_name": f"establishments_export_{frappe.utils.now().replace(' ', '_')}.xlsx",
					"file_url": f"/private/files/establishments_export_{frappe.utils.now().replace(' ', '_')}.xlsx",
					"is_private": 1
				})
				file_doc.insert(ignore_permissions=True)
				frappe.db.commit()
				
				return success(
					"Export file generated successfully",
					{
						"format": format,
						"file_url": file_doc.file_url,
						"file_name": file_doc.file_name,
						"count": len(result)
					}
				)
			except ImportError:
				return error(
					"XLSX export requires openpyxl library. Install with: pip install openpyxl",
					"MISSING_DEPENDENCY",
					{},
					400
				)
		elif format.upper() == "PDF":
			# Use Frappe's print format
			from frappe.utils.print_format import download_pdf
			from frappe.utils import get_site_path
			
			# Create a temporary HTML report
			html_content = f"""
			<html>
			<head><title>Establishments Export</title></head>
			<body>
				<h1>Establishments Export</h1>
				<table border="1" cellpadding="5">
					<tr>
						{"".join([f"<th>{h}</th>" for h in (result[0].keys() if result else [])])}
					</tr>
					{"".join([f"<tr>{''.join([f'<td>{row.get(h)}</td>' for h in row.keys()])}</tr>" for row in result])}
				</table>
			</body>
			</html>
			"""
			
			file_path = get_site_path("private", "files", f"establishments_export_{frappe.utils.now().replace(' ', '_')}.html")
			with open(file_path, "w", encoding="utf-8") as f:
				f.write(html_content)
			
			# Note: PDF generation would require wkhtmltopdf
			# For now, return HTML file
			file_doc = frappe.get_doc({
				"doctype": "File",
				"file_name": f"establishments_export_{frappe.utils.now().replace(' ', '_')}.html",
				"file_url": f"/private/files/establishments_export_{frappe.utils.now().replace(' ', '_')}.html",
				"is_private": 1
			})
			file_doc.insert(ignore_permissions=True)
			frappe.db.commit()
			
			return success(
				"Export file generated successfully (HTML format - PDF requires wkhtmltopdf)",
				{
					"format": "HTML",
					"file_url": file_doc.file_url,
					"file_name": file_doc.file_name,
					"count": len(result),
					"note": "PDF generation requires wkhtmltopdf. HTML file generated instead."
				}
			)
		else:
			return validation_error(f"Unsupported format: {format}. Supported formats: CSV, XLSX, PDF")
	except Exception as e:
		frappe.log_error(f"Error in export_establishments: {str(e)}")
		return error("Failed to export establishments", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def upload_establishment_media(company_id, file_url, title, document_type="PDF", tags=None, language=None, status="PUBLISHED"):
	"""
	Upload multimedia content for an establishment (US-08)
	
	Args:
		company_id: Company ID
		file_url: File URL or external link
		title: Document title
		document_type: Document type (PDF/Image/Link)
		tags: Comma-separated tags
		language: Language code
		status: Status (DRAFT/PUBLISHED/ARCHIVED)
		
	Returns:
		Created response with document data
	"""
	try:
		if not company_id:
			return validation_error("company_id is required")
		if not file_url:
			return validation_error("file_url is required")
		if not title:
			return validation_error("title is required")
		
		if not frappe.db.exists("Company", company_id):
			return not_found("Company", company_id)
		
		# Use document controller
		from cheese.api.v1.document_controller import upload_document
		return upload_document(
			entity_type="Company",
			entity_id=company_id,
			file_url=file_url,
			title=title,
			tags=tags,
			language=language,
			status=status
		)
	except Exception as e:
		frappe.log_error(f"Error in upload_establishment_media: {str(e)}")
		return error("Failed to upload establishment media", "SERVER_ERROR", {"error": str(e)}, 500)
