# Using Demo Data Commands

## Command Line Usage

### Setup Demo Data

```bash
# For all sites
bench --site all setup-demo-data

# For a specific site
bench --site your-site-name setup-demo-data
```

### Clear Demo Data

```bash
# For all sites
bench --site all clear-demo-data

# For a specific site
bench --site your-site-name clear-demo-data
```

## Using Bench Console

You can also run the functions directly in bench console:

```bash
bench --site all console
```

Then in the console:

```python
from cheese.demo import setup_demo_data
setup_demo_data()

# Or to clear:
from cheese.demo import clear_demo_data
clear_demo_data()
```

## Using Python Script

Create a file `setup_demo.py`:

```python
import frappe

frappe.init(site="your-site-name")
frappe.connect()

from cheese.demo import setup_demo_data
setup_demo_data()

frappe.db.commit()
frappe.destroy()
```

Then run:
```bash
python setup_demo.py
```

## Notes

- Demo data will be skipped if contacts already exist
- Use `clear_demo_data()` first if you want to recreate demo data
- The system automatically resolves references and creates relationships
- Experience slots are generated for the next 30 days automatically
