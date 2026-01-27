# Copyright (c) 2024
# License: MIT

from typing import Any, Dict, Optional, List


def success(
	message: str = "Success",
	data: Optional[Dict[str, Any]] = None,
	meta: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
	"""
	Create a success response
	
	Args:
		message: Success message
		data: Response data dictionary
		meta: Optional metadata (pagination, etc.)
		
	Returns:
		Formatted success response
	"""
	response = {
		"success": True,
		"message": message,
		"data": data or {}
	}
	
	if meta:
		response["meta"] = meta
	
	return response


def error(
	message: str,
	code: str = "SERVER_ERROR",
	details: Optional[Dict[str, Any]] = None,
	status_code: int = 400
) -> Dict[str, Any]:
	"""
	Create an error response
	
	Args:
		message: Error message
		code: Error code
		details: Optional error details
		status_code: HTTP status code
		
	Returns:
		Formatted error response
	"""
	response = {
		"success": False,
		"error": {
			"code": code,
			"message": message,
			"details": details or {}
		}
	}
	
	# Set HTTP status code in Frappe response
	import frappe
	frappe.response["http_status_code"] = status_code
	
	return response


def paginated_response(
	data: List[Dict[str, Any]],
	message: str = "Success",
	page: int = 1,
	page_size: int = 20,
	total: Optional[int] = None,
	total_pages: Optional[int] = None
) -> Dict[str, Any]:
	"""
	Create a paginated response
	
	Args:
		data: List of data items
		message: Success message
		page: Current page number
		page_size: Items per page
		total: Total number of items
		total_pages: Total number of pages
		
	Returns:
		Formatted paginated response
	"""
	if total is None:
		total = len(data)
	
	if total_pages is None:
		total_pages = (total + page_size - 1) // page_size if page_size > 0 else 1
	
	return {
		"success": True,
		"message": message,
		"data": data,
		"meta": {
			"page": page,
			"page_size": page_size,
			"total": total,
			"total_pages": total_pages,
			"has_next": page < total_pages,
			"has_prev": page > 1
		}
	}


def created(
	message: str = "Resource created successfully",
	data: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
	"""
	Create a 201 Created response
	
	Args:
		message: Success message
		data: Response data
		
	Returns:
		Formatted created response
	"""
	import frappe
	frappe.response["http_status_code"] = 201
	return success(message, data)


def not_found(
	resource: str = "Resource",
	identifier: Optional[str] = None
) -> Dict[str, Any]:
	"""
	Create a 404 Not Found response
	
	Args:
		resource: Resource type name
		identifier: Resource identifier
		
	Returns:
		Formatted not found response
	"""
	message = f"{resource} not found"
	if identifier:
		message += f": {identifier}"
	
	return error(message, "NOT_FOUND", {"resource": resource, "identifier": identifier}, 404)


def validation_error(
	message: str,
	fields: Optional[Dict[str, str]] = None
) -> Dict[str, Any]:
	"""
	Create a 422 Validation Error response
	
	Args:
		message: Error message
		fields: Field-specific errors
		
	Returns:
		Formatted validation error response
	"""
	return error(message, "VALIDATION_ERROR", {"fields": fields or {}}, 422)


def unauthorized(message: str = "Unauthorized access") -> Dict[str, Any]:
	"""
	Create a 401 Unauthorized response
	
	Args:
		message: Error message
		
	Returns:
		Formatted unauthorized response
	"""
	return error(message, "UNAUTHORIZED", {}, 401)


def forbidden(message: str = "Forbidden") -> Dict[str, Any]:
	"""
	Create a 403 Forbidden response
	
	Args:
		message: Error message
		
	Returns:
		Formatted forbidden response
	"""
	return error(message, "FORBIDDEN", {}, 403)
