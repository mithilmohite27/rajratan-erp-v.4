# Rajratan ERP Backend Security Migration Plan

Phase 8 is planning only. This document prepares the future backend/serverless migration for stronger write protection, audit trail, idempotency, invoice ledger, and later AI-safe workflows.

No code migration, Google Sheet schema change, transaction ID column, invoice ledger sheet, or real Google Sheet write is part of this phase.

## A. Current Architecture

Current flow:

```text
Frontend React/Vite app -> Google Sheets API -> Live Google Sheet
```

The browser signs in with Google OAuth and receives a user access token. The frontend then calls Google Sheets API directly from `src/lib/sheets.js` using that token.

This works for the current ERP, but the browser is still the write client. That means strong server-side permission checks, audit trail enforcement, transaction IDs, retry-safe writes, and future AI actions are not yet centrally controlled.

Current frontend protections already added in earlier phases:

- Manual backup and environment safety notes.
- Frontend Owner/Admin/Operator route permissions.
- Duplicate warnings and saving-state guards on key forms.
- Dangerous action confirmations for setup/import/config writes.

Important limitation: frontend permissions are useful for UI safety, but they are not the final source of truth. Google Sheet sharing and a future backend API must become the stronger protection layer.

## B. Current Write Paths

| Write action | Current page/file | Current helper | Google Sheet tab/range | Risk | Duplicate protection today | Move to backend first? |
|---|---|---|---|---|---|---|
| Production daily total save | `src/pages/Production.jsx` | `saveProductionEntry` | `Production_Log!A:A` | Very high, affects production cost and reports | Frontend warning/save guard from Phase 2 | Yes, Phase 8D |
| Production color variants save | `src/pages/Production.jsx` | `saveProductionVariants` | `Production_Variants!A:A` | Very high, drives finished stock inflow | Frontend warning/save guard from Phase 2 | Yes, Phase 8D |
| CRM order save | `src/pages/CRM.jsx` | `saveCRMEntry` | `CRM_Log!A:A` | High, drives orders and revenue | Frontend warning/save guard from Phase 2 | Yes, Phase 8D |
| CRM dispatch update | `src/pages/CRM.jsx` | `saveCRMEntry` | `CRM_Log!A:A` | Very high, reduces stock and affects revenue | Frontend warning/save guard from Phase 2 | Yes, Phase 8D |
| QC save | `src/pages/QC.jsx` | `saveQCEntry` | `QC_Log!A:A`, header repair via `QC_Log!A1` | High, affects stock and wastage loss | Frontend warning/save guard from Phase 2 | Yes, Phase 8D |
| Vendor invoice | `src/pages/Vendors.jsx` | `saveVendorEntry` | `Vendor_Ledger!A:A` | High, affects material stock and vendor reporting | Frontend warning/save guard from Phase 2 | Yes, Phase 8C |
| Vendor payment | `src/pages/Vendors.jsx` | `saveVendorEntry`, `saveCashFlowEntry` | `Vendor_Ledger!A:A`, `CashFlow_Log!A:A` | Very high, writes two ledgers | Frontend warning/save guard from Phase 2 | Yes, Phase 8C |
| Cash in/out | `src/pages/CashFlow.jsx` | `saveCashFlowEntry` | `CashFlow_Log!A:A` | High, affects cash position | Frontend warning/save guard from Phase 2 | Yes, Phase 8C |
| Cash vendor payment sync | `src/pages/CashFlow.jsx` | `saveCashFlowEntry`, `saveVendorEntry` | `CashFlow_Log!A:A`, `Vendor_Ledger!A:A` | Very high, writes two ledgers | Frontend warning/save guard from Phase 2 | Yes, Phase 8C |
| Payroll advance/payment | `src/pages/Payroll.jsx` | `savePayrollEntry`, `saveCashFlowEntry` | `Payroll_Log!A:A`, `CashFlow_Log!A:A` | Very high, writes payroll and cash | Frontend warning/save guard from Phase 2 | Yes, Phase 8C |
| Settings Config save | `src/pages/Settings.jsx` | `saveConfig` | `Config!A1` | Very high, can overwrite config values | Confirmation and zero-value guard | Yes, first write migration in Phase 8B |
| Setup seed static data | `src/pages/Setup.jsx` | `seedStaticData` | `Config`, all core headers | Very high, writes headers/defaults | Dangerous confirmation/collapsed advanced tools | Yes, but after daily writes are stable |
| Opening finished stock | `src/pages/Setup.jsx`, `src/pages/Inventory.jsx` | `saveOpeningStock` | `Opening_Stock!A:A` | Very high, changes stock baseline | Dangerous confirmation in Setup; Inventory quick fix still high risk | Yes, setup/admin backend endpoint |
| Opening material stock | `src/pages/Setup.jsx`, `src/pages/MaterialStock.jsx` | `saveOpeningMaterialStock` | `Opening_Material_Stock!A:A` | Very high, changes material baseline | Dangerous confirmation in Setup; Material quick fix still high risk | Yes, setup/admin backend endpoint |
| CSV production import | `src/pages/Setup.jsx` | `bulkImportProductionVariants` | `Production_Variants!A:A` | Very high, bulk stock inflow | Duplicate count/confirmation from Phase 2 | Yes, setup/import backend endpoint |
| CSV CRM import | `src/pages/Setup.jsx` | `bulkImportCRM` | `CRM_Log!A:A` | Very high, bulk CRM/dispatch history | Duplicate count/confirmation from Phase 2 | Yes, setup/import backend endpoint |
| External material usage | `src/pages/MaterialStock.jsx` | `saveExternalMaterialUsage` | `External_Material_Usage!A:A` | High, reduces material stock | Basic form validation, should gain backend duplicate/idempotency | Yes, Phase 8C or 8D |

