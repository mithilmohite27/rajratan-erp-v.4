# Backend Phase 8G Lockdown Audit

## Scope

Phase 8G performed a final frontend direct-write audit and migrated the remaining reachable UI write paths to backend endpoints.

## Frontend Direct Write Surfaces Found

| Frontend file | Previous direct helper | Sheet affected | Reachable from UI | Risk | Status |
| --- | --- | --- | --- | --- | --- |
| `src/pages/Inventory.jsx` | `saveOpeningStock` | `Opening_Stock` | Yes, block stock quick fix | High | Migrated to `POST /api/setup` |
| `src/pages/MaterialStock.jsx` | `saveOpeningMaterialStock` | `Opening_Material_Stock` | Yes, material stock quick fix | High | Migrated to `POST /api/setup` |
| `src/pages/MaterialStock.jsx` | `saveExternalMaterialUsage` | `External_Material_Usage` | Yes, External tab | Medium | Migrated to `POST /api/material-usage` |
| `src/pages/CashFlow.jsx` | `saveVendorEntry` | `Vendor_Ledger` | Yes, vendor payment sync | Medium | Migrated to `POST /api/vendors` with `skipCashFlow` |
| `src/lib/sheets.js` | legacy write helpers | multiple existing tabs | No direct UI usage after this phase | Medium if reused later | Kept as deprecated legacy helpers |

## Migrations Completed

- Inventory opening stock adjustment now uses `POST /api/setup` with `action: "opening_stock"`.
- Material Stock opening material adjustment now uses `POST /api/setup` with `action: "opening_material_stock"`.
- External Material Usage now uses `POST /api/material-usage`.
- Cash Flow vendor payment sync now uses `POST /api/vendors` with `skipCashFlow: true` so Cash Flow is not double-written.

## Safety Behavior

- Inventory and Material Stock quick fixes keep high-risk confirmation before write.
- Duplicate warnings are handled before force save.
- `force: true` is sent only after the user confirms.
- Backend token and module permission checks apply before writes.
- No frontend fallback to direct Google Sheets write was added.

## Legacy Helper Status

`src/lib/sheets.js` still contains direct Google Sheets write helpers for compatibility and build safety, but they are marked deprecated for reachable UI writes.

Remaining direct-write code is legacy helper code only. Current audit scans did not find page-level usage of these legacy helpers for normal app writes.

## Schema / Data Safety

- No Google Sheet schema changes.
- No new columns.
- No tab renaming.
- No transaction IDs.
- No invoice ledger.
- No AI.
- No test data inserted.

## Validation Steps

- Run static direct-write scans across `src/pages`, `src/lib`, and `src/App.jsx`.
- Run backend syntax checks for new/changed API files.
- Run `npm run build`.
- Live write tests should be done only on a demo/test sheet.

## Recommendations Before Production Deployment

- Restrict direct Google Sheet sharing to trusted owners/admins.
- Consider removing or server-only isolating deprecated write helpers in a later cleanup once all imports are proven unused.
- Add backend audit logging/idempotency IDs in a future schema-approved phase.
- Run authenticated smoke tests on a demo sheet before deploying to production.
