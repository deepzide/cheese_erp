import frappe
from frappe.utils.password import check_password, get_decrypted_password
from cheese.api.common.responses import success, error, validation_error, unauthorized

# Page access keyed by role. Shared between the token and session endpoints.
ROLE_PERMISSION_MAP = {
    "System Manager": ["Dashboard", "Tickets", "Routes", "Experiences", "Calendar", "Contacts", "Leads", "Quotations", "Deposits", "Bookings"],
    "Cheese Manager": ["Dashboard", "Tickets", "Routes", "Experiences", "Calendar", "Contacts", "Leads", "Quotations", "Deposits", "Bookings"],
    "Route Administrator": ["Dashboard", "Tickets", "Routes", "Experiences", "Calendar", "Contacts", "Leads", "Quotations", "Deposits", "Bookings"],
    "Central Admin": ["Dashboard", "Tickets", "Routes", "Experiences", "Calendar", "Contacts", "Leads", "Quotations", "Deposits", "Bookings"],
    "Establishment User": ["Dashboard", "Tickets", "Experiences", "Calendar", "Contacts", "Leads", "Quotations", "Deposits", "Bookings", "Hotels"],
    "Cheese Establishment User": ["Dashboard", "Tickets", "Experiences", "Calendar", "Contacts", "Leads", "Quotations", "Deposits", "Bookings", "Hotels"],
    "Cheese Booking Manager": ["Dashboard", "Tickets", "Experiences", "Calendar", "Contacts", "Leads", "Deposits", "Bookings"],
    "Cheese Booking Agent": ["Dashboard", "Tickets", "Experiences", "Calendar", "Contacts", "Leads", "Deposits", "Bookings"],
}


def _build_auth_payload(username):
    """Build the credential + profile payload returned by the auth endpoints.

    Reuses the existing api_secret when possible so that concurrent sessions
    (multiple tabs / devices) are not invalidated. A new secret is only
    generated when one does not yet exist.
    """
    user_doc = frappe.get_doc("User", username)

    if not user_doc.api_key:
        user_doc.api_key = frappe.generate_hash(length=15)

    api_secret = None
    try:
        api_secret = get_decrypted_password("User", username, "api_secret")
    except Exception:
        pass

    if not api_secret:
        api_secret = frappe.generate_hash(length=15)
        user_doc.api_secret = api_secret

    user_doc.save(ignore_permissions=True)
    frappe.db.commit()

    roles = frappe.get_roles(username)
    permissions = []
    for role in roles:
        if role in ROLE_PERMISSION_MAP:
            permissions.extend(ROLE_PERMISSION_MAP[role])
    permissions = list(dict.fromkeys(permissions))

    return {
        "api_key": user_doc.api_key,
        "api_secret": api_secret,
        "user": username,
        "full_name": user_doc.full_name,
        "email": user_doc.email,
        "permissions": permissions,
        "roles": roles,
    }


@frappe.whitelist(allow_guest=True, methods=["GET", "POST"])
def session():
    """
    GET /auth/session - Resolve the currently logged-in Frappe session user.

    Lets the Cheese SPA reuse the same login as the Frappe desk (/app).
    When the browser already has a valid Frappe session cookie, this returns
    API credentials for that user without requiring a second login.

    Returns:
        Success response with api_key/api_secret/user info when a real user is
        logged in, otherwise a 401 indicating the session is a guest.
    """
    current_user = frappe.session.user

    if not current_user or current_user == "Guest":
        return unauthorized("No active session")

    if not frappe.db.get_value("User", current_user, "enabled"):
        return unauthorized("User account is disabled")

    try:
        payload = _build_auth_payload(current_user)
        return success("Session active", payload)
    except Exception as e:
        frappe.log_error(f"Error in session endpoint: {str(e)}")
        return error("Failed to resolve session", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist(allow_guest=True, methods=["POST"])
def token():
    """
    POST /auth/token - Authenticate and obtain API key/secret.
    
    Reuses existing api_secret when possible so that concurrent sessions
    (multiple tabs / devices) are not invalidated on each login.
    A new secret is only generated when one does not yet exist.
    
    Args:
        grant_type: Must be "password"
        username: User username/email
        password: User password
        
    Returns:
        Success response with api_key, api_secret, user info, and permissions
    """
    data = frappe.form_dict
    grant_type = data.get("grant_type")
    username = data.get("username")
    password = data.get("password")

    if grant_type != "password":
        return validation_error("grant_type must be 'password'")

    if not username or not password:
        return validation_error("username and password are required")

    try:
        check_password(username, password)
    except frappe.AuthenticationError:
        return unauthorized("Invalid credentials")

    if not frappe.db.get_value("User", username, "enabled"):
        return unauthorized("User account is disabled")

    # Normalize to the canonical User name (login may be email or username).
    username = frappe.db.get_value("User", username, "name") or username

    try:
        payload = _build_auth_payload(username)

        # Also establish a real Frappe web session (sets the `sid` cookie) so
        # that logging in through Cheese keeps the Frappe desk (/app) in sync
        # with the same user instead of two independent logins.
        try:
            frappe.local.login_manager.login_as(username)
        except Exception as session_err:
            # Token auth still works even if the cookie session can't be set.
            frappe.log_error(f"Cheese token: could not start web session: {str(session_err)}")

        return success("Authentication successful", payload)
    except Exception as e:
        frappe.log_error(f"Error in token endpoint: {str(e)}")
        return error("Failed to generate API credentials", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist(methods=["POST"])
def logout():
    """
    POST /auth/logout - Regenerate API secret (effectively invalidates current session).
    
    Returns:
        Success response confirming logout
    """
    try:
        if frappe.session.user == "Guest":
            return unauthorized("Not logged in")

        # Clear the Frappe web session (`sid` cookie) so /app logs out too.
        try:
            frappe.local.login_manager.logout(user=frappe.session.user)
            frappe.db.commit()
        except Exception as session_err:
            frappe.log_error(f"Cheese logout: could not clear web session: {str(session_err)}")

        return success("Logged out successfully.")

    except Exception as e:
        frappe.log_error(f"Logout error: {str(e)}")
        return error("Internal server error", "SERVER_ERROR", {"error": str(e)}, 500)
