# Rajratan ERP Phase 8D Backend Vendor + Payroll Save Notes

Phase 8D moves only Vendor and Payroll write flows to backend endpoints.

No Production, CRM, Dispatch, QC, Setup, imports, invoice ledger, transaction IDs, schema changes, or AI features are included in this phase.

## Endpoints Added

### `POST /api/vendors`

Purpose:

- Append vendor invoice/payment rows to `Vendor_Ledger`.
- Verify Google token server-side.
- Check backend Vendors permission.
- Validate vendor entry fields.
- Check likely duplicates before append.
- For `Payment` entries, append the existing paired Cash Flow out row.

### `POST /api/payroll`

Purpose:

- Append payroll rows to `Payroll_Log`.
- Verify Google token server-side.
- Check backend Payroll permission.
- Validate payroll entry fields.
- Check likely duplicates before append.
- For `Advance` entries, append the existing paired Cash Flow out row.

## Vendor Fields Validated

Existing `Vendor_Ledger` schema is preserved:

```text
Date
VendorName
Material
Type
Quantity
Unit
Amount
Notes
```

Validation:

- `Date` required.
- `VendorName` required.
- `Type` must be `Invoice` or `Payment`.
- `Amount` must be positive.
- `Material` required for invoice.
- `Quantity` must be positive when provided.
- `Unit` required when quantity is provided.
- `Notes` trimmed.
- Payment source must be `Factory` or `External`.

## Payroll Fields Validated

Existing `Payroll_Log` schema is preserved:

```text
Date
WorkerName
Type
Blocks
WageRate
Amount
Notes
```

Validation:

- `Date` required.
- `WorkerName` required.
- `Type` required.
- `Amount` must be positive.
- `Blocks` must be zero or positive.
- `WageRate` must be zero or positive.
- `Notes` trimmed.
- Cash source must be `Factory` or `External`.

## Permission Requirements

- `/api/vendors` requires Vendors permission.
- `/api/payroll` requires Payroll permission.
- Owner is allowed.
- Admin is allowed only if configured with the relevant module.
- Operator/Viewer/Unknown are blocked unless explicitly configured.

## Duplicate Check Behavior

Vendor duplicate check matches:

- Date
- VendorName
- Material
- Type
- Quantity
- Amount

Payroll duplicate check matches:

- Date
- WorkerName
- Type
- Blocks
- WageRate
- Amount

If a likely duplicate exists, backend returns a structured duplicate warning. The frontend shows the existing confirmation dialog and resends with `force: true` if confirmed.

## Paired Cash Write Behavior

Existing behavior is preserved:

- Vendor payment writes `Vendor_Ledger` and also writes `CashFlow_Log` as cash out.
- Payroll advance writes `Payroll_Log` and also writes `CashFlow_Log` as cash out.

No new accounting logic was added.

## Frontend Behavior

Updated:

- `src/pages/Vendors.jsx`
- `src/pages/Payroll.jsx`

Both pages now:

- keep the same forms,
- keep saving state,
- call backend endpoints,
- show duplicate confirmation when backend reports duplicate,
- do not silently fall back to direct frontend writes.

## Still Frontend-Direct

These writes are intentionally not migrated yet:

- Production save
- CRM order save
- CRM dispatch save
- QC save
- Setup seed/import/opening stock writes
- External material usage
- Inventory quick-fix opening stock

## Manual Test Checklist

Only test real saves after explicit approval and backup confirmation.

- Vendor purchase save as Owner succeeds.
- Vendor payment save as Owner succeeds.
- Vendor payment creates cash out.
- Payroll advance save as Owner succeeds.
- Payroll advance creates cash out.
- Unknown user gets `403`.
- Invalid token gets `401`.
- Invalid amount is rejected.
- Duplicate vendor entry returns warning.
- Duplicate payroll entry returns warning.
- Confirmed duplicate with `force: true` saves.
- `Vendor_Ledger`, `Payroll_Log`, and `CashFlow_Log` schemas remain unchanged.
- Other modules still use existing write paths.

## Recommended Phase 8E

Move Production, CRM order/dispatch, and QC writes to backend next because they affect stock and production reports.
