# Cheese API - Postman Response Examples

This document provides example responses for all Cheese API endpoints. All responses follow a consistent structure.

## Response Structure

### Success Response
```json
{
  "success": true,
  "message": "Success message",
  "data": {
    // Response data here
  }
}
```

### Paginated Response
```json
{
  "success": true,
  "message": "Success message",
  "data": [
    // Array of items
  ],
  "meta": {
    "page": 1,
    "page_size": 20,
    "total": 100,
    "total_pages": 5,
    "has_next": true,
    "has_prev": false
  }
}
```

### Error Response
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Error message",
    "details": {
      // Additional error details
    }
  }
}
```

---

## 1. Contact Endpoints

### Resolve or Create Contact
**Endpoint:** `POST /api/method/cheese.api.v1.contact_controller.resolve_or_create_contact`

**Request:**
```json
{
  "phone": "+1234567890",
  "email": "customer@example.com",
  "name": "John Doe"
}
```

**Success Response (200/201):**
```json
{
  "success": true,
  "message": "Contact created successfully",
  "data": {
    "contact_id": "CONTACT-001",
    "full_name": "John Doe",
    "phone": "+1234567890",
    "email": "customer@example.com",
    "is_new": true
  }
}
```

**Existing Contact Response (200):**
```json
{
  "success": true,
  "message": "Contact found",
  "data": {
    "contact_id": "CONTACT-001",
    "full_name": "John Doe",
    "phone": "+1234567890",
    "email": "customer@example.com",
    "is_new": false
  }
}
```

**Validation Error (422):**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Either phone or email must be provided",
    "details": {
      "fields": {}
    }
  }
}
```

---

## 2. Experience Endpoints

### List Experiences
**Endpoint:** `POST /api/method/cheese.api.v1.experience_controller.list_experiences`

**Request:**
```json
{
  "page": 1,
  "page_size": 20,
  "status": "ONLINE",
  "company": "Demo Company",
  "package_mode": "Both",
  "search": "adventure"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Experiences retrieved successfully",
  "data": [
    {
      "name": "Desert Safari Adventure",
      "experience_name": "Desert Safari Adventure",
      "company": "Demo Company",
      "description": "Experience the thrill of dune bashing and camel riding",
      "status": "ONLINE",
      "package_mode": "Both",
      "individual_price": 150.0,
      "route_price": 120.0,
      "min_acts_for_route_price": 3,
      "deposit_required": 1
    },
    {
      "name": "City Tour Experience",
      "experience_name": "City Tour Experience",
      "company": "Demo Company",
      "description": "Explore the city's landmarks and cultural sites",
      "status": "ONLINE",
      "package_mode": "Both",
      "individual_price": 80.0,
      "route_price": 65.0,
      "min_acts_for_route_price": 2,
      "deposit_required": 1
    }
  ],
  "meta": {
    "page": 1,
    "page_size": 20,
    "total": 5,
    "total_pages": 1,
    "has_next": false,
    "has_prev": false
  }
}
```

### Get Experience Detail
**Endpoint:** `POST /api/method/cheese.api.v1.experience_controller.get_experience_detail`

**Request:**
```json
{
  "experience_id": "Desert Safari Adventure"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Experience retrieved successfully",
  "data": {
    "name": "Desert Safari Adventure",
    "company": "Demo Company",
    "description": "Experience the thrill of dune bashing and camel riding in the desert",
    "status": "ONLINE",
    "package_mode": "Both",
    "individual_price": 150.0,
    "route_price": 120.0,
    "min_acts_for_route_price": 3,
    "deposit_required": 1,
    "deposit_type": "%",
    "deposit_value": 20.0,
    "deposit_ttl_hours": 24
  }
}
```

**Not Found Response (404):**
```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Experience not found: INVALID-ID",
    "details": {
      "resource": "Experience",
      "identifier": "INVALID-ID"
    }
  }
}
```

---

## 3. Availability Endpoints

### Get Available Slots
**Endpoint:** `POST /api/method/cheese.api.v1.availability_controller.get_available_slots`

