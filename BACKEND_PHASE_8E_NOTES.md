# Backend Phase 8E Notes

## Scope

Phase 8E moves Production, CRM order/dispatch, and QC write actions from direct frontend Google Sheets writes to backend API endpoints.

## Endpoints Added

- `POST /api/production`
- `POST /api/crm`
  - `action: "create_order"`
  - `action: "dispatch"`
- `POST /api/qc`

## Existing Sheet Tabs Used

- `Production_Log`
- `Production_Variants`
- `CRM_Log`
- `QC_Log`

No new sheet tabs, columns, transaction IDs, migrations, or schema changes were added.

## Safety Behavior

- Backend verifies Google login token.
- Backend checks module permission before writing.
- Backend reads existing rows before append to detect likely duplicates.
- If a likely duplicate is found, backend returns `409` with `duplicate: true`.
- Frontend shows the existing duplicate confirmation warning.
- If the user confirms, frontend retries with `force: true`.

## Preserved Behavior

- Production calculations remain frontend-calculated exactly as before.
- Production still writes one `Production_Log` row plus per-color `Production_Variants` rows.
- CRM order still writes one row per color with `Status = "Order"`.
- CRM dispatch still writes one row per color with `Status = "Dispatched"`.
- QC still writes one `QC_Log` row and continues to drive inventory deduction through existing read logic.
- No stock, dispatch, cash, payroll, P&L, invoice, or reporting formulas were changed.

## Validation Notes

- Do not call these endpoints against the real production sheet unless manually approved.
- Build validation is safe because it does not write to Google Sheets.
- Live duplicate warning QA should be done only on a demo/test sheet.
