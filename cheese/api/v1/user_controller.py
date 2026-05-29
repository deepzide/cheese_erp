# Copyright (c) 2024
# License: MIT

import frappe
from frappe import _
from frappe.utils import now_datetime, cint
from cheese.api.common.responses import success, created, error, not_found, validation_error, paginated_response


CHEESE_ROLE = "Cheese Establishment User"


def _ensure_role_exists():
    """Ensure the Cheese Establishment User role exists."""
    if not frappe.db.exists("Role", CHEESE_ROLE):
        role = frappe.get_doc({"doctype": "Role", "role_name": CHEESE_ROLE, "desk_access": 1})
        role.insert(ignore_permissions=True)
        frappe.db.commit()


def _get_user_companies(user_email):
    """Get companies assigned to a user via User Permission."""
    perms = frappe.get_all(
        "User Permission",
        filters={"user": user_email, "allow": "Company"},
        fields=["for_value"],
        order_by="creation desc",
    )
    return [p.for_value for p in perms]


def _get_current_user_company():
    """Get the company for the currently logged-in user (for scoped access).

    Super admins (Route Administrator / System Manager / Central Admin /
    Administrator) are never scoped and return ``None`` meaning "all
    companies". Establishment-level (Level 2) users are scoped to their single
    assigned company.
    """
    from cheese.cheese.utils.permissions import _is_super_admin

    user = frappe.session.user
    if _is_super_admin(user):
        return None  # super admins see everything
    companies = _get_user_companies(user)
    return companies[0] if companies else None


