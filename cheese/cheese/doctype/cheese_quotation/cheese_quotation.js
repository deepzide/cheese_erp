// Copyright (c) 2024
// License: MIT

frappe.ui.form.on('Cheese Quotation', {
	refresh: function (frm) {
		// Filter routes to show only ONLINE routes
		frm.set_query('route', function () {
			return {
				filters: {
					'status': 'ONLINE'
				}
			};
		});

		// Filter experiences in the child table
		frm.set_query('experience', 'experiences', function () {
			return {
				filters: {
					'status': 'ONLINE'
				}
			};
		});

		if (!frm.is_new() && frm.doc.status === 'ACCEPTED') {
			frm.add_custom_button(__('Create Tickets'), function () {
				frappe.call({
					method: 'cheese.cheese.doctype.cheese_quotation.cheese_quotation.make_tickets',
					args: {
						source_name: frm.doc.name
					},
					callback: function (r) {
						if (!r.exc && r.message) {
							frappe.msgprint(__('Successfully created {0} Tickets.', [r.message.length]));
							// Optionally, route to ticket list
							frappe.set_route('List', 'Cheese Ticket', { quotation: frm.doc.name });
						}
					}
				});
			}, __('Create'));
		}
	},

	route: function (frm) {
		// When route is selected, optionally populate experiences from route
		if (frm.doc.route && frm.doc.experiences.length === 0) {
			frappe.db.get_doc('Cheese Route', frm.doc.route)
				.then(route => {
					// Clear existing experiences
					frm.clear_table('experiences');

					// Add experiences from route
					route.experiences.forEach((exp_row, idx) => {
						let row = frm.add_child('experiences');
						row.experience = exp_row.experience;
						row.sequence = exp_row.sequence || (idx + 1);
					});

					frm.refresh_field('experiences');
				});
		}
	}
});

// Handle experience selection in child table
frappe.ui.form.on('Cheese Quotation Experience', {
	experience: function (frm, cdt, cdn) {
		let row = locals[cdt][cdn];
		if (row.experience) {
			// Filter slots for this experience
			frappe.db.get_value('Cheese Experience', row.experience, 'name')
				.then(r => {
					if (r.message) {
						// Set query for slot field to filter by experience
						frm.set_query('slot', 'experiences', function (doc, cdt, cdn) {
							let row = locals[cdt][cdn];
							return {
								filters: {
									'experience': row.experience,
									'slot_status': ['in', ['OPEN', 'CLOSED']]
								}
							};
						});
					}
				});
		}
	}
});
