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
import re

import frappe

OPENAI_EMBEDDINGS_URL = "https://api.openai.com/v1/embeddings"
OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions"
DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_REQUEST_TIMEOUT = 30
# text-embedding-3-* accept up to 8191 tokens; ~4 chars/token keeps us safe.
MAX_EMBED_CHARS = 20000
MAX_EXTRACTED_CHARS = 100000
MAX_PDF_PAGES = 50
REMOTE_DOWNLOAD_TIMEOUT = 30
MAX_REMOTE_DOWNLOAD_BYTES = 20 * 1024 * 1024  # 20 MB

# Vision extraction for Image documents (same OpenAI key as embeddings)
DEFAULT_VISION_MODEL = "gpt-4o-mini"
VISION_REQUEST_TIMEOUT = 60
VISION_MAX_TOKENS = 1200
MAX_VISION_IMAGE_BYTES = 15 * 1024 * 1024  # 15 MB
VISION_PROMPT = (
	"This image is a document uploaded by a tourism establishment (typically a menu, "
	"gastronomic offer, flyer, price list, schedule or poster). First transcribe ALL "
	"visible text exactly as written — names, dishes, prices, dates, schedules, contact "
	"info. Then add a short paragraph describing what the image shows. Reply in the "
	"language that predominates in the image. If the image contains no readable text, "
	"just describe its content."
)

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


def _pdf_to_text(source):
	"""Extract text from a PDF given a file path or a bytes buffer."""
	try:
		from pypdf import PdfReader
	except ImportError:
		from PyPDF2 import PdfReader

	if isinstance(source, bytes):
		import io

		source = io.BytesIO(source)

	reader = PdfReader(source)
	parts = []
	for page in reader.pages[:MAX_PDF_PAGES]:
		try:
			parts.append(page.extract_text() or "")
		except Exception:
			continue
	return "\n".join(parts).strip()


def _extract_pdf_text(file_url):
	"""Extract text from a locally stored PDF. Returns '' when unavailable."""
	import os

	path = _resolve_local_file_path(file_url)
	if not path or not os.path.exists(path):
		return ""

	try:
		return _pdf_to_text(path)
	except Exception as e:
		frappe.log_error(f"PDF text extraction failed for {file_url}: {e}", "Document Embeddings")
		return ""


# ── Remote content (public Google Drive files, external PDFs) ───────────


def _extract_drive_file_id(url):
	"""Return the file id from any common Google Drive / Docs URL shape."""
	for pattern in (r"/file/d/([\w-]{10,})", r"/document/d/([\w-]{10,})", r"[?&]id=([\w-]{10,})"):
		match = re.search(pattern, url or "")
		if match:
			return match.group(1)
	return None


def _is_google_drive_url(url):
	host = (url or "").lower()
	return "drive.google.com" in host or "docs.google.com" in host or "drive.usercontent.google.com" in host


def _download_capped(url):
	"""GET a URL streaming at most MAX_REMOTE_DOWNLOAD_BYTES. Returns (bytes, content_type)."""
	import requests

	resp = requests.get(url, timeout=REMOTE_DOWNLOAD_TIMEOUT, stream=True, allow_redirects=True)
	resp.raise_for_status()
	chunks = []
	total = 0
	for chunk in resp.iter_content(chunk_size=65536):
		chunks.append(chunk)
		total += len(chunk)
		if total > MAX_REMOTE_DOWNLOAD_BYTES:
			break
	return b"".join(chunks), (resp.headers.get("Content-Type") or "").lower()


def _bytes_to_text(data, content_type):
	"""Turn downloaded bytes into text: PDF via pypdf, otherwise plain text."""
	if data[:5] == b"%PDF-":
		try:
			return _pdf_to_text(data)
		except Exception:
			return ""
	if "text/html" in content_type or data[:15].lstrip().lower().startswith((b"<!doctype", b"<html")):
		# HTML means a viewer/interstitial page, not the file content
		return ""
	if "text/" in content_type or "json" in content_type:
		try:
			return data.decode("utf-8", errors="ignore").strip()
		except Exception:
			return ""
	return ""


def _extract_google_drive_text(url):
	"""Download a *public* Google Drive / Docs file and extract its text."""
	file_id = _extract_drive_file_id(url)
	if not file_id:
		return ""

	if "docs.google.com/document" in (url or "").lower():
		candidates = [f"https://docs.google.com/document/d/{file_id}/export?format=txt"]
	else:
		# usercontent host first: skips the "can't scan for viruses" interstitial
		candidates = [
			f"https://drive.usercontent.google.com/download?id={file_id}&export=download&confirm=t",
			f"https://drive.google.com/uc?export=download&confirm=t&id={file_id}",
		]

	for candidate in candidates:
		try:
			data, content_type = _download_capped(candidate)
		except Exception:
			continue
		text = _bytes_to_text(data, content_type)
		if text:
			return text
	return ""


