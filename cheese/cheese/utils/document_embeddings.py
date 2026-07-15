# Copyright (c) 2024
# License: MIT

"""Semantic vectorization for Cheese Document.

Uploaded documents are converted to text, embedded with the OpenAI
embeddings API and stored on the document itself (``embedding_json``).
The bot-facing search endpoint ranks documents by cosine similarity
against a natural-language query embedded with the same model.
"""

import json
import math

import frappe

OPENAI_EMBEDDINGS_URL = "https://api.openai.com/v1/embeddings"
DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_REQUEST_TIMEOUT = 30
# text-embedding-3-* accept up to 8191 tokens; ~4 chars/token keeps us safe.
MAX_EMBED_CHARS = 20000
MAX_EXTRACTED_CHARS = 100000
MAX_PDF_PAGES = 50

# Fields whose change invalidates the stored embedding
EMBEDDING_SOURCE_FIELDS = ("file_url", "title", "tags", "language", "entity_type", "entity_id")


def get_embedding_settings():
	"""Return embeddings configuration from Cheese Bot Setting."""
	try:
		doc = frappe.get_single("Cheese Bot Setting")
		return {
			"enabled": bool(getattr(doc, "embeddings_enabled", 0)),
			"api_key": doc.get_password("openai_api_key", raise_exception=False) or "",
			"model": getattr(doc, "embedding_model", None) or DEFAULT_EMBEDDING_MODEL,
		}
	except Exception:
		return {"enabled": False, "api_key": "", "model": DEFAULT_EMBEDDING_MODEL}


def generate_embedding(text, settings=None):
	"""Embed ``text`` with the configured OpenAI model. Returns list[float].

	Raises on missing configuration or API failure so callers can record
	the error on the document.
	"""
	settings = settings or get_embedding_settings()
	if not settings.get("api_key"):
		frappe.throw("OpenAI API key is not configured in Cheese Bot Setting")

	import requests

	resp = requests.post(
		OPENAI_EMBEDDINGS_URL,
		headers={
			"Authorization": f"Bearer {settings['api_key']}",
			"Content-Type": "application/json",
		},
		json={"model": settings["model"], "input": (text or "")[:MAX_EMBED_CHARS]},
		timeout=EMBEDDING_REQUEST_TIMEOUT,
	)
	if not resp.ok:
		frappe.throw(f"OpenAI embeddings API error HTTP {resp.status_code}: {resp.text[:300]}")
	return resp.json()["data"][0]["embedding"]


def cosine_similarity(vec_a, vec_b):
	"""Cosine similarity between two equal-length vectors."""
	if not vec_a or not vec_b or len(vec_a) != len(vec_b):
		return 0.0
	dot = sum(a * b for a, b in zip(vec_a, vec_b))
	norm_a = math.sqrt(sum(a * a for a in vec_a))
	norm_b = math.sqrt(sum(b * b for b in vec_b))
	if norm_a == 0 or norm_b == 0:
		return 0.0
	return dot / (norm_a * norm_b)


# ── Text extraction ─────────────────────────────────────────────────────


def _resolve_local_file_path(file_url):
	"""Map a Frappe file_url (/files/... or /private/files/...) to disk."""
	if not file_url:
		return None
	file_name = frappe.db.get_value("File", {"file_url": file_url}, "name")
	if file_name:
		try:
			return frappe.get_doc("File", file_name).get_full_path()
		except Exception:
			pass
	if file_url.startswith("/private/files/"):
		return frappe.get_site_path("private", "files", file_url.split("/private/files/", 1)[1])
	if file_url.startswith("/files/"):
		return frappe.get_site_path("public", "files", file_url.split("/files/", 1)[1])
	return None


def _extract_pdf_text(file_url):
	"""Extract text from a locally stored PDF. Returns '' when unavailable."""
	import os

	path = _resolve_local_file_path(file_url)
	if not path or not os.path.exists(path):
		return ""

	try:
		try:
			from pypdf import PdfReader
		except ImportError:
			from PyPDF2 import PdfReader

		reader = PdfReader(path)
		parts = []
		for page in reader.pages[:MAX_PDF_PAGES]:
			try:
				parts.append(page.extract_text() or "")
			except Exception:
				continue
		return "\n".join(parts).strip()
	except Exception as e:
		frappe.log_error(f"PDF text extraction failed for {file_url}: {e}", "Document Embeddings")
		return ""


