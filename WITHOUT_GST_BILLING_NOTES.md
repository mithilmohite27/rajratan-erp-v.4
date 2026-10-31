# Without GST billing: implementation and rollout

Storage recovery update: use [WITHOUT_GST_STORAGE_FIX.md](./WITHOUT_GST_STORAGE_FIX.md) for the managed Setup check/repair and pending-request reconciliation workflow. It supersedes the original manual worksheet-creation instruction below. Ordinary page loads remain read-only; explicit setup now provisions a missing journal safely. New event appends use an atomic named-range request marker plus literal appendCells to prevent physical duplicates on concurrent same-ID retries.

## Audit findings

- The application is React 18 + Vite, with Tailwind and Vercel-style Node API handlers. `src/pages/Billgenerator.jsx` contains the existing GST invoice and delivery-challan forms/templates. Those calculations, template bodies, configurable prefixes, and numbering inputs are unchanged.
- The original Without GST tab held one delivery and a separate in-memory draft with manually entered `NGST1`. No bill persistence, number reservation, saved-bill retrieval, or issued-document history existed.
- CRM clients and dispatches come from `CRM_Log` through `src/lib/sheets.js`. Client names, addresses, and latest rates are reused. There is no product catalog with stable product IDs; product/specification entry remains manual with suggestions.
- Cashflow has `Date | Type | Source | Amount | Description | VendorName`; CRM receipts likewise lack stable transaction IDs. Automatically importing/posting these rows would risk double allocation. Billing therefore keeps its own payment allocations and freight records and NEVER creates or changes Cashflow, CRM, inventory, or dispatch transactions.
- Authentication follows `verifyGoogleToken`; API access follows the existing `Bills` permission. The frontend remains behind the existing protected `/bills` route.
- Existing automated tests use Node's built-in test runner. Added scripts are `npm test` and `npm run test:billing:browser`. The repository has no lint/typecheck script.

## Features

- Standard itemized bills and consolidated supply bills, with delivery date, product/specification, location, quantity, unit, and independent rates. Rows can be added, edited, duplicated, removed with confirmation, and reordered.
- Client selection from CRM, manual entry, immediate financial summary, quantities grouped by unit, explicit credit/overpayment display, and validation before preview/issue.
- Multiple bill-specific payments and explicitly deductible freight. Payment IDs and nonempty references cannot be allocated to multiple bills; repeated same-date/amount/method/reference payments are flagged as possible duplicates. Distinct genuine cash payments need a distinct reference to distinguish them.
- Per-user browser working-draft backup, isolated from the GST form, including the original request ID for pending-save recovery. Save/open drafts, finalize, search, date/payment-status filters, duplicate as a new bill (WITHOUT copying payments/freight), and subsequent settlement updates.
- Issued bill snapshots are immutable. Start Revision requires a reason; finalizing the revised draft increments the issued revision. Settlement corrections require a reason and preserve issued customer/delivery data. Each accepted snapshot records the verified actor and server timestamp. The full history can be viewed and printed.
- A4 branded print layout with company settings, customer/state, delivery table, unit totals, payments, deductible freight, outstanding/credit, amount in words, bank details, notes and signature. Repeated table headings, page counters, row-break protection, and an intact financial summary support long bills. Printing uses the browser's Save as PDF and waits for logo loading. No paid service or new production package is used.

## Financial behavior

Shared browser/API calculations use integer paise and BigInt multiplication. Quantities support four decimal places; rates and adjustment amounts support two. Each line rounds half-up to the nearest paise, then rounded lines are summed. Negative inputs, zero quantities, malformed dates, missing issue fields, duplicate IDs/references, and unsafe numeric ranges are rejected.

`Outstanding = Grand total - Allocated payments - Explicitly deductible freight`

An excess allocation is shown separately as credit, with outstanding at zero. Brass and Pieces are never added together. Unit labels are trimmed and compared without case sensitivity; distinct labels such as Pieces and Nos remain separate. Freight is non-deductible by default. A blank draft rate/quantity may be saved, but cannot be issued or previewed as a complete bill.

