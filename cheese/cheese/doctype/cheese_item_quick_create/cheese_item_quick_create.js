// Copyright (c) 2024
// License: MIT

frappe.ui.form.on("Cheese Item Quick Create", {
	refresh: function(frm) {
		// Auto-focus barcode field on new document for mobile scanning
		if (frm.is_new()) {
			setTimeout(() => {
				if (frm.fields_dict.barcode && frm.fields_dict.barcode.$input) {
					frm.fields_dict.barcode.$input.focus();
				}
			}, 100);
		}

		// Show Print Label button after item is created
		if (frm.doc.created_item && !frm.is_new()) {
			frm.add_custom_button(__("Print Label"), function() {
				// Open print dialog for the created item
				frappe.set_route("Form", "Item", frm.doc.created_item);
				frappe.ui.toolbar.clear_cache();
				setTimeout(() => {
					const item_frm = frappe.get_route()[1] === "Item" ? 
						frappe.get_cur_form() : null;
					if (item_frm) {
						item_frm.print_doc();
					} else {
						// Fallback: show message with link
						frappe.msgprint({
							message: __("Item {0} created. You can print the label from the Item form.", [
								`<a href="/app/item/${frm.doc.created_item}">${frm.doc.created_item}</a>`
							]),
							indicator: "green"
						});
					}
				}, 500);
			}, __("Actions"));

			// Add button to open created item
			frm.add_custom_button(__("Open Item"), function() {
				frappe.set_route("Form", "Item", frm.doc.created_item);
			}, __("View"));
		}
	},

	barcode: function(frm) {
		// Validate barcode on change (client-side check for UX)
		if (frm.doc.barcode && frm.is_new()) {
			// Check for duplicate barcode
			frappe.call({
				method: "frappe.client.get_list",
				args: {
					doctype: "Item Barcode",
					filters: {
						barcode: frm.doc.barcode
					},
					fields: ["parent"],
					limit: 1
				},
				callback: function(r) {
					if (r.message && r.message.length > 0) {
						const existing_item = r.message[0].parent;
						frappe.msgprint({
							message: __("Barcode {0} already exists for Item {1}", [
								frappe.bold(frm.doc.barcode),
								`<a href="/app/item/${existing_item}">${existing_item}</a>`
							]),
							indicator: "orange",
							title: __("Duplicate Barcode")
						});
					}
				}
			});
		}
	},

	onload: function(frm) {
		// Handle barcode scanner input (typically ends with Enter key)
		// Wait for fields to be rendered
		setTimeout(() => {
			if (frm.fields_dict.barcode && frm.fields_dict.barcode.$input) {
				frm.fields_dict.barcode.$input.on("keypress", function(e) {
					// If Enter is pressed in barcode field, move to next field
					if (e.which === 13) {
						e.preventDefault();
						if (frm.fields_dict.item_name && frm.fields_dict.item_name.$input) {
							frm.fields_dict.item_name.$input.focus();
						}
					}
				});
			}
		}, 100);
	}
});
