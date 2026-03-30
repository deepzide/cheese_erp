# Copyright (c) 2024
# License: MIT

import frappe


def calculate_ticket_price(experience_id, party_size, route_id=None):
	"""
	Calculate price for a ticket.
	
	- Individual ticket (no route): individual_price * party_size
	- Route ticket, Manual mode: route.price (already the total for the route, per person)
	  multiplied by party_size
	- Route ticket, Sum mode: use experience.route_price (or individual_price) * party_size
	"""
	experience = frappe.get_doc("Cheese Experience", experience_id)
	
	if route_id:
		route = frappe.get_doc("Cheese Route", route_id)
		if route.price_mode == "Manual":
			per_person = route.price or 0
			return {
				"total_price": per_person * party_size,
				"individual_price": None,
				"route_price": per_person
			}
		unit_price = experience.route_price or experience.individual_price or 0
		return {
			"total_price": unit_price * party_size,
			"individual_price": experience.individual_price,
			"route_price": experience.route_price
		}
	
	return {
		"total_price": (experience.individual_price or 0) * party_size,
		"individual_price": experience.individual_price,
		"route_price": None
	}


def calculate_deposit_amount(experience_id, total_price, route_id=None):
	"""
	Calculate deposit amount
	
	Args:
		experience_id: ID of the experience
		total_price: Total ticket price
		route_id: Optional route ID
		
	Returns:
		Deposit amount
	"""
	# Check route deposit first
	if route_id:
		route = frappe.get_doc("Cheese Route", route_id)
		if route.deposit_required:
			if route.deposit_type == "Amount":
				return route.deposit_value
			elif route.deposit_type == "%":
				return (total_price * route.deposit_value) / 100
	
	# Check experience deposit
	experience = frappe.get_doc("Cheese Experience", experience_id)
	if experience.deposit_required:
		if experience.deposit_type == "Amount":
			return experience.deposit_value
		elif experience.deposit_type == "%":
			return (total_price * experience.deposit_value) / 100
	
	return 0


def calculate_route_price(route_id, party_size):
	"""
	Calculate total price for a route booking.
	
	- Manual mode: route.price is the per-person price for the whole route.
	- Sum mode: sum each experience's route_price (or individual_price) * party_size.
	"""
	route = frappe.get_doc("Cheese Route", route_id)
	
	if route.price_mode == "Manual" and route.price:
		return route.price * party_size

	total = 0
	for exp_row in route.experiences:
		experience = frappe.get_doc("Cheese Experience", exp_row.experience)
		unit = experience.route_price or experience.individual_price or 0
		total += unit * party_size
	return total
