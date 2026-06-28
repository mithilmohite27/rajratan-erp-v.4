# Rajratan ERP Phase 8C Backend Cash Flow Save Notes

Phase 8C moves only the Cash Flow row append to the backend.

No Payroll, Vendor, Production, CRM, Dispatch, QC, Setup, opening stock, import, invoice ledger, transaction ID, schema, or AI work is included in this phase.

## Endpoint Added

### `POST /api/cash-flow`

Purpose:

- Save one `CashFlow_Log` row through the backend.
- Verify Google token server-side.
- Check backend Cash Flow permission.
- Validate cash entry fields.
- Read existing `CashFlow_Log` rows for duplicate detection.
- Append to the existing `CashFlow_Log!A:A` schema only.

Request:

```json
{
  "entry": {
    "date": "2026-06-28",
    "type": "In",
    "source": "Factory",
    "amount": 1000,
    "description": "Client payment",
    "vendorName": ""
  }
}
```

Confirmed duplicate request:

```json
{
  "entry": {
    "date": "2026-06-28",
    "type": "Out",
    "source": "Factory",
    "amount": 500,
    "description": "Expense",
    "vendorName": "",
    "force": true
  }
}
```

Headers:

```text
Authorization: Bearer <google_token>
Content-Type: application/json
```

## Fields Validated

Existing `CashFlow_Log` schema is preserved:

```text
Date
Type
Source
Amount
Description
VendorName
```

Validation:

- `Date` is required.
- `Type` must be `In` or `Out`.
- `Source` must be `Factory` or `External`.
- `Amount` must be a positive number.
- `Description` is trimmed.
- `VendorName` is trimmed.
- No new columns are added.

## Permission Requirement

Backend permission checks use `MODULES.cashFlow`.

- Owner: allowed.
- Admin: allowed only if configured with Cash Flow permission.
- Operator/Viewer/Unknown: blocked unless specifically configured.

## Duplicate Check Behavior

Backend reads existing `CashFlow_Log` rows and checks for a duplicate with the same:

- Date
- Type
- Source
- Amount
- Description
- VendorName

If a match exists and `force` is not true, the endpoint returns:

```json
{
  "ok": false,
  "duplicate": true,
  "message": "Similar cash entry already exists. Please confirm before saving again."
}
```

The frontend then shows the existing duplicate confirmation dialog. If confirmed, it resends with `force: true`.

## Frontend Behavior

`src/pages/CashFlow.jsx` now saves cash rows through:

```text
POST /api/cash-flow
```

There is no silent fallback to the old frontend direct cash write.

Important: if "Vendor Payment" is selected in Cash Flow, the cash row now uses the backend, but the optional vendor ledger sync still uses the existing frontend `saveVendorEntry` path. Vendor write migration is intentionally deferred.

## Still Frontend-Direct

These writes are intentionally not migrated yet:

- Production save
- CRM order save
- CRM dispatch save
- QC save
- Payroll entry
- Vendor invoice/payment entry
- Setup seed/import/opening stock writes
- External material usage
- Cash Flow vendor-ledger sync for vendor payments

## Manual Test Checklist

Only test real saves after explicit approval and backup confirmation.

- Cash Flow save as Owner succeeds.
- Unknown user gets `403`.
- Missing/invalid token gets `401`.
- Invalid amount is rejected.
- Invalid Type/Source is rejected.
- Duplicate cash entry returns warning.
- Confirmed duplicate with `force: true` saves.
- `CashFlow_Log` columns remain unchanged.
- Other modules still use existing write paths.

## Recommended Phase 8D

Move Payroll and Vendor writes to backend next, including their paired Cash/Vendor ledger operations, so money-related multi-write flows are controlled server-side.