Shared low-level write helpers in `src/lib/sheets.js`:

- `appendRow`
- `appendRows`
- `updateRange`
- `ensureHeaders`

These should eventually be moved out of frontend usage for sensitive writes. Frontend read helpers can remain temporarily during migration.

## C. Recommended Future Architecture

Future secure flow:

```text
Frontend React/Vite app -> Vercel Serverless API -> Google Sheets API using service account -> Google Sheet
```

Recommended write behavior:

1. Frontend sends a request to an API endpoint.
2. API receives the Google ID/access token or a verified session.
3. API verifies the token and extracts email/name.
4. API checks backend Owner/Admin/Operator/Viewer permissions.
5. API validates request body and required fields.
6. API checks duplicate/idempotency rules.
7. API writes to Google Sheets using a service account.
8. API returns structured success/error to frontend.

The frontend should never hold service account credentials. Sensitive writes should eventually stop using the user's browser token directly.

Recommended platform: **Vercel Serverless Functions**.

Why Vercel Serverless fits best:

- The app is already Vite/Vercel-style.
- It keeps deployment simple with frontend and API in one Vercel project.
- It supports environment variables for service account secrets.
- It is easier to phase in endpoint-by-endpoint than a full Express backend.
- It keeps the path open for future AI features through controlled server-side workflows.

Alternatives:

- Google Apps Script Web App: close to Sheets, but weaker developer workflow, versioning, testing, and auth ergonomics.
- Firebase Functions: strong Google integration, but more setup than needed right now.
- Express backend: powerful, but adds separate hosting/ops unless the project grows beyond serverless limits.

## D. Serverless API Plan

Future backend environment variables:

```text
GOOGLE_SERVICE_ACCOUNT_EMAIL
GOOGLE_PRIVATE_KEY
SPREADSHEET_ID
OWNER_EMAIL
GOOGLE_CLIENT_ID
ALLOWED_ORIGINS
NODE_ENV
```

Rules:

- Private backend secrets must never use the `VITE_` prefix.
- `GOOGLE_PRIVATE_KEY` must never be sent to frontend code.
- The Google Sheet should be shared with the service account email.
- Frontend public values may keep `VITE_GOOGLE_CLIENT_ID` and demo labels, but write secrets belong only to backend env.

Endpoint plan:

