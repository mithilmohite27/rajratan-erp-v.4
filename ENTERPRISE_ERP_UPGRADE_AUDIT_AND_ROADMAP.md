# Enterprise ERP Upgrade Audit and Roadmap

Audit date: 2026-06-28

Scope: Rajratan ERP v4, connected to DEMO Google Sheet for safe testing. This document is planning and audit only. No production database changes, schema changes, code implementation, or test data writes are included.

## A. Executive Summary

Rajratan ERP is already a useful, working business ERP for production, inventory, material stock, CRM/dispatch, cash flow, payroll, vendors, QC, bills, settings, setup, and reports. The current system has moved most reachable write actions behind backend endpoints, uses Google OAuth, supports Owner/module permissions, and has duplicate/high-risk confirmations.

The main upgrade gap is no longer "can the ERP work"; it is "can the ERP feel and operate like an enterprise-grade system without risking live data." The next improvements should focus first on professional UI cleanup, clearer navigation, workflow clarity, dashboard/reporting polish, and safer admin surfaces. Structural ERP features such as audit logs, approvals, transaction IDs, work orders, BOM, customer ledger, purchase orders, and notification automation should be phased later because they need schema or backend changes.

Recommended first implementation phase: UI cleanup and professional navigation only. This should remove emoji-heavy navigation, fix encoding/mojibake issues, improve page hierarchy, standardize action buttons/tables/forms, and preserve every existing formula, backend API, duplicate warning, permission gate, and Google Sheet schema.

## B. Current Rajratan ERP Assessment

### Architecture

- Frontend: React/Vite single-page ERP.
- Authentication: Google login with owner/module access layer.
- Database: Google Sheets, currently safe to test against DEMO Sheet.
- Backend: Vercel/serverless API endpoints for high-risk writes.
- Read model: frontend still reads Google Sheets through shared helpers.
- Write model: main reachable writes now go through backend APIs.

### Current modules

- Dashboard
- Production
- Inventory
- Material Stock
- CRM / Clients / Dispatch
- Cash Flow
- QC
- Vendors
- Payroll
- P&L
- Reports
- Setup
- Settings
- Bills & Challans

### Current backend write endpoints

- `POST /api/settings/config`
- `POST /api/cash-flow`
- `POST /api/vendors`
- `POST /api/payroll`
- `POST /api/production`
- `POST /api/crm`
- `POST /api/qc`
- `POST /api/setup`
- `POST /api/material-usage`

### Current data flow

- Production writes production summary and color/variant rows.
- Inventory is calculated from opening stock, production variants, CRM dispatches, and QC broken/damage rows.
- Material Stock is calculated from opening material, vendor purchases, production consumption, and external material usage.
- CRM stores orders and dispatch-related entries in the CRM log.
- Dispatch affects available finished stock through CRM dispatch rows.
- Payroll stores worker advance/payment rows and derives production labour context from production records.
- Vendor purchases/payments feed vendor ledger and cash-facing flows.
- Cash Flow captures income/expense movement and linked vendor/payroll style entries.
- P&L and Reports aggregate existing tabs; they should remain read-only until a future reporting schema is approved.
- Bills & Challans use CRM/config data for document preview but do not create an invoice ledger.
- Setup seeds headers/static data and imports/opening balances through high-risk backend setup actions.

### Current strengths

- Business-specific formulas already match the paver/block workflow.
- Google Sheet compatibility is preserved.
- Owner/module permissions exist.
- Backend endpoints now protect most reachable writes.
- Duplicate warning and `force: true` confirmation flows exist.
- Setup and import tools are treated as dangerous operations.
- DEMO Sheet testing path exists before production use.

### Current weaknesses

- UI still carries consumer/demo signals such as emoji icons and occasional encoding artifacts.
- Navigation is module-based but not yet enterprise workflow-based.
- Some legacy frontend sheet write helpers still exist in `src/lib/sheets.js` for compatibility/deprecation.
- No database-backed user management or audit log exists yet.
- No transaction IDs, immutable event log, approval queue, or invoice ledger exists.
- Google Sheets remains the system of record, so concurrency, auditability, and row-level security are limited.

## C. Enterprise ERP Benchmark Learnings

Sources reviewed:

