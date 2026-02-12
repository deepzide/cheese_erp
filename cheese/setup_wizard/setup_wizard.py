# Copyright (c) 2024
# License: MIT

import frappe
from cheese.demo import setup_demo_data


def setup_demo(args):
	"""
	Setup demo data if requested during setup wizard.
	This function is called via the setup_wizard_complete hook.
	
	Args:
		args: Dictionary containing setup wizard form data
			- setup_demo: Boolean indicating if demo data should be created
	"""
	if args.get("setup_demo"):
		# Enqueue as background job to avoid blocking setup wizard
		frappe.enqueue(setup_demo_data, enqueue_after_commit=True, at_front=True)
