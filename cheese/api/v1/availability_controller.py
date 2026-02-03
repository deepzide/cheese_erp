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


@frappe.whitelist()
def get_availability(experience_id, date):
	"""
	Get availability by experience - alias for get_available_slots
	
	Args:
		experience_id: ID of the experience
		date: Date string (YYYY-MM-DD)
		
	Returns:
		Success response with list of available slots
	"""
	return get_available_slots(experience_id, date)


@frappe.whitelist()
def get_route_availability(route_id, date=None, party_size=1):
	"""
	Get availability by route - returns aggregated availability or rules to build it
	
	Args:
		route_id: Route ID
		date: Date string (YYYY-MM-DD) - optional, if not provided returns general availability rules
		party_size: Party size for capacity checks
		
	Returns:
		Success response with route availability information
	"""
	try:
		if not route_id:
			return validation_error("route_id is required")
		
		if not frappe.db.exists("Cheese Route", route_id):
			return not_found("Route", route_id)
		
		route = frappe.get_doc("Cheese Route", route_id)
		
		if route.status != "ONLINE":
			return success(
				"Route is not online",
				{
					"route_id": route_id,
					"status": route.status,
					"available": False,
					"reason": f"Route status is {route.status}"
				}
			)
		
		# Get route experiences
		experiences = []
		for exp_row in route.experiences:
			exp_doc = frappe.get_doc("Cheese Experience", exp_row.experience)
			experiences.append({
				"experience_id": exp_row.experience,
				"experience_name": exp_doc.name,
				"sequence": exp_row.sequence,
				"status": exp_doc.status
			})
		
		# If date is provided, check actual availability
		if date:
			date_obj = getdate(date)
			availability_by_experience = []
			all_available = True
			
			for exp in experiences:
				if exp["status"] != "ONLINE":
					all_available = False
					availability_by_experience.append({
						"experience_id": exp["experience_id"],
						"available": False,
						"reason": f"Experience status is {exp['status']}"
					})
					continue
				
				# Get slots for this experience on the date
				slots = frappe.get_all(
					"Cheese Experience Slot",
					filters={
						"experience": exp["experience_id"],
						"date": date_obj,
						"slot_status": "OPEN"
					},
					fields=["name", "time", "max_capacity"]
				)
				
				available_slots = []
				for slot in slots:
					available = get_available_capacity(slot.name)
					if available >= party_size:
						available_slots.append({
							"slot_id": slot.name,
							"time": str(slot.time),
							"available_capacity": available
						})
				
				if not available_slots:
					all_available = False
				
				availability_by_experience.append({
					"experience_id": exp["experience_id"],
					"experience_name": exp["experience_name"],
					"sequence": exp["sequence"],
					"available": len(available_slots) > 0,
					"available_slots": available_slots,
					"available_slots_count": len(available_slots)
				})
			
			return success(
				"Route availability retrieved successfully",
				{
					"route_id": route_id,
					"date": str(date_obj),
					"party_size": party_size,
					"available": all_available,
					"experiences": availability_by_experience
				}
			)
		else:
			# Return general availability rules
			return success(
				"Route availability rules retrieved successfully",
				{
					"route_id": route_id,
					"status": route.status,
					"experiences_count": len(experiences),
					"experiences": experiences,
					"note": "Provide a date to check actual slot availability"
				}
			)
	except frappe.ValidationError as e:
		return validation_error(str(e))
	except Exception as e:
		frappe.log_error(f"Error in get_route_availability: {str(e)}")
		return error("Failed to get route availability", "SERVER_ERROR", {"error": str(e)}, 500)
