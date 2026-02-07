# Copyright (c) 2024
# License: MIT

import frappe


def calculate_ticket_price(experience_id, party_size, route_id=None):
	"""
	Calculate price for a ticket
	
	Args:
		experience_id: ID of the experience
		party_size: Number of people
		route_id: Optional route ID
		
	Returns:
		Dictionary with price details
	"""
	experience = frappe.get_doc("Cheese Experience", experience_id)
	
	# If route is provided, use route pricing
	if route_id:
		route = frappe.get_doc("Cheese Route", route_id)
		if route.price_mode == "Manual":
			return {
				"total_price": route.price,
				"individual_price": None,
				"route_price": route.price
			}
		# Sum mode: calculate from route experiences
		# This is simplified - in production, sum all experience prices
		return {
			"total_price": experience.individual_price * party_size,
			"individual_price": experience.individual_price,
			"route_price": None
		}
	
	# Individual pricing
	if experience.min_acts_for_route_price and party_size >= experience.min_acts_for_route_price:
		# Use route price if applicable
		if experience.route_price:
			return {
				"total_price": experience.route_price,
				"individual_price": experience.individual_price,
				"route_price": experience.route_price
			}
	
	# Default: individual price
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
	Calculate total price for a route booking
	
	Args:
		route_id: ID of the route
		party_size: Number of people
		
	Returns:
		Total price for the route
	"""
	route = frappe.get_doc("Cheese Route", route_id)
	
	if route.price_mode == "Manual" and route.price:
		return route.price * party_size
	elif route.price_mode == "Sum":
		total = 0
		for exp_row in route.experiences:
			experience = frappe.get_doc("Cheese Experience", exp_row.experience)
			if experience.route_price:
				total += experience.route_price * party_size
			elif experience.individual_price:
				total += experience.individual_price * party_size
		return total
	else:
		# Default: sum individual prices
		total = 0
		for exp_row in route.experiences:
			experience = frappe.get_doc("Cheese Experience", exp_row.experience)
			if experience.individual_price:
				total += experience.individual_price * party_size
		return total