def _extract_remote_text(url):
	"""Extract text from an external URL: Google Drive aware, PDFs and plain text."""
	try:
		if _is_google_drive_url(url):
			return _extract_google_drive_text(url)
		data, content_type = _download_capped(url)
		return _bytes_to_text(data, content_type)
	except Exception as e:
		frappe.log_error(f"Remote text extraction failed for {url}: {e}", "Document Embeddings")
		return ""


# ── Image content extraction (vision model) ─────────────────────────────


def _image_mime(file_url, data=b""):
	"""Detect the image MIME type from magic bytes, falling back to the extension."""
	if data[:8] == b"\x89PNG\r\n\x1a\n":
		return "image/png"
	if data[:3] == b"\xff\xd8\xff":
		return "image/jpeg"
	if data[:6] in (b"GIF87a", b"GIF89a"):
		return "image/gif"
	if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
		return "image/webp"
	ext = (file_url or "").lower().rsplit(".", 1)[-1]
	return {
		"png": "image/png",
		"jpg": "image/jpeg",
		"jpeg": "image/jpeg",
		"gif": "image/gif",
		"webp": "image/webp",
	}.get(ext, "image/jpeg")


def _load_document_image_bytes(file_url):
	"""Raw bytes of an Image document: local upload, external URL or public Drive."""
	import os

	if (file_url or "").lower().startswith(("http://", "https://")):
		if _is_google_drive_url(file_url):
			file_id = _extract_drive_file_id(file_url)
			if not file_id:
				return b""
			candidates = [
				f"https://drive.usercontent.google.com/download?id={file_id}&export=download&confirm=t",
				f"https://drive.google.com/uc?export=download&confirm=t&id={file_id}",
			]
			for candidate in candidates:
				try:
					data, content_type = _download_capped(candidate)
				except Exception:
					continue
				if data and "text/html" not in content_type:
					return data
			return b""
		try:
			data, content_type = _download_capped(file_url)
		except Exception:
			return b""
		return b"" if "text/html" in content_type else data

	path = _resolve_local_file_path(file_url)
	if not path or not os.path.exists(path):
		return b""
	with open(path, "rb") as f:
		return f.read()


def _extract_image_text(doc, settings=None):
	"""Transcribe and describe an Image document with the OpenAI vision model.

	Runs BEFORE embedding so the image's real content (menu items, prices,
	schedules, ...) becomes searchable instead of just title/tags. Returns
	'' on any failure so vectorization falls back to metadata-only.
	"""
	settings = settings or get_embedding_settings()
	if not settings.get("api_key"):
		return ""

	try:
		data = _load_document_image_bytes(doc.file_url)
		if not data:
			return ""
		if len(data) > MAX_VISION_IMAGE_BYTES:
			frappe.logger().info(
				f"Skipping vision extraction for {doc.name}: image exceeds {MAX_VISION_IMAGE_BYTES} bytes"
			)
			return ""

		import base64

		import requests

		data_uri = f"data:{_image_mime(doc.file_url, data)};base64,{base64.b64encode(data).decode()}"
		resp = requests.post(
			OPENAI_CHAT_COMPLETIONS_URL,
			headers={
				"Authorization": f"Bearer {settings['api_key']}",
				"Content-Type": "application/json",
			},
			json={
				"model": DEFAULT_VISION_MODEL,
				"messages": [
					{
						"role": "user",
						"content": [
							{"type": "text", "text": VISION_PROMPT},
							{"type": "image_url", "image_url": {"url": data_uri}},
						],
					}
				],
				"max_tokens": VISION_MAX_TOKENS,
				"temperature": 0,
			},
			timeout=VISION_REQUEST_TIMEOUT,
		)
		if not resp.ok:
			frappe.log_error(
				f"Vision API error HTTP {resp.status_code} for {doc.name}: {resp.text[:300]}",
				"Document Embeddings",
			)
			return ""
		return (resp.json()["choices"][0]["message"]["content"] or "").strip()
	except Exception as e:
		frappe.log_error(f"Image content extraction failed for {doc.name}: {e}", "Document Embeddings")
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
	is_remote = (doc.file_url or "").lower().startswith(("http://", "https://"))
	if doc.document_type == "PDF":
		body = _extract_remote_text(doc.file_url) if is_remote else _extract_pdf_text(doc.file_url)
	elif doc.document_type == "Image":
		# A vision model transcribes/describes the image before embedding so
		# its real content (menu items, prices, schedules) is searchable.
		body = _extract_image_text(doc)
	elif doc.document_type == "Link":
		header_parts.append(f"Link: {doc.file_url}")
		if is_remote:
			# Public Google Drive files (and direct PDF/text links) contribute
			# their real content to the embedding, not just the URL.
			body = _extract_remote_text(doc.file_url)

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
