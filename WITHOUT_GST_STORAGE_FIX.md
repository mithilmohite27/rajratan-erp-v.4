# Without GST storage error: cause and safe recovery

Sequence-source update: [NGST_SEQUENCE_DIAGNOSTIC.md](./NGST_SEQUENCE_DIAGNOSTIC.md) explains the Config-only validation fix. `Config!A:B` is now consulted for NGST_START_NUMBER; the environment variable is a legacy fallback, and any populated journal's recorded base is preserved. Do not increment either setting after saving bills.

## Confirmed repository findings

`api/without-gst-bills.js` read `Without_GST_Journal!A:I` for both GET (load) and POST (save). That journal was documented as a manual prerequisite but was not registered in `seedStaticDataIfEmpty()` or exposed through a Setup migration. Existing `ensureHeadersIfEmpty()` writes header values; it does not create missing worksheets. Consequently, running the previous Setup seeder did not provision billing storage.

The previous UI persisted a pending request ID before sending the save, then retained it on schema/transport failures. Retaining the ID was appropriate for uncertain writes, but the workflow had no explicit read-only request reconciliation and did not validate storage before creating a new pending request. It also cleared every HTTP 409, even though an ID-reuse conflict is not proof that the pending financial operation did not commit. Concurrent same-ID requests could append duplicate physical events, although journal replay prevented duplicate bills.

The reported range error proves that the deployed API could not read the requested range; by itself it does not prove which spreadsheet/tab/header/configuration problem exists. The new checks distinguish absent/near-matching worksheet names, insufficient columns, incompatible headers, missing Config, sequence configuration, frontend/backend target mismatch, and inaccessible metadata. No configured backend credentials or `NGST_START_NUMBER` exist in this workspace's `.env` or execution environment. Therefore the live spreadsheet's contents/headers, deployed environment, and actual browser pending request could NOT be inspected or changed here. The fix is implemented and tested locally; production reconciliation remains an explicit operator step.

## What changed

- Added shared `JOURNAL_TAB`/`JOURNAL_RANGE` constants and registered the exact existing nine-column journal schema in managed setup. No journal-column migration is needed if the current worksheet already has compatible data.
- Added an explicit `reconcile_without_gst` action to the existing authenticated `/api/setup` endpoint. It follows existing Setup permission and confirmation rules, defaults to dry-run, and rechecks after a confirmed repair.
- Setup → Advanced Setup Tools → **Without GST storage** now exposes **Check Without GST storage** and **Repair missing billing storage**. Repair is offered only after a clean check with proposed changes.
- Repair creates the missing worksheet and exact headers in one atomic batch, or initializes a completely empty worksheet. Repeated/concurrent repairs do not duplicate worksheets. Nonempty incompatible headers, data below an empty first row, similarly named journals, missing Config or an unresolved sequence stop repair. It never deletes, resets, sorts, renames or overwrites existing journal records.
- The general Seed Database action includes the journal. Header-only seeding does not invent a number base; actual load/save and the dedicated readiness check still require a valid, consistent `NGST_START_NUMBER`.
- Billing load/save checks required worksheets (`Without_GST_Journal` and `Config`), journal integrity and NGST base before any financial append. CRM remains optional for manual billing. Ordinary page loads never create or repair Sheets.
- New saves preflight storage BEFORE creating pending state. Already-pending requests preserve the full original payload/ID. **Check pending save** sends a read-only reconciliation request; **Retry pending save** checks first, then resends the identical financial request only if no stored event was found.
- Pending state is durably cleared only for a matching committed result or a matching, durably rejected journal event. Missing schema, absent events, generic errors, permission failures, or ID mismatch do not clear it. An absent event alone cannot rule out an in-flight write.
- Each new event atomically creates a deterministic named-range marker and appends literal cell values in one Sheets batch. Duplicate marker IDs fail the whole batch; the API then reads the existing event. This prevents a second physical append on concurrent same-ID retries. Keep these request markers: do not delete them to force a retry. Existing historical duplicate/rejected rows are preserved.
- Stale/financially conflicting valid intents are kept as rejected audit events. They do not reserve a bill number or change a bill. NGST numbering is still assigned only to accepted new bill creations in original append order.

