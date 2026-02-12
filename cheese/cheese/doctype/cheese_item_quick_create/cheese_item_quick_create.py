# Copyright (c) 2024
# License: MIT

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import cint
import re


class CheeseItemQuickCreate(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		barcode: DF.Data
		brand: DF.Link | None
		condition: DF.Literal["", "NEW", "USED", "REFURBISHED", "DAMAGED", "FOR_PARTS"]
		created_item: DF.Link | None
		item_code: DF.Data | None
		item_group: DF.Link
		item_name: DF.Data
	# end: auto-generated types

	def validate(self):
		"""Validate barcode uniqueness and required fields"""
		# Validate required fields
		if not self.barcode:
			frappe.throw(_("Barcode is required"))
		
		if not self.item_name:
			frappe.throw(_("Item Name is required"))
		
		if not self.item_group:
			frappe.throw(_("Item Group (Category) is required"))
		
		if not self.condition:
			frappe.throw(_("Condition is required"))
		
		# Check barcode uniqueness globally (across all companies)
		self.validate_barcode_uniqueness()
		
		# Auto-generate item_code if not set
		if not self.item_code:
			self.generate_item_code()

	def validate_barcode_uniqueness(self):
		"""Check if barcode already exists in Item Barcode table"""
		# Check if barcode exists in Item Barcode child table
		existing_barcode = frappe.db.get_value(
			"Item Barcode",
			{"barcode": self.barcode},
			["name", "parent"],
			as_dict=True
		)
		
		if existing_barcode:
			# If this is an update and the barcode hasn't changed, allow it
			if not self.is_new():
				old_barcode = frappe.db.get_value(
					"Cheese Item Quick Create", self.name, "barcode"
				)
				if self.barcode == old_barcode:
					return
			
			frappe.throw(
				_("Barcode {0} already exists for Item {1}").format(
					frappe.bold(self.barcode),
					frappe.bold(existing_barcode.parent)
				),
				title=_("Duplicate Barcode"),
				exc=frappe.DuplicateEntryError
			)

	def generate_item_code(self):
		"""Auto-generate item code based on barcode or hash"""
		# Clean barcode for use in item code
		# Remove special characters, keep alphanumeric
		clean_barcode = re.sub(r'[^a-zA-Z0-9]', '', self.barcode)
		
		# If barcode is suitable (alphanumeric, reasonable length), use it
		if clean_barcode and len(clean_barcode) <= 20 and len(clean_barcode) >= 3:
			# Check if item code already exists
			base_code = f"ITEM-{clean_barcode.upper()}"
			if not frappe.db.exists("Item", base_code):
				self.item_code = base_code
			else:
				# Append number if exists
				counter = 1
				while frappe.db.exists("Item", f"{base_code}-{counter}"):
					counter += 1
				self.item_code = f"{base_code}-{counter}"
		else:
			# Use hash-based naming if barcode is not suitable
			# Generate a short hash from barcode
			import hashlib
			hash_suffix = hashlib.md5(self.barcode.encode()).hexdigest()[:8].upper()
			base_code = f"ITEM-{hash_suffix}"
			
			# Check if exists and append number if needed
			if not frappe.db.exists("Item", base_code):
				self.item_code = base_code
			else:
				counter = 1
				while frappe.db.exists("Item", f"{base_code}-{counter}"):
					counter += 1
				self.item_code = f"{base_code}-{counter}"

	def after_insert(self):
		"""Create ERPNext Item and Item Barcode after saving"""
		try:
			# Create Item document
			item = frappe.new_doc("Item")
			item.item_code = self.item_code
			item.item_name = self.item_name
			item.item_group = self.item_group
			item.is_stock_item = 1
			item.stock_uom = "Nos"  # Default UOM
			
			# Optional fields
			if self.brand:
				item.brand = self.brand
			
			# Set description
			item.description = self.item_name
			
			# Insert the item
			item.insert(ignore_permissions=False)
			
			# Create Item Barcode child record
			barcode_doc = frappe.new_doc("Item Barcode")
			barcode_doc.parent = item.name
			barcode_doc.parenttype = "Item"
			barcode_doc.parentfield = "barcodes"
			barcode_doc.barcode = self.barcode
			barcode_doc.barcode_type = ""  # Auto-detect or leave empty
			barcode_doc.insert(ignore_permissions=False)
			
			# Update this document with created item reference
			self.created_item = item.name
			self.db_update()
			
			frappe.db.commit()
			
			frappe.msgprint(
				_("Item {0} created successfully with barcode {1}").format(
					frappe.bold(item.name),
					frappe.bold(self.barcode)
				),
				title=_("Success"),
				indicator="green"
			)
			
		except Exception as e:
			frappe.db.rollback()
			frappe.log_error(
				message=f"Error creating Item from Cheese Item Quick Create: {str(e)}",
				title="Item Creation Error"
			)
			frappe.throw(
				_("Failed to create Item: {0}").format(str(e)),
				title=_("Error")
			)
