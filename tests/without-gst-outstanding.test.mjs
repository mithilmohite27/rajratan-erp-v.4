import assert from 'node:assert/strict'
import test from 'node:test'
import { createHandler } from '../api/without-gst-bills.js'
import { calculateBillPayable, selectPreviousOutstanding, validateLegacyCustomerLink } from '../src/lib/withoutGstOutstanding.js'
import { fixture, freight, line, payment } from './fixtures/without-gst.mjs'
import { mockBillingStore } from './fixtures/without-gst-store.mjs'

const customerId = 'customer-1'
const otherCustomerId = 'customer-2'
const owner = { role: 'Owner' }

function bill(amount = 15000, paid = 0) {
  return {
    ...fixture('Same customer name'),
    deliveries: [line(1, amount)],
    payments: paid ? [payment(paid)] : [],
    freight: [],
  }
}

function setup() {
  const state = {
    customers: new Map([
      [customerId, { id: customerId, name: 'Same customer name' }],
      [otherCustomerId, { id: otherCustomerId, name: 'Same customer name' }],
    ]),
    bills: new Map(),
    customerLinks: new Map(),
  }
  function add(id, document, { linkedTo = customerId, status = 'finalized', history = [] } = {}) {
    state.bills.set(id, { id, number: `NGST${state.bills.size + 1}`, version: 'version-1', status, bill: document, history })
    if (linkedTo) state.customerLinks.set(id, { customerId: linkedTo })
  }
  return { state, add }
}

test('only the owner can validate an explicit legacy link against the current bill version', () => {
  const { state, add } = setup()
  add('legacy-bill', bill(), { linkedTo: null })
  const intent = { billId: 'legacy-bill', customerId, expectedVersion: 'version-1', reason: ' Verified original invoice ' }
  assert.throws(() => validateLegacyCustomerLink(state, intent, { role: 'Operator' }), /Only the owner/)
  assert.throws(() => validateLegacyCustomerLink(state, { ...intent, customerId: '' }, owner), /registered customer/)
  assert.throws(() => validateLegacyCustomerLink(state, { ...intent, billId: 'missing-bill' }, owner), /existing bill/)
  assert.throws(() => validateLegacyCustomerLink(state, { ...intent, expectedVersion: 'stale' }, owner), /bill changed/)
  assert.throws(() => validateLegacyCustomerLink(state, { ...intent, reason: ' ' }, owner), /Enter a reason/)
  assert.deepEqual(validateLegacyCustomerLink(state, intent, owner), { ...intent, reason: 'Verified original invoice' })
  assert.equal(state.customerLinks.size, 0)
  state.customerLinks.set(intent.billId, { customerId })
  assert.throws(() => validateLegacyCustomerLink(state, { ...intent, customerId: otherCustomerId }, owner), /already has/)
})

test('previous outstanding includes only verified eligible debt for the selected ID', () => {
  const { state, add } = setup()
  add('partial-bill', { ...bill(15000, 10000), freight: [freight(500, true), freight(900, false)] })
  add('unpaid-bill', bill(700))
  add('settled-bill', bill(15000, 15000))
  add('credit-bill', bill(15000, 16000))
  add('current-bill', bill())
  add('cancelled-bill', bill(), { status: 'cancelled' })
  add('voided-bill', bill(), { status: 'voided' })
  add('draft-bill', bill(), { status: 'draft' })
  add('unlinked-bill', bill(), { linkedTo: null })
  add('other-bill', bill(), { linkedTo: otherCustomerId })

  assert.equal(selectPreviousOutstanding(state, ''), null)
  assert.equal(selectPreviousOutstanding(state, 'unknown-id'), null)
  const result = selectPreviousOutstanding(state, customerId, 'current-bill')
  assert.equal(result.previousOutstandingPaise, 520000)
  assert.deepEqual(result.sources.map(source => source.billId), ['partial-bill', 'unpaid-bill'])
  assert.deepEqual(result.sources[0], {
    billId: 'partial-bill', number: 'NGST1', date: '2026-09-12',
    version: 'version-1', issuedVersion: 'version-1', revisionInProgress: false,
    originalPaise: 1500000, paidPaise: 1000000, deductiblePaise: 50000, outstandingPaise: 450000,
  })
})