**Request:**
```json
{
  "experience_id": "Desert Safari Adventure",
  "date": "2024-12-25"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Available slots retrieved successfully",
  "data": {
    "experience_id": "Desert Safari Adventure",
    "date": "2024-12-25",
    "slots": [
      {
        "slot_id": "SLOT-001",
        "time": "09:00:00",
        "available_capacity": 15,
        "max_capacity": 20,
        "reserved_capacity": 5,
        "slot_status": "OPEN"
      },
      {
        "slot_id": "SLOT-002",
        "time": "14:00:00",
        "available_capacity": 20,
        "max_capacity": 20,
        "reserved_capacity": 0,
        "slot_status": "OPEN"
      },
      {
        "slot_id": "SLOT-003",
        "time": "18:00:00",
        "available_capacity": 8,
        "max_capacity": 15,
        "reserved_capacity": 7,
        "slot_status": "OPEN"
      }
    ]
  }
}
```

**No Slots Available Response (200):**
```json
{
  "success": true,
  "message": "No available slots found",
  "data": {
    "experience_id": "Desert Safari Adventure",
    "date": "2024-12-25",
    "slots": []
  }
}
```

---

## 4. Ticket/Booking Endpoints

### Create Ticket
**Endpoint:** `POST /api/method/cheese.api.v1.ticket_controller.create_ticket`

**Request:**
```json
{
  "contact_id": "CONTACT-001",
  "experience_id": "Desert Safari Adventure",
  "slot_id": "SLOT-001",
  "party_size": 2
}
```

**Success Response (201):**
```json
{
  "success": true,
  "message": "Ticket created successfully",
  "data": {
    "ticket_id": "TICKET-001",
    "contact_id": "CONTACT-001",
    "experience_id": "Desert Safari Adventure",
    "slot_id": "SLOT-001",
    "party_size": 2,
    "status": "PENDING",
    "expires_at": "2024-12-24T10:00:00",
    "total_price": 300.0,
    "deposit_required": true,
    "deposit_amount": 60.0
  }
}
```

