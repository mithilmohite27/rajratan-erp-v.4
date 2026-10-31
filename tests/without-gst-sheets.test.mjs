import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import test from 'node:test'
import setupHandler from '../api/setup.js'
import billHandler from '../api/without-gst-bills.js'
import { newId, normalizeBill } from '../src/lib/withoutGst.js'
import { fixture } from './fixtures/without-gst.mjs'
import { mockBillingStore } from './fixtures/without-gst-store.mjs'

test('actual Setup/auth/Sheets transport: dry-run, confirmed migration, literal writes and guarded retries', async () => {
  let store = mockBillingStore({ missingJournal: true })
  const values = {
    SPREADSHEET_ID: 'ISOLATED_TEST_SHEET', VITE_SHEET_ID: 'ISOLATED_TEST_SHEET',
    GOOGLE_SERVICE_ACCOUNT_EMAIL: 'service@fixture.invalid',
    GOOGLE_PRIVATE_KEY: crypto.generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } }).privateKey,
    NGST_START_NUMBER: '42', OWNER_EMAIL: 'owner@fixture.invalid', GOOGLE_CLIENT_ID: 'fixture-client',
  }
  const before = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]))
  const originalFetch = globalThis.fetch
  const requests = []
  let email = values.OWNER_EMAIL
  Object.assign(process.env, values)
  const response = (data, status = 200) => ({ ok: status < 400, status, json: async () => data, text: async () => JSON.stringify(data) })
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(input), pathname = decodeURIComponent(url.pathname)
    requests.push({ pathname, method: init.method || 'GET', valueRenderOption: url.searchParams.get('valueRenderOption') })
    if (url.origin === 'https://oauth2.googleapis.com' && pathname === '/tokeninfo') return response({ email, aud: values.GOOGLE_CLIENT_ID })
    if (url.origin === 'https://oauth2.googleapis.com' && pathname === '/token') return response({ access_token: 'isolated-service-token' })
    assert.equal(url.origin, 'https://sheets.googleapis.com', 'No unexpected network request is allowed')
    assert.ok(pathname.startsWith('/v4/spreadsheets/ISOLATED_TEST_SHEET'), 'Only the isolated fixture spreadsheet can be requested')
    if (pathname.endsWith(':batchUpdate')) {
      try { await store.batch(JSON.parse(init.body).requests); return response({ replies: [] }) }
      catch (error) { return response({ error: { message: error.message } }, 400) }
    }
    if (pathname.includes('/values/')) {
      try { return response({ values: await store.read(pathname.split('/values/')[1]) }) }
      catch (error) { return response({ error: { message: error.message } }, 400) }
    }
    return response(await store.metadata())
  }
  const send = async (handler, body) => {
    const res = { statusCode: 200, setHeader() {}, status(code) { this.statusCode = code; return this }, json(payload) { this.payload = payload }, end() {} }
    await handler({ method: body ? 'POST' : 'GET', headers: { authorization: 'Bearer isolated-user-token' }, body }, res)
    return { status: res.statusCode, ...res.payload }
  }
  try {
    const check = { action: 'reconcile_without_gst', confirmHighRisk: true, dryRun: true }
    assert.equal((await send(setupHandler, check)).writesPerformed, false)
    assert.equal(store.calls.length, 0)
    assert.equal((await send(setupHandler, { ...check, dryRun: false })).ready, true)
    assert.equal(store.calls.length, 1)
    assert.equal((await send(setupHandler, { ...check, dryRun: false })).writesPerformed, false)
    const request = { id: newId(), billId: newId(), action: 'SAVE', expectedVersion: '', reason: '', bill: normalizeBill(fixture()) }
    const saves = await Promise.all([send(billHandler, request), send(billHandler, request)])
    assert.ok(saves.every(save => save.requestState === 'committed'))
    assert.ok(saves.every(save => save.record.number === 'NGST42'))
    assert.equal(store.calls.length, 2) // One migration, one physical event.
    assert.equal(store.rows.length, 2)
    const reconciled = await send(billHandler, { ...request, reconcile: true })
    assert.equal(reconciled.authoritative, true); assert.equal(store.calls.length, 2)
    assert.equal((await send(billHandler)).bills.length, 1)
    email = 'unauthorized@fixture.invalid'
    const requestCount = requests.length
    assert.equal((await send(setupHandler, { ...check, dryRun: false })).status, 403)
    assert.equal(requests.length, requestCount + 1, 'Unauthorized setup must stop after token verification')
    assert.equal(store.calls.length, 2)
    // Reproduce the reported Config-only deployment through the real handlers,
    // token/metadata/value transport, without a server environment base.
    email = values.OWNER_EMAIL
    delete process.env.NGST_START_NUMBER
    store = mockBillingStore()
    const read = store.read
    store.read = async range => range === 'Config!A:B' ? [...Array.from({ length: 21 }, () => []), ['NGST_START_NUMBER', 1]] : read(range)
    const configCheck = await send(setupHandler, check)
    assert.equal(configCheck.ready, true); assert.equal(configCheck.sequence.base, 1)
    assert.deepEqual(configCheck.sequence.config.rows, [22]); assert.equal(configCheck.sequence.environment.status, 'missing')
    assert.equal(configCheck.sequence.source, 'Config'); assert.equal(store.calls.length, 0)
    const configPending = { ...request, id: newId(), billId: newId() }
    assert.equal((await send(billHandler, configPending)).record.number, 'NGST1')
    const pendingCheck = await send(billHandler, { ...configPending, reconcile: true })
    assert.equal(pendingCheck.requestState, 'committed'); assert.equal(pendingCheck.requestId, configPending.id)
    const loaded = await send(billHandler)
    assert.equal(loaded.sequence.base, 1); assert.equal(loaded.sequence.nextNumber, 2)
    assert.equal(store.rows.length, 2); assert.equal(store.calls.length, 1)
    assert.ok(requests.some(req => req.pathname.endsWith('/values/Config!A:B') && req.valueRenderOption === 'UNFORMATTED_VALUE'))
  } finally {
    globalThis.fetch = originalFetch
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
})