- SAP Business One: https://www.sap.com/products/erp/business-one.html
- Odoo Manufacturing: https://www.odoo.com/app/manufacturing
- Oracle NetSuite ERP: https://www.netsuite.com/portal/products/erp.shtml
- Microsoft Dynamics 365 Supply Chain Management: https://www.microsoft.com/en-us/dynamics-365/products/supply-chain-management
- ERPNext Manufacturing/ERP docs: https://docs.frappe.io/erpnext/manufacturing
- Zoho Inventory: https://www.zoho.com/inventory/features/

### Patterns seen in mature ERP systems

- Integrated company operations: finance, sales, purchasing, inventory, production, CRM, and reporting should feel connected, not like separate pages.
- Role-based workspaces: owner, admin, operator, finance, dispatch, and viewer roles should see different dashboards and actions.
- Process-centered navigation: enterprise ERPs group work by daily business flow such as order-to-cash, procure-to-pay, plan-to-produce, inventory control, finance, and admin.
- Dashboards are action-oriented: dashboards show pending work, exceptions, overdue items, low stock, cash pressure, production efficiency, and attention-needed alerts.
- Manufacturing maturity: enterprise systems use work orders, BOM/recipes, shop-floor steps, capacity planning, quality checks, and batch/lot traceability.
- Inventory maturity: warehouse/bin/location, reservation, stock reconciliation, valuation, reorder points, and traceability reports become important as volume grows.
- Finance maturity: invoices, payments, receivables, payables, ledgers, GST/tax details, and audit trail are linked instead of being independent print previews.
- Security maturity: backend permissions, immutable audit logs, approval flows, and user activity history are standard enterprise expectations.
- Mobile maturity: operator screens are simple, tap-friendly, and task-focused, while owner/admin screens can be denser and analytical.

## D. Gap Analysis

### UI/UX gaps

- Emoji-based navigation does not feel enterprise-grade.
- Some user-facing text may show encoding artifacts or unclear symbols.
- Page hierarchy is not consistent across all modules.
- Forms need clearer grouping, sticky action areas, and stronger validation feedback.
- Tables need consistent density, overflow behavior, column priority, and empty states.
- Desktop should feel like a command center; mobile should feel like guided daily entry.

### Workflow gaps

- CRM order and dispatch lifecycle is functional but not yet a structured order pipeline.
- Production is entry-based, not work-order-based.
- Inventory does not yet support reservation, adjustment approval, or batch traceability.
- Bills are preview/print oriented, not ledger/audit oriented.
- Vendor and payroll flows need clearer approval and linked cash audit later.
- Setup remains powerful and dangerous; it should become more controlled over time.

### Data/audit gaps

- No immutable `Audit_Log`.
- No transaction ID or idempotency key per write.
- No created/updated metadata columns in business sheets.
- No approval state for high-value or risky transactions.
- No row-level backend authorization beyond module-level access.

### Reporting gaps

- Current reports are useful but should evolve into drill-down owner insights.
- Exception reports are missing: duplicate suspects, stock mismatch, negative stock risk, overdue dispatch, unpaid vendor/payment gaps, payroll liability, and QC waste trend.
- No scheduled daily/weekly summary exists.

## E. UI/UX Redesign Recommendations

### Visual system

- Replace emoji icons with a professional icon system.
- Use a stable enterprise palette: dark/navy shell, white work surface, orange brand accent, neutral grays, status colors.
- Keep page backgrounds calm and reduce decorative visual noise.
- Use consistent card, table, button, badge, input, and alert styles.
- Preserve warning colors for dangerous actions.

### Navigation

- Move toward process groups:
  - Daily Operations: Production, CRM/Dispatch, QC
  - Stock Control: Inventory, Material Stock
  - Finance: Cash Flow, Vendors, Payroll, P&L, Bills
  - Insights: Dashboard, Reports
  - Admin: Settings, Setup
- Keep module permissions enforced in both navigation and route access.
- Show environment label clearly: Demo/Test/Production.

### Screen patterns

- Every page should have a consistent header: title, purpose, environment, primary action, last updated/refresh.
- Forms should use sections, review summaries, and clear save states.
- Tables should support search, filter chips, horizontal scroll on desktop, card mode on mobile, and clear empty states.
- Warnings should remain visible but not look like ordinary buttons.
- Print previews should have stable paper sizing and not depend on screen layout.

## F. Workflow Improvement Recommendations

### Daily production workflow

- Keep current production logic unchanged in the next UI phase.
- Add clearer entry review before save.
- Show expected block/brass/material calculation preview in a cleaner panel.
- Later: introduce work orders and batch traceability only after schema approval.

