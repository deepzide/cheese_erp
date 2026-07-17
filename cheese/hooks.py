app_name = "cheese"
app_title = "Cheese"
app_publisher = "itsyosefali"
app_description = "cheese_erp"
app_email = "joeyxjoey123@gmail.com"
app_license = "mit"

# Apps
# ------------------

# required_apps = []

# Each item in the list will be shown as an app in the apps page
# add_to_apps_screen = [
# 	{
# 		"name": "cheese",
# 		"logo": "/assets/cheese/logo.png",
# 		"title": "Cheese",
# 		"route": "/cheese",
# 		"has_permission": "cheese.api.permission.has_app_permission"
# 	}
# ]

# Includes in <head>
# ------------------

# include js, css files in header of desk.html
# app_include_css = "/assets/cheese/css/cheese.css"
# app_include_js = "/assets/cheese/js/cheese.js"

# include js, css files in header of web template
# web_include_css = "/assets/cheese/css/cheese.css"
# web_include_js = "/assets/cheese/js/cheese.js"

# include custom scss in every website theme (without file extension ".scss")
# website_theme_scss = "cheese/public/scss/website"

# include js, css files in header of web form
# webform_include_js = {"doctype": "public/js/doctype.js"}
# webform_include_css = {"doctype": "public/css/doctype.css"}

# include js in page
# page_js = {"page" : "public/js/file.js"}

# include js in doctype views
# doctype_js = {"doctype" : "public/js/doctype.js"}
# doctype_list_js = {"doctype" : "public/js/doctype_list.js"}
# doctype_tree_js = {"doctype" : "public/js/doctype_tree.js"}
# doctype_calendar_js = {"doctype" : "public/js/doctype_calendar.js"}

# Svg Icons
# ------------------
# include app icons in desk
# app_include_icons = "cheese/public/icons.svg"

# Home Pages
# ----------

# application home page (will override Website Settings)
# home_page = "login"

# website user home page (by Role)
# role_home_page = {
# 	"Role": "home_page"
# }

# Generators
# ----------

# automatically create page for each record of this doctype
# website_generators = ["Web Page"]

# Jinja
# ----------

# add methods and filters to jinja environment
# jinja = {
# 	"methods": "cheese.utils.jinja_methods",
# 	"filters": "cheese.utils.jinja_filters"
# }

# Installation
# ------------

# before_install = "cheese.install.before_install"
after_install = "cheese.install.after_install"

# Uninstallation
# ------------

# before_uninstall = "cheese.uninstall.before_uninstall"
# after_uninstall = "cheese.uninstall.after_uninstall"

# Integration Setup
# ------------------
# To set up dependencies/integrations with other apps
# Name of the app being installed is passed as an argument

# before_app_install = "cheese.utils.before_app_install"
# after_app_install = "cheese.utils.after_app_install"

# Integration Cleanup
# -------------------
# To clean up dependencies/integrations with other apps
# Name of the app being uninstalled is passed as an argument

# before_app_uninstall = "cheese.utils.before_app_uninstall"
# after_app_uninstall = "cheese.utils.after_app_uninstall"

# Desk Notifications
# ------------------
# See frappe.core.notifications.get_notification_config

# notification_config = "cheese.notifications.get_notification_config"

# Permissions
# -----------
# Multi-tenant scoping: Route Administrator (super admin) sees every establishment's
# data; Establishment Users see only documents whose `company` matches one of the
# Companies assigned to them via Frappe's standard User Permission rows.
# See cheese/cheese/utils/permissions.py for details.

