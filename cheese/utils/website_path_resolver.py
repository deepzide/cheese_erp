"""
Custom website path resolver for Cheese frontend SPA routing
Handles all /cheese/* routes and serves cheese.html
"""
import frappe
from frappe.website.path_resolver import resolve_path


def resolve_cheese_routes(path):
	"""
	Resolve /cheese/* routes to serve the SPA entry point
	
	Args:
		path: The request path (without leading slash)
		
	Returns:
		The resolved endpoint path
	"""
	# Check if path starts with cheese/ (for routes like cheese/dashboard, cheese/login, etc.)
	if path.startswith("cheese/") and path != "cheese.html":
		# For all /cheese/* routes (except cheese.html itself), serve cheese.html
		# Return "cheese" (without .html) as TemplatePage will look for cheese.html
		return "cheese"
	
	# For all other paths, use the default resolver
	return resolve_path(path)
