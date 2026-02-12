# Cheese App Demo Data - Simple Usage

## Single Command for All Demo Data

**One command creates demo data for ALL doctypes, especially Cheese Ticket:**

```bash
bench --site cheese.local execute cheese.demo.setup_demo_data
```

## What Gets Created

### Master Data (created first):
- ✅ Cheese Contact (5 contacts)
- ✅ Cheese Experience (5 experiences)  
- ✅ Cheese Experience Slot (slots for next 30 days)
- ✅ Cheese Route (3 routes)
- ✅ Cheese Booking Policy (3 policies)

### Transaction Data (created after masters):
- ✅ **Cheese Ticket** (5 tickets) ⭐ **Special focus**
- ✅ Cheese Quotation (2 quotations)
- ✅ Cheese Lead (3 leads)
- ✅ Cheese Deposit (2 deposits)

## Clear Demo Data

```bash
bench --site cheese.local execute cheese.demo.clear_demo_data
```

## How Cheese Ticket Works

The demo system automatically:
1. ✅ Resolves contact names → contact IDs
2. ✅ Resolves experience names → experience IDs  
3. ✅ Assigns available slots automatically
4. ✅ Adds company automatically
5. ✅ Sets expiration dates automatically

All from `demo_data/cheese_ticket.json` - just specify names, the system handles the rest!

## Files Structure

```
cheese/
├── demo.py                    # Main demo data functions
├── demo_data/                 # JSON data files
│   ├── cheese_contact.json
│   ├── cheese_experience.json
│   ├── cheese_experience_slot.json
│   ├── cheese_route.json
│   ├── cheese_booking_policy.json
│   ├── cheese_ticket.json      ⭐ Focus on this
│   ├── cheese_quotation.json
│   ├── cheese_lead.json
│   └── cheese_deposit.json
└── hooks.py                   # Defines master vs transaction doctypes
```

## That's It!

- ✅ One command: `bench --site cheese.local execute cheese.demo.setup_demo_data`
- ✅ Creates all doctypes automatically
- ✅ Cheese Ticket gets special handling
- ✅ No other setup needed
