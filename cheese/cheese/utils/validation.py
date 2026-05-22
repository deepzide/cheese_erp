# Copyright (c) 2024
# License: MIT

import frappe
from frappe import _
from frappe.utils import get_datetime, add_to_date, now_datetime


def get_booking_policy_for_experience(experience_id, as_dict=True, fields=None):
	"""
	Resolve the booking policy for an experience.

	Resolution order (supports many-to-one experience-policy relationship):
	  1. Experience.booking_policy Link field (preferred, new)
	  2. Legacy Cheese Booking Policy.experience back-reference (deprecated)

	Args:
		experience_id: Name of the Cheese Experience.
		as_dict: When True, return the policy fields as a dict; otherwise return the policy name.
		fields: Optional list of fields to read; defaults to the standard policy lead-time fields.

	Returns:
		dict | str | None: Policy data, policy name, or None when no policy is assigned.
	"""
	if not experience_id:
		return None

	if fields is None:
		fields = [
			"name",
			"min_hours_before_booking",
			"modify_until_hours_before",
			"cancel_until_hours_before",
		]

	policy_name = frappe.db.get_value("Cheese Experience", experience_id, "booking_policy")

	if not policy_name:
		# Backwards compatibility: fall back to the legacy back-reference
		policy_name = frappe.db.get_value(
			"Cheese Booking Policy",
			{"experience": experience_id},
			"name",
		)

	if not policy_name:
		return None

	if not as_dict:
		return policy_name

	policy = frappe.db.get_value(
		"Cheese Booking Policy", policy_name, fields, as_dict=True
	)
	return policy


def validate_booking_policy(experience_id, slot_datetime, action="booking", event_end_datetime=None):
	"""
	Validate booking policy for an action

	Args:
		experience_id: ID of the experience
		slot_datetime: Datetime of the visit start (used for lead-time rules)
		action: Action type ("booking", "modify", "cancel")
		event_end_datetime: Optional end of the bookable window for "already passed" checks only.
			For multi-day slots with a chosen calendar day, pass end of that day so same-day
			bookings are not rejected just because clock time is after time_from.

	Returns:
		True if valid, raises exception if invalid
	"""
	policy = get_booking_policy_for_experience(experience_id)

	visit_dt = get_datetime(slot_datetime)
	end_dt = get_datetime(event_end_datetime) if event_end_datetime else visit_dt

	# "Already started" uses end of window when provided (range slots + selected day).
	hours_until_end = (end_dt - now_datetime()).total_seconds() / 3600

	if hours_until_end < 0 and action in ["booking", "modify"]:
		frappe.throw(_("Cannot book or modify a slot that has already started or passed"))
	
	if not policy:
		return True  # No policy, allow

	# Lead-time rules use visit start, not end-of-day.
	hours_until_slot = (visit_dt - now_datetime()).total_seconds() / 3600
	
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
