# Copyright (c) 2024
# License: MIT

import frappe
from frappe import _
from frappe.utils import getdate
from cheese.cheese.utils.capacity import get_available_capacity
from cheese.api.common.responses import success, error, not_found, validation_error


@frappe.whitelist()
def get_available_slots(experience_id, date):
	"""
	Get available slots for an experience on a date
	
	Args:
		experience_id: ID of the experience
		date: Date string (YYYY-MM-DD)
		
	Returns:
		Success response with list of available slots
	"""
	try:
		# Validate inputs
		if not experience_id:
			return validation_error("experience_id is required")
		if not date:
			return validation_error("date is required")

		# Validate experience exists
		if not frappe.db.exists("Cheese Experience", experience_id):
			return not_found("Experience", experience_id)

		# Get experience details
		experience = frappe.get_doc("Cheese Experience", experience_id)
		
		# Get slots for the date
		slots = frappe.get_all(
			"Cheese Experience Slot",
			filters={
				"experience": experience_id,
				"date": getdate(date),
				"slot_status": ["in", ["OPEN", "CLOSED"]]
			},
			fields=["name", "date", "time", "max_capacity", "slot_status"],
			order_by="time asc"
		)

		# Calculate available capacity for each slot
		result = []
		for slot in slots:
			available = get_available_capacity(slot.name)
			result.append({
				"slot_id": slot.name,
				"date": str(slot.date),
				"time": str(slot.time),
				"max_capacity": slot.max_capacity,
				"available_capacity": available,
				"slot_status": slot.slot_status,
				"is_available": available > 0
			})

		return success(
			f"Found {len(result)} slots for {experience.name} on {date}",
			{
				"experience_id": experience_id,
				"experience_name": experience.name,
				"date": date,
				"slots": result,
				"total_slots": len(result),
				"available_slots": len([s for s in result if s["is_available"]])
			}
		)
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except Exception as e:
		frappe.log_error(f"Error in get_available_slots: {str(e)}")
		return error("Failed to get available slots", "SERVER_ERROR", {"error": str(e)}, 500)
