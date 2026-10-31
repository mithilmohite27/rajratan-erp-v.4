import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveNgstSequence } from '../api/_lib/withoutGstSequence.js'
import { loadBillingStorage, reconcileWithoutGstSchema } from '../api/_lib/withoutGstSchema.js'
import { createHandler } from '../api/without-gst-bills.js'
import { encodeEvent, JOURNAL_HEADERS, newId, normalizeBill } from '../src/lib/withoutGst.js'
import { fixture } from './fixtures/without-gst.mjs'
import { mockBillingStore } from './fixtures/without-gst-store.mjs'

const configAt22 = (value = 1, key = 'NGST_START_NUMBER') => [...Array.from({ length: 21 }, () => []), [key, value]]
const resolve = options => resolveNgstSequence({ environmentValue: null, ...options })
const event = (base = 42) => ({ id: newId(), billId: newId(), expectedVersion: '', action: 'SAVE', bill: normalizeBill(fixture()), reason: '', actor: 'fixture@example.com', timestamp: '2026-10-31T00:00:00Z', sequenceStart: base })

test('A22=NGST_START_NUMBER / numeric B22=1 is valid without an environment variable', () => {
  const result = resolve({ configRows: configAt22(), journalRows: [JOURNAL_HEADERS] })
  assert.deepEqual(result.issues, []); assert.equal(result.startNumber, 1)
  assert.equal(result.diagnostic.source, 'Config'); assert.deepEqual(result.diagnostic.config.rows, [22])
  assert.equal(result.diagnostic.environment.status, 'missing')
})
test('key whitespace, invisible characters, case and numeric representations normalize safely', () => {
  for (const value of [1, '1', ' 1 ', '01', '1.0']) {
    const result = resolve({ configRows: configAt22(value, '\uFEFF \u200bngst_start_number \u00a0') })
    assert.deepEqual(result.issues, []); assert.equal(result.startNumber, 1)
  }
  for (const value of [0, -1, 1.5, '1.5', '1e3', '1,000', 'text', true, null, '', ' ', Number.MAX_SAFE_INTEGER + 1]) {
    assert.ok(resolve({ configRows: configAt22(value) }).issues.length, String(value))
  }
})
test('no default of 1; legacy environment remains compatible; conflicting values block', () => {
  assert.equal(resolve({}).startNumber, undefined)
  assert.ok(resolve({}).issues.some(issue => issue.includes('NGST_START_NUMBER')))
  assert.equal(resolve({ environmentValue: '42' }).startNumber, 42)
  assert.deepEqual(resolve({ environmentValue: '1', configRows: configAt22() }).issues, [])
  assert.ok(resolve({ environmentValue: '42', configRows: configAt22() }).issues.some(issue => /conflict/.test(issue)))
  assert.ok(resolve({ environmentValue: 'invalid', configRows: configAt22() }).issues.length)
  assert.ok(resolve({ configRows: [...configAt22(), [' ngst_start_number ', 2]] }).issues.some(issue => /Duplicate/.test(issue)))
})
test('recorded journal base is preserved and is NOT a next-number counter', () => {
  const rows = [JOURNAL_HEADERS, ...encodeEvent(event(42))]
  assert.equal(resolve({ journalRows: rows }).startNumber, 42)
  assert.equal(resolve({ journalRows: rows }).diagnostic.source, 'journal')
  assert.deepEqual(resolve({ journalRows: rows, configRows: configAt22(42) }).issues, [])
  for (const changed of [1, 43]) {
    const result = resolve({ journalRows: rows, configRows: configAt22(changed) })
    assert.equal(result.startNumber, 42); assert.ok(result.issues.some(issue => /fixed sequence base/.test(issue)))
  }
  assert.ok(resolve({ journalRows: rows, environmentValue: '1' }).issues.length)
})
test('chunked first events recover the base; incomplete/corrupt events never trigger a fallback reset', () => {
  const first = event(42); first.bill.deliveries = Array.from({ length: 200 }, () => ({ ...first.bill.deliveries[0], id: newId(), location: 'Long location '.repeat(20) }))
  const chunks = encodeEvent(first); assert.ok(chunks.length > 1)
  assert.equal(resolve({ journalRows: [JOURNAL_HEADERS, ...chunks] }).startNumber, 42)
  assert.ok(resolve({ configRows: configAt22(), journalRows: [JOURNAL_HEADERS, ...chunks.slice(0, -1)] }).issues.length)
  const corrupt = structuredClone(chunks); corrupt[0][8] = 'invalid JSON'
  assert.ok(resolve({ configRows: configAt22(), journalRows: [JOURNAL_HEADERS, ...corrupt] }).issues.length)
})
test('Setup check reads full unformatted Config range fresh on every call and does not write', async () => {
  const store = mockBillingStore(); let configRows = configAt22(), reads = 0
  const read = async (range, options) => {
    if (range === 'Config!A:B') { reads++; assert.equal(options?.valueRenderOption, 'UNFORMATTED_VALUE'); return configRows }
    return store.read(range)
  }
  const check = () => reconcileWithoutGstSchema({ read, metadata: store.metadata, batch: store.batch })
  const first = await check()
  assert.equal(first.ready, true); assert.equal(first.sequence.base, 1); assert.equal(first.sequence.nextNumber, 1)
  configRows = configAt22(5)
  const second = await check(); assert.equal(second.sequence.base, 5); assert.equal(reads, 2)
  assert.equal(store.calls.length, 0)
  const diagnostics = JSON.stringify(second)
  assert.doesNotMatch(diagnostics, /GOOGLE_PRIVATE_KEY|access_token|service-account|Bearer/)
})
test('billing load/save/reconciliation uses the same Config base and preserves pending request identity', async () => {
  const store = mockBillingStore()
  const read = async (range, options) => range === 'Config!A:B' ? configAt22() : store.read(range, options)
  const handler = createHandler({ verify: async () => ({ ok: true, user: { email: 'fixture@example.com' } }), permission: () => ({ ok: true }), metadata: store.metadata, read, appendEvent: store.appendEvent })
  const send = async body => {
    const res = { statusCode: 200, setHeader() {}, status(code) { this.statusCode = code; return this }, json(payload) { this.payload = payload }, end() {} }
    await handler({ method: body ? 'POST' : 'GET', headers: {}, body }, res)
    return { status: res.statusCode, ...res.payload }
  }
  const pending = { id: newId(), billId: newId(), action: 'SAVE', expectedVersion: '', reason: '', bill: normalizeBill(fixture()) }
  const copy = structuredClone(pending)
  assert.equal((await send()).sequence.base, 1)
  assert.equal((await send({ ...pending, reconcile: true })).requestState, 'not_found')
  const saved = await send(pending)
  assert.equal(saved.record.number, 'NGST1'); assert.equal(saved.requestId, copy.id)
  const retried = await send({ ...pending, reconcile: true })
  assert.equal(retried.requestState, 'committed'); assert.equal(retried.requestId, copy.id)
  assert.deepEqual(pending, copy); assert.equal(store.rows.length, 2)
  const loaded = await send(); assert.equal(loaded.sequence.base, 1); assert.equal(loaded.sequence.nextNumber, 2)
  assert.equal(loaded.sequence.source, 'journal'); assert.equal(store.calls.length, 1)
})
test('legacy populated journal loads without Config/env base; conflict fails without modifying events', async () => {
  const store = mockBillingStore(); store.rows.push(...encodeEvent(event(42)))
  const before = structuredClone(store.rows)
  const loaded = await loadBillingStorage({ read: store.read, metadata: store.metadata })
  assert.equal(loaded.startNumber, 42); assert.equal(loaded.sequence.nextNumber, 43)
  const read = async range => range === 'Config!A:B' ? configAt22(1) : store.read(range)
  await assert.rejects(loadBillingStorage({ read, metadata: store.metadata }), /conflict/)
  assert.deepEqual(store.rows, before); assert.equal(store.calls.length, 0)
})
