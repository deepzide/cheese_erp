# Copyright (c) 2024
# License: MIT

import frappe
from frappe import _
from frappe.utils import cint
from cheese.api.common.responses import success, created, error, not_found, validation_error, paginated_response
from cheese.api.v1.user_controller import _get_current_user_company
import json


def _normalize_entity_type(entity_type):
	"""Accept legacy aliases and normalize to Cheese Document values."""
	mapping = {
		"Experience": "Cheese Experience",
		"Route": "Cheese Route",
		"Cheese Experience": "Cheese Experience",
		"Cheese Route": "Cheese Route",
		"Company": "Company",
	}
	return mapping.get(entity_type, entity_type)


def _normalize_document_type(document_type):
	"""Normalize common casing variants."""
	mapping = {
		"PDF": "PDF",
		"Image": "Image",
		"IMAGE": "Image",
		"Link": "Link",
		"LINK": "Link",
	}
	return mapping.get(document_type, document_type)


def _entity_company(entity_type, entity_id):
	"""Resolve owning company for supported document entity targets."""
	if entity_type == "Company":
		return entity_id
	if entity_type == "Cheese Experience":
		return frappe.db.get_value("Cheese Experience", entity_id, "company")
	if entity_type == "Cheese Ticket":
		return frappe.db.get_value("Cheese Ticket", entity_id, "company")
	return None


def _is_entity_accessible(entity_type, entity_id):
	"""Tenant guard for establishment users; admins remain unrestricted."""
	user_company = _get_current_user_company()
	if not user_company:
		return True
	return _entity_company(entity_type, entity_id) == user_company


