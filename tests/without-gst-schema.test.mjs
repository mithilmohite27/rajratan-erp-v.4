import assert from 'node:assert/strict'
import test from 'node:test'
import { assertSpreadsheetTarget, journalAppendRequests, loadBillingStorage, reconcileWithoutGstSchema } from '../api/_lib/withoutGstSchema.js'
import { createHandler } from '../api/without-gst-bills.js'
import { validateSetupPayload } from '../api/_lib/setupValidation.js'
import { JOURNAL_HEADERS, JOURNAL_TAB, newId, normalizeBill } from '../src/lib/withoutGst.js'
import { fixture } from './fixtures/without-gst.mjs'
import { mockBillingStore } from './fixtures/without-gst-store.mjs'

const repair = (store, options = {}) => reconcileWithoutGstSchema({ read: store.read, metadata: store.metadata, batch: store.batch, startNumber: 42, ...options })
const request = () => ({ id: newId(), billId: newId(), action: 'SAVE', expectedVersion: '', reason: '', bill: normalizeBill(fixture()) })
function backend(store, overrides = {}) {
  const handler = createHandler({ verify: async () => ({ ok: true, user: { email: 'fixture@example.com' } }), permission: () => ({ ok: true }), startNumber: 42, read: store.read, metadata: store.metadata, appendEvent: store.appendEvent, config: async () => ({}), ...overrides })
  return async body => {
    const res = { statusCode: 200, setHeader() {}, status(status) { this.statusCode = status; return this }, json(payload) { this.payload = payload }, end() {} }
    await handler({ method: body ? 'POST' : 'GET', headers: {}, body }, res)
    return { status: res.statusCode, ...res.payload }
  }
}
test('missing journal: dry-run reports exact schema and performs no writes', async () => {
  const store = mockBillingStore({ missingJournal: true }), result = await repair(store)
  assert.equal(result.dryRun, true); assert.equal(result.ready, false)
  assert.deepEqual(result.issues, []); assert.equal(result.changes.length, 1)
  assert.equal(store.calls.length, 0); assert.equal(store.sheets.length, 1)
})
test('explicit repair atomically creates exact headers; repeat and concurrent repair are safe', async () => {
  const store = mockBillingStore({ missingJournal: true })
  const results = await Promise.all([repair(store, { dryRun: false }), repair(store, { dryRun: false })])
  assert.ok(results.every(result => result.ready))
  assert.deepEqual(store.rows, [JOURNAL_HEADERS]); assert.equal(store.calls.length, 1)
  assert.equal(store.sheets.filter(s => s.properties.title === JOURNAL_TAB).length, 1)
  assert.equal((await repair(store, { dryRun: false })).writesPerformed, false)
  assert.equal(store.calls.length, 1)
})
test('empty journal may be initialized/expanded; existing data below a blank header is preserved', async () => {
  const store = mockBillingStore(); store.rows.length = 0; store.sheets[0].properties.gridProperties.columnCount = 3
  assert.equal((await repair(store, { dryRun: false })).ready, true)
  assert.equal(store.sheets[0].properties.gridProperties.columnCount, 9)
  const nonempty = mockBillingStore(); nonempty.rows.splice(0, 1, [], [], ['Existing record'])
  const before = structuredClone(nonempty.rows), result = await repair(nonempty, { dryRun: false })
  assert.ok(result.issues.length); assert.equal(result.writesPerformed, false)
  assert.deepEqual(nonempty.rows, before); assert.equal(nonempty.calls.length, 0)
})
test('incompatible nonempty headers and similarly named journals are never overwritten or duplicated', async () => {
  const store = mockBillingStore(); store.rows[0][0] = 'WrongEventHeader'
  const before = structuredClone(store.rows), result = await repair(store, { dryRun: false })
  assert.equal(result.ready, false); assert.ok(result.issues.some(i => /headers/.test(i)))
  assert.deepEqual(store.rows, before); assert.equal(store.calls.length, 0)
  const typo = mockBillingStore(); typo.sheets[0].properties.title = 'Without GST Journal '
  const typoResult = await repair(typo, { dryRun: false })
  assert.ok(typoResult.issues.some(i => /Similarly named/.test(i))); assert.equal(typo.calls.length, 0)
})
test('formulas displaying blank are existing data and cannot be initialized over', async () => {
  const store = mockBillingStore()
  const read = async (range, options) => range.startsWith("'Without_GST_Journal'") ? (options?.valueRenderOption === 'FORMULA' ? [['=""']] : []) : store.read(range)
  const result = await repair(store, { dryRun: false, read })
  assert.equal(result.ready, false); assert.ok(result.issues.length)
  assert.equal(store.calls.length, 0)
})
test('missing Config, invalid numbering and mismatched spreadsheet targets block writes', async () => {
  const noConfig = mockBillingStore({ missingJournal: true, missingConfig: true })
  assert.equal((await repair(noConfig, { dryRun: false })).writesPerformed, false)
  assert.equal(noConfig.calls.length, 0)
  const store = mockBillingStore({ missingJournal: true })
  assert.ok((await repair(store, { dryRun: false, startNumber: 0 })).issues.some(i => /NGST_START_NUMBER/.test(i)))
  assert.equal(store.calls.length, 0)
  assert.throws(() => assertSpreadsheetTarget('frontend-sheet', 'different-backend-sheet'), /differ/)
  assert.doesNotThrow(() => assertSpreadsheetTarget('same', 'same'))
})
test('header-only seed does not invent a sequence; financial preflight still blocks an unset base', async () => {
  const store = mockBillingStore({ missingJournal: true })
  assert.equal((await repair(store, { dryRun: false, startNumber: 0, validateSequence: false })).ready, true)
  await assert.rejects(loadBillingStorage({ read: store.read, metadata: store.metadata, startNumber: 0 }), /NGST_START_NUMBER/)
  assert.equal(store.calls.length, 1)
})
test('existing saved NGST sequence survives checks and repairs; changed base is refused', async () => {
  const store = mockBillingStore(), api = backend(store), req = request()
  assert.equal((await api(req)).record.number, 'NGST42')
  const before = structuredClone(store.rows)
  assert.equal((await repair(store, { dryRun: false })).ready, true)
  assert.deepEqual(store.rows, before)
  const wrong = await repair(store, { dryRun: false, startNumber: 1 })
  assert.equal(wrong.ready, false); assert.ok(wrong.issues.some(i => /sequence/.test(i)))
  assert.deepEqual(store.rows, before)
})
test('Setup action defaults to dry-run and requires existing high-risk confirmation', () => {
  assert.equal(validateSetupPayload({ action: 'reconcile_without_gst' }).ok, false)
  assert.equal(validateSetupPayload({ action: 'reconcile_without_gst', confirmHighRisk: true }).dryRun, true)
  assert.equal(validateSetupPayload({ action: 'reconcile_without_gst', confirmHighRisk: true, dryRun: false }).dryRun, false)
})
test('both loading and saving fail preflight without initializing missing storage', async () => {
  for (const options of [{ missingJournal: true }, { missingConfig: true }]) {
    const store = mockBillingStore(options), api = backend(store), req = request()
    assert.equal((await api()).status, 503)
    const failed = await api(req)
    assert.equal(failed.status, 503); assert.equal(failed.details.requestId, req.id)
    assert.equal(failed.details.requestState, 'unknown'); assert.equal(store.calls.length, 0)
  }
})
test('pending unknown is retained; schema repair then same-ID retry commits once', async () => {
  const store = mockBillingStore({ missingJournal: true }), api = backend(store), req = request(), original = structuredClone(req)
  assert.equal((await api(req)).details.requestState, 'unknown')
  assert.equal((await api({ ...req, reconcile: true })).details.requestState, 'unknown')
  assert.equal((await repair(store, { dryRun: false })).ready, true)
  const checked = await api({ ...req, reconcile: true })
  assert.equal(checked.requestState, 'not_found')
  assert.deepEqual(req, original)
  const saved = await api(req)
  assert.equal(saved.requestId, original.id); assert.equal(saved.requestState, 'committed')
  assert.equal(saved.record.number, 'NGST42')
  assert.equal((await api(req)).record.number, 'NGST42')
  assert.equal(store.rows.length, 2)
})
test('read-only reconciliation finds an existing commit with no append or number consumption', async () => {
  const store = mockBillingStore(), api = backend(store), req = request()
  await api(req)
  const callCount = store.calls.length, result = await api({ ...req, reconcile: true })
  assert.equal(result.requestState, 'committed'); assert.equal(result.authoritative, true)
  assert.equal(result.requestId, req.id); assert.equal(store.calls.length, callCount)
  const duplicate = await api(req); assert.equal(duplicate.record.number, result.record.number)
  assert.equal(store.rows.length, 2)
})
test('reused ID is unknown; stored rejected attempt is authoritative and cannot later commit', async () => {
  const store = mockBillingStore(), api = backend(store), req = request()
  const issued = await api(req)
  const changed = structuredClone(req); changed.bill.clientName = 'Changed under same ID'
  const mismatch = await api({ ...changed, reconcile: true })
  assert.equal(mismatch.details.requestState, 'unknown'); assert.equal(mismatch.code, 'REQUEST_ID_REUSED')
  const stale = { ...req, id: newId(), expectedVersion: '' }
  const rejected = await api(stale)
  assert.equal(rejected.details.requestState, 'rejected'); assert.equal(rejected.details.authoritative, true)
  assert.equal((await api({ ...stale, reconcile: true })).details.requestState, 'rejected')
  assert.equal((await api()).bills[0].version, issued.record.version)
  assert.equal((await api()).bills.length, 1)
})
test('guard and literal event chunks share one atomic batch with deterministic IDs', () => {
  const event = { ...request(), actor: 'fixture@example.com', timestamp: '2026-10-31T00:00:00Z', sequenceStart: 42 }
  event.bill.notes = '=HYPERLINK("example.invalid")'
  const batch = journalAppendRequests(event, 17), again = journalAppendRequests(event, 17)
  assert.equal(batch.length, 2)
  assert.equal(batch[0].addNamedRange.namedRange.namedRangeId, again[0].addNamedRange.namedRange.namedRangeId)
  assert.equal(batch[1].appendCells.sheetId, 17)
  for (const row of batch[1].appendCells.rows) for (const cell of row.values) assert.equal(cell.userEnteredValue.formulaValue, undefined)
})
