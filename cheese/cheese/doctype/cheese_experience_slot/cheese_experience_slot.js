// Copyright (c) 2024
// License: MIT

frappe.ui.form.on('Cheese Experience Slot', {
	time_from: function(frm) {
		update_time_range(frm);
	},

	time_to: function(frm) {
		update_time_range(frm);
	},

	date_from: function(frm) {
		// If date_to is not set or is before date_from, auto-set it
		if (!frm.doc.date_to || frm.doc.date_to < frm.doc.date_from) {
			frm.set_value('date_to', frm.doc.date_from);
		}
	},

	date_to: function(frm) {
		// Validate date_to is not before date_from
		if (frm.doc.date_from && frm.doc.date_to && frm.doc.date_to < frm.doc.date_from) {
			frappe.msgprint(__('Date To cannot be before Date From'));
			frm.set_value('date_to', frm.doc.date_from);
		}
	},

	refresh: function(frm) {
		update_time_range(frm);
	}
});

function update_time_range(frm) {
	let time_from = frm.doc.time_from;
	let time_to = frm.doc.time_to;

	if (time_from && time_to) {
		// Format: "09:00 - 17:00"
		frm.set_value('time_range', `${time_from} - ${time_to}`);
	} else if (time_from) {
		// Only time_from provided
		frm.set_value('time_range', `${time_from} -`);
	} else if (time_to) {
		// Only time_to provided
		frm.set_value('time_range', `- ${time_to}`);
	} else {
		// No time range
		frm.set_value('time_range', '');
	}
}