### CRM and dispatch workflow

- Separate visual steps: order received, pending, partial dispatch, dispatched, cancelled/closed.
- Make dispatch action visually distinct from order creation because it affects stock.
- Later: add order IDs, stock reservation, customer ledger, and delivery documents.

### Inventory workflow

- Current formula-driven stock is acceptable for the sheet model.
- Improve visual stock status: available, low, risk, damaged/broken.
- Later: stock adjustment approval and batch traceability need schema.

### Material stock workflow

- Improve purchase/use/closing views.
- Make external material usage clearly separated from production consumption.
- Later: introduce purchase orders, reorder alerts, and supplier material history.

### Finance workflow

- Keep cash/payroll/vendor formulas stable.
- Improve UI clarity around linked entries.
- Later: add approvals, audit logs, receivables/payables, and document ledger.

### Setup workflow

- Keep advanced tools collapsed.
- Make backup and demo-sheet warnings impossible to miss.
- Later: add admin-only guided setup wizard and audit logging.

## G. Module-wise Improvement Plan

### Dashboard

- Add owner cockpit layout with production, cash, stock, dispatch, vendor, payroll, QC, and alerts.
- No schema impact if all values are calculated from existing tabs.
- Later: saved dashboard preferences can use Config keys.

### Production

- Improve form grouping and calculation preview.
- Add clearer duplicate warning placement.
- Later: work orders, BOM, product master, production approval, and batch traceability.

### CRM / Dispatch

- Improve order pipeline visuals and dispatch status badges.
- Keep dispatch logic unchanged.
- Later: order IDs, customer ledger, delivery challan ledger, dispatch approvals.

### Bills & Challans

- Improve paper preview, GST/company details display, and print stability.
- Do not create invoice ledger yet.
- Later: invoice ledger, payment status, GST report exports.

### Inventory

- Improve stock cards, color/variant filters, low stock emphasis, and mobile card mode.
- Later: reservation, adjustment approval, batch stock ledger.

### Material Stock

- Improve material cards and consumption breakdown.
- Later: purchase orders, reorder levels, vendor-material rate history.

### Cash Flow

- Improve cash summary and entry clarity.
- Later: approval for high-value expense, audit log, bank/cash account separation.

### Payroll

- Improve worker-level summary and advance/payment clarity.
- Later: worker master, attendance, wage approval, settlement workflow.

### Vendors

- Improve purchase/payment separation and outstanding status.
- Later: supplier master, purchase order, invoice matching, payment approval.

### QC

- Improve defect/damage display and trend summary.
- Later: quality checkpoints tied to work orders/batches.

### P&L

- Improve drill-down and period comparison using existing data.
- Later: accounting ledger and cost-center style classification.

### Reports

- Improve report center navigation and export clarity.
- Later: scheduled reports, exception alerts, automated owner summaries.

### Settings

- Improve admin grouping and explain config effects.
- Keep zero-value guard for numeric production settings.
- Later: user management, thresholds, dashboard preferences, notification rules.

### Setup

- Keep high-risk design.
- Make demo/production status prominent.
- Later: setup audit log and backup status tracking.

## H. Database/Schema Impact Classification

### No schema change

- Professional UI cleanup.
- Emoji removal and icon replacement.
- Navigation grouping.
- Table, form, mobile, print-preview polish.
- Dashboard and reports using existing tabs.
- Better empty states, warnings, helper text, and review panels.
- Role display and permission-denied screen polish.
- Duplicate warning display improvements.

### Config-only additions

- Dashboard thresholds.
- Low stock warning thresholds.
- Alert limits.
- Branding/display labels.
- Report default periods.
- Print/document display preferences.
- Notification placeholders, if no automation is sent yet.

### New sheet/tab required

- `Audit_Log`
- `Approvals`
- `Users` or `Role_Config`
- `Notifications`
- `Product_Master`
- `BOM` or `Recipe_Master`
- `Work_Orders`
- `Customer_Ledger`
- `Purchase_Orders`
- `Stock_Adjustments`
- `Invoice_Ledger`
- `Backup_Log`

### New columns required in existing sheets

- `TransactionID`
- `IdempotencyKey`
- `CreatedAt`
- `CreatedBy`
- `ApprovedAt`
- `ApprovedBy`
- `Status`
- `ReferenceNo`
- `BatchID` enhancement
- `OrderID`
- `InvoiceNo`
- `WorkOrderID`

