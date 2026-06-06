# Copyright (c) 2024
# License: MIT

import frappe
from frappe import _
from frappe.utils import getdate, cint
from cheese.api.common.responses import success, error, not_found, validation_error, paginated_response
from cheese.api.v1.user_controller import _get_current_user_company
from cheese.cheese.utils.access import assert_company_value
from cheese.api.v1.bank_account_controller import (
	get_active_company_bank_accounts_list,
	get_active_company_bank_accounts_map,
)
from cheese.cheese.utils.documents import get_published_documents_grouped
import json


def _company_has_cheese_archived():
	return bool(frappe.get_meta("Company").get_field("cheese_archived"))


def _company_has_cheese_establishment_fields():
	"""Check if any Cheese establishment custom fields exist on Company."""
	meta = frappe.get_meta("Company")
	return any(
		meta.get_field(fieldname)
		for fieldname in (
			"cheese_is_hotel",
			"cheese_payment_methods",
			"cheese_types",
			"cheese_establishment_type",
			"cheese_operating_hours",
			"cheese_google_maps_link",
		)
	)


def _company_has_is_hotel_field():
	return bool(frappe.get_meta("Company").get_field("cheese_is_hotel"))


def _get_establishment_extra_fields(company):
	"""Extract new establishment fields from a Company doc, returns a dict."""
	meta = frappe.get_meta("Company")
	fields = {}
	if _company_has_is_hotel_field():
		fields["is_hotel"] = bool(getattr(company, "cheese_is_hotel", 0))
		fields["cheese_is_hotel"] = 1 if fields["is_hotel"] else 0
	if meta.get_field("cheese_payment_methods"):
		fields["payment_methods"] = getattr(company, "cheese_payment_methods", None)
	if meta.get_field("cheese_types"):
		fields["cheese_types"] = getattr(company, "cheese_types", None)
	if meta.get_field("cheese_establishment_type"):
		fields["establishment_type"] = getattr(company, "cheese_establishment_type", None)
	if meta.get_field("cheese_operating_hours"):
		fields["operating_hours"] = getattr(company, "cheese_operating_hours", None)
	if meta.get_field("cheese_google_maps_link"):
		fields["google_maps_link"] = getattr(company, "cheese_google_maps_link", None)
	return fields


def _establishment_delete_blockers(company_id):
	"""Return list of human-readable blockers if establishment cannot be deleted."""
	blockers = []
	if frappe.db.exists("Cheese Experience", {"company": company_id}):
		blockers.append(_("Linked Cheese Experience records exist"))
	if frappe.db.exists("Cheese Ticket", {"company": company_id}):
		blockers.append(_("Linked Cheese Ticket records exist"))
	if frappe.db.exists("Cheese Bank Account", {"entity_type": "Company", "entity_id": company_id}):
		blockers.append(_("Linked Cheese Bank Account records exist"))
	return blockers