| Endpoint | Required role | Reads/writes | Validation | Duplicate/idempotency need |
|---|---|---|---|---|
| `POST /api/production` | Owner/Admin/Operator with Production | Writes `Production_Log` and `Production_Variants` | Date, total blocks, color rows, material/cost fields | Very high. Use idempotency key and date/color/batch/quantity duplicate check |
| `POST /api/crm/order` | Owner/Admin/Operator with CRM | Writes order row to `CRM_Log` | Client, date, location, color, rate, quantity | High. Check client/date/location/color/rate/quantity |
| `POST /api/crm/dispatch` | Owner/Admin/Operator with CRM | Writes dispatched row to `CRM_Log` | Existing order reference, dispatch qty, stock availability if possible | Very high. Prevent double dispatch/retry stock deduction |
| `POST /api/qc` | Owner/Admin/Operator with QC | Writes `QC_Log` | Date, color, broken blocks, loss amount | High. Check date/color/blocks/cost duplicate |
| `POST /api/vendors` | Owner/Admin with Vendors | Writes `Vendor_Ledger`; may write cash if payment | Vendor, material, type, quantity, amount | Very high for payment. Use idempotency key and invoice/payment duplicate check |
| `POST /api/payroll` | Owner/Admin with Payroll | Writes `Payroll_Log`; may write cash | Worker, type, date, blocks/rate/amount | Very high. Prevent duplicate advance/payment |
| `POST /api/cash-flow` | Owner/Admin with Cash Flow | Writes `CashFlow_Log`; may sync vendor payment | Type, source, amount, vendor, description | Very high. Prevent duplicate cash in/out |
| `POST /api/settings/config` | Owner only initially | Writes `Config!A:B` | Known keys, numeric ranges, positive GST, zero-value guard | High. Require confirmation flag and audit entry later |
| `POST /api/setup/import` | Owner only | Writes setup/import/opening rows | File shape, allowed tabs, dry-run preview first | Extreme. Require dry-run, duplicate report, backup acknowledgement |
| `GET /api/dashboard` | Owner/Admin/Operator/Viewer based on modules | Reads existing tabs, returns dashboard summary | Date range/module permission | None for writes; cache carefully |
| `GET /api/reports` | Owner/Admin/Viewer with reports/P&L | Reads existing tabs, returns report data | Date range/report type | None for writes |
| `GET /api/config` | Allowed logged-in users | Reads safe config keys | Key whitelist | None |

API response format should be consistent:

```json
{
  "ok": true,
  "message": "Saved",
  "data": {},
  "duplicateWarning": null,
  "idempotencyKey": "..."
}
```

Error response:

```json
{
  "ok": false,
  "code": "PERMISSION_DENIED",
  "message": "You do not have permission for this module."
}
```

## E. Permission Model

Frontend permissions should remain for UI convenience:

- Hide modules.
- Block direct routes.
- Show clean access pending / no-permission screens.

Backend permissions should become the source of truth:

- Owner: all modules, all reads/writes, setup/config access.
- Admin: configured module access, operational writes where granted.
- Operator: limited daily operation writes, normally Production, Inventory, Material Stock, optionally CRM dispatch.
- Viewer: read-only dashboard/reports/config display, no writes.
- Unknown: blocked before any data read/write.

Permission checks should happen on every API request. Never trust only the frontend.

Initial backend permission storage can mirror the current config constant. Later, after schema approval, move users/roles to a secure database or controlled backend config, not directly editable by ordinary ERP users.

## F. Audit Trail Plan

Future audit trail should be added only after schema approval.

Possible future columns for write tabs:

- `Entry_ID`
- `Created_At`
- `Created_By_Email`
- `Created_By_Name`
- `Source_Module`
- `Updated_At`
- `Voided`
- `Void_Reason`

Do not add these columns now.

Recommended audit behavior:

- Every backend write stamps who created it.
- Corrections should prefer void/reversal over delete.
- Backend should log request metadata where safe.
- High-risk writes should include a user-facing reason/notes field.
- Setup/import/config writes should require stronger audit details.

## G. Transaction ID / Idempotency Plan

Current frontend duplicate warnings are helpful but not enough for network retry/double-submit protection.

Future backend method:

1. Frontend generates an `Idempotency_Key` per save attempt, or backend issues one before save.
2. Backend receives the key with the write request.
3. Backend checks whether that key already exists.
4. If key exists, backend returns the original success response and does not append again.
5. If key does not exist, backend validates and writes once.

Possible key format:

```text
module-userEmail-timestamp-randomSuffix
```

For stricter integrity after schema approval, use `Entry_ID` column on each write tab.

Recommended duplicate layers:

- Idempotency key for exact retry/double-click.
- Business duplicate checks for likely duplicate entry.
- Confirmation workflow for "similar but possibly legitimate" entries.
- Hard block only when the exact same idempotency key or exact submitted payload is already written.