### Backend architecture required

- Server-only writes for all modules.
- Strong idempotency and duplicate hard-blocking.
- Immutable audit logging.
- Role/user storage outside frontend constants.
- Write queue or transaction wrapper for multi-tab writes.
- Scheduled reports and alert jobs.
- Future AI insights using read-only backend data access.

## I. Security, Audit, and Permission Recommendations

- Keep Google Sheet sharing restricted; this remains the strongest current protection.
- Move user/role management from constants to backend-controlled storage in a future phase.
- Add an immutable audit log before adding approvals or AI.
- Add transaction IDs before invoice ledger, work orders, or accounting-style reports.
- Require approval for high-risk actions: setup/import, opening stock, large cash expense, payroll settlement, vendor payment, stock adjustment, dispatch reversal.
- Keep unknown users blocked.
- Keep direct route blocking and hidden navigation for unauthorized modules.
- Add backend permission checks to every write endpoint and future read-sensitive endpoint.

## J. Reports and Analytics Recommendations

### Owner dashboard

- Today production, monthly production, dispatch pending, cash balance, vendor payable, payroll exposure, material risk, QC loss.

### Operational reports

- Production by date/color/batch.
- Stock by color and variant.
- Pending CRM orders.
- Dispatch history.
- QC damage trend.
- Material consumption variance.

### Finance reports

- Cash in/out by period.
- Vendor outstanding.
- Payroll advances/payments.
- P&L drill-down.
- GST invoice summary after invoice ledger is approved.

### Exception reports

- Possible duplicate entries.
- Negative stock risk.
- Low material risk.
- Orders pending too long.
- Vendor payment without purchase reference.
- Payroll advance duplicate suspects.
- Setup/import actions needing review.

## K. Automation and AI Opportunities

AI and automation should wait until audit logs, transaction IDs, and clean data confidence improve.

Safe future automation:

- Daily owner summary.
- Low stock and low material alerts.
- Pending dispatch reminders.
- Vendor outstanding alerts.
- Payroll advance warning.
- Duplicate anomaly report.
- Backup reminder.

Later AI opportunities:

- Natural-language owner insights.
- Demand/production forecasting.
- Material reorder prediction.
- Duplicate/anomaly detection.
- Cash pressure prediction.
- Smart report explanation.

Do not add AI before backend read controls, audit logs, and production/demo separation are fully stable.

## L. Phased Implementation Roadmap

### Phase 1: UI cleanup and emoji removal

- Goal: make the ERP look professional without touching business logic.
- Modules affected: app shell, dashboard, all module navigation, shared UI components, page headings.
- Changes required: replace emojis, fix encoding artifacts, standardize typography/buttons/cards/tables, improve spacing.
- Risk: low.
- Schema impact: none.
- Backend impact: none.
- Benefit: immediate enterprise feel and user confidence.
- Test checklist: build passes, all routes open, permissions still work, no Sheet writes, duplicate warnings still visible.

### Phase 2: Navigation information architecture

- Goal: group modules by workflow.
- Modules affected: app shell/navigation only.
- Changes required: Daily Operations, Stock Control, Finance, Insights, Admin groups.
- Risk: low to medium because users must still find familiar modules.
- Schema impact: none.
- Backend impact: none.
- Benefit: easier owner/operator usage.
- Test checklist: owner sees all modules, operator sees allowed modules only, direct blocked routes remain denied.

### Phase 3: Dashboard and reports polish

- Goal: turn dashboard into an owner cockpit.
- Modules affected: Dashboard, Reports, P&L, Inventory, CRM, Cash Flow.
- Changes required: existing-data KPIs, exception cards, drill-down links.
- Risk: low if read-only.
- Schema impact: none.
- Backend impact: optional read optimization only.
- Benefit: faster decisions.
- Test checklist: report numbers match current module calculations, no writes, exports still work.

### Phase 4: Daily workflow redesign

- Goal: make daily entry screens clearer and safer.
- Modules affected: Production, CRM/Dispatch, Cash Flow, Vendors, Payroll, QC.
- Changes required: guided forms, review panels, sticky save, clearer duplicate confirmations.
- Risk: medium because forms are business-critical.
- Schema impact: none if only UI.
- Backend impact: none if using existing endpoints.
- Benefit: fewer mistakes and faster data entry.
- Test checklist: save behavior unchanged, duplicate warnings work, force confirmation works, formulas unchanged.

### Phase 5: Settings/Admin polish

