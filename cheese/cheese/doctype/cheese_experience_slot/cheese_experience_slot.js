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
		add_series_buttons(frm);
	}
});

function update_time_range(frm) {
	let time_from = frm.doc.time_from;
	let time_to = frm.doc.time_to;

	if (time_from && time_to) {
		frm.set_value('time_range', `${time_from} - ${time_to}`);
	} else if (time_from) {
		frm.set_value('time_range', `${time_from} -`);
	} else if (time_to) {
		frm.set_value('time_range', `- ${time_to}`);
	} else {
		frm.set_value('time_range', '');
	}
}

// Issue #260: surface the Google-Calendar-style series operations on the
// standard Frappe form too. Operators who edit slots from the backoffice
// (not the React frontend) need a way to trim or delete an entire recurring
// series without clicking through each occurrence.
function add_series_buttons(frm) {
	if (frm.is_new() || !frm.doc.recurrence_group_id) {
		return;
	}

	frm.add_custom_button(__('Change series end date'), function() {
		frappe.prompt(
			[
				{
					fieldname: 'new_end_date',
					label: __('New series end date'),
					fieldtype: 'Date',
					reqd: 1,
					default: frm.doc.date_from,
					description: __('Slots on or before this date are kept. Slots after it are deleted.'),
				},
			],
			function(values) {
				_call_trim_series(frm, values.new_end_date, false);
			},
			__('Trim recurring series'),
			__('Trim series')
		);
	}, __('Series'));

	frm.add_custom_button(__('Delete entire series'), function() {
		frappe.confirm(
			__('Delete every slot in this series? This cannot be undone.'),
			function() {
				_call_delete_series(frm);
			}
		);
	}, __('Series'));
}

function _call_trim_series(frm, new_end_date, confirm_active_tickets) {
	frappe.call({
		method: 'cheese.api.v1.experience_controller.trim_recurrence_series',
		args: {
			slot_id: frm.doc.name,
			new_end_date: new_end_date,
			confirm_active_tickets: confirm_active_tickets ? 1 : 0,
		},
		callback: function(r) {
			const payload = r?.message?.data || {};
			const removed = payload.trimmed_count || 0;
			frappe.show_alert({
				message: removed
					? __('Series trimmed — removed {0} slot(s)', [removed])
					: __('Series already ends on or before this date'),
				indicator: 'green',
			});
			frm.reload_doc();
		},
		error: function(err) {
			const details = err?._server_messages || err?.responseJSON?.exception || '';
			const confirmed = err?.responseJSON?.data?.confirmed_tickets;
			if (confirmed && confirmed > 0) {
				frappe.confirm(
					__('Trimming the series cancels {0} confirmed reservation(s). Continue?', [confirmed]),
					function() {
						_call_trim_series(frm, new_end_date, true);
					}
				);
				return;
			}
			frappe.msgprint({
				title: __('Failed to trim series'),
				message: details || __('Unknown error'),
				indicator: 'red',
			});
		},
	});
}

function _call_delete_series(frm) {
	frappe.call({
		method: 'cheese.api.v1.experience_controller.delete_time_slot',
		args: {
			slot_id: frm.doc.name,
			scope: 'all',
		},
		callback: function(r) {
			const payload = r?.message?.data || {};
			frappe.show_alert({
				message: __('Deleted {0} slot(s) in series', [payload.deleted_count || 0]),
				indicator: 'green',
			});
			frappe.set_route('List', 'Cheese Experience Slot');
		},
	});
}
