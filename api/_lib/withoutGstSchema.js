import crypto from 'node:crypto'
import { batchUpdateSpreadsheet, readSheetRange, readSpreadsheetMetadata } from './googleSheets.js'
import { encodeEvent, JOURNAL_HEADERS, JOURNAL_RANGE, JOURNAL_TAB, replayJournal } from '../../src/lib/withoutGst.js'

export const WITHOUT_GST_SCHEMA = [
  { title: JOURNAL_TAB, range: JOURNAL_RANGE, headers: JOURNAL_HEADERS },
  // Config is key/value data, not a header-based journal. CRM is an optional picker.
  { title: 'Config', range: 'Config!A:B' },
]
const canonical = name => name.toLowerCase().replace(/[^a-z0-9]/g, '')
const nonempty = rows => rows.some(row => row.some(value => String(value ?? '') !== ''))
export function assertSpreadsheetTarget(frontend = process.env.VITE_SHEET_ID, backend = process.env.SPREADSHEET_ID) {
  if (frontend && backend && frontend.trim() !== backend.trim()) throw new Error('Frontend VITE_SHEET_ID and backend SPREADSHEET_ID differ. Select the correct existing spreadsheet before checking or repairing billing storage.')
}
const cells = values => ({ values: values.map(value => ({ userEnteredValue: typeof value === 'number' ? { numberValue: value } : { stringValue: String(value) } })) })

// Read-only preflight on every bill load/save; never initializes storage implicitly.
export async function loadBillingStorage({ read = readSheetRange, metadata = readSpreadsheetMetadata, startNumber } = {}) {
  assertSpreadsheetTarget()
  const info = await metadata()
  const properties = info.sheets.map(sheet => sheet.properties)
  for (const required of WITHOUT_GST_SCHEMA) {
    const sheet = properties.find(item => item.title === required.title)
    if (!sheet) {
      const similar = properties.filter(item => canonical(item.title) === canonical(required.title)).map(item => item.title)
      throw new Error(`${required.title} worksheet is missing in the backend spreadsheet.${similar.length ? ` Similarly named sheet: ${similar.join(', ')}. Do not create another journal; reconcile the existing name first.` : ''} Use Setup → Without GST storage → Check, then explicitly repair after backup.`)
    }
    if ((sheet.gridProperties?.columnCount || 0) < (required.headers?.length || 2)) throw new Error(`${required.title} has too few columns. Run the Without GST storage check in Setup.`)
  }
  const rows = await read(JOURNAL_RANGE)
  const state = replayJournal(rows, startNumber)
  await read('Config!A:B') // Detect missing/inaccessible settings before ANY financial append.
  return { rows, state, sheetId: properties.find(item => item.title === JOURNAL_TAB).sheetId }
}

