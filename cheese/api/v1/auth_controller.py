import frappe
from frappe.utils.password import check_password
from cheese.api.common.responses import success, error, validation_error, unauthorized

@frappe.whitelist(allow_guest=True, methods=["POST"])
def token():
    """
    POST /auth/token - Authenticate and obtain API key/secret.
    
    If API key/secret don't exist, they will be created.
    On each login, a new API secret is generated and returned.
    
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
        # Authenticate user
        check_password(username, password)
    except frappe.AuthenticationError:
        return unauthorized("Invalid credentials")

    if not frappe.db.get_value("User", username, "enabled"):
        return unauthorized("User account is disabled")

    try:
        # Get or generate API key and secret
        user_doc = frappe.get_doc("User", username)
        
        # Generate API key if not exists
        if not user_doc.api_key:
            user_doc.api_key = frappe.generate_hash(length=15)
        
        # Always generate a new API secret on login to return the clear text version
        api_secret = frappe.generate_hash(length=15)
        user_doc.api_secret = api_secret
        
        user_doc.save(ignore_permissions=True)
        frappe.db.commit()
        
        api_key = user_doc.api_key

        # Get user permissions
        roles = frappe.get_roles(username)
        permissions = []
        
        role_permission_map = {
            "System Manager": ["Dashboard", "Tickets", "Routes", "Experiences", "Calendar", "Contacts", "Leads", "Quotations", "Deposits", "Bookings"],
            "Cheese Manager": ["Dashboard", "Tickets", "Routes", "Experiences", "Calendar", "Contacts", "Leads", "Quotations", "Deposits", "Bookings"],
        }
        for role in roles:
            if role in role_permission_map:
                permissions.extend(role_permission_map[role])
        permissions = list(dict.fromkeys(permissions))

        return success(
            "Authentication successful",
            {
                "api_key": api_key,
                "api_secret": api_secret,
                "user": username,
                "full_name": user_doc.full_name,
                "email": user_doc.email,
                "permissions": permissions,
            }
        )
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
            
        user_doc = frappe.get_doc("User", frappe.session.user)
        
        # Generate new API secret to invalidate the current one
        user_doc.api_secret = frappe.generate_hash(length=15)
        user_doc.save(ignore_permissions=True)
        frappe.db.commit()
        
        return success("Logged out successfully. API secret has been regenerated.")

    except Exception as e:
        frappe.log_error(f"Logout error: {str(e)}")
        return error("Internal server error", "SERVER_ERROR", {"error": str(e)}, 500)