def _entity_label(doc):
	"""Human-readable entity + company context to enrich the embedding."""
	parts = []
	try:
		if doc.entity_type == "Company":
			parts.append(f"Establishment: {doc.entity_id}")
		elif doc.entity_type == "Cheese Experience":
			company = frappe.db.get_value("Cheese Experience", doc.entity_id, "company")
			parts.append(f"Experience: {doc.entity_id}")
			if company:
				parts.append(f"Establishment: {company}")
		elif doc.entity_type == "Cheese Route":
			parts.append(f"Route: {doc.entity_id}")
	except Exception:
		pass
	return "\n".join(parts)


def extract_document_text(doc):
	"""Build the searchable text for a Cheese Document.

	Always includes title/tags/entity metadata so Image and Link documents
	remain findable even without extractable body content.
	"""
	header_parts = [doc.title or ""]
	if doc.tags:
		header_parts.append(f"Tags: {doc.tags}")
	if doc.language:
		header_parts.append(f"Language: {doc.language}")
	entity_label = _entity_label(doc)
	if entity_label:
		header_parts.append(entity_label)

	body = ""
	if doc.document_type == "PDF":
		body = _extract_pdf_text(doc.file_url)
	elif doc.document_type == "Link":
		header_parts.append(f"Link: {doc.file_url}")

	text = "\n".join(p for p in header_parts if p)
	if body:
		text = f"{text}\n\n{body}"
	return text[:MAX_EXTRACTED_CHARS]


# ── Vectorization job ───────────────────────────────────────────────────


def vectorize_document(document_name):
	"""Extract text and store its embedding on the document.

	Runs in a background job. Results are written with ``db.set_value`` so
	document hooks are not re-triggered.
	"""
	try:
		doc = frappe.get_doc("Cheese Document", document_name)
	except frappe.DoesNotExistError:
		return

	settings = get_embedding_settings()
	if not settings["enabled"]:
		frappe.db.set_value(
			"Cheese Document",
			document_name,
			{"embedding_status": "FAILED", "embedding_error": "Embeddings disabled in Cheese Bot Setting"},
			update_modified=False,
		)
		frappe.db.commit()
		return

	frappe.db.set_value(
		"Cheese Document", document_name, "embedding_status", "PROCESSING", update_modified=False
	)
	frappe.db.commit()

	try:
		text = extract_document_text(doc)
		embedding = generate_embedding(text, settings)
		frappe.db.set_value(
			"Cheese Document",
			document_name,
			{
				"extracted_text": text,
				"embedding_json": json.dumps(embedding),
				"embedding_model": settings["model"],
				"embedding_status": "COMPLETED",
				"embedding_error": "",
			},
			update_modified=False,
		)
		frappe.db.commit()
		frappe.logger().info(f"Vectorized document {document_name} ({len(text)} chars)")
	except Exception as e:
		frappe.db.set_value(
			"Cheese Document",
			document_name,
			{"embedding_status": "FAILED", "embedding_error": str(e)[:500]},
			update_modified=False,
		)
		frappe.db.commit()
		frappe.log_error(f"Vectorization failed for {document_name}: {e}", "Document Embeddings")


def enqueue_vectorize_document(doc, method=None):
	"""Doc-event handler: (re)vectorize on insert and on relevant changes."""
	try:
		if method == "on_update":
			if not any(doc.has_value_changed(f) for f in EMBEDDING_SOURCE_FIELDS):
				return
		frappe.db.set_value(
			"Cheese Document", doc.name, "embedding_status", "PENDING", update_modified=False
		)
		frappe.enqueue(
			"cheese.cheese.utils.document_embeddings.vectorize_document",
			document_name=doc.name,
			queue="long",
			is_async=True,
			enqueue_after_commit=True,
		)
	except Exception as e:
		frappe.log_error(f"Failed to enqueue vectorization for {doc.name}: {e}", "Document Embeddings")


def reindex_pending_documents():
	"""Queue vectorization for every document without a completed embedding."""
	names = frappe.get_all(
		"Cheese Document",
		filters={"embedding_status": ["not in", ["COMPLETED", "PROCESSING"]]},
		pluck="name",
	)
	for name in names:
		frappe.enqueue(
			"cheese.cheese.utils.document_embeddings.vectorize_document",
			document_name=name,
			queue="long",
			is_async=True,
		)
	return len(names)
