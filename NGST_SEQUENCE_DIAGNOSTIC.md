# NGST_START_NUMBER: Config-only validation fix

## Exact root cause

Before this fix, `reconcileWithoutGstSchema()` defaulted its `startNumber` to `Number(process.env.NGST_START_NUMBER)`. Although it read `Config!A:B`, it discarded those rows and never consulted the worksheet for the sequence. `api/without-gst-bills.js` independently used the same environment-only expression for load, save and post-append replay.

Consequently, the reported `Config!A22 = NGST_START_NUMBER` and numeric `B22 = 1` could not satisfy validation. An unset environment variable became `NaN`; a blank environment string became `0`. Both failed the positive-safe-integer check. This was a configuration-source mismatch, not a problem with the numeric value 1, row 22 being outside the range, or a cached Config value.

The generic `readConfig()` function did load arbitrary Config keys, but the sequence validator never called it to obtain this setting. There was no sequence cache to invalidate. The old direct environment reads have been removed from Setup/billing and consolidated in one resolver.

## Current behavior and safe diagnostic

Setup and billing now read the complete `Config!A:B` range with `UNFORMATTED_VALUE`, on every check/request. Key matching trims whitespace, ignores case and removes invisible copy/paste characters. Numeric cells and integer-valued text such as `1`, ` 1 ` and `1.0` are accepted. Zero, negatives, fractions, booleans, malformed values and unsafe integers are rejected. Duplicate matching keys are reported rather than silently using the last row.

For a header-only journal with the reported row 22 and no legacy environment setting, the regression fixture produces:

```json
{
  "ready": true,
  "sequence": {
    "source": "Config",
    "base": 1,
    "nextNumber": 1,
    "config": { "status": "valid", "value": 1, "rows": [22], "range": "Config!A:B" },
    "environment": { "status": "missing", "value": null },
    "journal": { "status": "empty", "value": null }
  }
}
```

This is an executed isolated reproduction, not a claim that the live spreadsheet was read. The real Setup check now displays these source/status/base/row/next-number diagnostics. It also reports frontend/backend and metadata/backend target comparisons as match or unavailable. IDs, tokens, private keys and unrelated Config values are not exposed.

## Meaning of the number

`NGST_START_NUMBER` is a fixed sequence BASE. It is not a counter to increment after every save.

- Before any journal event, a valid Config value supplies the base; the server environment variable remains a backward-compatible fallback. If both exist, they must agree.
- Once events exist, their original `sequenceStart` is authoritative. All supplied settings must match that base. If both external settings are absent, the valid recorded journal base can still be used safely.
- `nextNumber = base + number of accepted new bill creations`. Saving a revision or retrying a pending request does not consume another number.
- Example: Config remains 1 after NGST1 is saved. The journal base remains 1 and the next number becomes 2. Setting Config to 2 at that point would be a conflict, not the correct way to advance numbering.
- Missing/invalid/conflicting settings or incomplete/corrupt event chunks block writes. No fallback silently resets a populated journal to 1.

The base is resolved once per request and reused for append verification. Pending request IDs/payloads and idempotency checks are unchanged. A pending request can be checked/retried using its original ID after the read-only storage check succeeds.

## Spreadsheet verification and limitations

The backend reads metadata and values from its server-configured `SPREADSHEET_ID`, using the existing service account. It compares the server's frontend `VITE_SHEET_ID` when available and verifies the metadata ID against the backend target. Exact `Config` and `Without_GST_Journal` worksheet names and required columns are checked before writes. If a comparison input is unavailable, diagnostics say so instead of claiming a verified match.

This workspace has a frontend sheet configuration but no backend `SPREADSHEET_ID`, service-account credentials or legacy NGST environment setting in `.env` or the execution environment. Live worksheet contents, deployed variables, and the actual pending request therefore could not be independently verified here. Credential values were not printed. Real handler/metadata/Config-read/save/reconciliation paths were exercised against isolated mocked Google HTTP transport, including row 22 and no environment base.

## Files and verification

- New `api/_lib/withoutGstSequence.js`: single parser/resolver and safe diagnostics.
- `api/_lib/withoutGstSchema.js`: shared Config/journal resolution for load and Setup, fresh unformatted reads, target diagnostics.
- `api/without-gst-bills.js`: uses the resolved base consistently for load/save/replay.
- `src/pages/Setup.jsx`: displays configuration source, matched rows, parsed value, fixed base, next number and target checks.
- `.env.example`: documents Config as the preferred source and the environment variable as a legacy fallback.
- New `tests/without-gst-sequence.test.mjs` and expanded `tests/without-gst-sheets.test.mjs`: Config-only case, normalization, duplicate keys, conflicts, recorded-base recovery, corrupt chunks, fresh reads, pending identities and full handler/transport regression.

Executed: `npm test` — 43 passed, 0 failed, 0 skipped; `npm run build` — passed with the existing large-bundle warning; PDF checks — passed for the 2-page and 6-page fixtures; `git diff --check` — passed.

## Remaining manual steps

No spreadsheet edit or schema migration is required if the existing nine journal headers are correct and Config B22 already contains the intended base 1. Do not increment that cell or clear the journal/pending state.

After an explicitly approved release of this fix, run Setup → Check Without GST storage again. For the stated empty-journal case expect Config row 22, base 1 and next number 1. If a legacy deployed environment value conflicts, reconcile it against the intended/original base; do not alter issued numbers to suppress the error. For existing pending saves, use Check pending save, then Retry pending save with the original ID if needed.

No production data was changed and no deployment was performed.
