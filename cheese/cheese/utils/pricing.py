# Copyright (c) 2024
# License: MIT

import frappe


def calculate_ticket_price(experience_id, party_size, route_id=None, ticket=None):
	"""
	Calculate price for a ticket.
	
	- Individual ticket (no route): individual_price * party_size
	- Route ticket: always use experience.route_price * party_size
	- HOTEL ticket (standalone): price_per_night * nights * rooms_requested
	- HOTEL ticket (within a route): route_price * nights * rooms_requested
	"""
	experience = frappe.get_doc("Cheese Experience", experience_id)
	
	if experience.experience_type == "HOTEL":
		nights = ticket.nights if ticket else 1
		rooms = party_size  # For HOTEL, party_size passed is actually rooms_requested
		# Within a route package, hotel pricing must use the configured Route
		# Price per night, never the standalone nightly price.
		if route_id:
			per_night = experience.route_price if experience.route_price is not None else 0
		else:
			per_night = experience.price_per_night or 0
		return {
			"total_price": per_night * nights * rooms,
			"price_per_night": per_night,
			"nights": nights,
			"rooms": rooms,
			"individual_price": experience.price_per_night,
			"route_price": experience.route_price,
		}

	if route_id:
		# In route context, per-ticket pricing must always come from the
		# experience's route_price. Using route.price here can duplicate the
		# full route total on every ticket.
		unit_price = experience.route_price if experience.route_price is not None else 0
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
	- Sum mode: sum each experience's route_price (with sensible fallbacks) * party_size.

	HOTEL experiences expose two prices:
		- price_per_night: individual booking price (per night, per room).
		- route_price: per-person price contributed when this hotel is part of a route.
	When summing a route, we use route_price for both ACTIVITY and HOTEL experiences,
	falling back to the per-type individual price if route_price is not set.
	"""
	route = frappe.get_doc("Cheese Route", route_id)
	
	if route.price_mode == "Manual" and route.price:
		return route.price * party_size

	total = 0
	for exp_row in route.experiences:
		experience = frappe.get_doc("Cheese Experience", exp_row.experience)
		if experience.experience_type == "HOTEL":
			unit = experience.route_price if experience.route_price is not None else 0
		else:
			unit = experience.route_price if experience.route_price is not None else 0
		total += unit * party_size
	return total
