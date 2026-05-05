# Copyright (c) 2024
# License: MIT

import frappe
from frappe import _
from frappe.utils import getdate, add_days, now_datetime, cint, flt
from cheese.api.common.responses import success, created, error, not_found, validation_error, paginated_response
from cheese.api.v1.user_controller import _get_current_user_company


@frappe.whitelist()
def list_hotels(page=1, page_size=20, search=None):
    """
    List establishments flagged as hotels.

    Args:
        page: Page number
        page_size: Items per page
        search: Search term

    Returns:
        Paginated response with hotel establishments
    """
    try:
        page = cint(page) or 1
        page_size = cint(page_size) or 20

        user_company = _get_current_user_company()

        filters = {"cheese_is_hotel": 1}
        if user_company:
            filters["name"] = user_company

        or_filters = []
        if search:
            or_filters.append(["company_name", "like", f"%{search}%"])

        hotels = frappe.get_all(
            "Company",
            filters=filters,
            or_filters=or_filters if or_filters else None,
            fields=["name", "company_name", "administrator_contact", "cheese_is_hotel",
                     "cheese_payment_methods", "cheese_operating_hours"],
            limit_start=(page - 1) * page_size,
            limit_page_length=page_size,
            order_by="company_name asc",
        )

        # Enrich with experience count
        for hotel in hotels:
            hotel["experience_count"] = frappe.db.count(
                "Cheese Experience",
                {"company": hotel.name, "experience_type": "HOTEL"},
            )

        total = frappe.db.count("Company", filters=filters)

        return paginated_response(
            hotels,
            "Hotels retrieved successfully",
            page=page,
            page_size=page_size,
            total=total,
        )
    except Exception as e:
        frappe.log_error(f"Error in list_hotels: {str(e)}")
        return error("Failed to list hotels", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def get_hotel_experiences(hotel_id, page=1, page_size=20):
    """
    List HOTEL-type experiences for a specific establishment.

    Args:
        hotel_id: Company ID (establishment)
        page: Page number
        page_size: Items per page

    Returns:
        Paginated response with hotel experiences
    """
    try:
        if not hotel_id:
            return validation_error("hotel_id is required")

        user_company = _get_current_user_company()
        if user_company and hotel_id != user_company:
            return error("Unauthorized", "UNAUTHORIZED", {}, 403)

        if not frappe.db.exists("Company", hotel_id):
            return not_found("Hotel", hotel_id)

        page = cint(page) or 1
        page_size = cint(page_size) or 20

        filters = {"company": hotel_id, "experience_type": "HOTEL"}

        experiences = frappe.get_all(
            "Cheese Experience",
            filters=filters,
            fields=[
                "name", "company", "description", "status", "is_room", "room_size",
                "price_per_night", "max_occupancy_per_unit", "min_nights_stay",
                "deposit_required", "deposit_type", "deposit_value",
            ],
            limit_start=(page - 1) * page_size,
            limit_page_length=page_size,
            order_by="name asc",
        )

        total = frappe.db.count("Cheese Experience", filters=filters)

        return paginated_response(
            experiences,
            "Hotel experiences retrieved successfully",
            page=page,
            page_size=page_size,
            total=total,
        )
    except Exception as e:
        frappe.log_error(f"Error in get_hotel_experiences: {str(e)}")
        return error("Failed to get hotel experiences", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def get_hotel_availability(experience_id, date_from=None, date_to=None, guests=None, rooms_requested=1):
    """
    Get nightly availability for a hotel experience.

    For each night in the range, returns the number of available rooms
    by querying Cheese Experience Slot records.

    Args:
        experience_id: Hotel Experience ID
        date_from: Start date (YYYY-MM-DD), defaults to today
        date_to: End date (YYYY-MM-DD), defaults to today + 30 days

    Returns:
        Success response with nightly availability array
    """
    try:
        if not experience_id:
            return validation_error("experience_id is required")

        if not frappe.db.exists("Cheese Experience", experience_id):
            return not_found("Experience", experience_id)

        experience = frappe.get_doc("Cheese Experience", experience_id)
        if experience.experience_type != "HOTEL":
            return validation_error("Experience is not a HOTEL type")
        rooms_requested = cint(rooms_requested) or 1
        guests = cint(guests) if guests is not None else None
        room_size = cint(getattr(experience, "room_size", 0) or getattr(experience, "max_occupancy_per_unit", 0) or 0)
        if room_size < 1:
            return validation_error("room_size must be configured for hotel availability")
        if guests and guests > room_size * rooms_requested:
            return validation_error(
                f"Cannot book {guests} guests. This room allows {room_size} guests per room ({room_size * rooms_requested} total for {rooms_requested} rooms)."
            )

        today = getdate(now_datetime())
        start_date = getdate(date_from) if date_from else today
        end_date = getdate(date_to) if date_to else add_days(today, 30)

        if start_date > end_date:
            return validation_error("date_from must be before or equal to date_to")

        from cheese.cheese.utils.capacity import get_available_capacity

        # Get all slots for this experience in the date range
        slots = frappe.get_all(
            "Cheese Experience Slot",
            filters={
                "experience": experience_id,
                "date_from": ["<=", end_date],
                "date_to": [">=", start_date],
            },
            fields=["name", "date_from", "date_to", "max_capacity", "reserved_capacity", "slot_status"],
            order_by="date_from asc",
        )

        # Build nightly availability
        nights = []
        current_date = start_date
        while current_date < end_date:
            # Find the slot that covers this night
            matching_slot = None
            for slot in slots:
                if getdate(slot.date_from) <= current_date <= getdate(slot.date_to):
                    matching_slot = slot
                    break

            if matching_slot:
                available = get_available_capacity(matching_slot.name, current_date)
                nights.append({
                    "date": str(current_date),
                    "slot_id": matching_slot.name,
                    "max_capacity": matching_slot.max_capacity,
                    "available": available,
                    "available_rooms": available,
                    "room_size": room_size,
                    "max_guests_available": available * room_size,
                    "status": matching_slot.slot_status,
                    "price_per_night": flt(experience.price_per_night),
                })
            else:
                nights.append({
                    "date": str(current_date),
                    "slot_id": None,
                    "max_capacity": 0,
                    "available": 0,
                    "status": "NO_SLOT",
                    "price_per_night": flt(experience.price_per_night),
                })

            current_date = add_days(current_date, 1)

        return success(
            "Hotel availability retrieved successfully",
            {
                "experience_id": experience_id,
                "experience_name": experience.name,
                "date_from": str(start_date),
                "date_to": str(end_date),
                "price_per_night": flt(experience.price_per_night),
                "room_size": room_size,
                "requested_rooms": rooms_requested,
                "requested_guests": guests,
                "min_nights_stay": experience.min_nights_stay or 1,
                "nights": nights,
            },
        )
    except Exception as e:
        frappe.log_error(f"Error in get_hotel_availability: {str(e)}")
        return error("Failed to get hotel availability", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def create_hotel_slots(experience_id, date_from, date_to, rooms_available, price_override=None):
    """
    Bulk create nightly slots for a hotel experience.

    Creates one Cheese Experience Slot per night in the range.

    Args:
        experience_id: Hotel Experience ID
        date_from: Start date (YYYY-MM-DD)
        date_to: End date (YYYY-MM-DD)
        rooms_available: Number of rooms available per night
        price_override: Optional price override per night

    Returns:
        Created response with count of slots
    """
    try:
        if not experience_id:
            return validation_error("experience_id is required")
        if not date_from or not date_to:
            return validation_error("date_from and date_to are required")

        rooms_available = cint(rooms_available)
        if rooms_available < 1:
            return validation_error("rooms_available must be at least 1")

        if not frappe.db.exists("Cheese Experience", experience_id):
            return not_found("Experience", experience_id)

        experience = frappe.get_doc("Cheese Experience", experience_id)
        if experience.experience_type != "HOTEL":
            return validation_error("Experience is not a HOTEL type")

        start_date = getdate(date_from)
        end_date = getdate(date_to)
        today = getdate(now_datetime())

        if start_date > end_date:
            return validation_error("date_from must be before or equal to date_to")
        if start_date < today:
            return validation_error("Cannot create slots in the past")

        created_slots = []
        current_date = start_date

        while current_date <= end_date:
            # Check if slot already exists for this night
            existing = frappe.db.exists(
                "Cheese Experience Slot",
                {"experience": experience_id, "date_from": current_date, "date_to": current_date}
            )
            if existing:
                current_date = add_days(current_date, 1)
                continue

            slot = frappe.get_doc({
                "doctype": "Cheese Experience Slot",
                "experience": experience_id,
                "date_from": current_date,
                "date_to": current_date,
                "max_capacity": rooms_available,
                "slot_status": "OPEN",
                "reserved_capacity": 0,
            })
            slot.insert()
            created_slots.append(slot.name)
            current_date = add_days(current_date, 1)

        frappe.db.commit()

        return created(
            f"Created {len(created_slots)} hotel slot(s) successfully",
            {
                "slots_created": len(created_slots),
                "slot_ids": created_slots,
                "experience_id": experience_id,
                "date_range": {"from": str(start_date), "to": str(end_date)},
                "rooms_available": rooms_available,
            },
        )
    except frappe.ValidationError as e:
        return validation_error(str(e))
    except Exception as e:
        frappe.log_error(f"Error in create_hotel_slots: {str(e)}")
        return error("Failed to create hotel slots", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def update_hotel_slot(slot_id, rooms_available=None, status=None):
    """
    Update a hotel slot's available rooms or status.

    Args:
        slot_id: Slot ID
        rooms_available: New number of available rooms
        status: New status (OPEN/CLOSED/BLOCKED)

    Returns:
        Success response with updated slot
    """
    try:
        if not slot_id:
            return validation_error("slot_id is required")

        if not frappe.db.exists("Cheese Experience Slot", slot_id):
            return not_found("Slot", slot_id)

        slot = frappe.get_doc("Cheese Experience Slot", slot_id)

        if rooms_available is not None:
            rooms_available = cint(rooms_available)
            if rooms_available < (slot.reserved_capacity or 0):
                return validation_error(
                    f"Cannot reduce rooms below reserved count ({slot.reserved_capacity})"
                )
            slot.max_capacity = rooms_available

        if status is not None:
            if status not in ["OPEN", "CLOSED", "BLOCKED"]:
                return validation_error(f"Invalid status: {status}")
            slot.slot_status = status

        slot.save()
        frappe.db.commit()

        return success(
            "Hotel slot updated successfully",
            {
                "slot_id": slot.name,
                "date": str(slot.date_from),
                "max_capacity": slot.max_capacity,
                "reserved_capacity": slot.reserved_capacity,
                "slot_status": slot.slot_status,
            },
        )
    except frappe.ValidationError as e:
        return validation_error(str(e))
    except Exception as e:
        frappe.log_error(f"Error in update_hotel_slot: {str(e)}")
        return error("Failed to update hotel slot", "SERVER_ERROR", {"error": str(e)}, 500)


@frappe.whitelist()
def get_hotel_reservations(hotel_id=None, experience_id=None, date_from=None, date_to=None, status=None, page=1, page_size=20):
    """
    Get hotel reservations (tickets for HOTEL-type experiences).

    Args:
        hotel_id: Company ID (optional)
        experience_id: Experience ID (optional)
        date_from: Check-in date from (optional)
        date_to: Check-in date to (optional)
        status: Ticket status filter (optional)
        page: Page number
        page_size: Items per page

    Returns:
        Paginated response with hotel reservations
    """
    try:
        user_company = _get_current_user_company()
        if user_company and hotel_id != user_company:
            return paginated_response([], "Unauthorized", page=1, page_size=20, total=0)

        page = cint(page) or 1
        page_size = cint(page_size) or 20

        # Get all HOTEL-type experiences
        exp_filters = {"experience_type": "HOTEL"}
        if hotel_id:
            exp_filters["company"] = hotel_id
        if experience_id:
            exp_filters["name"] = experience_id

        hotel_experiences = frappe.get_all(
            "Cheese Experience",
            filters=exp_filters,
            fields=["name"],
        )

        if not hotel_experiences:
            return paginated_response([], "No hotel reservations found", page=page, page_size=page_size, total=0)

        exp_names = [e.name for e in hotel_experiences]

        # Build ticket filters
        ticket_filters = {"experience": ["in", exp_names]}
        if status:
            ticket_filters["status"] = status

        # Date filtering based on check_in_date or selected_date
        if date_from:
            ticket_filters["selected_date"] = [">=", getdate(date_from)]
        if date_to:
            if "selected_date" in ticket_filters and isinstance(ticket_filters["selected_date"], list):
                # Both date_from and date_to — use between
                ticket_filters["selected_date"] = ["between", [getdate(date_from), getdate(date_to)]]
            else:
                ticket_filters["selected_date"] = ["<=", getdate(date_to)]

        tickets = frappe.get_all(
            "Cheese Ticket",
            filters=ticket_filters,
            fields=[
                "name", "contact", "company", "experience", "slot",
                "party_size", "status", "selected_date", "total_price",
                "deposit_amount", "creation", "modified",
            ],
            limit_start=(page - 1) * page_size,
            limit_page_length=page_size,
            order_by="modified desc",
        )

        # Enrich with contact and experience names
        for ticket in tickets:
            if ticket.contact:
                contact = frappe.db.get_value(
                    "Cheese Contact", ticket.contact,
                    ["full_name", "phone", "email"], as_dict=True,
                )
                if contact:
                    ticket["contact_name"] = contact.full_name
                    ticket["contact_phone"] = contact.phone
                    ticket["contact_email"] = contact.email

            if ticket.experience:
                ticket["experience_name"] = ticket.experience

            # Get hotel-specific fields
            ticket["check_in_date"] = frappe.db.get_value("Cheese Ticket", ticket.name, "check_in_date")
            ticket["check_out_date"] = frappe.db.get_value("Cheese Ticket", ticket.name, "check_out_date")
            ticket["rooms_requested"] = frappe.db.get_value("Cheese Ticket", ticket.name, "rooms_requested")
            ticket["nights"] = frappe.db.get_value("Cheese Ticket", ticket.name, "nights")

        total = frappe.db.count("Cheese Ticket", filters=ticket_filters)

        return paginated_response(
            tickets,
            "Hotel reservations retrieved successfully",
            page=page,
            page_size=page_size,
            total=total,
        )
    except Exception as e:
        frappe.log_error(f"Error in get_hotel_reservations: {str(e)}")
        return error("Failed to get hotel reservations", "SERVER_ERROR", {"error": str(e)}, 500)

@frappe.whitelist(allow_guest=True)
def bot_get_hotel_catalog():
    """
    Bot Endpoint: Get a catalog of all hotels and their available rooms.
    """
    try:
        hotels = frappe.get_all(
            "Company",
            filters={"cheese_is_hotel": 1},
            fields=["name", "company_name", "cheese_operating_hours"],
            order_by="company_name asc",
        )
        for hotel in hotels:
            rooms = frappe.get_all(
                "Cheese Experience",
                filters={"company": hotel.name, "experience_type": "HOTEL", "status": "ONLINE"},
                fields=["name", "description", "price_per_night", "max_occupancy_per_unit", "min_nights_stay"]
            )
            hotel["rooms"] = rooms
            
        return success("Hotel catalog retrieved", {"hotels": hotels})
    except Exception as e:
        frappe.log_error(f"Error in bot_get_hotel_catalog: {str(e)}")
        return error("Failed to get hotel catalog", "SERVER_ERROR", {"error": str(e)}, 500)

@frappe.whitelist(allow_guest=True)
def bot_check_hotel_availability(room_id, date_from, date_to=None, guests=None, rooms_requested=1):
    """
    Bot Endpoint: Check availability for a specific room on a date or date range.
    """
    try:
        if not date_to:
            date_to = add_days(getdate(date_from), 1)
            
        # We can reuse the existing get_hotel_availability logic internally, 
        # but format it for the bot
        res = get_hotel_availability(
            room_id,
            date_from,
            date_to,
            guests=guests,
            rooms_requested=rooms_requested,
        )
        
        # Check if error
        if res.get("status") == "error":
            return res
            
        data = res.get("data", {})
        nights = data.get("nights", [])
        
        # Check if all nights are available
        all_available = True
        min_available = float('inf')
        
        for night in nights:
            if night["available"] <= 0:
                all_available = False
                min_available = 0
                break
            if night["available"] < min_available:
                min_available = night["available"]
                
        if min_available == float('inf'):
            min_available = 0
            
        total_price = flt(data.get("price_per_night")) * len(nights)
        
        return success("Availability checked", {
            "room_id": room_id,
            "date_from": date_from,
            "date_to": date_to,
            "nights_count": len(nights),
            "is_available": all_available,
            "rooms_available": min_available,
            "room_size": data.get("room_size"),
            "max_guests_available": min_available * (data.get("room_size") or 0),
            "requested_rooms": cint(rooms_requested) or 1,
            "requested_guests": cint(guests) if guests is not None else None,
            "total_price": total_price,
            "price_per_night": data.get("price_per_night")
        })
    except Exception as e:
        frappe.log_error(f"Error in bot_check_hotel_availability: {str(e)}")
        return error("Failed to check availability", "SERVER_ERROR", {"error": str(e)}, 500)

@frappe.whitelist(allow_guest=True)
def bot_book_hotel_room(contact_phone, room_id, date_from, date_to, rooms_requested=1, guests=1):
    """
    Bot Endpoint: Book a hotel room.
    Automatically finds or creates contact and creates a pending ticket.
    """
    try:
        from cheese.api.v1.contact_controller import find_or_create_contact
        from cheese.api.v1.ticket_controller import create_pending_reservation
        
        contact_res = find_or_create_contact(contact_phone, contact_phone)
        if contact_res.get("status") == "error":
            return contact_res
            
        contact_id = contact_res.get("data", {}).get("contact_id")
        
        # We need the slot ID for the first night to satisfy ticket creation
        availability = get_hotel_availability(
            room_id,
            date_from,
            date_to,
            guests=guests,
            rooms_requested=rooms_requested,
        )
        if availability.get("status") == "error":
            return availability
            
        nights = availability.get("data", {}).get("nights", [])
        if not nights or any(night["available"] < cint(rooms_requested) for night in nights):
            return validation_error(f"Not enough rooms available for requested dates.")
            
        slot_id = nights[0]["slot_id"]
        if not slot_id:
            return validation_error("No booking slot available for this date.")
            
        ticket_res = create_pending_reservation(
            contact_id=contact_id,
            experience_id=room_id,
            slot_id=slot_id,
            party_size=cint(guests) or 1,
            check_in_date=date_from,
            check_out_date=date_to,
            rooms_requested=rooms_requested
        )
        
        if ticket_res.get("status") == "error":
            return ticket_res
            
        ticket_id = ticket_res.get("data", {}).get("ticket_id")
        
        return success("Booking created successfully", {
            "ticket_id": ticket_id,
            "status": "PENDING",
            "message": "Reservation is pending. Please proceed to payment."
        })
    except Exception as e:
        frappe.log_error(f"Error in bot_book_hotel_room: {str(e)}")
        return error("Failed to book room", "SERVER_ERROR", {"error": str(e)}, 500)

@frappe.whitelist()
def get_hotel_reservation_details(ticket_id):
    """
    Get full details for a hotel reservation.
    """
    try:
        if not ticket_id:
            return validation_error("ticket_id is required")

        if not frappe.db.exists("Cheese Ticket", ticket_id):
            return not_found("Ticket", ticket_id)

        ticket = frappe.get_doc("Cheese Ticket", ticket_id)
        
        # Ensure it's a hotel ticket
        if ticket.experience:
            exp_type = frappe.db.get_value("Cheese Experience", ticket.experience, "experience_type")
            if exp_type != "HOTEL":
                return validation_error("Not a hotel reservation")
                
        user_company = _get_current_user_company()
        if user_company and ticket.company != user_company:
            return error("Unauthorized", "UNAUTHORIZED", {}, 403)

        contact = {}
        if ticket.contact:
            contact = frappe.db.get_value(
                "Cheese Contact", ticket.contact,
                ["name", "full_name", "phone", "email"], as_dict=True
            ) or {}

        # Get payments
        raw_payments = frappe.get_all(
            "Cheese Deposit",
            filters={"entity_type": "Cheese Ticket", "entity_id": ticket.name},
            fields=["name", "amount_paid", "amount_required", "bank_account", "status", "creation", "paid_at"],
            order_by="creation desc"
        )
        
        payments = []
        amount_paid_total = 0
        for p in raw_payments:
            paid = p.amount_paid or 0
            if p.status in ("CONFIRMED", "VERIFIED"):
                amount_paid_total += paid
            payments.append({
                "name": p.name,
                "amount": paid,
                "amount_required": p.amount_required or 0,
                "bank_account": p.bank_account or "",
                "status": p.status,
                "deposit_date": str(p.creation) if p.creation else "",
                "paid_at": str(p.paid_at) if p.paid_at else "",
            })

        total_price = float(ticket.total_price or 0)
        is_paid = amount_paid_total >= total_price > 0
        remaining_balance = max(0, total_price - amount_paid_total)

        return success(
            "Hotel reservation details retrieved successfully",
            {
                "ticket": {
                    "name": ticket.name,
                    "status": ticket.status,
                    "company": ticket.company,
                    "experience": ticket.experience,
                    "check_in_date": ticket.check_in_date,
                    "check_out_date": ticket.check_out_date,
                    "nights": ticket.nights,
                    "rooms_requested": ticket.rooms_requested,
                    "total_price": ticket.total_price,
                    "deposit_amount": ticket.deposit_amount,
                    "is_paid": is_paid,
                    "amount_paid_total": amount_paid_total,
                    "remaining_balance": remaining_balance,
                    "party_size": ticket.party_size,
                    "expires_at": ticket.expires_at,
                    "creation": ticket.creation,
                    "modified": ticket.modified
                },
                "contact": contact,
                "payments": payments
            }
        )
    except Exception as e:
        frappe.log_error(f"Error in get_hotel_reservation_details: {str(e)}")
        return error("Failed to get reservation details", "SERVER_ERROR", {"error": str(e)}, 500)