test('an open revision uses the last issued settlement and exposes the current version', () => {
  const { state, add } = setup()
  add('revised-bill', bill(99000), { status: 'draft', history: [
    { status: 'finalized', version: 'issued-version', bill: bill() },
    { status: 'finalized', version: 'settled-version', bill: bill(15000, 10000) },
  ] })
  const [source] = selectPreviousOutstanding(state, customerId).sources
  assert.equal(source.outstandingPaise, 500000)
  assert.equal(source.issuedVersion, 'settled-version')
  assert.equal(source.version, 'version-1')
  assert.equal(source.revisionInProgress, true)
})

test('selected previous debt increases payable without increasing sales or creating a receivable', () => {
  const { state, add } = setup()
  add('previous-bill', bill(15000, 10000))
  const available = selectPreviousOutstanding(state, customerId)
  const supply = bill(20000)
  assert.equal(calculateBillPayable(supply, available).totalPayablePaise, 2000000)
  for (let i = 0; i < 2; i++) {
    assert.deepEqual(calculateBillPayable(supply, available, ['previous-bill']), {
      currentSalePaise: 2000000, currentPaidPaise: 0, currentAdjustmentsPaise: 0, currentDuePaise: 2000000,
      currentCreditPaise: 0, previousDuePaise: 500000, totalPayablePaise: 2500000,
    })
  }
  assert.equal(state.bills.size, 1)
  assert.throws(() => calculateBillPayable(supply, available, ['previous-bill', 'previous-bill']), /only be selected once/)
  assert.throws(() => calculateBillPayable(supply, available, ['stale-bill']), /Refresh/)
  assert.equal(calculateBillPayable(bill(20000, 21000), available, ['previous-bill']).totalPayablePaise, 500000)
  // Model the resulting balances after an independently confirmed split.
  // Stage B calculates from these records and does not post the receipt.
  state.bills.get('previous-bill').bill = bill(15000, 15000)
  const after = calculateBillPayable(bill(20000, 7000), selectPreviousOutstanding(state, customerId))
  assert.equal(after.previousDuePaise, 0)
  assert.equal(after.totalPayablePaise, 1300000)
})

test('read-only API uses Bills authorization and legacy history supplies no customer links', async () => {
  const store = mockBillingStore()
  const historical = {
    id: 'legacy-event', billId: 'legacy-bill', expectedVersion: '', action: 'FINALIZE',
    actor: 'owner@example.invalid', timestamp: '2026-09-12T00:00:00Z', sequenceStart: 1,
    bill: bill(15000, 10000),
  }
  store.rows.push(...store.encodeEvent(historical))
  const before = structuredClone(store.rows)
  const makeHandler = allowed => createHandler({
    verify: async () => ({ ok: true, user: { email: 'owner@example.invalid' } }),
    permission: () => allowed ? { ok: true } : { ok: false, status: 403, code: 'PERMISSION_DENIED' },
    read: store.read, metadata: store.metadata, startNumber: 1, appendEvent: store.appendEvent,
  })
  async function get(query, allowed = true) {
    const response = { headers: {}, setHeader(key, value) { this.headers[key] = value }, status(code) { this.code = code; return this }, json(body) { this.body = body } }
    await makeHandler(allowed)({ method: 'GET', headers: {}, query }, response)
    return response
  }
  assert.equal((await get({ view: 'outstanding', customerId }, false)).code, 403)
  assert.equal((await get({ view: 'outstanding', customerId: historical.bill.clientName })).code, 400)
  assert.equal((await get({ view: 'outstanding', customerId, currentBillId: ['legacy-bill'] })).code, 400)
  const result = await get({ view: 'outstanding', customerId })
  assert.equal(result.code, 404)
  assert.equal(result.body.code, 'CUSTOMER_NOT_REGISTERED')
  assert.equal(result.headers['Cache-Control'], 'private, no-store')
  assert.equal((await get({})).body.bills[0].number, 'NGST1')
  assert.equal(store.calls.length, 0)
  assert.deepEqual(store.rows, before)
})
