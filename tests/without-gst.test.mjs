import assert from 'node:assert/strict'
import test from 'node:test'
import { createBill, decimal, encodeEvent, JOURNAL_HEADERS, linePaise, money, newId, normalizeBill, paymentStatus, replayJournal, totals } from '../src/lib/withoutGst.js'
import { createHandler } from '../api/without-gst-bills.js'
import { requireRoleOrPermission, MODULES } from '../api/_lib/permissions.js'
import { fixture, freight, line, payment } from './fixtures/without-gst.mjs'
import { mockBillingStore } from './fixtures/without-gst-store.mjs'

test('Kalpesh Mohite: sixteen deliveries, mixed rates/locations, payments and deductible freight', () => {
  const bill = normalizeBill(fixture(), true), t = totals(bill)
  assert.equal(t.count, 16); assert.equal(t.quantities.brass, 2500000)
  assert.equal(t.total, 104520000); assert.equal(t.payments, 40000000)
  assert.equal(t.freight, 16590000); assert.equal(t.balance, 47930000)
  assert.equal(money(t.balance), '₹4,79,300.00'); assert.equal(paymentStatus(bill), 'Partial')
})
test('Akshay Mohite: 44 Brass and ₹1,67,200', () => {
  const bill = { ...fixture('Akshay Mohite'), deliveries: [line(20, 3800, 'Peth', '2026-05-31'), line(10, 3800, 'Vani', '2026-06-01'), line(14, 3800, 'Vani', '2026-06-25')], payments: [], freight: [] }
  assert.equal(totals(normalizeBill(bill, true)).total, 16720000)
  assert.equal(totals(bill).quantities.brass, 440000)
})
test('standard legacy bill, paise rounding, quantity units and zero rate', () => {
  const bill = createBill('2026-10-31', { itemDesc: 'paving block', qty: '2.5', rate: '100.25', per: 'Brass' })
  assert.equal(bill.mode, 'standard'); assert.equal(linePaise(bill.deliveries[0]), 25063)
  assert.equal(linePaise(line('0.1', '0.1')), 1)
  assert.equal(linePaise(line('0.5', '0.01')), 1)
  assert.equal(linePaise(line('1', '0')), 0)
  bill.deliveries.push({ ...line(3, 10), unit: 'Pieces' })
  assert.deepEqual(totals(bill).quantities, { brass: 25000, pieces: 30000 })
  assert.equal(decimal('0.29'), 29)
  assert.equal(decimal('.5'), 50)
  assert.equal(money(Number.MAX_SAFE_INTEGER), '₹9,00,71,99,25,47,409.91')
})
test('freight is never implicitly deductible; overpayments become explicit credit', () => {
  const bill = { ...fixture(), deliveries: [line(1, 100)], payments: [payment(120)], freight: [freight(50)] }
  assert.equal(totals(bill).freight, 0); assert.equal(totals(bill).credit, 2000)
  assert.equal(totals(bill).outstanding, 0); assert.equal(paymentStatus(bill), 'Credit')
  bill.freight[0].deductible = true; assert.equal(totals(bill).credit, 7000)
})
test('validation rejects negative, malformed, zero quantity, invalid dates, duplicate IDs/references', () => {
  for (const value of ['-1', '1e3', 'NaN', 'Infinity', '1.234', '']) assert.throws(() => decimal(value))
  for (const patch of [{ qty: '0' }, { qty: '-1' }, { rate: '-1' }, { date: '2026-02-30' }, { location: '' }, { product: '' }]) {
    const bill = fixture(); Object.assign(bill.deliveries[0], patch); assert.throws(() => normalizeBill(bill, true))
  }
  const bill = fixture(); bill.payments.push({ ...bill.payments[0] }); assert.throws(() => normalizeBill(bill, true), /record ID/)
  bill.payments[2].id = newId(); assert.throws(() => normalizeBill(bill, true), /reference/)
  bill.payments[2].reference = ''; bill.payments[0].reference = ''; assert.throws(() => normalizeBill(bill, true), /duplicate payment/)
  const empty = createBill('2026-10-31'); assert.doesNotThrow(() => normalizeBill(empty)); assert.throws(() => normalizeBill(empty, true))
})