Payments in this module are allocation records, NOT cash receipts posted to the general ledger. Record/reconcile actual money in the existing Cashflow workflow separately. For a pre-existing cash receipt, record its bank/UPI/internal reconciliation reference when allocating it here. The legacy ledgers cannot automatically detect a second allocation entered under a different ID/reference, and do not safely support splitting a single receipt across bills. No automatic legacy payment import or split-receipt allocation is claimed.

## Minimal Sheets extension

One new worksheet, `Without_GST_Journal`, stores an append-only event stream. Headers in A1:I1, in this exact order:

```text
EventID | BillID | ExpectedVersion | Action | Actor | Timestamp | PartIndex | PartCount | PayloadChunk
```

Payload JSON contains the complete bill header, delivery IDs/items, payment allocation IDs, freight IDs, correction reason, company snapshot on issue, and sequence starting value. Large payloads are split across contiguous 30,000-character cells/rows in a SINGLE append request. There is no fixed editor row limit; Sheets, browser storage, and hosting request limits still apply. Writes use RAW input so user text is not interpreted as a formula. Existing tabs/records are untouched.

Events are replayed in physical append order. A save is accepted only when its ExpectedVersion matches the latest accepted event for that bill. The first matching save wins; stale attempts stay in the journal and are rejected instead of silently replacing newer data. A new accepted bill creation reserves the next NGST number in append order. Editing, issuing, retrying, and chunking do not consume additional numbers. Abandoned saved drafts retain their reserved numbers. No number is reused by the app.

Request IDs make retries idempotent, including an uncertain connection after append. The UI blocks editing/new submissions until the pending request is retried. Concurrent requests are verified by replaying the stored journal after append. An API/network error may mean a write succeeded; retry the SAME request instead of creating another bill. Missing/incomplete chunks fail closed and require reconciliation. Rejected attempts can be inspected directly in the protected journal; an aggregate count is shown when bills load.

Sheets append semantics: [Google Sheets values.append](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/append). The implementation uses one complete append operation per event and no process-local lock or read-modify-write sequence cell.

## Setup / migration (not executed against live data)

1. Back up the existing spreadsheet. Reconcile previously printed NGST bills, including the original manually numbered documents. Determine the next UNUSED integer; choose 1 only if NGST1 has never been issued. Existing paper/PDF bills are not automatically imported.
2. In a staging copy first, create `Without_GST_Journal` with the exact nine headers above (no pipe characters in individual cells). Freeze the header. Keep every journal row in original order. Do not sort, delete, move or edit event rows. Protect the worksheet against manual edits while retaining write access for the existing backend service account. Snapshot-based history assumes this journal is preserved; it is not a cryptographically signed ledger.
3. Set server-only `NGST_START_NUMBER` to the reconciled next integer, alongside the existing service-account credentials, `SPREADSHEET_ID`, OAuth audience and `OWNER_EMAIL`. The frontend must never receive service-account secrets. Use the SAME base for the lifetime of this journal: stored events reject a later configuration change rather than silently renumbering bills. Never clear/recreate a populated journal or lower the base.
4. Test using the staging spreadsheet, not production. Backend credentials need access to this new tab. Vite alone does not run `/api` handlers; use the existing full-stack hosting/local API workflow. No new API request is sent to production during automated tests.
5. After explicit deployment authorization, create the protected production tab and configure the reconciled production base. Do not copy test events into production. Preserve any already issued paper/PDF records as the external historical register.

No migration runs automatically. Until setup is complete, Sheets load/save returns a clear setup error; the form and per-user browser working draft remain available. Once credentials/schema are corrected, retry the same pending request.

## Validation and manual acceptance

Run `npm test` and `npm run build`. Node tests cover both supplied customer fixtures, decimal rounding, mixed units/rates/locations, payment/freight behavior, credits, validation, Sheets save/reopen, concurrent number creation and edits, retry recovery, duplicate allocations, permissions, company snapshots, revisions, and large chunked events. The browser harness builds its own isolated JavaScript and Tailwind CSS without relying on an existing dist folder. After browser tests, run `python tests/check-without-gst-pdfs.py` with a Python runtime containing pdfplumber to verify A4 size, all 100 rows, repeated headings, page counters, margins, logo, and financial-summary integrity in the actual generated PDFs.