permission_query_conditions = {
	"Cheese Ticket": "cheese.cheese.utils.permissions.cheese_ticket_query",
	"Cheese Experience": "cheese.cheese.utils.permissions.cheese_experience_query",
	"Cheese Experience Slot": "cheese.cheese.utils.permissions.cheese_experience_slot_query",
	"Cheese Booking Policy": "cheese.cheese.utils.permissions.cheese_booking_policy_query",
	"Cheese Survey Response": "cheese.cheese.utils.permissions.cheese_survey_response_query",
	"Cheese Support Case": "cheese.cheese.utils.permissions.cheese_support_case_query",
	"Conversation": "cheese.cheese.utils.permissions.conversation_query",
	"Cheese Attendance": "cheese.cheese.utils.permissions.cheese_attendance_query",
	"Cheese QR Token": "cheese.cheese.utils.permissions.cheese_qr_token_query",
	"Cheese Bank Account": "cheese.cheese.utils.permissions.cheese_bank_account_query",
	"Cheese Document": "cheese.cheese.utils.permissions.cheese_document_query",
	"Cheese Route Booking": "cheese.cheese.utils.permissions.cheese_route_booking_query",
	"Cheese Contact": "cheese.cheese.utils.permissions.cheese_contact_query",
	"Cheese Lead": "cheese.cheese.utils.permissions.cheese_lead_query",
	"Company": "cheese.cheese.utils.permissions.company_query",
	"Cheese Route": "cheese.cheese.utils.permissions.cheese_route_query",
	"Cheese Quotation": "cheese.cheese.utils.permissions.cheese_quotation_query",
	"Cheese Deposit": "cheese.cheese.utils.permissions.cheese_deposit_query",
	"Cheese Message": "cheese.cheese.utils.permissions.cheese_message_query",
	"Cheese Complaint": "cheese.cheese.utils.permissions.cheese_complaint_query",
	"Cheese System Event": "cheese.cheese.utils.permissions.cheese_system_event_query",
	"Cheese Route Experience": "cheese.cheese.utils.permissions.cheese_route_experience_query",
	"Cheese Quotation Experience": "cheese.cheese.utils.permissions.cheese_quotation_experience_query",
	"Cheese Season": "cheese.cheese.utils.permissions.cheese_season_query",
	"Cheese Promotion": "cheese.cheese.utils.permissions.cheese_promotion_query",
	"Cheese Age Group": "cheese.cheese.utils.permissions.cheese_age_group_query",
}

has_permission = {
	"Cheese Ticket": "cheese.cheese.utils.permissions.has_company_permission",
	"Cheese Experience": "cheese.cheese.utils.permissions.has_company_permission",
	"Cheese Experience Slot": "cheese.cheese.utils.permissions.has_company_permission",
	"Cheese Booking Policy": "cheese.cheese.utils.permissions.has_company_permission",
	"Cheese Survey Response": "cheese.cheese.utils.permissions.has_company_permission",
	"Cheese Support Case": "cheese.cheese.utils.permissions.has_company_permission",
	"Conversation": "cheese.cheese.utils.permissions.has_conversation_permission",
	"Cheese Attendance": "cheese.cheese.utils.permissions.has_company_permission",
	"Cheese QR Token": "cheese.cheese.utils.permissions.has_company_permission",
	"Cheese Bank Account": "cheese.cheese.utils.permissions.has_bank_account_permission",
	"Cheese Document": "cheese.cheese.utils.permissions.has_document_permission",
	"Cheese Route Booking": "cheese.cheese.utils.permissions.has_route_booking_permission",
	"Cheese Contact": "cheese.cheese.utils.permissions.has_contact_permission",
	"Cheese Contact Company": "cheese.cheese.utils.permissions.has_contact_company_permission",
	"Cheese Lead": "cheese.cheese.utils.permissions.has_lead_permission",
	"Cheese Lead Company": "cheese.cheese.utils.permissions.has_lead_company_permission",
	"Company": "cheese.cheese.utils.permissions.has_company_doc_permission",
	"Cheese Route": "cheese.cheese.utils.permissions.has_route_permission",
	"Cheese Quotation": "cheese.cheese.utils.permissions.has_company_permission",
	"Cheese Deposit": "cheese.cheese.utils.permissions.has_deposit_permission",
	"Cheese Message": "cheese.cheese.utils.permissions.has_message_permission",
	"Cheese Complaint": "cheese.cheese.utils.permissions.has_complaint_permission",
	"Cheese System Event": "cheese.cheese.utils.permissions.has_system_event_permission",
	"Cheese Route Experience": "cheese.cheese.utils.permissions.has_route_experience_permission",
	"Cheese Quotation Experience": "cheese.cheese.utils.permissions.has_quotation_experience_permission",
	"Cheese Season": "cheese.cheese.utils.permissions.has_company_permission",
	"Cheese Promotion": "cheese.cheese.utils.permissions.has_company_permission",
	"Cheese Age Group": "cheese.cheese.utils.permissions.has_company_permission",
}

# DocType Class
# ---------------
# Override standard doctype classes

# override_doctype_class = {
# 	"ToDo": "custom_app.overrides.CustomToDo"
# }

# Document Events
# ---------------
# Hook on document methods and events

