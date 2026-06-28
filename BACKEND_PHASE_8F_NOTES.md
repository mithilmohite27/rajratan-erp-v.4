# Backend Phase 8F Notes

## Scope

Phase 8F moves high-risk Setup page writes to the backend:

- Seed headers/default config
- Opening finished stock
- Opening material stock
- Production CSV import
- CRM CSV import

## Endpoint Added

- `POST /api/setup`

Supported actions:

- `seed_headers`
- `opening_stock`
- `opening_material_stock`
- `production_csv_import`
- `crm_csv_import`

## Permission Behavior

- Backend verifies the Google login token.
- Backend requires access to the `Setup` module.
- Owner has access by default.
- Admin can access only if explicitly configured with the `Setup` module.
- Operator, Viewer, unknown users, and missing/invalid tokens are blocked.

## High-Risk Confirmation

Every action requires:

- `confirmHighRisk: true`

If missing, the backend rejects the request before any write.

## Validation Behavior

- Opening stock requires date, type, color, and positive blocks or brass.
- Opening material stock requires date, type, material, positive quantity, and unit.
- Production CSV import validates date, valid color, and positive blocks.
- CRM CSV import validates date, client name, positive order brass, and valid color.
- Invalid import rows are rejected instead of silently skipped.

## Duplicate / Import Warning Behavior

- Opening stock duplicate check: Date + Type + Color + Blocks + Brass.
- Opening material duplicate check: Date + Type + Material + Quantity + Unit.
- Production import duplicate check: Date + Color + Blocks.
- CRM import duplicate check: Date + ClientName + Location + OrderBrass + Rate + Color.
- If duplicates are found, backend returns a warning before append.
- Frontend resends with `force: true` only after user confirmation.

## Existing Header Behavior

The backend preserves the old safe header behavior:

- Header rows are written only when the target tab is empty.
- Existing rows are not overwritten.
- No tabs, columns, or schemas are renamed.

## Frontend-Direct Writes Remaining

The main daily write paths now moved to backend include Settings, Cash Flow, Vendors, Payroll, Production, CRM/Dispatch, QC, and Setup/import/opening stock.

Remaining frontend-direct writes should be checked separately before final backend lockdown, especially any less-used helper actions or future modules added outside the phased migration.

## Testing Notes

- Build validation is safe and does not write to Google Sheets.
- Do not manually test Setup actions against the real production sheet unless explicitly approved.
- Use a demo/test sheet for live endpoint tests.

## Schema Confirmation

No new sheet tabs, columns, transaction IDs, invoice ledger, or migrations were added in this phase.