The batch uses [Google's atomic batch semantics](https://developers.google.com/workspace/sheets/api/guides/batch) and [duplicate namedRangeId validation](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/request#AddNamedRangeRequest). Marker storage grows with the journal; retain metadata in backups and do not recreate it independently of journal history.

## Production recovery — explicit operator action required

1. Back up the existing spreadsheet. Keep the affected browser's local working draft and pending ID. Do not clear browser storage or create a replacement bill.
2. Verify the deployed `SPREADSHEET_ID`, service-account access, and frontend `VITE_SHEET_ID` refer to the intended existing spreadsheet. Keep the ORIGINAL `NGST_START_NUMBER` base for a populated journal. For a genuinely new journal, reconcile previously printed bills and configure the initial base in Config column B beside the NGST_START_NUMBER key in column A; never assume 1. A legacy server environment setting is optional but must agree if present.
3. Use the new code in a staging copy first. No deployment was performed by this fix. After the approved release, sign in as an owner/Setup-authorized operator and run **Setup → Advanced Setup Tools → Without GST storage → Check Without GST storage**.
4. Resolve reported configuration/name/header issues. If the check only proposes creating a missing journal or initializing an empty one, choose **Repair missing billing storage** and explicitly confirm the target and backup. A populated/mismatched journal requires inspection and a separate approved correction; do not use forced seeding or manual deletion.
5. Return to the ORIGINAL affected browser and choose **Check pending save**. A matching committed request resolves without another append. A stored rejected event unlocks the working draft while retaining its edits. If not found, choose **Retry pending save** using the displayed original ID; one event/bill is created, with no extra number reservation. Unknown/incompatible results remain pending for owner review.
6. Open the saved bill, verify deliveries/payments/freight, and print a preview. Confirm the existing GST invoice and delivery challan still work.

Equivalent authenticated API requests (use the existing signed-in Google bearer token; these examples were NOT executed against production):

```http
POST /api/setup
Authorization: Bearer <existing-user-token>
Content-Type: application/json

{"action":"reconcile_without_gst","confirmHighRisk":true,"dryRun":true}
```

Only after reviewing a clean dry-run and approving the schema write:

```json
{"action":"reconcile_without_gst","confirmHighRisk":true,"dryRun":false}
```

Read-only pending lookup uses `POST /api/without-gst-bills` with the UNCHANGED original pending body plus `"reconcile": true`. Do not change `id`, `billId`, `expectedVersion`, action, bill payload or reason. A normal retry omits only `reconcile`; the UI handles this automatically.

## Modified files

- `api/_lib/withoutGstSchema.js`: read-only readiness, safe Setup reconciliation, atomic idempotent append plan.
- `api/_lib/googleSheets.js`: metadata/batch transport and managed journal seeding.
- `api/_lib/setupValidation.js`, `api/setup.js`: explicit protected repair action.
- `api/without-gst-bills.js`: schema preflight, read-only request lookup, authoritative outcomes and guarded append/replay.
- `src/lib/withoutGst.js`, `src/lib/withoutGstApi.js`: shared range constants and structured error details.
- `src/components/WithoutGstBilling.jsx`: pre-save readiness, preserved pending request, explicit reconciliation and safe clearing.
- `src/pages/Setup.jsx`: check/repair UI using existing confirmation flow.
- Tests: new schema and actual mocked Sheets/auth transport suites, in-memory atomic Sheets fixture, and expanded domain/browser pending-save regressions.
- Documentation: this runbook and `WITHOUT_GST_BILLING_NOTES.md`.

GST calculations, invoice numbers, delivery-challan templates, delivery/payment calculations and print layout were not rewritten. No database, paid dependency, production record edits or automatic deployment were introduced.

## Verification executed — 31 October 2026

- `npm test`: 35 passed, 0 failed, 0 skipped. Includes missing/incompatible schemas, repeated/concurrent repair, blank-displaying formula preservation, configured target/sequence checks, real authenticated API/Sheets transport with mocked HTTP, same-ID guarded append, pending reconciliation, multi-delivery/payment/freight persistence, GST/challan regressions and browser behavior.
- The browser suite verifies schema failure before new pending-state creation, preservation of an existing pending ID through errors and a not-found lookup, same-ID retry with one physical event, read-only resolution of an existing commit, and preservation on an ID-mismatch HTTP 409. Native print UI is intercepted and its invocation asserted; actual PDFs are exported using Chromium's PDF engine, avoiding concurrent native-dialog/PDF jobs in headless testing.
- `npm run build`: passed, with the existing Vite large-bundle warning.
- `tests/check-without-gst-pdfs.py`: passed for the 2-page bill and 6-page/100-delivery bill, including logo, A4, margins, repeated headings, every row, page counters and intact summaries.
- `git diff --check`: passed. No lint/typecheck script is configured.
- All storage, authorization and HTTP test data are isolated fixtures. Live spreadsheet metadata, journal headers, committed status of the affected browser request, and production environment remain unverified because backend credentials/session state were unavailable here. No migration command was executed against a real spreadsheet and nothing was deployed.
