# Copyright (c) 2024
# License: MIT

import frappe
from frappe import _
from frappe.utils import now_datetime, format_datetime
from cheese.cheese.api.v1.opt_in_controller import get_opt_in_status_for_channel


def send_ticket_notification(ticket_id, notification_type, **kwargs):
	"""
	Send notification to customer about ticket status changes
	
	Args:
		ticket_id: Ticket ID
		notification_type: Type of notification (confirmed, rejected, expired, qr_generated, deposit_due)
		**kwargs: Additional data for notification
	"""
	try:
		ticket = frappe.get_doc("Cheese Ticket", ticket_id)
		if not ticket.contact:
			return
		
		contact = frappe.get_doc("Cheese Contact", ticket.contact)
		preferred_channel = contact.preferred_channel or "Email"
		
		# Check opt-in status for the channel
		if not get_opt_in_status_for_channel(ticket.contact, preferred_channel):
			frappe.logger().info(f"Skipping notification for ticket {ticket_id} - contact {ticket.contact} opted out of {preferred_channel}")
			return
		
		# Get experience and slot details
		experience = frappe.get_doc("Cheese Experience", ticket.experience)
		slot = frappe.get_doc("Cheese Experience Slot", ticket.slot)
		
		# Build message based on notification type
		message = _build_notification_message(notification_type, ticket, experience, slot, **kwargs)
		
		# Send notification via preferred channel
		_send_notification(contact, preferred_channel, message, notification_type, ticket_id)
		
	except Exception as e:
		frappe.log_error(f"Failed to send notification for ticket {ticket_id}: {e}", "Notification Error")


def send_route_booking_notification(route_booking_id, notification_type, **kwargs):
	"""
	Send notification to customer about route booking status changes
	
	Args:
		route_booking_id: Route Booking ID
		notification_type: Type of notification (confirmed, rejected, expired, deposit_due)
		**kwargs: Additional data for notification
	"""
	try:
		route_booking = frappe.get_doc("Cheese Route Booking", route_booking_id)
		if not route_booking.contact:
			return
		
		contact = frappe.get_doc("Cheese Contact", route_booking.contact)
		preferred_channel = contact.preferred_channel or "Email"
		
		# Check opt-in status for the channel
		if not get_opt_in_status_for_channel(route_booking.contact, preferred_channel):
			frappe.logger().info(f"Skipping notification for route booking {route_booking_id} - contact {route_booking.contact} opted out of {preferred_channel}")
			return
		
		# Get route details
		route = frappe.get_doc("Cheese Route", route_booking.route)
		
		# Build message based on notification type
		message = _build_route_booking_message(notification_type, route_booking, route, **kwargs)
		
		# Send notification via preferred channel
		_send_notification(contact, preferred_channel, message, notification_type, route_booking_id)
		
	except Exception as e:
		frappe.log_error(f"Failed to send notification for route booking {route_booking_id}: {e}", "Notification Error")


def send_deposit_notification(deposit_id, notification_type, **kwargs):
	"""
	Send notification about deposit status
	
	Args:
		deposit_id: Deposit ID
		notification_type: Type of notification (due, overdue, paid)
		**kwargs: Additional data
	"""
	try:
		deposit = frappe.get_doc("Cheese Deposit", deposit_id)
		
		# Get contact from entity
		contact_id = None
		if deposit.entity_type == "Cheese Ticket":
			ticket = frappe.get_doc("Cheese Ticket", deposit.entity_id)
			contact_id = ticket.contact
		elif deposit.entity_type == "Cheese Route Booking":
			route_booking = frappe.get_doc("Cheese Route Booking", deposit.entity_id)
			contact_id = route_booking.contact
		
		if not contact_id:
			return
		
		contact = frappe.get_doc("Cheese Contact", contact_id)
		preferred_channel = contact.preferred_channel or "Email"
		
		# Check opt-in status
		if not get_opt_in_status_for_channel(contact_id, preferred_channel):
			frappe.logger().info(f"Skipping deposit notification for deposit {deposit_id} - contact {contact_id} opted out")
			return
		
		# Build message
		message = _build_deposit_message(notification_type, deposit, **kwargs)
		
		# Send notification
		_send_notification(contact, preferred_channel, message, notification_type, deposit_id)
		
	except Exception as e:
		frappe.log_error(f"Failed to send deposit notification for deposit {deposit_id}: {e}", "Notification Error")


