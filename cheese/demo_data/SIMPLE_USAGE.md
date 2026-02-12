# Simple Demo Data Usage

## Single Command to Create All Demo Data

```bash
bench --site cheese.local execute cheese.demo.setup_demo_data
```

That's it! This one command creates demo data for **all doctypes**, especially **Cheese Ticket**.

## What It Creates

The command creates demo data for all doctypes defined in `hooks.py`:

### Master Data (created first):
- Cheese Contact (5 contacts)
- Cheese Experience (5 experiences)
- Cheese Experience Slot (slots for next 30 days)
- Cheese Route (3 routes)
- Cheese Booking Policy (3 policies)

### Transaction Data (created after masters):
- **Cheese Ticket** (5 tickets) ⭐
- Cheese Quotation (2 quotations)
- Cheese Lead (3 leads)
- Cheese Deposit (2 deposits)

## Clear Demo Data

```bash
bench --site cheese.local execute cheese.demo.clear_demo_data
```

## How Cheese Ticket Works

Cheese Ticket demo data:
1. Automatically resolves contact names to contact IDs
2. Automatically resolves experience names to experience IDs
3. Automatically assigns available slots
4. Automatically adds company
5. Automatically sets expiration dates

All from the simple JSON file: `demo_data/cheese_ticket.json`

## No Other Commands Needed

- ❌ No `install.py` mock data functions
- ❌ No `seed_mock_data_manual`
- ❌ No complex setup

Just one simple execute command!