function mockBackend(overrides = {}) {
  const store = mockBillingStore(), { rows, calls } = store
  const handler = createHandler({ startNumber: 42, verify: async () => ({ ok: true, user: { email: 'fixture@example.com' } }), permission: () => ({ ok: true }), read: store.read, metadata: store.metadata, appendEvent: store.appendEvent, config: async () => ({ COMPANY_NAME: 'Rajratan Test', BUSINESS_PHONE: '0000000000' }), ...overrides })
  return {
    rows, calls,
    async send(body, method = body ? 'POST' : 'GET') {
      const res = { statusCode: 200, setHeader() {}, status(code) { this.statusCode = code; return this }, json(value) { this.body = value }, end() {} }
      await handler({ method, headers: {}, body }, res)
      return { status: res.statusCode, ...res.body }
    },
  }
}
const request = (bill = fixture(), extra = {}) => ({ id: newId(), billId: newId(), action: 'SAVE', expectedVersion: '', reason: '', bill: normalizeBill(bill), ...extra })
test('Sheets save/reopen, literal writes, stable IDs, unique numbers under concurrent creation', async () => {
  const api = mockBackend()
  const a = request({ ...fixture(), payments: [] }), b = request({ ...fixture('Another Client'), payments: [] })
  const results = await Promise.all([api.send(a), api.send(b)])
  assert.ok(results.every(r => r.ok)); assert.equal(new Set(results.map(r => r.record.number)).size, 2)
  assert.deepEqual(results.map(r => r.record.number).sort(), ['NGST42', 'NGST43'])
  const listed = await api.send(); assert.equal(listed.bills.length, 2)
  assert.ok(api.calls.every(batch => batch[0].addNamedRange && batch[1].appendCells.sheetId === 17))
  assert.equal(listed.bills.find(r => r.id === a.billId).bill.deliveries.length, 16)
})
test('idempotent retries, including simultaneous requests with the same ID', async () => {
  const api = mockBackend(), req = request()
  const responses = await Promise.all([api.send(req), api.send(req)])
  assert.ok(responses.every(r => r.ok))
  assert.equal((await api.send()).bills.length, 1)
  assert.equal(api.calls.length, 1)
  assert.equal(api.rows.length, 2)
  assert.equal((await api.send(req)).replayed, true)
  const changed = structuredClone(req); changed.bill.clientName = 'Changed'
  assert.equal((await api.send(changed)).status, 409)
})
test('concurrent edits cannot silently overwrite; issued history and corrections are preserved', async () => {
  const api = mockBackend(), create = request()
  const first = await api.send(create)
  const base = { billId: first.record.id, expectedVersion: first.record.version }
  const changed = structuredClone(create.bill); changed.deliveries[0].rate = '5000'
  const edits = await Promise.all([api.send(request(create.bill, base)), api.send(request(changed, base))])
  assert.equal(edits.filter(r => r.ok).length, 1); assert.equal(edits.filter(r => r.status === 409).length, 1)
  const current = (await api.send()).bills[0]
  const finalized = await api.send(request(current.bill, { ...base, expectedVersion: current.version, action: 'FINALIZE' }))
  assert.equal(finalized.record.status, 'finalized'); assert.equal(finalized.record.revision, 1)
  assert.equal((await api.send(request(changed, { ...base, expectedVersion: finalized.record.version }))).status, 409)
  const revised = await api.send(request(current.bill, { ...base, expectedVersion: finalized.record.version, action: 'REVISE', reason: 'Correct delivery rate' }))
  const final2 = await api.send(request(changed, { ...base, expectedVersion: revised.record.version, action: 'FINALIZE' }))
  assert.equal(final2.record.number, 'NGST42'); assert.equal(final2.record.revision, 2)
  const issued = final2.record.history.filter(h => h.action === 'FINALIZE')
  assert.equal(issued[0].bill.deliveries[0].rate, current.bill.deliveries[0].rate)
  assert.equal(issued[1].bill.deliveries[0].rate, '5000')
  assert.equal(issued[0].company.COMPANY_NAME, 'Rajratan Test')
})
test('subsequent payments do not modify issued deliveries and cannot be allocated twice', async () => {
  const api = mockBackend(), req = request(fixture(), { action: 'FINALIZE' }), issued = await api.send(req)
  const adjusted = structuredClone(issued.record.bill); adjusted.payments.push(payment(1000, 'TEST-PAYMENT-3')); adjusted.deliveries[0].qty = '999'
  const response = await api.send(request(adjusted, { billId: req.billId, expectedVersion: issued.record.version, action: 'SETTLE', reason: 'Subsequent payment' }))
  assert.equal(response.record.bill.deliveries[0].qty, '10'); assert.equal(response.record.bill.payments.length, 3)
  assert.equal(response.record.history[0].bill.payments.length, 2)
  assert.equal((await api.send(request(fixture('Other Client')))).status, 409)
  const noReason = await api.send(request(response.record.bill, { billId: req.billId, expectedVersion: response.record.version, action: 'SETTLE' }))
  assert.equal(noReason.status, 409)
})
test('large multi-row journal events round-trip, remain immutable, and detect corruption/config changes', () => {
  const bill = fixture(); bill.deliveries = Array.from({ length: 400 }, (_, i) => ({ ...line(1, 1, 'Long delivery location '.repeat(10)), product: `Product ${i}` }))
  const event = { ...request(bill), actor: 'fixture@example.com', timestamp: '2026-10-31T00:00:00Z', sequenceStart: 42 }
  const encoded = encodeEvent(event); assert.ok(encoded.length > 1)
  const rows = [JOURNAL_HEADERS, ...encoded], state = replayJournal(rows, 42)
  assert.equal(state.bills.get(event.billId).bill.deliveries.length, 400)
  assert.throws(() => replayJournal(rows.slice(0, -1), 42), /Incomplete/)
  assert.throws(() => replayJournal(rows, 1), /sequence/)
})
test('permissions and configuration fail closed before any write', async () => {
  let writes = 0
  const unauth = mockBackend({ verify: async () => ({ ok: false, status: 401, code: 'MISSING_TOKEN', message: 'Sign in' }), appendEvent: () => { writes++ } })
  assert.equal((await unauth.send(request())).status, 401)
  const denied = mockBackend({ permission: () => ({ ok: false, status: 403, code: 'PERMISSION_DENIED', message: 'Denied' }), appendEvent: () => { writes++ } })
  assert.equal((await denied.send(request())).status, 403)
  const unconfigured = mockBackend({ startNumber: 0, appendEvent: () => { writes++ } })
  assert.equal((await unconfigured.send(request())).status, 503)
  const missing = mockBackend({ read: async () => { const e = new Error('Missing journal'); e.code = 'SHEET_RANGE_NOT_FOUND'; throw e }, appendEvent: () => { writes++ } })
  assert.equal((await missing.send(request())).status, 503)
  assert.equal(writes, 0)
  assert.equal(requireRoleOrPermission({ email: 'nobody@example.invalid' }, MODULES.bills).ok, false)
})
test('uncertain write response is safely recoverable with the original ID', async () => {
  const store = mockBillingStore(); let failed = false
  const api = mockBackend({ metadata: store.metadata, read: async range => { if (failed && range === store.JOURNAL_RANGE) { failed = false; throw new Error('Read response lost after write') } return store.read(range) }, appendEvent: async (event, sheetId) => { await store.appendEvent(event, sheetId); failed = true; throw new Error('Connection lost after write') } })
  const req = request(); assert.equal((await api.send(req)).ok, false)
  const retried = await api.send(req); assert.equal(retried.ok, true); assert.equal(retried.replayed, true)
  assert.equal((await api.send()).bills.length, 1)
})
test('concurrent allocations accept a payment only once and subsequent numbering stays sequential', async () => {
  const api = mockBackend(), bill = fixture()
  const attempts = await Promise.all([api.send(request(bill)), api.send(request({ ...bill, clientName: 'Another Client' }))])
  assert.equal(attempts.filter(r => r.ok).length, 1)
  assert.equal(attempts.filter(r => r.status === 409).length, 1)
  const other = await api.send(request({ ...fixture(), payments: [] }))
  assert.equal(other.record.number, 'NGST43')
})
test('revisions, chunking and retries never consume another bill number', async () => {
  const api = mockBackend(), req = request()
  let record = (await api.send(req)).record
  for (const action of ['SAVE', 'FINALIZE', 'REVISE', 'SAVE', 'FINALIZE']) {
    record = (await api.send(request(record.bill, { billId: record.id, expectedVersion: record.version, action, reason: action === 'REVISE' ? 'Correction' : '' }))).record
  }
  const next = await api.send(request({ ...fixture(), payments: [] }))
  assert.equal(record.number, 'NGST42'); assert.equal(next.record.number, 'NGST43')
})
