# Rajratan ERP Phase 8A Backend Skeleton Notes

Phase 8A adds only a safe Vercel Serverless backend foundation. It does not migrate frontend writes, change schemas, create tabs, add transaction IDs, add invoice ledger, or add AI features.

## Endpoints Created

### `GET /api/health`

Read-only health endpoint.

Expected success:

```json
{
  "ok": true,
  "service": "Rajratan ERP API",
  "environment": "development",
  "timestamp": "..."
}
```

This endpoint does not touch Google Sheets and does not require auth.

### `GET /api/config`

Read-only Config endpoint.

Behavior:

- Requires `Authorization: Bearer <google_token>`.
- Verifies Google token against `GOOGLE_CLIENT_ID` when available.
- Requires backend permission for Settings.
- Uses Google service account to read `Config!A:B`.
- Merges Config sheet values over safe backend defaults.
- Performs no writes.

## Files Added

- `api/health.js`
- `api/config.js`
- `api/_lib/auth.js`
- `api/_lib/permissions.js`
- `api/_lib/googleSheets.js`
- `api/_lib/response.js`

## Environment Variables

Backend-only variables:

```text
GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_PRIVATE_KEY=
SPREADSHEET_ID=
OWNER_EMAIL=
GOOGLE_CLIENT_ID=
ALLOWED_ORIGINS=
NODE_ENV=
```

Frontend variables remain unchanged:

```text
VITE_GOOGLE_CLIENT_ID=
VITE_OWNER_EMAIL=
VITE_SHEET_ID=
VITE_SHEET_ENV=
```

Private backend secrets must never use `VITE_`. Anything with `VITE_` can be exposed to the browser.

## Local Testing Steps

Start the local Vercel-style dev server when ready:

```powershell
vercel dev
```

Health check:

```powershell
Invoke-RestMethod http://localhost:3000/api/health
```

Config without token should return `401`:

```powershell
Invoke-RestMethod http://localhost:3000/api/config
```

Config with invalid token should return `401`:

```powershell
Invoke-RestMethod http://localhost:3000/api/config -Headers @{ Authorization = 'Bearer invalid' }
```

Config with a valid owner token should return config only after:

- service account env variables are configured,
- `OWNER_EMAIL` matches the signed-in Google email,
- the Google Sheet is shared with `GOOGLE_SERVICE_ACCOUNT_EMAIL`,
- `GOOGLE_CLIENT_ID` matches the OAuth client.

Do not test against the real production Sheet unless the service account setup and read-only intent are explicitly approved.

## Vercel Deployment Notes

Set these in Vercel Project Settings -> Environment Variables:

- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_PRIVATE_KEY`
- `SPREADSHEET_ID`
- `OWNER_EMAIL`
- `GOOGLE_CLIENT_ID`
- `ALLOWED_ORIGINS`
- `NODE_ENV`

For `GOOGLE_PRIVATE_KEY`, preserve newline formatting. The helper supports escaped `\n` values.

## Not Migrated Yet

- Production writes remain frontend direct-to-Sheets.
- CRM order/dispatch writes remain frontend direct-to-Sheets.
- QC writes remain frontend direct-to-Sheets.
- Cash, payroll, and vendor writes remain frontend direct-to-Sheets.
- Settings save remains frontend direct-to-Sheets.
- Setup/import/opening stock writes remain frontend direct-to-Sheets.

Existing frontend safety, duplicate warnings, and permission gates remain untouched.

## Recommended Phase 8B

Move only Settings Config save behind a backend endpoint:

```text
POST /api/settings/config
```

Keep the current Settings UI confirmation and zero-value guard. Add backend key whitelist validation and preserve the existing `Config` key/value schema.
