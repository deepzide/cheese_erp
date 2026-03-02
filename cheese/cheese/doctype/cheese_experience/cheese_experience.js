// Copyright (c) 2024
// License: MIT

frappe.ui.form.on('Cheese Experience', {
	refresh: function(frm) {
		hide_name_field(frm);
	},
	
	onload: function(frm) {
		hide_name_field(frm);
	}
});

function hide_name_field(frm) {
	// Multiple attempts to hide the name field
	setTimeout(function() {
		// Method 1: Hide via field wrapper
		if (frm.fields_dict.name && frm.fields_dict.name.$wrapper) {
			frm.fields_dict.name.$wrapper.hide();
		}
		
		// Method 2: Hide by data attribute
		frm.$wrapper.find('[data-fieldname="name"]').hide();
		frm.$wrapper.find('[data-fieldname="name"]').closest('.form-group, .form-section, .form-column, .frappe-control').hide();
		
		// Method 3: Hide by label text (Experience Name)
		frm.$wrapper.find('label:contains("Experience Name"), label:contains("Nombre de la Experiencia")').closest('.form-group, .frappe-control').hide();
		
		// Method 4: Hide any input with name="name"
		frm.$wrapper.find('input[name="name"], input[data-fieldname="name"]').closest('.form-group, .frappe-control').hide();
	}, 200);
	
	// Also try after a longer delay in case field renders later
	setTimeout(function() {
		if (frm.fields_dict.name && frm.fields_dict.name.$wrapper) {
			frm.fields_dict.name.$wrapper.hide();
		}
		frm.$wrapper.find('[data-fieldname="name"]').hide();
		frm.$wrapper.find('[data-fieldname="name"]').closest('.form-group, .form-section, .form-column, .frappe-control').hide();
	}, 500);
}
