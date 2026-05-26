# Suggested Commit Messages

Use these in order, one commit per issue/fix:

1. `fix(pricing): use route-specific prices for route booking totals and previews`
   - Prevent route bookings from silently falling back to individual experience prices.
   - Keep route sum calculations aligned with route pricing rules.

2. `feat(ticket): add bot endpoint to record customer notes on tickets`
   - Add `record_customer_notes` to save or append customer notes on existing tickets.
   - Validate ticket existence and reject empty note payloads.

3. `fix(ui): keep experience selector text inside control without hiding actions`
   - Truncate long selected values in `FrappeSearchSelect`.
   - Preserve clear/expand icons visibility for long experience names.

4. `fix(calendar-i18n): translate calendar view labels and headers to active locale`
   - Localize all-day labels, weekday headers, month legends, and overflow labels.
   - Add missing translation keys used by calendar components.

5. `feat(booking-policy): support linking one policy to multiple experiences`
   - Update booking policy creation flow to select and link multiple experiences.
   - Keep policy reusable without forcing a single-experience association.