// Explicit Setup action, dry-run by default. Only creates the missing journal or
// initializes a truly empty worksheet. Never repairs nonempty/mismatched headers.
export async function reconcileWithoutGstSchema({ dryRun = true, validateSequence = true, read = readSheetRange, metadata = readSpreadsheetMetadata, batch = batchUpdateSpreadsheet, startNumber = Number(process.env.NGST_START_NUMBER) } = {}) {
  assertSpreadsheetTarget()
  const info = await metadata(), sheets = info.sheets.map(sheet => sheet.properties)
  const journal = sheets.find(sheet => sheet.title === JOURNAL_TAB)
  const similar = sheets.filter(sheet => sheet.title !== JOURNAL_TAB && canonical(sheet.title) === canonical(JOURNAL_TAB))
  const issues = [], changes = [], requests = []
  let rows = []
  if (!sheets.some(sheet => sheet.title === 'Config')) issues.push('Config is missing. Restore/check the existing Config worksheet; this repair will not create or overwrite company settings.')
  else if ((sheets.find(sheet => sheet.title === 'Config').gridProperties?.columnCount || 0) < 2) issues.push('Config needs at least two columns for existing key/value settings.')
  else await read('Config!A:B')
  if (validateSequence && (!Number.isSafeInteger(startNumber) || startNumber < 1)) issues.push('Set NGST_START_NUMBER to the reconciled next unused number (or restore the original journal base). Never guess or reset it.')
  if (similar.length) issues.push(`Similarly named worksheet(s): ${similar.map(sheet => sheet.title).join(', ')}. Resolve the name/configuration manually before creating or repairing a journal.`)
  if (!journal && !similar.length) {
    const sheetId = crypto.randomInt(1, 2147483647)
    changes.push(`Create ${JOURNAL_TAB} with exact A:I headers`)
    requests.push({ addSheet: { properties: { sheetId, title: JOURNAL_TAB, gridProperties: { rowCount: 1000, columnCount: 9, frozenRowCount: 1 } } } })
    requests.push({ updateCells: { start: { sheetId, rowIndex: 0, columnIndex: 0 }, rows: [cells(JOURNAL_HEADERS)], fields: 'userEnteredValue' } })
  } else if (journal) {
    // Read the entire existing tab so data below a blank first row or outside A:I
    // cannot be mistaken for an empty sheet and overwritten. FORMULA also sees
    // formulas displaying an empty string, which must never be overwritten.
    rows = await read(`'${JOURNAL_TAB}'`, { valueRenderOption: 'FORMULA' })
    if (!nonempty(rows)) {
      changes.push(`Initialize empty ${JOURNAL_TAB} headers`)
      if ((journal.gridProperties?.columnCount || 0) < 9) requests.push({ updateSheetProperties: { properties: { sheetId: journal.sheetId, gridProperties: { columnCount: 9 } }, fields: 'gridProperties.columnCount' } })
      requests.push({ updateCells: { start: { sheetId: journal.sheetId, rowIndex: 0, columnIndex: 0 }, rows: [cells(JOURNAL_HEADERS)], fields: 'userEnteredValue' } })
    } else {
      try {
        if (validateSequence) replayJournal(rows, startNumber)
        else if (JSON.stringify(rows[0]) !== JSON.stringify(JOURNAL_HEADERS)) throw new Error('Existing journal headers are incompatible.')
      } catch (error) { issues.push(`${error.message} No existing journal cells will be changed.`) }
    }
  }
  const report = { dryRun, ready: issues.length === 0 && changes.length === 0, alreadyOk: issues.length === 0 && changes.length === 0, changes, issues, schemaChanged: false, writesPerformed: false, journalExists: Boolean(journal), requiredWorksheets: WITHOUT_GST_SCHEMA.map(item => item.title) }
  if (dryRun || issues.length || !requests.length) return report
  try { await batch(requests) } catch (error) {
    // A simultaneous repair may have won the create race, or the response may
    // have been lost. Re-read; never blindly repeat the mutation.
    const checked = await reconcileWithoutGstSchema({ dryRun: true, validateSequence, read, metadata, batch, startNumber })
    if (!checked.ready) throw error
    return { ...checked, dryRun: false, recheckedAfterError: true }
  }
  const checked = await reconcileWithoutGstSchema({ dryRun: true, validateSequence, read, metadata, batch, startNumber })
  return { ...checked, dryRun: false, changes, schemaChanged: true, writesPerformed: true }
}

// The deterministic named-range ID and the event append are ONE atomic batch.
// Google rejects an already-existing namedRangeId, so concurrent same-ID retries
// cannot append a second physical event. Existing historical rows are untouched.
export function journalAppendRequests(event, sheetId) {
  const marker = `ngst_req_${crypto.createHash('sha256').update(event.id).digest('hex')}`
  return [
    { addNamedRange: { namedRange: { namedRangeId: marker, name: marker, range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 1 } } } },
    { appendCells: { sheetId, rows: encodeEvent(event).map(cells), fields: 'userEnteredValue' } },
  ]
}
export async function appendJournalEvent(event, sheetId) {
  return batchUpdateSpreadsheet(journalAppendRequests(event, sheetId))
}
