# Copyright (c) 2024
# License: MIT

import click
from frappe.commands import pass_context, get_site
from frappe.exceptions import SiteNotSpecifiedError


@click.command("setup-demo-data")
@click.option("--site", help="Site name")
@pass_context
def setup_demo_data(context, site=None):
	"""Setup demo data for Cheese app"""
	import frappe
	
	site = site or context.sites[0] if context.sites else None
	if not site:
		raise SiteNotSpecifiedError
	
	frappe.init(site=site)
	frappe.connect()
	
	try:
		from cheese.demo import setup_demo_data as setup_demo
		setup_demo()
		frappe.db.commit()
		click.echo("Demo data setup completed successfully!")
	except Exception as e:
		frappe.db.rollback()
		click.echo(f"Error setting up demo data: {str(e)}", err=True)
		raise
	finally:
		frappe.destroy()


@click.command("clear-demo-data")
@click.option("--site", help="Site name")
@pass_context
def clear_demo_data(context, site=None):
	"""Clear demo data for Cheese app"""
	import frappe
	
	site = site or context.sites[0] if context.sites else None
	if not site:
		raise SiteNotSpecifiedError
	
	frappe.init(site=site)
	frappe.connect()
	
	try:
		from cheese.demo import clear_demo_data as clear_demo
		clear_demo()
		frappe.db.commit()
		click.echo("Demo data cleared successfully!")
	except Exception as e:
		frappe.db.rollback()
		click.echo(f"Error clearing demo data: {str(e)}", err=True)
		raise
	finally:
		frappe.destroy()


commands = [
	setup_demo_data,
	clear_demo_data,
]
