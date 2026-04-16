// Copyright (c) 2024
// License: MIT

frappe.ui.form.on('Cheese Ticket', {
	experience: function (frm) {
		// Clear slot when experience changes
		if (frm.doc.experience) {
			frm.set_value('slot', '');
		}
		// Refresh slot field to apply new filter
		frm.refresh_field('slot');
	},

	slot: function (frm) {
		// Validate that slot belongs to selected experience
		if (frm.doc.slot && frm.doc.experience) {
			frappe.db.get_value('Cheese Experience Slot', frm.doc.slot, 'experience')
				.then(r => {
					if (r.message && r.message.experience !== frm.doc.experience) {
						frappe.msgprint(__('Selected slot does not belong to the selected experience.'));
						frm.set_value('slot', '');
					}
				});
		}
	}
});

// Filter slots by experience
frappe.ui.form.on('Cheese Ticket', {
	refresh: function (frm) {
		// Set up get_query for slot field to filter by experience
		frm.set_query('slot', function () {
			let filters = {};

			if (frm.doc.experience) {
				filters['experience'] = frm.doc.experience;
			}

			// Only show OPEN or CLOSED slots (not BLOCKED)
			filters['slot_status'] = ['in', ['OPEN', 'CLOSED']];

			return {
				filters: filters
			};
		});

		if (!frm.is_new() && frm.doc.status !== 'CANCELLED') {
			frm.add_custom_button(__('Create Reservation'), function () {
				frappe.model.open_mapped_doc({
					method: 'cheese.cheese.doctype.cheese_ticket.cheese_ticket.make_route_booking',
					frm: frm
				});
			}, __('Create'));
		}
	}
});
