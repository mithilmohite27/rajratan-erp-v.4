# Vercel Backend Env And Smoke Test Checklist

## A. Required Env Variables

### Frontend variables

These are exposed to the browser because they use the `VITE_` prefix.

- `VITE_GOOGLE_CLIENT_ID`
- `VITE_OWNER_EMAIL`
- `VITE_SHEET_ID`
- `VITE_SHEET_ENV`

### Backend variables

These are server-only Vercel variables. Do not add the `VITE_` prefix.

- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_PRIVATE_KEY`
- `SPREADSHEET_ID`
- `OWNER_EMAIL`
- `GOOGLE_CLIENT_ID`
- `ALLOWED_ORIGINS`
- `NODE_ENV`

## B. Matching Rules

- `VITE_GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_ID` must be the same Google OAuth client ID.
- `VITE_OWNER_EMAIL` and `OWNER_EMAIL` must be the same owner login email.
- `VITE_SHEET_ID` and `SPREADSHEET_ID` must point to the same active sheet for the selected environment.
- `VITE_SHEET_ENV` should be `demo`, `test`, `staging`, or `production` so the app label is clear.
- `ALLOWED_ORIGINS` must include the live Vercel app origin, for example `https://your-app.vercel.app`.
- If using preview/staging URLs, include those origins too, comma-separated.

## C. Demo Sheet Setup

Before any backend write smoke test:

- Make a copy of the real Google Sheet.
- Rename the copied sheet clearly, for example `Rajratan ERP DEMO TEST - YYYY-MM-DD`.
- Confirm all existing tabs are copied.
- Confirm `Config` tab exists.
- Confirm production, CRM, cash, payroll, vendor, QC, opening stock, opening material, and external material tabs are present if they exist in production.
- Share the demo Sheet with `GOOGLE_SERVICE_ACCOUNT_EMAIL` as Editor.
- Set Vercel preview/staging `SPREADSHEET_ID` to the demo Sheet ID.
- Set Vercel preview/staging `VITE_SHEET_ID` to the same demo Sheet ID.
- Set `VITE_SHEET_ENV=demo` or `VITE_SHEET_ENV=test`.
- Do not point backend `SPREADSHEET_ID` to the real production Sheet until demo/staging smoke test passes.

## D. Service Account Setup

- Confirm `GOOGLE_SERVICE_ACCOUNT_EMAIL` is the service account client email from Google Cloud.
- Confirm the demo Google Sheet is shared with that email as Editor.
- Confirm `GOOGLE_PRIVATE_KEY` is stored only as a backend/server environment variable.
- Do not create `VITE_GOOGLE_PRIVATE_KEY`.
- In Vercel, paste the private key with newline escapes preserved, typically containing `\n`.
- The backend code converts escaped `\n` into real newlines before signing.
- If Vercel multiline secret paste is used, confirm the key still includes the full `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` text.

## E. OAuth Setup

- Add the live Vercel URL to Google OAuth Authorized JavaScript origins.
- Add preview/staging URL if testing there.
- Keep local origins if needed, for example `http://localhost:5173`.
- Confirm `VITE_GOOGLE_CLIENT_ID` is the OAuth client used by the frontend login.
- Confirm backend `GOOGLE_CLIENT_ID` is the same OAuth client ID, because token verification checks that audience.

## F. Read-Only Endpoint Tests

Do these first. They should not write to Google Sheets.

- Open `GET /api/health`.
- Confirm it returns healthy JSON and environment info.
- Call `GET /api/config` without token.
- Confirm it returns `401`.
- Login as Owner in the app and get a valid Google token through the normal login flow.
- Call `GET /api/config` with the valid Owner token.
- Confirm Config loads from the demo Sheet, not production.

## G. Demo Write Smoke Tests

Only run these after the demo Sheet ID is confirmed in both frontend and backend env variables.

For every write test:

- Confirm the environment label says Demo/Test.
- Perform one normal save.
- Confirm the new row appears in the demo Sheet only.
- Repeat the same save to confirm duplicate warning appears.
- Confirm cancel stops the write.
- Confirm continuing sends the force save only after confirmation.
- Confirm the related screen/dashboard/report reads the new demo row.
- Confirm the real production Sheet did not change.

Write tests on demo Sheet only:

- Settings save.
- Cash Flow save.
- Vendor purchase.
- Vendor payment.
- Payroll advance.
- Production save.
- CRM order.
- CRM dispatch.
- QC entry.
- Setup opening stock.
- Material opening stock.
- External material usage.

## H. Production Deployment Checklist

Do not switch production backend variables until demo smoke test passes.

Before production:

- Confirm demo write smoke tests passed.
- Confirm no schema changes were required.
- Confirm Owner login works.
- Confirm unknown user is blocked.
- Confirm module permissions still work.
- Confirm all backend endpoints return clear 401/403 errors when expected.
- Confirm `ALLOWED_ORIGINS` includes the final production Vercel domain.
- Confirm production `SPREADSHEET_ID` and `VITE_SHEET_ID` both point to the real production Sheet only when ready.
- Confirm the real production Sheet is backed up immediately before switching.

## I. Rollback Plan

If live backend testing fails:

- Revert Vercel `SPREADSHEET_ID` and `VITE_SHEET_ID` back to the previous known-safe demo/test sheet or prior production configuration.
- Revert changed Vercel env variables from the Vercel dashboard history if available.
- Redeploy the previous successful Vercel deployment.
- Keep the real Google Sheet unchanged.
- Do not retry writes on production until the failing endpoint is fixed and retested on demo.
- If any demo data becomes messy, discard the demo Sheet copy and create a fresh copy from production.

## J. Remaining Risks

- Deprecated direct write helpers still exist in `src/lib/sheets.js` for compatibility; remove or isolate them only after one full live demo smoke test passes.
- Frontend still contains Google Sheet read helpers, so Google Sheet sharing permissions remain important.
- Backend writes are safer, but not fully transactional across multi-row workflows.
- Stronger future architecture should add backend audit logs and idempotency keys when schema changes are approved.
- Production should not be connected to backend writes until demo/staging smoke tests pass.
