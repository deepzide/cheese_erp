# Quick Start: Adding Demo Data to Your Frappe/ERPNext App

## Summary

Based on ERPNext's implementation, here are **3 ways** to add demo data to your custom app:

## Method 1: Setup Wizard Integration (Like ERPNext) ⭐ Recommended

**When to use:** When you want users to optionally create demo data during initial setup.

### Steps:

1. **Add hook in `hooks.py`:**
```python
setup_wizard_complete = "your_app.setup_wizard.setup_wizard.setup_demo"
```

2. **Create `setup_wizard/setup_wizard.py`:**
```python
import frappe
from your_app.demo import setup_demo_data

def setup_demo(args):
    if args.get("setup_demo"):
        frappe.enqueue(setup_demo_data, enqueue_after_commit=True, at_front=True)
```

3. **Add checkbox in setup wizard UI** (optional):
Create `public/js/setup_wizard.js`:
```javascript
frappe.setup.slides_settings = [
    {
        name: "demo_data",
        fields: [{
            fieldname: "setup_demo",
            label: __("Generate Demo Data"),
            fieldtype: "Check",
        }],
    },
];
```

## Method 2: After Install Hook

**When to use:** When you want demo data created automatically after app installation.

### Steps:

1. **Add hook in `hooks.py`:**
```python
after_install = "your_app.install.after_install"
```

2. **Create `install.py`:**
```python
def after_install():
    from your_app.demo import setup_demo_data
    setup_demo_data()
    frappe.db.commit()
```

## Method 3: CLI Command (Current Implementation)

**When to use:** When you want manual control over when demo data is created.

### Steps:

1. **Create `commands.py`:**
```python
import click
import frappe
from frappe.commands import pass_context
from frappe.exceptions import SiteNotSpecifiedError

@click.command("setup-demo-data")
@click.option("--site", help="Site name")
@pass_context
def setup_demo_data(context, site=None):
    site = site or context.sites[0] if context.sites else None
    if not site:
        raise SiteNotSpecifiedError
    
    frappe.init(site=site)
    frappe.connect()
    
    try:
        from your_app.demo import setup_demo_data as setup_demo
        setup_demo()
        frappe.db.commit()
        click.echo("Demo data setup completed!")
    finally:
        frappe.destroy()

commands = [setup_demo_data]
```

2. **Usage:**
```bash
bench --site all setup-demo-data
```

## Required Components

Regardless of which method you choose, you need:

### 1. Demo Data Module (`demo.py`)

```python
import frappe
import json
import os

def setup_demo_data():
    process_masters()
    make_transactions()

def process_masters():
    for doctype in frappe.get_hooks("demo_master_doctypes"):
        data = read_json_file(doctype)
        for item in json.loads(data):
            frappe.get_doc(item).insert(ignore_permissions=True)

def make_transactions():
    for doctype in frappe.get_hooks("demo_transaction_doctypes"):
        data = read_json_file(doctype)
        for item in json.loads(data):
            frappe.get_doc(item).insert(ignore_permissions=True)
```

### 2. Hooks Configuration (`hooks.py`)

```python
demo_master_doctypes = [
    "your_doctype_1",
    "your_doctype_2",
]

demo_transaction_doctypes = [
    "your_transaction_1",
    "your_transaction_2",
]
```

### 3. JSON Data Files (`demo_data/`)

Create JSON files matching doctype names:
- `your_doctype_1.json`
- `your_transaction_1.json`

Example JSON format:
```json
[
    {
        "doctype": "Your DocType",
        "field1": "value1",
        "field2": "value2"
    }
]
```

## Complete Example

See the Cheese app implementation:
- `cheese/demo.py` - Demo data functions
- `cheese/demo_data/` - JSON data files
- `cheese/commands.py` - CLI commands
- `cheese/hooks.py` - Hooks configuration

## Comparison Table

| Method | User Control | Automatic | Best For |
|--------|-------------|-----------|----------|
| Setup Wizard | ✅ Yes (checkbox) | ❌ No | Production apps |
| After Install | ❌ No | ✅ Yes | Development/testing |
| CLI Command | ✅ Yes (manual) | ❌ No | All scenarios |

## Recommendation

- **For production apps:** Use Method 1 (Setup Wizard) - gives users choice
- **For development:** Use Method 2 (After Install) - automatic
- **For flexibility:** Use Method 3 (CLI) - full control

You can also combine methods - e.g., use CLI for development and Setup Wizard for production.
