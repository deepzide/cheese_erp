// Copyright (c) 2024
// License: MIT

frappe.ui.form.on('Cheese Experience Slot', {
	time_from: function(frm) {
		update_time_range(frm);
	},
	
	time_to: function(frm) {
		update_time_range(frm);
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