doc_events = {
	"Cheese Ticket": {
		"validate": "cheese.cheese.utils.events.set_ticket_company",
		"on_update": "cheese.cheese.utils.events.update_route_booking_status",
		"after_insert": [
			"cheese.cheese.utils.lead_automation.on_ticket_insert",
			"cheese.cheese.utils.events.on_ticket_created_notify_establishment",
			"cheese.cheese.utils.events.link_contact_to_ticket_company",
		],
	},
	"Conversation": {
		"on_update": "cheese.cheese.utils.lead_automation.on_conversation_update",
		"after_insert": "cheese.cheese.utils.lead_automation.on_conversation_update",
	},
	"Cheese Experience Slot": {
		"validate": "cheese.cheese.utils.events.set_slot_company",
	},
	"Cheese Attendance": {
		"validate": "cheese.cheese.utils.events.set_attendance_company",
	},
	"Cheese QR Token": {
		"validate": "cheese.cheese.utils.events.set_qr_token_company",
	},
	"Cheese Booking Policy": {
		"validate": "cheese.cheese.utils.events.set_booking_policy_company",
	},
	"Cheese Lead": {
		"validate": "cheese.cheese.utils.events.set_lead_company",
	},
	"Cheese Deposit": {
		"on_update": "cheese.cheese.utils.qr_on_payment.on_deposit_paid",
	},
	"Cheese Document": {
		# Fires on insert too; the handler skips saves that don't touch
		# embedding source fields (title, tags, file_url, ...)
		"on_update": "cheese.cheese.utils.document_embeddings.enqueue_vectorize_document",
	},
}

# Scheduled Tasks
# ---------------

scheduler_events = {
	"cron": {
		"0/15 * * * *": [
			"cheese.cheese.scheduler.expiration.expire_pending_tickets",
			"cheese.cheese.scheduler.deposit_overdue.process_overdue_deposits",
			"cheese.cheese.scheduler.completion.auto_complete_checked_in_tickets",
		],
	},
	"hourly": [
		"cheese.cheese.scheduler.no_show.process_no_shows",
		"cheese.cheese.scheduler.deposit_reminders.send_deposit_reminders",
	],
	"daily": [
		"cheese.cheese.utils.currency_rates.sync_exchange_rates",
		"cheese.cheese.scheduler.survey.send_post_completion_surveys",
		"cheese.cheese.scheduler.survey.create_support_cases_for_low_ratings",
	],
}

# Testing
# -------

# before_tests = "cheese.install.before_tests"

# Overriding Methods
# ------------------------------
#
# override_whitelisted_methods = {
# 	"frappe.desk.doctype.event.event.get_events": "cheese.event.get_events"
# }
#
# each overriding function accepts a `data` argument;
# generated from the base implementation of the doctype dashboard,
# along with any modifications made in other Frappe apps
# override_doctype_dashboards = {
# 	"Task": "cheese.task.get_dashboard_data"
# }

# exempt linked doctypes from being automatically cancelled
#
# auto_cancel_exempted_doctypes = ["Auto Repeat"]

# Ignore links to specified DocTypes when deleting documents
# -----------------------------------------------------------

# ignore_links_on_delete = ["Communication", "ToDo"]

# Request Events
# ----------------
# Restrict the Frappe desk (/app) to the Administrator only; everyone else is
# redirected to the Cheese SPA.
before_request = ["cheese.utils.desk_access.restrict_desk_to_admin"]
# after_request = ["cheese.utils.after_request"]

# Website Path Resolver
# ---------------------
# Custom path resolver for SPA routing
website_path_resolver = ["cheese.utils.website_path_resolver.resolve_cheese_routes"]

# Job Events
# ----------
# before_job = ["cheese.utils.before_job"]
# after_job = ["cheese.utils.after_job"]

# User Data Protection
# --------------------

# user_data_fields = [
# 	{
# 		"doctype": "{doctype_1}",
# 		"filter_by": "{filter_by}",
# 		"redact_fields": ["{field_1}", "{field_2}"],
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_2}",
# 		"filter_by": "{filter_by}",
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_3}",
# 		"strict": False,
# 	},
# 	{
# 		"doctype": "{doctype_4}"
# 	}
# ]

# Authentication and authorization
# --------------------------------

# auth_hooks = [
# 	"cheese.auth.validate"
# ]

# Automatically update python controller files with type annotations for this app.
# export_python_type_annotations = True

# default_log_clearing_doctypes = {
# 	"Logging DocType Name": 30  # days to retain logs
# }

# Demo Data
# ----------
# Define which doctypes are master data and which are transactions for demo data setup

demo_master_doctypes = [
	"cheese_contact",
	"cheese_experience",
	"cheese_experience_slot",
	"cheese_route",
	"cheese_booking_policy",
]

demo_transaction_doctypes = [
	"cheese_ticket",
	"cheese_quotation",
	"cheese_lead",
	"cheese_deposit",
]

# Setup Wizard Integration
# ------------------------
# Uncomment the line below to enable demo data creation during setup wizard
# setup_wizard_complete = "cheese.setup_wizard.setup_wizard.setup_demo"
