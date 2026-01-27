# Copyright (c) 2024
# License: MIT

import frappe
from frappe import _
from frappe.utils import get_datetime, add_to_date, now_datetime


def validate_booking_policy(experience_id, slot_datetime, action="booking"):
	"""
	Validate booking policy for an action
	
	Args:
		experience_id: ID of the experience
		slot_datetime: Datetime of the slot
		action: Action type ("booking", "modify", "cancel")
		
	Returns:
		True if valid, raises exception if invalid
	"""
	policy = frappe.db.get_value(
		"Cheese Booking Policy",
		{"experience": experience_id},
		["min_hours_before_booking", "modify_until_hours_before", "cancel_until_hours_before"],
		as_dict=True
	)
	
	if not policy:
		return True  # No policy, allow
	
	hours_until_slot = (get_datetime(slot_datetime) - now_datetime()).total_seconds() / 3600
	
	if action == "booking":
		if policy.min_hours_before_booking and hours_until_slot < policy.min_hours_before_booking:
			frappe.throw(
				_("Booking must be made at least {0} hours before the slot").format(
					policy.min_hours_before_booking
				)
			)
	
	elif action == "modify":
		if policy.modify_until_hours_before and hours_until_slot < policy.modify_until_hours_before:
			frappe.throw(
				_("Modification must be made at least {0} hours before the slot").format(
					policy.modify_until_hours_before
				)
			)
	
	elif action == "cancel":
		if policy.cancel_until_hours_before and hours_until_slot < policy.cancel_until_hours_before:
			frappe.throw(
				_("Cancellation must be made at least {0} hours before the slot").format(
					policy.cancel_until_hours_before
				)
			)
	
	return True