The browser test bundles the REAL bill page with an isolated App context and a mocked Sheets-backed API. All HTTP resources are served from memory with Playwright route fulfillment; other network requests are blocked. It checks GST draft isolation, delivery duplicate/edit/reorder/delete, save/reload, issued locks, subsequent payments, revision creation, mobile overflow, preview, and printing a 100-row bill. PDFs/screenshots are written to ignored `tmp/ngst-qa/`. Playwright is a test-only runtime: install it in the development environment or set `NGST_BROWSER_TEST_MODULES` to a node_modules directory containing it; `NGST_TEST_CHROME` can select Chrome. Without that runtime the browser test reports an explicit skip; domain/API tests still run.

Manual staging checks:

1. Sign in with and without Bills permission; verify API denial as well as route protection.
2. Enter a simple bill, switch to GST, return, and confirm both drafts remain independent. Reload to verify the browser backup. Save and reopen from the Sheets list.
3. Enter the Kalpesh fixture: 250 Brass, ₹10,45,200 total, ₹4,00,000 payments, ₹1,65,900 deductible freight, ₹4,79,300 outstanding. Check Akshay: 44 Brass, ₹1,67,200.
4. Save new bills in two browsers concurrently. Confirm different reserved NGST numbers. Edit the same saved version in two browsers: the stale save must be rejected, with local changes retained for review.
5. Issue, correct through Start Revision, reissue, and view the original issued snapshot. Add a subsequent payment through settlement with a reason; verify the original issued snapshot and Cashflow data remain unchanged.
6. Test print/Save as PDF in the browsers/printers used by staff, including a long bill, long addresses, and mobile/tablet layouts. Confirm repeated headings, logo, page counters, final totals, and no clipped amounts.

## Operational limits / readiness

- Not deployed; production schema/configuration and live staging smoke checks are still required. No production spreadsheet was modified.
- The journal is replayed on every request and histories are returned with bills. This favors auditability and a small compatible schema over large-scale reporting speed; high-volume use will need pagination/checkpointing within Sheets.
- Browser working drafts and pending requests live on the current device/account. Storage failures are visible; saving is blocked if the pending request ID cannot be durably backed up. Saved server drafts are available across devices.
- The browser's PDF settings can alter output; use A4/default CSS page size. The print window remains open for reprinting. This feature does not email PDFs or post ledger transactions.
- Direct spreadsheet edits, deleted rows, restored older backups, or starting a new journal can invalidate sequence/history assumptions. Use protected append-only storage and backups. Reconcile rejected/incomplete events before any manual repair.
- Existing GST calculations/templates/prefixes remain unchanged; the new workflow is isolated in separate components. No unrelated ERP modules or dependencies were rewritten.

## Executed verification — 31 October 2026

- `npm test`: 20 passed, 0 failed, 0 skipped, including the real-browser interaction suite and GST/challan render regression tests. The original template bodies were also compared with the repository baseline and are unchanged.
- `npm run build`: production compilation passed. Vite still reports the existing large JavaScript bundle warning; it is not a build failure.
- `tests/check-without-gst-pdfs.py` using the bundled Python/pdfplumber runtime: passed for the 2-page Kalpesh workflow PDF and 6-page/100-delivery PDF. A4 dimensions, logo, every delivery, repeated table headings, page counters, margins and financial-summary integrity were verified. Rendered first/continuation/final pages were visually inspected.
- `git diff --check`: passed. No lint/typecheck script is configured in this JavaScript repository.
- All fixture APIs, Google reads and browser assets were mocked or served from memory. No production spreadsheet writes, deployment, email, or ledger posting occurred.

Changed files: `src/pages/Billgenerator.jsx` (tab integration), `src/components/WithoutGstBilling.jsx` (editor/management), `src/components/WithoutGstPrint.jsx` (print), `src/lib/withoutGst.js` (shared validation/calculations/journal), `src/lib/withoutGstApi.js` (client API), `api/without-gst-bills.js` (authenticated persistence), `api/_lib/googleSheets.js` (optional RAW append), `.env.example`, `.gitignore`, `package.json`, this document, and the Without GST fixtures/domain/render/browser/PDF checks in `tests/`.
