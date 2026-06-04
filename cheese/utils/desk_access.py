"""Restrict the Frappe desk (/app) so only the Administrator can open it.

Every other authenticated user (e.g. Cheese operators who get a Frappe session
via single sign-on) is redirected to the Cheese SPA at /cheese instead of the
desk. Wired up through the ``before_request`` hook.
"""
import frappe
from werkzeug.routing import RequestRedirect


class _DeskRedirect(RequestRedirect):
    # 302 (not the werkzeug default 308) so browsers never cache the redirect.
    code = 302


def restrict_desk_to_admin():
    request = getattr(frappe.local, "request", None)
    if not request:
        return

    path = request.path or ""
    # Only guard the desk entry point, never the API / assets / cheese routes.
    if path != "/app" and not path.startswith("/app/"):
        return

    user = getattr(frappe.session, "user", None)
    # Guests are handled by Frappe itself (redirect to /login); only block
    # real users who are not the Administrator.
    if not user or user in ("Guest", "Administrator"):
        return

    raise _DeskRedirect("/cheese")