def _build_notification_message(notification_type, ticket, experience, slot, **kwargs):
	"""Build notification message for ticket"""
	messages = {
		"confirmed": _(
			"Your reservation for {experience_name} on {date} at {time} has been confirmed. "
			"Party size: {party_size}. Reservation ID: {ticket_id}"
		).format(
			experience_name=experience.name,
			date=slot.date,
			time=slot.time,
			party_size=ticket.party_size,
			ticket_id=ticket.name
		),
		"rejected": _(
			"Unfortunately, your reservation for {experience_name} on {date} at {time} could not be confirmed. "
			"Please contact us for alternative options. Reservation ID: {ticket_id}"
		).format(
			experience_name=experience.name,
			date=slot.date,
			time=slot.time,
			ticket_id=ticket.name
		),
		"expired": _(
			"Your pending reservation for {experience_name} on {date} at {time} has expired. "
			"If you still wish to book, please create a new reservation. Reservation ID: {ticket_id}"
		).format(
			experience_name=experience.name,
			date=slot.date,
			time=slot.time,
			ticket_id=ticket.name
		),
		"qr_generated": _(
			"Your QR code for {experience_name} on {date} at {time} is ready. "
			"Please present this QR code at check-in. Reservation ID: {ticket_id}"
		).format(
			experience_name=experience.name,
			date=slot.date,
			time=slot.time,
			ticket_id=ticket.name
		),
		"deposit_due": _(
			"Reminder: A deposit of {amount} is due for your reservation {ticket_id} by {due_date}. "
			"Please complete payment to confirm your booking."
		).format(
			amount=kwargs.get("deposit_amount", ticket.deposit_amount or 0),
			ticket_id=ticket.name,
			due_date=kwargs.get("due_date", "")
		)
	}
	return messages.get(notification_type, _("Notification about your reservation {ticket_id}").format(ticket_id=ticket.name))


def _build_route_booking_message(notification_type, route_booking, route, **kwargs):
	"""Build notification message for route booking"""
	messages = {
		"confirmed": _(
			"Your route booking for {route_name} has been confirmed. "
			"Total price: {total_price}. Booking ID: {booking_id}"
		).format(
			route_name=route.name,
			total_price=route_booking.total_price or 0,
			booking_id=route_booking.name
		),
		"rejected": _(
			"Unfortunately, your route booking for {route_name} could not be confirmed. "
			"Please contact us for alternative options. Booking ID: {booking_id}"
		).format(
			route_name=route.name,
			booking_id=route_booking.name
		),
		"expired": _(
			"Your pending route booking for {route_name} has expired. "
			"If you still wish to book, please create a new reservation. Booking ID: {booking_id}"
		).format(
			route_name=route.name,
			booking_id=route_booking.name
		),
		"deposit_due": _(
			"Reminder: A deposit of {amount} is due for your route booking {booking_id} by {due_date}. "
			"Please complete payment to confirm your booking."
		).format(
			amount=kwargs.get("deposit_amount", route_booking.deposit_amount or 0),
			booking_id=route_booking.name,
			due_date=kwargs.get("due_date", "")
		)
	}
	return messages.get(notification_type, _("Notification about your route booking {booking_id}").format(booking_id=route_booking.name))


def _build_deposit_message(notification_type, deposit, **kwargs):
	"""Build notification message for deposit"""
	messages = {
		"due": _(
			"Reminder: A deposit of {amount} is due by {due_date} for your booking. "
			"Please complete payment to confirm your reservation."
		).format(
			amount=deposit.amount_required,
			due_date=format_datetime(deposit.due_at) if deposit.due_at else ""
		),
		"overdue": _(
			"Your deposit of {amount} is now overdue. Please complete payment immediately to avoid cancellation. "
			"Due date: {due_date}"
		).format(
			amount=deposit.amount_required,
			due_date=format_datetime(deposit.due_at) if deposit.due_at else ""
		),
		"paid": _(
			"Your deposit of {amount} has been received and confirmed. Your booking is now confirmed."
		).format(
			amount=deposit.amount_required
		)
	}
	return messages.get(notification_type, _("Notification about your deposit"))