@frappe.whitelist()
def upload_document(entity_type, entity_id, file_url, title, document_type="PDF", tags=None, language=None, status="DRAFT", version=None):
	"""
	Upload a document (PDF/Image/Link) for an entity (US-08)
	
	Args:
		entity_type: Entity type (Experience/Route/Company)
		entity_id: Entity ID
		file_url: File URL (from Frappe file upload) or external link
		title: Document title
		document_type: Document type (PDF/Image/Link)
		tags: Comma-separated tags
		language: Language code
		status: Status (DRAFT/PUBLISHED/ARCHIVED)
		version: Document version (optional)
		
	Returns:
		Created response with document data
	"""
	try:
		if not entity_type:
			return validation_error("entity_type is required")
		if not entity_id:
			return validation_error("entity_id is required")
		if not file_url:
			return validation_error("file_url is required")
		if not title:
			return validation_error("title is required")

		entity_type = _normalize_entity_type(entity_type)
		document_type = _normalize_document_type(document_type)
		
		# Validate entity exists
		if entity_type == "Cheese Experience":
			if not frappe.db.exists("Cheese Experience", entity_id):
				return not_found("Experience", entity_id)
		elif entity_type == "Cheese Route":
			if not frappe.db.exists("Cheese Route", entity_id):
				return not_found("Route", entity_id)
		elif entity_type == "Company":
			if not frappe.db.exists("Company", entity_id):
				return not_found("Company", entity_id)
		else:
			return validation_error(f"Invalid entity_type: {entity_type}")

		if not _is_entity_accessible(entity_type, entity_id):
			return error("Unauthorized", "UNAUTHORIZED", {}, 403)
		
		# If Cheese Document doctype exists, use it
		# Otherwise, store as File attachment with custom fields
		try:
			doc = frappe.get_doc({
				"doctype": "Cheese Document",
				"entity_type": entity_type,
				"entity_id": entity_id,
				"file_url": file_url,
				"title": title,
				"document_type": document_type,
				"tags": tags,
				"language": language,
				"status": status,
				"version": version
			})
			doc.insert()
			frappe.db.commit()
			
			return created(
				"Document uploaded successfully",
				{
					"document_id": doc.name,
					"entity_type": entity_type,
					"entity_id": entity_id,
					"title": title,
					"status": status
				}
			)
		except Exception:
			# Fallback: store in File doctype with metadata in attached_to
			file_doc = frappe.get_doc({
				"doctype": "File",
				"file_url": file_url,
				"file_name": title,
				"attached_to_doctype": entity_type,
				"attached_to_name": entity_id
			})
			file_doc.insert()
			frappe.db.commit()
			
			return created(
				"Document uploaded successfully (stored as File)",
				{
					"document_id": file_doc.name,
					"file_url": file_url,
					"title": title,
					"entity_type": entity_type,
					"entity_id": entity_id
				}
			)
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except Exception as e:
		frappe.log_error(f"Error in upload_document: {str(e)}")
		return error("Failed to upload document", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def list_documents(entity_type=None, entity_id=None, status=None, document_type=None, tags=None, language=None, page=1, page_size=20):
	"""
	List documents with filters (US-08)
	
	Args:
		entity_type: Filter by entity type
		entity_id: Filter by entity ID
		status: Filter by status
		document_type: Filter by document type (PDF/Image/Link)
		tags: Filter by tags (comma-separated, matches any)
		language: Filter by language
		page: Page number
		page_size: Items per page
		
	Returns:
		Paginated response with documents list
	"""
	try:
		page = cint(page) or 1
		page_size = cint(page_size) or 20
		entity_type = _normalize_entity_type(entity_type) if entity_type else None
		document_type = _normalize_document_type(document_type) if document_type else None
		user_company = _get_current_user_company()
		
		# Try to use Cheese Document doctype
		try:
			filters = {}
			if entity_type:
				filters["entity_type"] = entity_type
			if entity_id:
				filters["entity_id"] = entity_id
			if status:
				filters["status"] = status
			if document_type:
				filters["document_type"] = document_type
			if language:
				filters["language"] = language
			
			# `frappe.get_all` bypasses doctype permission hooks; apply explicit
			# company scoping for establishment users.
			if user_company:
				if entity_type and entity_id:
					if not _is_entity_accessible(entity_type, entity_id):
						return paginated_response([], "Documents retrieved successfully", page=page, page_size=page_size, total=0)
				else:
					allowed_experiences = frappe.get_all(
						"Cheese Experience",
						filters={"company": user_company},
						pluck="name",
					)
					allowed_tickets = frappe.get_all(
						"Cheese Ticket",
						filters={"company": user_company},
						pluck="name",
					)
					if entity_type == "Company":
						filters["entity_id"] = user_company
					elif entity_type == "Cheese Experience":
						filters["entity_id"] = ["in", allowed_experiences or ["__none__"]]
					elif entity_type == "Cheese Ticket":
						filters["entity_id"] = ["in", allowed_tickets or ["__none__"]]
					else:
						filters["entity_type"] = ["in", ["Company", "Cheese Experience", "Cheese Ticket"]]
						filters["entity_id"] = [
							"in",
							[user_company, *allowed_experiences, *allowed_tickets],
						]

			documents = frappe.get_all(
				"Cheese Document",
				filters=filters,
				fields=["name", "entity_type", "entity_id", "file_url", "title", "document_type", "tags", "language", "status", "version", "modified"],
				limit_start=(page - 1) * page_size,
				limit_page_length=page_size,
				order_by="modified desc"
			)
			
			# Filter by tags if provided (tags are stored as comma-separated string)
			if tags:
				tag_list = [t.strip().lower() for t in tags.split(",")] if isinstance(tags, str) else [t.strip().lower() for t in tags]
				filtered_docs = []
				for doc in documents:
					if doc.tags:
						doc_tags = [t.strip().lower() for t in doc.tags.split(",")]
						if any(tag in doc_tags for tag in tag_list):
							filtered_docs.append(doc)
					documents = filtered_docs
			
			total = frappe.db.count("Cheese Document", filters=filters)
			
			return paginated_response(
				documents,
				"Documents retrieved successfully",
				page=page,
				page_size=page_size,
				total=total
			)
		except Exception:
			# Fallback: use File doctype
			filters = {}
			if entity_type:
				filters["attached_to_doctype"] = entity_type
			if entity_id:
				filters["attached_to_name"] = entity_id
			
			files = frappe.get_all(
				"File",
				filters=filters,
				fields=["name", "file_url", "file_name", "attached_to_doctype", "attached_to_name", "modified"],
				limit_start=(page - 1) * page_size,
				limit_page_length=page_size,
				order_by="modified desc"
			)
			
			# Map to document format
			documents = []
			for file in files:
				if user_company and not _is_entity_accessible(file.attached_to_doctype, file.attached_to_name):
					continue
				documents.append({
					"document_id": file.name,
					"entity_type": file.attached_to_doctype,
					"entity_id": file.attached_to_name,
					"file_url": file.file_url,
					"title": file.file_name,
					"status": "PUBLISHED"  # Default for File
				})
			
			total = frappe.db.count("File", filters=filters)
			
			return paginated_response(
				documents,
				"Documents retrieved successfully",
				page=page,
				page_size=page_size,
				total=total
			)
	except Exception as e:
		frappe.log_error(f"Error in list_documents: {str(e)}")
		return error("Failed to list documents", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def get_document_details(document_id):
	"""
	Get document metadata
	
	Args:
		document_id: Document ID
		
	Returns:
		Success response with document details
	"""
	try:
		if not document_id:
			return validation_error("document_id is required")
		
		# Try Cheese Document doctype first
		try:
			if not frappe.db.exists("Cheese Document", document_id):
				return not_found("Document", document_id)
			
			doc = frappe.get_doc("Cheese Document", document_id)
			if not _is_entity_accessible(doc.entity_type, doc.entity_id):
				return error("Unauthorized", "UNAUTHORIZED", {}, 403)
			
			return success(
				"Document details retrieved successfully",
				{
					"document_id": doc.name,
					"entity_type": doc.entity_type,
					"entity_id": doc.entity_id,
					"file_url": doc.file_url,
					"title": doc.title,
					"tags": doc.tags,
					"language": doc.language,
					"status": doc.status,
					"created_at": str(doc.creation) if doc.creation else None
				}
			)
		except Exception:
			# Fallback to File doctype
			if not frappe.db.exists("File", document_id):
				return not_found("Document", document_id)
			
			file_doc = frappe.get_doc("File", document_id)
			if not _is_entity_accessible(file_doc.attached_to_doctype, file_doc.attached_to_name):
				return error("Unauthorized", "UNAUTHORIZED", {}, 403)
			
			return success(
				"Document details retrieved successfully",
				{
					"document_id": file_doc.name,
					"entity_type": file_doc.attached_to_doctype,
					"entity_id": file_doc.attached_to_name,
					"file_url": file_doc.file_url,
					"title": file_doc.file_name,
					"status": "PUBLISHED"
				}
			)
	except Exception as e:
		frappe.log_error(f"Error in get_document_details: {str(e)}")
		return error("Failed to get document details", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def update_document_status(document_id, status):
	"""
	Update document status
	
	Args:
		document_id: Document ID
		status: New status (DRAFT/PUBLISHED/ARCHIVED)
		
	Returns:
		Success response
	"""
	try:
		if not document_id:
			return validation_error("document_id is required")
		if not status:
			return validation_error("status is required")
		
		if status not in ["DRAFT", "PUBLISHED", "ARCHIVED"]:
			return validation_error(f"Invalid status: {status}")
		
		# Try Cheese Document doctype
		try:
			if not frappe.db.exists("Cheese Document", document_id):
				return not_found("Document", document_id)
			
			doc = frappe.get_doc("Cheese Document", document_id)
			if not _is_entity_accessible(doc.entity_type, doc.entity_id):
				return error("Unauthorized", "UNAUTHORIZED", {}, 403)
			doc.status = status
			doc.save()
			frappe.db.commit()
			
			return success(
				"Document status updated successfully",
				{
					"document_id": doc.name,
					"status": doc.status
				}
			)
		except Exception:
			return validation_error("Document status update requires Cheese Document doctype")
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except Exception as e:
		frappe.log_error(f"Error in update_document_status: {str(e)}")
		return error("Failed to update document status", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def delete_document(document_id):
	"""
	Delete/archive document
	
	Args:
		document_id: Document ID
		
	Returns:
		Success response
	"""
	try:
		if not document_id:
			return validation_error("document_id is required")
		
		# Try Cheese Document doctype
		try:
			if not frappe.db.exists("Cheese Document", document_id):
				return not_found("Document", document_id)
			
			doc = frappe.get_doc("Cheese Document", document_id)
			if not _is_entity_accessible(doc.entity_type, doc.entity_id):
				return error("Unauthorized", "UNAUTHORIZED", {}, 403)
			# Soft delete by archiving
			doc.status = "ARCHIVED"
			doc.save()
			frappe.db.commit()
			
			return success(
				"Document archived successfully",
				{
					"document_id": doc.name,
					"status": doc.status
				}
			)
		except Exception:
			# Fallback: delete File
			if not frappe.db.exists("File", document_id):
				return not_found("Document", document_id)
			
			file_doc = frappe.get_doc("File", document_id)
			file_doc.delete()
			frappe.db.commit()
			
			return success(
				"Document deleted successfully",
				{
					"document_id": document_id
				}
			)
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except Exception as e:
		frappe.log_error(f"Error in delete_document: {str(e)}")
		return error("Failed to delete document", "SERVER_ERROR", {"error": str(e)}, 500)
