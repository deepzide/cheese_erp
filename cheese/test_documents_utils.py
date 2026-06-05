# Copyright (c) 2024
# License: MIT

import unittest

import frappe

from cheese.cheese.utils.documents import (
	get_published_documents_grouped,
	resolve_document_url,
	serialize_document_row,
)


class TestCheeseDocuments(unittest.TestCase):
	def test_resolve_document_url_external(self):
		self.assertEqual(
			resolve_document_url("https://example.com/image.png"),
			"https://example.com/image.png",
		)

	def test_resolve_document_url_relative(self):
		self.assertTrue(resolve_document_url("/files/demo.pdf").endswith("/files/demo.pdf"))

	def test_serialize_document_row_includes_url(self):
		row = frappe._dict(
			name="DOC-1",
			title="Brochure",
			file_url="/files/brochure.pdf",
			document_type="PDF",
			tags="brochure",
			language="Spanish",
			version="1.0",
			entity_type="Company",
			entity_id="COMP-1",
		)
		payload = serialize_document_row(row)
		self.assertEqual(payload["document_id"], "DOC-1")
		self.assertEqual(payload["file_url"], payload["url"])
		self.assertTrue(payload["url"].endswith("/files/brochure.pdf"))

	def test_get_published_documents_grouped_empty(self):
		grouped = get_published_documents_grouped([])
		self.assertEqual(grouped["documents"], [])
		self.assertEqual(grouped["photos"], [])
		self.assertEqual(grouped["links"], [])
		self.assertEqual(grouped["pdfs"], [])
