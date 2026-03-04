import frappe
from frappe.utils.password import check_password

@frappe.whitelist(allow_guest=True, methods=["POST"])
def token():
    """POST /auth/token - Authenticate and obtain API key/secret."""
    data = frappe.form_dict
    grant_type = data.get("grant_type")
    username = data.get("username")
    password = data.get("password")

    if grant_type != "password":
        frappe.local.response["http_status_code"] = 400
        return {"message": "grant_type must be 'password'", "status": "error"}

    if not username or not password:
        frappe.local.response["http_status_code"] = 400
        return {"message": "username and password are required", "status": "error"}

    try:
        # Authenticate user
        check_password(username, password)
    except frappe.AuthenticationError:
        frappe.local.response["http_status_code"] = 401
        return {"message": "Invalid credentials", "status": "error"}

    if not frappe.db.get_value("User", username, "enabled"):
        frappe.local.response["http_status_code"] = 401
        return {"message": "User disabled", "status": "error"}

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

    return {
        "api_key": api_key,
        "api_secret": api_secret,
        "user": username,
        "full_name": user_doc.full_name,
        "email": user_doc.email,
        "permissions": permissions,
    }


@frappe.whitelist(methods=["POST"])
def logout():
    """POST /auth/logout - Regenerate API secret (effectively invalidates current session)."""
    try:
        if frappe.session.user == "Guest":
            frappe.local.response["http_status_code"] = 401
            return {"message": "Not logged in", "status": "error"}
            
        user_doc = frappe.get_doc("User", frappe.session.user)
        
        # Generate new API secret to invalidate the current one
        user_doc.api_secret = frappe.generate_hash(length=15)
        user_doc.save(ignore_permissions=True)
        frappe.db.commit()
        
        return {"message": "Logged out successfully. API secret has been regenerated.", "status": "success"}

    except Exception as e:
        frappe.log_error(f"Logout error: {str(e)}")
        frappe.local.response["http_status_code"] = 500
        return {"message": "Internal server error", "status": "error"}