## H. Invoice Ledger Plan

Do not create invoice ledger now.

Future possible sheet: `Invoice_Ledger`

Possible fields:

- `Invoice_ID`
- `Invoice_Number`
- `Type` such as GST Invoice, Challan, Proforma, Delivery Note
- `Date`
- `ClientName`
- `Amount`
- `GST`
- `Generated_By`
- `Source_CRM_Row`
- `Status`

Recommended behavior:

- Invoice number allocation should happen on backend.
- Backend should prevent duplicate invoice numbers.
- Generated invoices should link to CRM/order/dispatch source when possible.
- Voiding/canceling should not delete rows; use `Status`.
- PDF generation can remain frontend initially, but ledger write should be backend-controlled.

## I. Migration Phases

Recommended safe migration:

### Phase 8A: Backend Skeleton

- Add Vercel API folder.
- Add `GET /api/health`.
- Add `GET /api/config` for safe config read.
- Add token verification utility.
- Add backend permission utility.
- No write migration yet.

### Phase 8B: Move Settings Save

- Move `saveConfig` behind `POST /api/settings/config`.
- Keep existing confirmation UI.
- Validate known config keys server-side.
- Preserve current Config schema.

### Phase 8C: Move Cash, Payroll, Vendor Writes

- Move `CashFlow_Log`, `Payroll_Log`, and `Vendor_Ledger` writes.
- Handle multi-write operations server-side.
- Add idempotency for payment/advance writes.
- Preserve existing columns.

### Phase 8D: Move Production, CRM, Dispatch, QC Writes

- Move production daily total + variants together.
- Move CRM order and dispatch writes.
- Move QC writes.
- Add backend duplicate checks before append.
- Keep current columns until schema approval.

### Phase 8E: Add Audit Trail and Transaction IDs

- Only after explicit schema approval.
- Add `Entry_ID`, created metadata, and void fields.
- Backfill is optional and should be planned separately.

### Phase 8F: Invoice Ledger

- Only after schema approval.
- Add `Invoice_Ledger`.
- Backend controls invoice/challan numbering.

### Phase 8G: AI Features

- Only after backend read/write approval workflow exists.
- AI should suggest or draft actions first.
- Human approval required before any write.
- Backend remains the only writer.

## J. Risks

Token verification risk:

- Backend must verify Google tokens properly using `GOOGLE_CLIENT_ID`.
- Never trust email passed directly from frontend without verification.

Service account risk:

- Google Sheet must be shared with the service account.
- Service account should have only the needed spreadsheet access.
- Private key handling must be exact in Vercel env, including newline formatting.

Sheet sharing risk:

- If users still have direct edit access to the Google Sheet, backend controls cannot prevent manual sheet edits.
- Strongest security requires limiting direct sheet editors.

Schema compatibility risk:

- Existing columns must be preserved during migration.
- Backend must write exactly the current column order until a schema phase is approved.

Concurrent write risk:

- Google Sheets append is not a full database transaction.
- Multi-row writes can partially fail if not carefully handled.
- Backend should validate first, write second, and return clear errors.

Rollback risk:

- During partial migration, some writes may still use frontend and some backend.
- Each migrated module needs a clear fallback/rollback plan.

Partial migration confusion:

- Avoid moving all writes at once.
- Label migrated endpoints clearly in code.
- Keep frontend behavior identical while changing only the write transport.

Import/setup risk:

- Bulk imports and setup writes are the highest risk.
- Require dry-run, duplicate report, explicit backup confirmation, and Owner role.

## K. Final Recommendation

Use Vercel Serverless Functions as the future backend layer.

Start with a small Phase 8A implementation:

1. Add backend health endpoint.
2. Add token verification.
3. Add backend permission utility.
4. Add safe read-only config/dashboard endpoint.
5. Do not migrate writes until the backend auth path is proven locally and on Vercel.

After 8A is stable, move writes gradually:

1. Settings Config save first.
2. Cash/Payroll/Vendor writes next.
3. Production/CRM/Dispatch/QC after that.
4. Audit trail, transaction IDs, and invoice ledger only after schema approval.

This keeps the current ERP stable while preparing it for stronger security, safer duplicate protection, owner auditability, and later AI-assisted workflows.