@frappe.whitelist()
def list_users(page=1, page_size=20, search=None, company=None):
    """
    List Cheese establishment users with their assigned companies.

    Args:
        page: Page number
        page_size: Items per page
        search: Search term
    company: Filter by company

    Returns:
        Paginated response with users
    """
    try:
        page = cint(page) or 1
        page_size = cint(page_size) or 20

        user_company = _get_current_user_company()
        if user_company:
            company = user_company

        # Get all users with the Cheese role
        role_users = frappe.get_all(
            "Has Role",
            filters={"role": CHEESE_ROLE, "parenttype": "User"},
            fields=["parent"],
        )
        cheese_user_emails = list(set(r.parent for r in role_users))

        if not cheese_user_emails:
            return paginated_response([], "No users found", page=page, page_size=page_size, total=0)

        # Build user filters
        filters = {"name": ["in", cheese_user_emails], "enabled": 1}
        or_filters = []
        if search:
            or_filters = [
                ["full_name", "like", f"%{search}%"],
                ["email", "like", f"%{search}%"],
            ]

        users = frappe.get_all(
            "User",
            filters=filters,
            or_filters=or_filters if or_filters else None,
            fields=["name", "email", "full_name", "enabled", "last_active", "creation", "user_type"],
            limit_start=(page - 1) * page_size,
            limit_page_length=page_size,
            order_by="full_name asc",
        )

        # Enrich with company assignments
        for user in users:
            user["companies"] = _get_user_companies(user.name)
            # Filter by company if specified
            if company and company not in user["companies"]:
                continue

        if company:
            users = [u for u in users if company in u.get("companies", [])]

        total = len(cheese_user_emails)

        return paginated_response(
            users,
            "Users retrieved successfully",
            page=page,
            page_size=page_size,
            total=total,
        )
    except Exception as e:
        frappe.log_error(f"Error in list_users: {str(e)}")
        return error("Failed to list users", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def create_user(email, full_name, company, password=None):
    """
    Create a new Cheese establishment user and assign them to a company.

    Args:
        email: User email (also used as login)
        full_name: User full name
        company: Company to assign
        password: Optional password (auto-generated if not provided)

    Returns:
        Created response with user details
    """
    try:
        if not email or not full_name or not company:
            return validation_error("email, full_name, and company are required")

        if not frappe.db.exists("Company", company):
            return not_found("Company", company)

        if frappe.db.exists("User", email):
            return validation_error(f"A user with email {email} already exists")

        _ensure_role_exists()

        # Create the user
        user = frappe.get_doc({
            "doctype": "User",
            "email": email,
            "first_name": full_name.split(" ")[0],
            "last_name": " ".join(full_name.split(" ")[1:]) if " " in full_name else "",
            "full_name": full_name,
            "enabled": 1,
            "user_type": "System User",
            "send_welcome_email": 0,
            "roles": [
                {"role": CHEESE_ROLE},
                {"role": "Cheese Booking Agent"},
            ],
        })
        user.insert(ignore_permissions=True)

        if password:
            from frappe.utils.password import update_password
            update_password(email, password)

        # Assign User Permission for the company
        perm = frappe.get_doc({
            "doctype": "User Permission",
            "user": email,
            "allow": "Company",
            "for_value": company,
            "apply_to_all_doctypes": 1,
        })
        perm.insert(ignore_permissions=True)

        frappe.db.commit()

        return created(
            "User created successfully",
            {
                "user_id": user.name,
                "email": email,
                "full_name": full_name,
                "company": company,
                "roles": [CHEESE_ROLE, "Cheese Booking Agent"],
            },
        )
    except frappe.ValidationError as e:
        return validation_error(str(e))
    except Exception as e:
        frappe.log_error(f"Error in create_user: {str(e)}")
        return error("Failed to create user", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def get_user(user_id):
    """
    Get user details with company assignments.

    Args:
        user_id: User email/name

    Returns:
        Success response with user details
    """
    try:
        if not user_id:
            return validation_error("user_id is required")

        if not frappe.db.exists("User", user_id):
            return not_found("User", user_id)

        user = frappe.get_doc("User", user_id)
        companies = _get_user_companies(user_id)
        roles = [r.role for r in user.roles]

        return success(
            "User retrieved successfully",
            {
                "user_id": user.name,
                "email": user.email,
                "full_name": user.full_name,
                "first_name": user.first_name,
                "last_name": user.last_name,
                "enabled": user.enabled,
                "user_type": user.user_type,
                "last_active": str(user.last_active) if user.last_active else None,
                "creation": str(user.creation) if user.creation else None,
                "companies": companies,
                "roles": roles,
                "is_cheese_user": CHEESE_ROLE in roles,
            },
        )
    except Exception as e:
        frappe.log_error(f"Error in get_user: {str(e)}")
        return error("Failed to get user", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def update_user(user_id, full_name=None, enabled=None, company=None, password=None):
    """
    Update a Cheese establishment user.

    Args:
        user_id: User email/name
        full_name: New full name (optional)
        enabled: Enable/disable (optional)
        company: Company to assign (replaces existing, optional)
        password: New password (optional)

    Returns:
        Success response with updated user
    """
    try:
        if not user_id:
            return validation_error("user_id is required")

        if not frappe.db.exists("User", user_id):
            return not_found("User", user_id)

        user = frappe.get_doc("User", user_id)

        if full_name is not None:
            user.first_name = full_name.split(" ")[0]
            user.last_name = " ".join(full_name.split(" ")[1:]) if " " in full_name else ""
            user.full_name = full_name

        if enabled is not None:
            user.enabled = cint(enabled)

        user.save(ignore_permissions=True)

        if password:
            from frappe.utils.password import update_password
            update_password(user_id, password)

        # Update company assignment if provided
        if company is not None:
            if not frappe.db.exists("Company", company):
                return not_found("Company", company)

            # Remove old company permissions
            frappe.db.delete("User Permission", {
                "user": user_id,
                "allow": "Company",
            })

            # Add new company permission
            perm = frappe.get_doc({
                "doctype": "User Permission",
                "user": user_id,
                "allow": "Company",
                "for_value": company,
                "apply_to_all_doctypes": 1,
            })
            perm.insert(ignore_permissions=True)

        frappe.db.commit()

        return success(
            "User updated successfully",
            {
                "user_id": user.name,
                "email": user.email,
                "full_name": user.full_name,
                "enabled": user.enabled,
                "companies": _get_user_companies(user_id),
            },
        )
    except frappe.ValidationError as e:
        return validation_error(str(e))
    except Exception as e:
        frappe.log_error(f"Error in update_user: {str(e)}")
        return error("Failed to update user", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def delete_user(user_id):
    """
    Disable a Cheese establishment user (soft-delete).

    Args:
        user_id: User email/name

    Returns:
        Success response
    """
    try:
        if not user_id:
            return validation_error("user_id is required")

        if not frappe.db.exists("User", user_id):
            return not_found("User", user_id)

        user = frappe.get_doc("User", user_id)
        user.enabled = 0
        user.save(ignore_permissions=True)

        # Remove company permissions
        frappe.db.delete("User Permission", {
            "user": user_id,
            "allow": "Company",
        })

        frappe.db.commit()

        return success("User disabled successfully", {"user_id": user_id, "enabled": 0})
    except Exception as e:
        frappe.log_error(f"Error in delete_user: {str(e)}")
        return error("Failed to delete user", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def list_companies_for_assignment():
    """
    List all companies available for user assignment.

    Returns:
        Success response with company list
    """
    try:
        companies = frappe.get_all(
            "Company",
            fields=["name", "company_name"],
            order_by="company_name asc",
            limit_page_length=500,
        )
        return success("Companies retrieved", {"companies": companies})
    except Exception as e:
        return error("Failed to list companies", "SERVER_ERROR", {"error": str(e)}, 500)
