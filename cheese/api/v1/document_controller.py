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
			
			extracted_text = doc.extracted_text or ""
			return success(
				"Document details retrieved successfully",
				{
					"document_id": doc.name,
					"entity_type": doc.entity_type,
					"entity_id": doc.entity_id,
					"file_url": doc.file_url,
					"title": doc.title,
					"document_type": doc.document_type,
					"tags": doc.tags,
					"language": doc.language,
					"status": doc.status,
					"version": doc.version,
					"validity_date": str(doc.validity_date) if doc.validity_date else None,
					"embedding_status": doc.embedding_status or "",
					"embedding_model": doc.embedding_model,
					"embedding_error": doc.embedding_error,
					"extracted_text_preview": extracted_text[:3000],
					"extracted_text_length": len(extracted_text),
					"created_at": str(doc.creation) if doc.creation else None,
					"modified_at": str(doc.modified) if doc.modified else None
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
			if not _is_entity_accessible(file_doc.attached_to_doctype, file_doc.attached_to_name):
				return error("Unauthorized", "UNAUTHORIZED", {}, 403)
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


# ── Semantic search (used by the chatbot agent) ─────────────────────────


def _document_search_base_filters(entity_type=None, entity_id=None, status="PUBLISHED"):
	"""Build tenant-aware filters for the semantic search candidate set."""
	filters = {
		"embedding_status": "COMPLETED",
	}
	if status:
		filters["status"] = status
	if entity_type:
		filters["entity_type"] = entity_type
	if entity_id:
		filters["entity_id"] = entity_id
	return filters


def _log_semantic_search(query, entity_type, entity_id, top_k, min_similarity, results, source):
	"""Persist the search and its ranked results for auditing. Never breaks the search."""
	try:
		log = frappe.get_doc(
			{
				"doctype": "Cheese Semantic Search Log",
				"query": query[:140],
				"source": "TEST" if (source or "").upper() == "TEST" else "API",
				"entity_type": entity_type,
				"entity_id": entity_id,
				"top_k": top_k,
				"min_similarity": min_similarity,
				"results_count": len(results),
				"results_json": json.dumps(
					[
						{
							"document_id": r["document_id"],
							"title": r["title"],
							"similarity": r["similarity"],
							"file_url": r.get("file_url"),
							"document_type": r.get("document_type"),
							"entity_type": r.get("entity_type"),
							"entity_id": r.get("entity_id"),
						}
						for r in results
					]
				),
			}
		)
		log.insert(ignore_permissions=True)
		frappe.db.commit()
	except Exception as e:
		frappe.log_error(f"Failed to log semantic search: {e}", "Semantic Search Log")


@frappe.whitelist()
def search_documents_semantic(
	query,
	entity_type=None,
	entity_id=None,
	top_k=5,
	min_similarity=0.35,
	include_content=0,
	content_max_chars=6000,
	status="PUBLISHED",
	search_source="API",
):
	"""
	Rank documents by semantic similarity against a natural-language query.

	The query is embedded with the same model used to vectorize documents
	and compared with cosine similarity. Returns only matches at or above
	``min_similarity`` (an empty list is a valid outcome).

	Args:
		query: Natural-language query (e.g. "ofertas gastronomicas de La Cremerie")
		entity_type: Optional filter (Company / Cheese Experience / Cheese Route)
		entity_id: Optional filter to one entity
		top_k: Maximum documents to return (default 5, capped at 20)
		min_similarity: Minimum cosine similarity in [0, 1] (default 0.35)
		include_content: When truthy, include the extracted text of each match
		content_max_chars: Truncate included content to this many characters
		status: Document status to search (default PUBLISHED)
		search_source: Audit tag — "API" (bot/agent) or "TEST" (ERP test page)

	Returns:
		Success response with ranked documents: [{document_id, title,
		entity_type, entity_id, tags, language, document_type, file_url,
		similarity, content?}]
	"""
	try:
		from cheese.cheese.utils.document_embeddings import (
			cosine_similarity,
			generate_embedding,
			get_embedding_settings,
		)

		query = (query or "").strip()
		if not query:
			return validation_error("query is required")

		top_k = min(cint(top_k) or 5, 20)
		content_max_chars = cint(content_max_chars) or 6000
		try:
			min_similarity = float(min_similarity)
		except (TypeError, ValueError):
			min_similarity = 0.35
		include_content = cint(include_content) == 1 if not isinstance(include_content, bool) else include_content

		settings = get_embedding_settings()
		if not settings["enabled"] or not settings["api_key"]:
			return error(
				"Semantic search is not configured (enable embeddings and set the OpenAI API key in Cheese Bot Setting)",
				"NOT_CONFIGURED",
				{},
				503,
			)

		if entity_type:
			entity_type = _normalize_entity_type(entity_type)

		query_embedding = generate_embedding(query, settings)

		candidates = frappe.get_all(
			"Cheese Document",
			filters=_document_search_base_filters(entity_type, entity_id, status),
			fields=[
				"name", "title", "entity_type", "entity_id", "tags", "language",
				"document_type", "file_url", "embedding_json", "embedding_model",
			],
		)

		results = []
		for row in candidates:
			# Tenant isolation: establishment users only see their own documents
			if not _is_entity_accessible(row.entity_type, row.entity_id):
				continue
			# Vectors from a different model are not comparable
			if row.embedding_model and row.embedding_model != settings["model"]:
				continue
			try:
				doc_embedding = json.loads(row.embedding_json)
			except Exception:
				continue
			similarity = cosine_similarity(query_embedding, doc_embedding)
			if similarity < min_similarity:
				continue
			results.append(
				{
					"document_id": row.name,
					"title": row.title,
					"entity_type": row.entity_type,
					"entity_id": row.entity_id,
					"tags": row.tags,
					"language": row.language,
					"document_type": row.document_type,
					"file_url": row.file_url,
					"similarity": round(similarity, 4),
				}
			)

		results.sort(key=lambda r: r["similarity"], reverse=True)
		results = results[:top_k]

		# Audit trail: every semantic search and its ranked results
		_log_semantic_search(query, entity_type, entity_id, top_k, min_similarity, results, search_source)

		if include_content and results:
			for item in results:
				content = frappe.db.get_value("Cheese Document", item["document_id"], "extracted_text") or ""
				item["content"] = content[:content_max_chars]

		return success(
			f"Found {len(results)} document(s) with similarity >= {min_similarity}",
			{"query": query, "results": results, "count": len(results)},
		)
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except Exception as e:
		frappe.log_error(f"Error in search_documents_semantic: {str(e)}")
		return error("Failed to search documents", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def get_document_content(document_id, max_chars=20000):
	"""
	Return the extracted text content of a document.

	Extracts on demand when the document has not been vectorized yet, so
	the agent can always read a document it discovered via search.
	"""
	try:
		if not document_id:
			return validation_error("document_id is required")
		if not frappe.db.exists("Cheese Document", document_id):
			return not_found("Document", document_id)

		doc = frappe.get_doc("Cheese Document", document_id)
		if not _is_entity_accessible(doc.entity_type, doc.entity_id):
			return error("Unauthorized", "UNAUTHORIZED", {}, 403)

		max_chars = cint(max_chars) or 20000
		content = doc.extracted_text
		if not content:
			from cheese.cheese.utils.document_embeddings import extract_document_text

			content = extract_document_text(doc)

		return success(
			"Document content retrieved successfully",
			{
				"document_id": doc.name,
				"title": doc.title,
				"entity_type": doc.entity_type,
				"entity_id": doc.entity_id,
				"document_type": doc.document_type,
				"embedding_status": doc.embedding_status,
				"content": (content or "")[:max_chars],
			},
		)
	except Exception as e:
		frappe.log_error(f"Error in get_document_content: {str(e)}")
		return error("Failed to get document content", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def reindex_documents():
	"""Re-queue vectorization for documents without a completed embedding (admin)."""
	try:
		if frappe.session.user != "Administrator" and "System Manager" not in frappe.get_roles():
			return error("Unauthorized", "UNAUTHORIZED", {}, 403)

		from cheese.cheese.utils.document_embeddings import reindex_pending_documents

		queued = reindex_pending_documents()
		return success(f"Queued {queued} document(s) for vectorization", {"queued": queued})
	except Exception as e:
		frappe.log_error(f"Error in reindex_documents: {str(e)}")
		return error("Failed to reindex documents", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def list_semantic_search_logs(page=1, page_size=20, search=None, source=None):
	"""
	Paginated history of semantic searches with their ranked results (audit).

	Args:
		page: Page number
		page_size: Items per page (max 100)
		search: Optional substring filter on the query text
		source: Optional filter: API (bot/agent) or TEST (ERP test page)
	"""
	try:
		if frappe.session.user != "Administrator" and "System Manager" not in frappe.get_roles():
			return error("Unauthorized", "UNAUTHORIZED", {}, 403)

		page = cint(page) or 1
		page_size = min(cint(page_size) or 20, 100)

		filters = {}
		if source and source.upper() in ("API", "TEST"):
			filters["source"] = source.upper()
		if search and str(search).strip():
			filters["query"] = ["like", f"%{str(search).strip()}%"]

		total = frappe.db.count("Cheese Semantic Search Log", filters=filters)
		rows = frappe.get_all(
			"Cheese Semantic Search Log",
			filters=filters,
			fields=[
				"name", "query", "source", "entity_type", "entity_id",
				"top_k", "min_similarity", "results_count", "results_json",
				"owner", "creation",
			],
			order_by="creation desc",
			limit_start=(page - 1) * page_size,
			limit_page_length=page_size,
		)

		logs = []
		for row in rows:
			try:
				results = json.loads(row.results_json) if row.results_json else []
			except Exception:
				results = []
			logs.append(
				{
					"log_id": row.name,
					"query": row.query,
					"source": row.source,
					"entity_type": row.entity_type,
					"entity_id": row.entity_id,
					"top_k": row.top_k,
					"min_similarity": row.min_similarity,
					"results_count": row.results_count,
					"results": results,
					"searched_by": row.owner,
					"searched_at": str(row.creation),
				}
			)

		return paginated_response(logs, "Search logs retrieved successfully", page=page, page_size=page_size, total=total)
	except Exception as e:
		frappe.log_error(f"Error in list_semantic_search_logs: {str(e)}")
		return error("Failed to list search logs", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def vectorize_document_now(document_id):
	"""
	Queue (re)vectorization of one document for semantic search.

	Args:
		document_id: Cheese Document ID
	"""
	try:
		if not document_id:
			return validation_error("document_id is required")
		if not frappe.db.exists("Cheese Document", document_id):
			return not_found("Document", document_id)

		doc = frappe.get_doc("Cheese Document", document_id)
		if not _is_entity_accessible(doc.entity_type, doc.entity_id):
			return error("Unauthorized", "UNAUTHORIZED", {}, 403)

		from cheese.cheese.utils.document_embeddings import get_embedding_settings

		settings = get_embedding_settings()
		if not settings["enabled"] or not settings["api_key"]:
			return error(
				"Semantic search is not configured (enable embeddings and set the OpenAI API key in Cheese Bot Setting)",
				"NOT_CONFIGURED",
				{},
				503,
			)

		frappe.db.set_value(
			"Cheese Document", document_id, "embedding_status", "PENDING", update_modified=False
		)
		frappe.enqueue(
			"cheese.cheese.utils.document_embeddings.vectorize_document",
			document_name=document_id,
			queue="long",
			is_async=True,
		)
		frappe.db.commit()

		return success(
			"Document queued for vectorization",
			{"document_id": document_id, "embedding_status": "PENDING"},
		)
	except Exception as e:
		frappe.log_error(f"Error in vectorize_document_now: {str(e)}")
		return error("Failed to queue vectorization", "SERVER_ERROR", {"error": str(e)}, 500)
