# Copyright (c) 2024
# License: MIT

import frappe
from frappe import _
from frappe.utils import getdate, get_time, cint, get_datetime
from cheese.api.common.responses import success, created, error, not_found, validation_error, paginated_response
from cheese.cheese.utils.capacity import get_available_capacity, update_slot_capacity


@frappe.whitelist()
def update_experience_pricing(experience_id, individual_price=None, route_price=None, min_acts_for_route_price=None, package_mode=None):
	"""
	Update experience pricing (US-09)
	
	Args:
		experience_id: Experience ID
		individual_price: Individual price
		route_price: Route price
		min_acts_for_route_price: Minimum activities for route price
		package_mode: Package mode (Package/Public/Both)
		
	Returns:
		Success response
	"""
	try:
		if not experience_id:
			return validation_error("experience_id is required")
		
		if not frappe.db.exists("Cheese Experience", experience_id):
			return not_found("Experience", experience_id)
		
		experience = frappe.get_doc("Cheese Experience", experience_id)
		
		if individual_price is not None:
			if individual_price < 0:
				return validation_error("individual_price must be >= 0")
			experience.individual_price = individual_price
		
		if route_price is not None:
			if route_price < 0:
				return validation_error("route_price must be >= 0")
			experience.route_price = route_price
		
		if min_acts_for_route_price is not None:
			if min_acts_for_route_price < 0:
				return validation_error("min_acts_for_route_price must be >= 0")
			experience.min_acts_for_route_price = min_acts_for_route_price
		
		if package_mode is not None:
			if package_mode not in ["Package", "Public", "Both"]:
				return validation_error(f"Invalid package_mode: {package_mode}")
			experience.package_mode = package_mode
			
			# Validate route_price if package_mode is Package
			if package_mode == "Package" and not experience.route_price:
				return validation_error("route_price is required when package_mode is Package")
		
		experience.save()
		frappe.db.commit()
		
		return success(
			"Experience pricing updated successfully",
			{
				"experience_id": experience.name,
				"individual_price": experience.individual_price,
				"route_price": experience.route_price,
				"min_acts_for_route_price": experience.min_acts_for_route_price,
				"package_mode": experience.package_mode
			}
		)
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except Exception as e:
		frappe.log_error(f"Error in update_experience_pricing: {str(e)}")
		return error("Failed to update experience pricing", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def create_time_slot(experience_id, date, time, max_capacity, slot_status="OPEN"):
	"""
	Create a time slot for an experience (US-10)
	
	Args:
		experience_id: Experience ID
		date: Date (YYYY-MM-DD)
		time: Time (HH:MM:SS)
		max_capacity: Maximum capacity
		slot_status: Slot status (OPEN/CLOSED/BLOCKED)
		
	Returns:
		Created response with slot data
	"""
	try:
		if not experience_id:
			return validation_error("experience_id is required")
		if not date:
			return validation_error("date is required")
		if not time:
			return validation_error("time is required")
		if not max_capacity or max_capacity < 1:
			return validation_error("max_capacity must be at least 1")
		
		if slot_status not in ["OPEN", "CLOSED", "BLOCKED"]:
			return validation_error(f"Invalid slot_status: {slot_status}")
		
		if not frappe.db.exists("Cheese Experience", experience_id):
			return not_found("Experience", experience_id)
		
		slot = frappe.get_doc({
			"doctype": "Cheese Experience Slot",
			"experience": experience_id,
			"date": getdate(date),
			"time": get_time(time),
			"max_capacity": max_capacity,
			"slot_status": slot_status,
			"reserved_capacity": 0
		})
		slot.insert()
		frappe.db.commit()
		
		return created(
			"Time slot created successfully",
			{
				"slot_id": slot.name,
				"experience_id": experience_id,
				"date": str(slot.date),
				"time": str(slot.time),
				"max_capacity": slot.max_capacity,
				"slot_status": slot.slot_status
			}
		)
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except Exception as e:
		frappe.log_error(f"Error in create_time_slot: {str(e)}")
		return error("Failed to create time slot", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def update_time_slot(slot_id, max_capacity=None, slot_status=None):
	"""
	Update time slot capacity or status (US-10)
	
	Args:
		slot_id: Slot ID
		max_capacity: New maximum capacity
		slot_status: New slot status
		
	Returns:
		Success response
	"""
	try:
		if not slot_id:
			return validation_error("slot_id is required")
		
		if not frappe.db.exists("Cheese Experience Slot", slot_id):
			return not_found("Slot", slot_id)
		
		slot = frappe.get_doc("Cheese Experience Slot", slot_id)
		
		if max_capacity is not None:
			if max_capacity < 1:
				return validation_error("max_capacity must be at least 1")
			
			# Check if reducing capacity would conflict with existing bookings
			current_reserved = slot.reserved_capacity or 0
			if max_capacity < current_reserved:
				return validation_error(
					f"Cannot reduce capacity below reserved capacity. "
					f"Current reserved: {current_reserved}, Requested: {max_capacity}"
				)
			
			slot.max_capacity = max_capacity
		
		if slot_status is not None:
			if slot_status not in ["OPEN", "CLOSED", "BLOCKED"]:
				return validation_error(f"Invalid slot_status: {slot_status}")
			slot.slot_status = slot_status
		
		slot.save()
		update_slot_capacity(slot_id)
		frappe.db.commit()
		
		return success(
			"Time slot updated successfully",
			{
				"slot_id": slot.name,
				"max_capacity": slot.max_capacity,
				"slot_status": slot.slot_status,
				"reserved_capacity": slot.reserved_capacity
			}
		)
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except Exception as e:
		frappe.log_error(f"Error in update_time_slot: {str(e)}")
		return error("Failed to update time slot", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def list_time_slots(experience_id, date_from=None, date_to=None, slot_status=None, page=1, page_size=20):
	"""
	List time slots for an experience (US-10)
	
	Args:
		experience_id: Experience ID
		date_from: Start date filter
		date_to: End date filter
		slot_status: Filter by status
		page: Page number
		page_size: Items per page
		
	Returns:
		Paginated response with slots list
	"""
	try:
		if not experience_id:
			return validation_error("experience_id is required")
		
		if not frappe.db.exists("Cheese Experience", experience_id):
			return not_found("Experience", experience_id)
		
		page = cint(page) or 1
		page_size = cint(page_size) or 20
		
		filters = {"experience": experience_id}
		
		if date_from:
			filters["date"] = [">=", getdate(date_from)]
		if date_to:
			if "date" in filters and isinstance(filters["date"], list):
				filters["date"].append(["<=", getdate(date_to)])
			else:
				filters["date"] = ["<=", getdate(date_to)]
		if slot_status:
			filters["slot_status"] = slot_status
		
		slots = frappe.get_all(
			"Cheese Experience Slot",
			filters=filters,
			fields=["name", "date", "time", "max_capacity", "reserved_capacity", "slot_status"],
			limit_start=(page - 1) * page_size,
			limit_page_length=page_size,
			order_by="date asc, time asc"
		)
		
		# Calculate available capacity
		for slot in slots:
			available = get_available_capacity(slot.name)
			slot["available_capacity"] = available
		
		total = frappe.db.count("Cheese Experience Slot", filters=filters)
		
		return paginated_response(
			slots,
			"Time slots retrieved successfully",
			page=page,
			page_size=page_size,
			total=total
		)
	except Exception as e:
		frappe.log_error(f"Error in list_time_slots: {str(e)}")
		return error("Failed to list time slots", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def block_time_slot(slot_id):
	"""
	Block a time slot (US-10)
	
	Args:
		slot_id: Slot ID
		
	Returns:
		Success response
	"""
	try:
		if not slot_id:
			return validation_error("slot_id is required")
		
		if not frappe.db.exists("Cheese Experience Slot", slot_id):
			return not_found("Slot", slot_id)
		
		slot = frappe.get_doc("Cheese Experience Slot", slot_id)
		slot.slot_status = "BLOCKED"
		slot.save()
		frappe.db.commit()
		
		return success(
			"Time slot blocked successfully",
			{
				"slot_id": slot.name,
				"slot_status": slot.slot_status
			}
		)
	except Exception as e:
		frappe.log_error(f"Error in block_time_slot: {str(e)}")
		return error("Failed to block time slot", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def update_booking_policy(experience_id, cancel_until_hours_before=None, modify_until_hours_before=None, min_hours_before_booking=None):
	"""
	Update booking policy for an experience (US-11)
	
	Args:
		experience_id: Experience ID
		cancel_until_hours_before: Hours before for cancellation
		modify_until_hours_before: Hours before for modification
		min_hours_before_booking: Minimum hours before booking
		
	Returns:
		Success response
	"""
	try:
		if not experience_id:
			return validation_error("experience_id is required")
		
		if not frappe.db.exists("Cheese Experience", experience_id):
			return not_found("Experience", experience_id)
		
		# Get or create booking policy
		policy_name = frappe.db.get_value(
			"Cheese Booking Policy",
			{"experience": experience_id},
			"name"
		)
		
		if policy_name:
			policy = frappe.get_doc("Cheese Booking Policy", policy_name)
		else:
			policy = frappe.get_doc({
				"doctype": "Cheese Booking Policy",
				"experience": experience_id
			})
		
		if cancel_until_hours_before is not None:
			if cancel_until_hours_before < 0:
				return validation_error("cancel_until_hours_before must be >= 0")
			policy.cancel_until_hours_before = cancel_until_hours_before
		
		if modify_until_hours_before is not None:
			if modify_until_hours_before < 0:
				return validation_error("modify_until_hours_before must be >= 0")
			policy.modify_until_hours_before = modify_until_hours_before
		
		if min_hours_before_booking is not None:
			if min_hours_before_booking < 0:
				return validation_error("min_hours_before_booking must be >= 0")
			policy.min_hours_before_booking = min_hours_before_booking
		
		if policy_name:
			policy.save()
		else:
			policy.insert()
		
		frappe.db.commit()
		
		return success(
			"Booking policy updated successfully",
			{
				"policy_id": policy.name,
				"experience_id": experience_id,
				"cancel_until_hours_before": policy.cancel_until_hours_before,
				"modify_until_hours_before": policy.modify_until_hours_before,
				"min_hours_before_booking": policy.min_hours_before_booking
			}
		)
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except Exception as e:
		frappe.log_error(f"Error in update_booking_policy: {str(e)}")
		return error("Failed to update booking policy", "SERVER_ERROR", {"error": str(e)}, 500)