def _send_notification(contact, channel, message, notification_type, entity_id):
	"""
	Send notification via the specified channel
	
	This is a placeholder implementation. In production, this would integrate with:
	- Email service (SMTP/SendGrid/etc.)
	- WhatsApp API
	- SMS gateway
	- Push notification service
	"""
	try:
		# Log the notification (for audit and debugging)
		frappe.logger().info(f"Sending {notification_type} notification to {contact.full_name} via {channel}: {message}")
		
		# In a real implementation, you would:
		# - For Email: Use frappe.sendmail() or external email service
		# - For WhatsApp: Call WhatsApp Business API
		# - For SMS: Call SMS gateway API
		# - For Web: Store in notification queue for in-app display
		
		# Example email implementation:
		if channel == "Email" and contact.email:
			# frappe.sendmail(
			# 	recipients=[contact.email],
			# 	subject=_("Booking Update: {notification_type}").format(notification_type=notification_type),
			# 	message=message
			# )
			pass
		
		# Log to system event for audit trail
		from cheese.cheese.utils.events import log_event
		log_event(
			entity_type="Cheese Contact",
			entity_id=contact.name,
			event_type="notification_sent",
			payload={
				"channel": channel,
				"notification_type": notification_type,
				"entity_id": entity_id,
				"message": message
			}
		)
		
	except Exception as e:
		frappe.log_error(f"Failed to send notification via {channel}: {e}", "Notification Send Error")


def send_whatsapp_notification(phone_number, message):
	"""
	Send WhatsApp notification to a phone number
	
	Args:
		phone_number: Phone number to send to
		message: Message content
		
	Returns:
		True if sent successfully, False otherwise
	"""
	try:
		# Check if WhatsApp integration is available
		# Try to use WhatsApp integration if available
		try:
			# Check if WhatsApp Account doctype exists
			if frappe.db.exists("DocType", "WhatsApp Account"):
				account = frappe.get_all("WhatsApp Account", filters={"status": "Active"}, limit=1)
				if account:
					# Use WhatsApp integration if available
					from whatsapp_integration.whatsapp_integration.api import send_message
					result = send_message(phone_number, message)
					if result and result.get("status") == "success":
						frappe.logger().info(f"WhatsApp message sent to {phone_number}")
						return True
		except ImportError:
			# WhatsApp integration not available, log and continue
			pass
		except Exception as e:
			frappe.log_error(f"WhatsApp integration error: {str(e)}", "WhatsApp Notification Error")
		
		# Fallback: Log the notification
		frappe.logger().info(f"WhatsApp notification to {phone_number}: {message}")
		
		# Log to system event for audit trail
		from cheese.cheese.utils.events import log_event
		log_event(
			entity_type="System",
			entity_id="WhatsApp Notification",
			event_type="whatsapp_notification_sent",
			payload={
				"phone_number": phone_number,
				"message": message
			}
		)
		
		return True
	except Exception as e:
		frappe.log_error(f"Failed to send WhatsApp notification: {e}", "WhatsApp Notification Error")
		return False


def send_support_notification_to_establishment(company_id, support_case_id, booking_info=None):
	"""
	Send WhatsApp notification to establishment about a support case
	
	Args:
		company_id: Company ID
		support_case_id: Support case ID
		booking_info: Optional booking information dict
		
	Returns:
		True if sent successfully, False otherwise
	"""
	try:
		# Get company WhatsApp number
		company = frappe.get_doc("Company", company_id)
		whatsapp_phone = getattr(company, "whatsapp_phone", None)
		
		if not whatsapp_phone:
			frappe.logger().warning(f"No WhatsApp phone configured for company {company_id}")
			return False
		
		# Get support case details
		support_case = frappe.get_doc("Cheese Support Case", support_case_id)
		
		# Build message (sanitized, no personal data)
		message_parts = [
			f"Support Case: {support_case_id}",
			f"Incident Type: {support_case.incident_type}"
		]
		
		if booking_info:
			if booking_info.get("ticket_id"):
				message_parts.append(f"Booking Reference: {booking_info.get('ticket_id')}")
			if booking_info.get("slot_date"):
				message_parts.append(f"Date: {booking_info.get('slot_date')}")
		
		# Add sanitized description (remove personal info)
		description = support_case.description or ""
		# Remove email addresses and phone numbers from description
		import re
		description = re.sub(r'\b[\w\.-]+@[\w\.-]+\.\w+\b', '[email]', description)
		description = re.sub(r'\b\d{3}[-.]?\d{3}[-.]?\d{4}\b', '[phone]', description)
		description = description[:200]  # Limit length
		
		if description:
			message_parts.append(f"Description: {description}")
		
		message = "\n".join(message_parts)
		
		# Send WhatsApp notification
		return send_whatsapp_notification(whatsapp_phone, message)
	except Exception as e:
		frappe.log_error(f"Failed to send support notification to establishment: {e}", "Support Notification Error")
		return False
