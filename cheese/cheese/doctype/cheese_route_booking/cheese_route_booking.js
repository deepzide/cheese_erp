// Copyright (c) 2024
// License: MIT

frappe.ui.form.on('Cheese Route Booking', {
    refresh: function (frm) {
        if (!frm.is_new() && frm.doc.status !== 'CANCELLED') {
            frm.add_custom_button(__('Record Deposit'), function () {
                frappe.model.open_mapped_doc({
                    method: 'cheese.cheese.doctype.cheese_route_booking.cheese_route_booking.make_deposit',
                    frm: frm
                });
            }, __('Create'));
        }
    }
});