- Goal: make admin configuration safer.
- Modules affected: Settings, Setup.
- Changes required: clearer grouping, danger zones, backup reminders, better validation messaging.
- Risk: medium because admin screens can affect live data.
- Schema impact: Config-only if new preferences are added.
- Backend impact: existing settings/setup endpoints.
- Benefit: fewer accidental config/setup mistakes.
- Test checklist: zero-value guard remains, high-risk confirms remain, no schema change.

### Phase 6: Alerts and notification foundation

- Goal: show internal alerts without sending external messages yet.
- Modules affected: Dashboard, Reports, Inventory, Material Stock, CRM, Cash Flow.
- Changes required: alert cards and Config thresholds.
- Risk: medium.
- Schema impact: Config-only at first.
- Backend impact: optional read endpoint.
- Benefit: owner can see risks earlier.
- Test checklist: alert calculations match source data, thresholds fallback safely.

### Phase 7: Audit logs and approvals

- Goal: create enterprise-grade accountability.
- Modules affected: all write modules.
- Changes required: `Audit_Log`, approval queue, created/approved metadata, backend-only writes.
- Risk: high.
- Schema impact: new sheet/tabs and possibly new columns.
- Backend impact: significant.
- Benefit: real control over sensitive actions.
- Test checklist: every write creates audit event, approvals block risky actions, rollback plan ready.

### Phase 8: Advanced manufacturing foundation

- Goal: move from entries to managed production planning.
- Modules affected: Production, Inventory, Material Stock, QC, CRM.
- Changes required: product master, BOM/recipe, work orders, batch traceability.
- Risk: high.
- Schema impact: new tabs and possibly new references in existing rows.
- Backend impact: significant.
- Benefit: stronger planning, traceability, material accuracy.
- Test checklist: old production entries still calculate correctly, new work orders do not break stock formulas.

### Phase 9: AI insights

- Goal: add read-only intelligence after data controls are strong.
- Modules affected: Dashboard, Reports, Owner Insights.
- Changes required: backend-controlled read context, audit-safe prompts, no direct write decisions.
- Risk: medium to high.
- Schema impact: optional logs/preferences.
- Backend impact: AI service endpoint.
- Benefit: faster analysis and anomaly detection.
- Test checklist: no AI writes, no secret exposure, answers match source data.

### Phase 10: Website/demo screenshot readiness

- Goal: prepare public-facing demo visuals without exposing real data.
- Modules affected: demo environment, screenshots, landing/demo assets.
- Changes required: polished demo data, masked sensitive info, screenshot flow.
- Risk: medium because privacy matters.
- Schema impact: none if demo-only.
- Backend impact: none.
- Benefit: sales/client presentation readiness.
- Test checklist: demo Sheet only, no production data, no private IDs visible.

## M. High-Risk Areas

- Production formulas and 1 brass / block conversion.
- Dispatch stock deduction through CRM rows.
- Material consumption calculation from production.
- Cash/vendor/payroll linked entries.
- Settings Config save.
- Setup seed/import/opening stock actions.
- Bills GST and document totals.
- Backend service account permissions.
- Vercel environment pointing to wrong Sheet.
- Deprecated write helpers in `src/lib/sheets.js`.
- Any future schema change without backup and demo smoke test.

## N. Recommended First Implementation Phase

Start with Phase 1: UI cleanup and emoji removal.

Why this first:

- It gives the ERP a professional enterprise feel quickly.
- It does not need Google Sheet schema changes.
- It does not need backend changes.
- It should not alter formulas, duplicate checks, permissions, or business logic.
- It prepares the UI foundation for later workflow improvements.

Recommended Phase 1 scope:

- Replace emoji icons in navigation and page headers.
- Fix visible encoding/mojibake artifacts.
- Standardize headers, action bars, cards, tables, forms, alerts, and empty states.
- Improve desktop spacing and table readability.
- Improve mobile tap targets and sticky save areas.
- Keep all safety warnings, duplicate warnings, environment labels, permission gates, and backend write endpoints unchanged.

Phase 1 acceptance checklist:

- `npm run build` passes.
- Owner can access all modules.
- Unknown user remains blocked.
- Operator permissions remain respected.
- No Google Sheet writes during visual testing.
- No schema changes.
- No formula/business logic changes.
- Setup remains visibly dangerous.
- Duplicate warnings remain visible.
- App looks professional enough for live owner demo on desktop and mobile.