@frappe.whitelist()
def list_establishments(page=1, page_size=20, search=None, status=None, locality=None, tags=None, include_archived=0):
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
		include_archived = cint(include_archived)

		# Build filters
		filters = {}

		if _company_has_cheese_archived() and not include_archived:
			filters["cheese_archived"] = 0

		if status and str(status).upper() == "ARCHIVED" and _company_has_cheese_archived():
			filters["cheese_archived"] = 1
		elif status and str(status).upper() == "ACTIVE" and _company_has_cheese_archived():
			filters["cheese_archived"] = 0

		# Build search query
		search_fields = ["company_name"]
		user_company = _get_current_user_company()
		if user_company:
			filters["name"] = user_company
			
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
				if _company_has_cheese_archived() and not include_archived:
					filters["cheese_archived"] = 0
			else:
				# No companies match tags, return empty
				return paginated_response(
					[],
					"No establishments found with these tags",
					page=page,
					page_size=page_size,
					total=0
				)
		
		# Re-assert tenant scope: the tags/locality filters above may have widened
		# `name`, so a scoped establishment user must always be pinned to their company.
		if user_company:
			filters["name"] = user_company

		# Get companies - try with administrator_contact, fallback without it if field doesn't exist
		company_fields_with_contact = ["name", "company_name", "email", "phone_no", "website", "company_description", "administrator_contact"]
		company_fields_without_contact = ["name", "company_name", "email", "phone_no", "website", "company_description"]
		if _company_has_is_hotel_field():
			company_fields_with_contact.append("cheese_is_hotel")
			company_fields_without_contact.append("cheese_is_hotel")
		if _company_has_cheese_archived():
			company_fields_with_contact.append("cheese_archived")
			company_fields_without_contact.append("cheese_archived")
		
		try:
			companies = frappe.get_all(
				"Company",
				filters=filters,
				or_filters=or_filters if or_filters else None,
				fields=company_fields_with_contact,
				limit_start=(page - 1) * page_size,
				limit_page_length=page_size,
				order_by="company_name asc"
			)
		except Exception as field_error:
			# If administrator_contact field doesn't exist yet, retry without it
			frappe.log_error(f"Error fetching administrator_contact field (may not exist yet): {str(field_error)}")
			companies = frappe.get_all(
				"Company",
				filters=filters,
				or_filters=or_filters if or_filters else None,
				fields=company_fields_without_contact,
				limit_start=(page - 1) * page_size,
				limit_page_length=page_size,
				order_by="company_name asc"
			)
		
		# Get total count
		total = frappe.db.count("Company", filters=filters)

		company_names = [c.name for c in companies]
		bank_map = get_active_company_bank_accounts_map(company_names)

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

			archived = bool(getattr(company, "cheese_archived", 0)) if _company_has_cheese_archived() else False

			# Fetch published company documents for this establishment
			grouped = {"documents": [], "photos": [], "links": [], "pdfs": []}
			try:
				grouped = get_published_documents_grouped([("Company", company.name)])
				links_data = [
					{
						"title": link["title"],
						"url": link["url"],
						"tags": link["tags"],
						"language": link["language"],
					}
					for link in grouped["links"]
				]
			except Exception:
				links_data = []

			item = {
				"company_id": company.name,
				"company_name": company.company_name,
				"status": "ARCHIVED" if archived else "ACTIVE",
				"email": company.email,
				"phone": company.phone_no,
				"website": company.website,
				"description": company.company_description,
				"is_hotel": bool(getattr(company, "cheese_is_hotel", 0)) if _company_has_is_hotel_field() else False,
				"cheese_is_hotel": 1 if bool(getattr(company, "cheese_is_hotel", 0)) else 0,
				"administrator_contact": getattr(company, "administrator_contact", None),
				"experiences_count": experiences_count,
				"online_experiences_count": online_experiences,
				"bank_account": bank_map.get(company.name, []),
				"links": links_data,
				"documents": grouped["documents"],
				"photos": grouped["photos"],
				"pdfs": grouped["pdfs"],
			}

			# Add new establishment fields if they exist
			if _company_has_cheese_establishment_fields():
				company_doc = frappe.get_doc("Company", company.name)
				item.update(_get_establishment_extra_fields(company_doc))

			result.append(item)
		
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

		try:
			assert_company_value(company_id)
		except frappe.PermissionError:
			return error("Unauthorized", "UNAUTHORIZED", {}, 403)

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
		
		# Get documents/multimedia (Company + linked experiences)
		documents = []
		photos = []
		links = []
		pdfs = []
		company_grouped = {"documents": [], "photos": [], "links": [], "pdfs": []}
		try:
			experience_ids = frappe.get_all(
				"Cheese Experience",
				filters={"company": company_id},
				pluck="name",
			)
			company_grouped = get_published_documents_grouped([("Company", company_id)])
			entity_specs = [("Company", company_id)]
			entity_specs.extend(("Cheese Experience", exp_id) for exp_id in experience_ids)
			grouped = get_published_documents_grouped(entity_specs)
			documents = grouped["documents"]
			photos = grouped["photos"]
			links = grouped["links"]
			pdfs = grouped["pdfs"]
		except Exception as e:
			frappe.log_error(f"Failed to fetch establishment documents: {e}", "Establishment API")

		archived = bool(getattr(company, "cheese_archived", 0)) if _company_has_cheese_archived() else False
		bank_account = get_active_company_bank_accounts_list(company_id)

		detail_data = {
				"company_id": company.name,
				"company_name": company.company_name,
				"status": "ARCHIVED" if archived else "ACTIVE",
				"email": company.email,
				"phone": company.phone_no,
				"website": company.website,
				"description": company.company_description,
				"administrator_contact": getattr(company, "administrator_contact", None),
				"address": address,
				"contacts": contacts,
				"experiences": experiences,
				"tickets_by_status": tickets_by_status,
				"logo": company.company_logo if hasattr(company, "company_logo") else None,
				"documents": documents,
				"photos": photos,
				"links": links,
				"pdfs": pdfs,
				"company_documents": company_grouped["documents"],
				"company_photos": company_grouped["photos"],
				"company_links": company_grouped["links"],
				"company_pdfs": company_grouped["pdfs"],
				"bank_account": bank_account,
			}

		# Add new establishment fields
		detail_data.update(_get_establishment_extra_fields(company))

		return success(
			"Establishment details retrieved successfully",
			detail_data
		)
	except Exception as e:
		frappe.log_error(f"Error in get_establishment_details: {str(e)}")
		return error("Failed to get establishment details", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def create_establishment(
	company_name,
	abbr=None,
	default_currency=None,
	country=None,
	email=None,
	phone_no=None,
	website=None,
	google_maps_link=None,
	cheese_google_maps_link=None,
	is_hotel=0,
	cheese_is_hotel=0,
):
	"""
	Create a new establishment (ERPNext Company) by copying chart of accounts from an existing company.
	"""
	try:
		if not company_name or not str(company_name).strip():
			return validation_error("company_name is required")

		company_name = str(company_name).strip()
		if frappe.db.exists("Company", company_name):
			return validation_error(_("A company with this name already exists"))

		template_company = frappe.defaults.get_global_default("company")
		if not template_company:
			existing = frappe.get_all("Company", fields=["name"], limit=1)
			template_company = existing[0].name if existing else None
		if not template_company:
			return validation_error(
				_("No existing company found to copy chart of accounts. Complete ERPNext company setup first.")
			)

		defaults = frappe.defaults.get_defaults()
		currency = default_currency or defaults.get("currency") or "USD"
		country_val = country or frappe.db.get_value("Company", template_company, "country")
		if not country_val:
			country_row = frappe.get_all("Country", fields=["name"], limit=1)
			country_val = country_row[0].name if country_row else None
		if not country_val:
			return validation_error(_("country is required (no default country on template company)"))

		doc_data = {
				"doctype": "Company",
				"company_name": company_name,
				"abbr": abbr,
				"default_currency": currency,
				"country": country_val,
				"create_chart_of_accounts_based_on": "Existing Company",
				"existing_company": template_company,
				"email": email,
				"phone_no": phone_no,
				"website": website,
		}
		if _company_has_is_hotel_field():
			doc_data["cheese_is_hotel"] = 1 if cint(is_hotel) or cint(cheese_is_hotel) else 0
		if frappe.get_meta("Company").get_field("cheese_google_maps_link"):
			doc_data["cheese_google_maps_link"] = (
				cheese_google_maps_link if cheese_google_maps_link is not None else google_maps_link
			)
		doc = frappe.get_doc(doc_data)
		doc.insert()
		frappe.db.commit()

		return success(
			"Establishment created successfully",
			{
				"company_id": doc.name,
				"company_name": doc.company_name,
				"status": "ACTIVE",
				"is_hotel": bool(getattr(doc, "cheese_is_hotel", 0)),
				"bank_account": [],
			},
		)
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except Exception as e:
		frappe.log_error(f"Error in create_establishment: {str(e)}")
		return error("Failed to create establishment", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def delete_establishment(company_id):
	"""Delete establishment only when no Cheese-linked records exist."""
	try:
		if not company_id:
			return validation_error("company_id is required")
		if not frappe.db.exists("Company", company_id):
			return not_found("Company", company_id)

		try:
			assert_company_value(company_id)
		except frappe.PermissionError:
			return error("Unauthorized", "UNAUTHORIZED", {}, 403)

		blockers = _establishment_delete_blockers(company_id)
		if blockers:
			return validation_error(
				_("Cannot delete establishment: {0}. Use archive instead.").format("; ".join(blockers))
			)

		frappe.delete_doc("Company", company_id, ignore_permissions=False)
		frappe.db.commit()
		return success("Establishment deleted successfully", {"company_id": company_id})
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except Exception as e:
		frappe.log_error(f"Error in delete_establishment: {str(e)}")
		return error("Failed to delete establishment", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def archive_establishment(company_id):
	"""Soft-archive: hide from default Cheese lists."""
	try:
		if not company_id:
			return validation_error("company_id is required")
		if not frappe.db.exists("Company", company_id):
			return not_found("Company", company_id)
		if not _company_has_cheese_archived():
			return validation_error(_("Cheese archive field is not installed. Run bench migrate."))

		try:
			assert_company_value(company_id)
		except frappe.PermissionError:
			return error("Unauthorized", "UNAUTHORIZED", {}, 403)

		frappe.db.set_value("Company", company_id, "cheese_archived", 1)
		frappe.db.commit()
		return success(
			"Establishment archived successfully",
			{"company_id": company_id, "status": "ARCHIVED"},
		)
	except Exception as e:
		frappe.log_error(f"Error in archive_establishment: {str(e)}")
		return error("Failed to archive establishment", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def unarchive_establishment(company_id):
	try:
		if not company_id:
			return validation_error("company_id is required")
		if not frappe.db.exists("Company", company_id):
			return not_found("Company", company_id)
		if not _company_has_cheese_archived():
			return validation_error(_("Cheese archive field is not installed. Run bench migrate."))

		try:
			assert_company_value(company_id)
		except frappe.PermissionError:
			return error("Unauthorized", "UNAUTHORIZED", {}, 403)

		frappe.db.set_value("Company", company_id, "cheese_archived", 0)
		frappe.db.commit()
		return success(
			"Establishment unarchived successfully",
			{"company_id": company_id, "status": "ACTIVE"},
		)
	except Exception as e:
		frappe.log_error(f"Error in unarchive_establishment: {str(e)}")
		return error("Failed to unarchive establishment", "SERVER_ERROR", {"error": str(e)}, 500)


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

		try:
			assert_company_value(company_id)
		except frappe.PermissionError:
			return error("Unauthorized", "UNAUTHORIZED", {}, 403)

		company = frappe.get_doc("Company", company_id)
		
		# Allowed fields for update (restrict operational fields)
		allowed_fields = [
			"company_name", "email", "phone_no", "website", 
			"company_description", "company_logo", "administrator_contact",
			"google_maps_link", "cheese_google_maps_link",
		]
		if _company_has_is_hotel_field():
			allowed_fields.extend(["cheese_is_hotel", "is_hotel"])
		
		changes = []
		for field, value in kwargs.items():
			if field in allowed_fields:
				if field == "is_hotel":
					field = "cheese_is_hotel"
					value = 1 if cint(value) else 0
				if field == "google_maps_link":
					field = "cheese_google_maps_link"
				if field == "cheese_google_maps_link" and not frappe.get_meta("Company").get_field("cheese_google_maps_link"):
					continue
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

		# Tenant isolation: scoped users may only export their own establishment.
		user_company = _get_current_user_company()
		if user_company:
			filter_dict["name"] = user_company

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

		try:
			assert_company_value(company_id)
		except frappe.PermissionError:
			return error("Unauthorized", "UNAUTHORIZED", {}, 403)

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