**Validation Error (422):**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Slot capacity exceeded",
    "details": {
      "fields": {
        "slot_id": "Requested party size exceeds available capacity"
      }
    }
  }
}
```

### Get Ticket Detail
**Endpoint:** `POST /api/method/cheese.api.v1.ticket_controller.get_ticket_detail`

**Request:**
```json
{
  "ticket_id": "TICKET-001"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Ticket retrieved successfully",
  "data": {
    "ticket_id": "TICKET-001",
    "contact": {
      "contact_id": "CONTACT-001",
      "full_name": "John Doe",
      "phone": "+1234567890",
      "email": "customer@example.com"
    },
    "experience": {
      "experience_id": "Desert Safari Adventure",
      "name": "Desert Safari Adventure",
      "description": "Experience the thrill of dune bashing"
    },
    "slot": {
      "slot_id": "SLOT-001",
      "date": "2024-12-25",
      "time": "09:00:00"
    },
    "party_size": 2,
    "status": "CONFIRMED",
    "total_price": 300.0,
    "deposit_required": true,
    "deposit_amount": 60.0,
    "deposit_status": "PENDING",
    "created_at": "2024-12-24T08:00:00",
    "expires_at": "2024-12-24T10:00:00"
  }
}
```

---

## 5. Route Endpoints

### List Routes
**Endpoint:** `POST /api/method/cheese.api.v1.route_controller.list_routes`

**Request:**
```json
{
  "page": 1,
  "page_size": 20,
  "status": "ONLINE",
  "search": "adventure"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Routes retrieved successfully",
  "data": [
    {
      "route_id": "ROUTE-001",
      "name": "Adventure Combo",
      "description": "Combine desert safari and water sports",
      "status": "ONLINE",
      "price_mode": "Sum",
      "price": 350.0,
      "experiences": [
        {
          "experience_id": "Desert Safari Adventure",
          "sequence": 1,
          "name": "Desert Safari Adventure"
        },
        {
          "experience_id": "Water Sports Package",
          "sequence": 2,
          "name": "Water Sports Package"
        }
      ]
    }
  ],
  "meta": {
    "page": 1,
    "page_size": 20,
    "total": 3,
    "total_pages": 1,
    "has_next": false,
    "has_prev": false
  }
}
```

### Create Route
**Endpoint:** `POST /api/method/cheese.api.v1.route_controller.create_route`

**Request:**
```json
{
  "name": "Adventure Combo",
  "description": "Combine desert safari and water sports",
  "status": "ONLINE",
  "price_mode": "Sum",
  "experiences": [
    {
      "experience": "Desert Safari Adventure",
      "sequence": 1
    },
    {
      "experience": "Water Sports Package",
      "sequence": 2
    }
  ]
}
```

**Success Response (201):**
```json
{
  "success": true,
  "message": "Route created successfully",
  "data": {
    "route_id": "ROUTE-001",
    "name": "Adventure Combo",
    "description": "Combine desert safari and water sports",
    "status": "ONLINE",
    "price_mode": "Sum",
    "price": 350.0,
    "experiences": [
      {
        "experience": "Desert Safari Adventure",
        "sequence": 1
      },
      {
        "experience": "Water Sports Package",
        "sequence": 2
      }
    ]
  }
}
```

---

## 6. Deposit Endpoints

### Get Deposit Instructions
**Endpoint:** `POST /api/method/cheese.api.v1.deposit_controller.get_deposit_instructions`

**Request:**
```json
{
  "ticket_id": "TICKET-001"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Deposit instructions retrieved successfully",
  "data": {
    "deposit_id": "DEPOSIT-001",
    "ticket_id": "TICKET-001",
    "amount_required": 60.0,
    "amount_paid": 0.0,
    "status": "PENDING",
    "due_at": "2024-12-24T10:00:00",
    "payment_instructions": "Please transfer the deposit amount to account XXX",
    "payment_link": "https://payment.example.com/deposit/DEPOSIT-001"
  }
}
```

### Record Payment
**Endpoint:** `POST /api/method/cheese.api.v1.deposit_controller.record_payment`

**Request:**
```json
{
  "deposit_id": "DEPOSIT-001",
  "amount": 60.0,
  "verification_method": "Manual"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Payment recorded successfully",
  "data": {
    "deposit_id": "DEPOSIT-001",
    "amount_paid": 60.0,
    "amount_required": 60.0,
    "status": "PAID",
    "paid_at": "2024-12-24T09:30:00"
  }
}
```

---

## 7. QR/Check-in Endpoints

### Generate QR Token
**Endpoint:** `POST /api/method/cheese.api.v1.qr_controller.generate_qr_token`

**Request:**
```json
{
  "ticket_id": "TICKET-001"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "QR token generated successfully",
  "data": {
    "qr_token": "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
    "ticket_id": "TICKET-001",
    "expires_at": "2024-12-26T09:00:00",
    "qr_url": "https://api.example.com/qr/a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6"
  }
}
```

### Verify QR Token
**Endpoint:** `POST /api/method/cheese.api.v1.qr_controller.verify_qr_token`

**Request:**
```json
{
  "qr_token": "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "QR token verified successfully",
  "data": {
    "ticket_id": "TICKET-001",
    "contact_name": "John Doe",
    "experience": "Desert Safari Adventure",
    "slot_date": "2024-12-25",
    "slot_time": "09:00:00",
    "party_size": 2,
    "status": "CONFIRMED",
    "is_valid": true
  }
}
```

**Invalid Token Response (400):**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid or expired QR token",
    "details": {
      "fields": {
        "qr_token": "Token not found or has expired"
      }
    }
  }
}
```

---

## 8. Error Responses

### Server Error (500)
```json
{
  "success": false,
  "error": {
    "code": "SERVER_ERROR",
    "message": "Failed to process request",
    "details": {
      "error": "Internal server error details"
    }
  }
}
```

### Unauthorized (401)
```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Unauthorized access",
    "details": {}
  }
}
```

### Forbidden (403)
```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "Forbidden",
    "details": {}
  }
}
```

---

## Notes

1. **HTTP Status Codes:**
   - `200` - Success
   - `201` - Created
   - `400` - Bad Request
   - `401` - Unauthorized
   - `403` - Forbidden
   - `404` - Not Found
   - `422` - Validation Error
   - `500` - Server Error

2. **Authentication:**
   - All endpoints require Bearer token authentication
   - Header: `Authorization: Bearer {{token}}`

3. **Content-Type:**
   - All requests should use `Content-Type: application/json`

4. **Pagination:**
   - Paginated endpoints support `page` and `page_size` parameters
   - Default `page_size` is usually 20
   - Meta includes pagination information

5. **Date Formats:**
   - Dates: `YYYY-MM-DD` (e.g., "2024-12-25")
   - Datetimes: ISO 8601 format (e.g., "2024-12-25T09:00:00")
