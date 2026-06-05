# Copyright (c) 2024
# License: MIT

import frappe
from frappe.utils import get_url


DOCUMENT_LIST_FIELDS = [
	"name",
	"title",
	"file_url",
	"document_type",
	"tags",
	"language",
	"version",
	"entity_type",
	"entity_id",
]


def resolve_document_url(file_url):
	"""Return an absolute URL for stored files and external links."""
	if not file_url:
		return file_url
	if str(file_url).startswith(("http://", "https://")):
		return file_url
	return get_url(file_url)


def serialize_document_row(doc):
	"""Normalize a Cheese Document row for API responses."""
	file_url = resolve_document_url(doc.file_url)
	return {
		"document_id": doc.name,
		"title": doc.title,
		"file_url": file_url,
		"url": file_url,
		"document_type": doc.document_type,
		"tags": doc.tags,
		"language": doc.language,
		"version": doc.version,
		"entity_type": doc.entity_type,
		"entity_id": doc.entity_id,
	}


def get_published_documents_for_entity(entity_type, entity_id):
	"""Fetch published Cheese Document rows for a single entity."""
	if not entity_type or not entity_id:
		return []

	if not frappe.db.exists("DocType", "Cheese Document"):
		return []

	return frappe.get_all(
		"Cheese Document",
		filters={
			"entity_type": entity_type,
			"entity_id": entity_id,
			"status": "PUBLISHED",
		},
		fields=DOCUMENT_LIST_FIELDS,
		order_by="creation asc",
	)


def get_published_documents_grouped(entity_specs):
	"""
	Fetch published documents for multiple entities and group by type.

	Args:
		entity_specs: list of (entity_type, entity_id) tuples

	Returns:
		dict with documents, photos, links, pdfs (each a list, never null)
	"""
	documents = []
	photos = []
	links = []
	pdfs = []
	seen = set()

	for entity_type, entity_id in entity_specs:
		for row in get_published_documents_for_entity(entity_type, entity_id):
			if row.name in seen:
				continue
			seen.add(row.name)

			doc_info = serialize_document_row(row)
			documents.append(doc_info)

			if row.document_type == "Image":
				photos.append(doc_info)
			elif row.document_type == "Link":
				links.append(doc_info)
			elif row.document_type == "PDF":
				pdfs.append(doc_info)

	return {
		"documents": documents,
		"photos": photos,
		"links": links,
		"pdfs": pdfs,
	}
