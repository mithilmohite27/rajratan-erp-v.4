import { encodeEvent, JOURNAL_HEADERS, JOURNAL_RANGE, JOURNAL_TAB } from '../../src/lib/withoutGst.js'
import { journalAppendRequests } from '../../api/_lib/withoutGstSchema.js'

// In-memory Sheets emulator: atomic batches, unique named-range IDs, real journal
// encoding. No credentials or business spreadsheet requests are used by tests.
export function mockBillingStore({ missingJournal = false, missingConfig = false } = {}) {
  const rows = missingJournal ? [] : [JOURNAL_HEADERS.slice()]
  const sheets = [
    ...(!missingJournal ? [{ properties: { title: JOURNAL_TAB, sheetId: 17, gridProperties: { columnCount: 9 } } }] : []),
    ...(!missingConfig ? [{ properties: { title: 'Config', sheetId: 18, gridProperties: { columnCount: 2 } } }] : []),
  ]
  const markers = new Set(), calls = []
  const metadata = async () => structuredClone({ sheets })
  const read = async range => {
    const title = range.startsWith('Config') ? 'Config' : JOURNAL_TAB
    if (!sheets.some(sheet => sheet.properties.title === title)) {
      const error = new Error(`Sheet range not found: ${range}`); error.code = 'SHEET_RANGE_NOT_FOUND'; throw error
    }
    if (title === 'Config') return [['COMPANY_NAME', 'Test Company']]
    return structuredClone(rows)
  }
  const batch = async requests => {
    // Validate all operations before mutating, as Sheets batchUpdate does.
    for (const req of requests) {
      if (req.addNamedRange && markers.has(req.addNamedRange.namedRange.namedRangeId)) throw new Error('Named range ID already exists')
      if (req.addSheet && sheets.some(sheet => sheet.properties.title === req.addSheet.properties.title)) throw new Error('Sheet already exists')
    }
    calls.push(structuredClone(requests))
    for (const req of requests) {
      if (req.addNamedRange) markers.add(req.addNamedRange.namedRange.namedRangeId)
      if (req.addSheet) sheets.push({ properties: structuredClone(req.addSheet.properties) })
      if (req.updateSheetProperties) sheets.find(sheet => sheet.properties.sheetId === req.updateSheetProperties.properties.sheetId).properties.gridProperties.columnCount = req.updateSheetProperties.properties.gridProperties.columnCount
      if (req.updateCells) rows[0] = req.updateCells.rows[0].values.map(cell => cell.userEnteredValue.stringValue)
      if (req.appendCells) rows.push(...req.appendCells.rows.map(row => row.values.map(cell => cell.userEnteredValue.stringValue ?? cell.userEnteredValue.numberValue)))
    }
  }
  const appendEvent = async (event, sheetId) => batch(journalAppendRequests(event, sheetId))
  return { rows, sheets, markers, calls, metadata, read, batch, appendEvent, encodeEvent, JOURNAL_RANGE }
}
