# Rajratan ERP Phase 8B Backend Config Save Notes

Phase 8B moves only Settings Config save to the backend.

No Production, CRM, Dispatch, QC, Cash, Payroll, Vendor, Setup, opening stock, or import writes were migrated in this phase.

## Endpoint Added

### `POST /api/settings/config`

Purpose:

- Save Settings Config key/value rows through the backend.
- Verify Google token server-side.
- Check backend Settings permission.
- Validate Config keys and values.
- Merge incoming values with existing `Config!A:B`.
- Preserve unknown existing sheet keys.
- Keep the existing `Config` key/value schema.

Request:

```json
{
  "config": {
    "cementRate": 340,
    "COMPANY_NAME": "RAJ RATAN ENTERPRISE",
    "DEFAULT_GST_RATE": 18
  }
}
```

Headers:

```text
Authorization: Bearer <google_token>
Content-Type: application/json
```

## Config Key Whitelist

Allowed production/calculation keys:

```text
ghamela_g
weight_g
ghamela_p
weight_p
litre_m
ml_c
yellowRatio
redRatio
reti_multiplier
plastic_ml
cementRate
greetRate
powderRate
chemicalRate
colorRate
plasticRate
retiRate
labourRate
miscDefault
```

Allowed business profile keys:

```text
COMPANY_NAME
FACTORY_NAME
BUSINESS_ADDRESS
BUSINESS_PHONE
BUSINESS_EMAIL
OWNER_NAME
BUSINESS_LOCATION
```

Allowed billing/GST keys:

```text
GST_NUMBER
INVOICE_PREFIX
CHALLAN_PREFIX
DEFAULT_GST_RATE
BANK_NAME
BANK_ACCOUNT_NAME
BANK_ACCOUNT_NUMBER
IFSC_CODE
PAYMENT_TERMS
INVOICE_FOOTER_NOTE
```

Allowed branding keys:

```text
APP_NAME
POWERED_BY_TEXT
```

Unknown keys are rejected. Arbitrary Config keys are not accepted from the frontend.

## Validation Behavior

- Unknown keys return `400 UNKNOWN_CONFIG_KEYS`.
- Non-numeric production values return `400 INVALID_SETTING_VALUE`.
- Numeric production keys cannot be `0`.
- `DEFAULT_GST_RATE` must be a positive number.
- Text fields are trimmed and may be blank where safe.
- No Google Sheet schema is changed.

## Settings Save Flow Now

```text
Settings.jsx Save button
-> existing frontend zero-value guard
-> existing confirmation warning
-> POST /api/settings/config
-> backend auth + permission
-> backend whitelist + validation
-> backend merge write to Config!A:B
```

There is no silent fallback to the old frontend direct write if the backend fails.

## Required Backend Environment Variables

```text
GOOGLE_SERVICE_ACCOUNT_EMAIL
GOOGLE_PRIVATE_KEY
SPREADSHEET_ID
OWNER_EMAIL
GOOGLE_CLIENT_ID
ALLOWED_ORIGINS
NODE_ENV
```

The service account must have access to the target spreadsheet.

## Still Frontend-Direct

These write paths are intentionally not migrated yet:

- Production save
- CRM order save
- CRM dispatch save
- QC save
- Cash flow entry
- Payroll entry
- Vendor invoice/payment
- Setup seed/import/opening stock writes
- External material usage

## Manual Test Checklist

Only test real saves after explicit approval and backup confirmation.

- Settings save as Owner succeeds.
- Unknown user gets `403`.
- Missing token gets `401`.
- Invalid token gets `401`.
- Unknown Config key returns `400`.
- `DEFAULT_GST_RATE <= 0` returns `400`.
- Numeric production key `0` is blocked.
- Existing Config keys remain present.
- No schema changes occur.

## Recommended Phase 8C

Move Cash, Payroll, and Vendor writes to backend next because they affect money ledgers and often perform paired writes.
