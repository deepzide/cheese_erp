# Commands to Execute Demo Data Functions

## Using Bench Execute Command

### Execute `seed_mock_data_manual()` (Recommended)

This function checks if data exists and provides feedback:

```bash
bench --site all execute cheese.install.seed_mock_data_manual
```

### Execute `seed_mock_data()` directly

```bash
bench --site all execute cheese.install.seed_mock_data
```

### Execute `after_install()` 

```bash
bench --site all execute cheese.install.after_install
```

### Execute `after_migrate()`

```bash
bench --site all execute cheese.install.after_migrate
```

## Using the New Demo Data System

### Execute `setup_demo_data()` from demo.py

```bash
bench --site all execute cheese.demo.setup_demo_data
```

### Execute `clear_demo_data()` from demo.py

```bash
bench --site all execute cheese.demo.clear_demo_data
```

## Using CLI Commands (Alternative)

### Setup Demo Data
```bash
bench --site all setup-demo-data
```

### Clear Demo Data
```bash
bench --site all clear-demo-data
```

## Using Bench Console

```bash
bench --site all console
```

Then in the console:
```python
# Option 1: Using install.py
frappe.call("cheese.install.seed_mock_data_manual")

# Option 2: Using demo.py
from cheese.demo import setup_demo_data
setup_demo_data()

# Option 3: Direct function call
from cheese.install import seed_mock_data
seed_mock_data()
frappe.db.commit()
```

## Recommended Command

For the new demo data system (following ERPNext pattern):
```bash
bench --site all execute cheese.demo.setup_demo_data
```

For the existing mock data system:
```bash
bench --site all execute cheese.install.seed_mock_data_manual
```
