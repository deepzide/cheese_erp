# How to Add Demo Data in ERPNext/Frappe App

This guide explains how ERPNext integrates demo data and how to implement the same pattern in your custom app.

## ERPNext's Demo Data Pattern

### 1. **Hooks Configuration** (`hooks.py`)

ERPNext uses the `setup_wizard_complete` hook to trigger demo data creation:

```python
# In erpnext/hooks.py
setup_wizard_complete = "erpnext.setup.setup_wizard.setup_wizard.setup_demo"
```

### 2. **Setup Wizard Integration** (`setup_wizard.py`)

The `setup_demo` function checks if the user selected "Generate Demo Data" checkbox:

```python
# In erpnext/setup/setup_wizard/setup_wizard.py
def setup_demo(args):
    if args.get("setup_demo"):
        frappe.enqueue(setup_demo_data, enqueue_after_commit=True, at_front=True)
```

### 3. **Demo Data Function** (`demo.py`)

The actual demo data creation happens in `setup_demo_data()`:

```python
# In erpnext/setup/demo.py
def setup_demo_data():
    company = create_demo_company()
    process_masters()  # Creates master data from JSON files
    make_transactions(company)  # Creates transactions with random dates
```

### 4. **Hooks for Data Files**

ERPNext uses hooks to define which doctypes are master data vs transactions:

```python
# In erpnext/hooks.py
demo_master_doctypes = [
    "item_group",
    "item",
    "customer_group",
    "supplier_group",
    "customer",
    "supplier",
]

demo_transaction_doctypes = [
    "purchase_order",
    "sales_order",
]
```

### 5. **JSON Data Files**

Demo data is stored in JSON files in `erpnext/setup/demo_data/`:
- `customer.json`
- `item.json`
- `sales_order.json`
- etc.

## Implementation Options

### Option 1: Using `setup_wizard_complete` Hook (Recommended)

This allows users to choose whether to create demo data during setup wizard.

**Step 1:** Add hook in `hooks.py`:

```python
setup_wizard_complete = "cheese.setup_wizard.setup_wizard.setup_demo"
```

**Step 2:** Create `setup_wizard.py`:

```python
# cheese/setup_wizard/setup_wizard.py
import frappe
from cheese.demo import setup_demo_data

def setup_demo(args):
    """Called after setup wizard completes"""
    if args.get("setup_demo"):
        frappe.enqueue(setup_demo_data, enqueue_after_commit=True, at_front=True)
```

**Step 3:** Add checkbox to setup wizard UI (optional):

Create `public/js/setup_wizard.js`:

```javascript
frappe.setup.slides_settings = [
    {
        name: "demo_data",
        title: __("Demo Data"),
        fields: [
            {
                fieldname: "setup_demo",
                label: __("Generate Demo Data"),
                fieldtype: "Check",
                description: __("Create sample data to explore the system"),
            },
        ],
    },
];
```

### Option 2: Using `after_install` Hook

This automatically creates demo data when the app is installed.

**In `hooks.py`:**

```python
after_install = "cheese.install.after_install"
```

**In `install.py`:**

```python
def after_install():
    # Your installation code here
    from cheese.demo import setup_demo_data
    setup_demo_data()
    frappe.db.commit()
```

### Option 3: Manual Command (Current Implementation)

Use CLI commands to setup demo data manually:

```bash
bench --site all setup-demo-data
```

## Complete Example for Cheese App

### 1. Update `hooks.py`

```python
# Demo Data Hooks
demo_master_doctypes = [
    "cheese_contact",
    "cheese_experience",
    "cheese_experience_slot",
    "cheese_route",
    "cheese_booking_policy",
]

demo_transaction_doctypes = [
    "cheese_ticket",
    "cheese_quotation",
    "cheese_lead",
    "cheese_deposit",
]

# Optional: Setup wizard integration
setup_wizard_complete = "cheese.setup_wizard.setup_wizard.setup_demo"
```

### 2. Create `setup_wizard.py` (if using setup wizard)

```python
# cheese/setup_wizard/setup_wizard.py
import frappe
from cheese.demo import setup_demo_data

def setup_demo(args):
    """Setup demo data if requested during setup wizard"""
    if args.get("setup_demo"):
        frappe.enqueue(setup_demo_data, enqueue_after_commit=True, at_front=True)
```

### 3. JSON Data Files

Store demo data in `cheese/demo_data/`:
- `cheese_contact.json`
- `cheese_experience.json`
- `cheese_ticket.json`
- etc.

### 4. Demo Data Function

Already implemented in `cheese/demo.py`:
- `setup_demo_data()` - Creates demo data
- `clear_demo_data()` - Clears demo data
- Uses hooks to read JSON files automatically

## Usage

### During Setup Wizard (if integrated):
1. User completes setup wizard
2. Checks "Generate Demo Data" checkbox
3. Demo data is created automatically

### After Installation:
```bash
bench --site all setup-demo-data
```

### Via Python:
```python
from cheese.demo import setup_demo_data
setup_demo_data()
```

## Key Points

1. **Master Data First**: Always create master data before transactions
2. **Reference Resolution**: Resolve linked fields (contacts, experiences, etc.)
3. **Random Dates**: Use random dates for transactions to simulate real data
4. **Error Handling**: Handle duplicate entries gracefully
5. **Background Jobs**: Use `frappe.enqueue()` for long-running operations
6. **Hooks Pattern**: Use hooks to make the system extensible

## Best Practices

- ✅ Use hooks to define master vs transaction doctypes
- ✅ Store data in JSON files for easy editing
- ✅ Resolve references automatically
- ✅ Handle duplicates gracefully
- ✅ Provide clear/delete functionality
- ✅ Use background jobs for large datasets
- ✅ Add validation to prevent duplicate creation
