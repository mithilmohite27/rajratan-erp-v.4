# Rajratan ERP Phase 1 Safety Checklist

This project can write to real Google Sheet business data. Complete this checklist before future upgrades, testing, imports, or schema-related work.

## Manual Google Sheet Backup

1. Open the current live Rajratan ERP Google Sheet.
2. In Google Sheets, choose `File` -> `Make a copy`.
3. Rename the copy with date and time, for example:
   `Rajratan ERP Backup - 2026-06-27 18-30`
4. Store the copy in a safe Google Drive folder.
5. Open the copied sheet and confirm these tabs are present:
   - `Config`
   - `Opening_Stock`
   - `Opening_Material_Stock`
   - `Production_Log`
   - `Production_Variants`
   - `CRM_Log`
   - `QC_Log`
   - `CashFlow_Log`
   - `Vendor_Ledger`
   - `Payroll_Log`
   - `External_Material_Usage`
6. Spot-check that production, CRM, cash, payroll, vendor, and config data are visible in the copied sheet.
7. Do not modify the live sheet during this backup process.
8. For development, copy the backup sheet ID into `.env` as `VITE_SHEET_ID` and set `VITE_SHEET_ENV=demo`.

## Phase 2 Duplicate Protection Plan

Highest priority duplicate risks:

1. Production duplicate: same date plus same color/batch in `Production_Variants`, or repeated same-day `Production_Log` entry.
2. CRM order duplicate: same client, date, color, order brass, and rate.
3. CRM dispatch duplicate: same client, date, color, dispatch brass, and transport details.
4. Payroll advance duplicate: same worker, date, amount, and source.
5. Vendor payment duplicate: same vendor, date, amount, and notes.
6. Cash duplicate: same date, source, type, amount, and description.
7. CSV import duplicate: repeated imported rows across production variants or CRM history.

Recommended Phase 2 approach:

1. Add a read-before-write duplicate check for each high-risk save action.
2. Show a confirmation dialog when a likely duplicate is detected.
3. Add stable transaction IDs for new rows only, after confirming schema strategy.
4. Keep append-only corrections where possible instead of deleting business records.
5. Add an owner-only duplicate review report before any automatic blocking.
