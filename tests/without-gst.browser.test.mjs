import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { createRequire } from 'node:module'
import { build } from 'esbuild'
import postcss from 'postcss'
import tailwindcss from 'tailwindcss'
import autoprefixer from 'autoprefixer'
import tailwindConfig from '../tailwind.config.js'
import { createHandler } from '../api/without-gst-bills.js'
import { newId, normalizeBill } from '../src/lib/withoutGst.js'
import { fixture, line } from './fixtures/without-gst.mjs'
import { mockBillingStore } from './fixtures/without-gst-store.mjs'

// No browser package is added to production. Use an installed Playwright or the
// Codex bundled test runtime; other environments can point to their node_modules.
let chromium
try {
  const require = createRequire(import.meta.url)
  let playwright
  try { playwright = require('playwright') } catch {
    const modules = process.env.NGST_BROWSER_TEST_MODULES || path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules')
    playwright = require(path.join(modules, 'playwright'))
  }
  chromium = playwright.chromium
} catch { /* Report an explicit skip when no browser runtime is installed. */ }

test('browser: tab isolation, editing, saved drafts, mobile, issued revisions, and multipage print', { skip: !chromium, timeout: 120000 }, async t => {
  const root = process.cwd()
  const store = mockBillingStore()
  let storageAvailable = true
  const postedSaveIds = []
  const handler = createHandler({ startNumber: 42, verify: async () => ({ ok: true, user: { email: 'fixture@example.invalid' } }), permission: () => ({ ok: true }), read: store.read, metadata: async () => storageAvailable ? store.metadata() : { sheets: store.sheets.filter(s => s.properties.title !== 'Without_GST_Journal') }, appendEvent: store.appendEvent, config: async () => ({ COMPANY_NAME: 'RAJ RATAN ENTERPRISE', BUSINESS_ADDRESS: 'Test factory address, Gujarat', BUSINESS_PHONE: '0000000000' }) })
  const api = async body => {
    const res = { statusCode: 200, setHeader() {}, status(code) { this.statusCode = code; return this }, json(data) { this.data = data }, end() {} }
    await handler({ method: body ? 'POST' : 'GET', headers: {}, body }, res)
    return res
  }
  const data = fixture()
  await api({ id: newId(), billId: newId(), expectedVersion: '', action: 'SAVE', reason: '', bill: normalizeBill(data) })
  const long = fixture('Long Table Fixture'); long.payments = []; long.freight = []
  long.deliveries = Array.from({ length: 100 }, (_, i) => ({ ...line(1, 4200, `Delivery location ${i + 1}, Peth district`), product: `Paver Blocks ${i + 1}` }))
  await api({ id: newId(), billId: newId(), expectedVersion: '', action: 'FINALIZE', reason: '', bill: normalizeBill(long) })
  const result = await build({
    stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import BillGenerator from './src/pages/Billgenerator.jsx'; createRoot(document.getElementById('root')).render(<BillGenerator/>);`, loader: 'jsx', resolveDir: root },
    bundle: true, write: false, format: 'esm', define: { 'import.meta.env': JSON.stringify({ VITE_SHEET_ID: 'ISOLATED_FIXTURE' }) },
    plugins: [{ name: 'isolated-app-context', setup(builder) {
      builder.onResolve({ filter: /\/App\.jsx$/ }, () => ({ path: 'fixture-app-context', namespace: 'fixture' }))
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `import { DEFAULT_CONFIG } from ${JSON.stringify(path.join(root, 'src/lib/config.js').replaceAll('\\', '/'))}; export const useApp=()=>({accessToken:'isolated-test-token',config:DEFAULT_CONFIG,user:{email:'fixture@example.invalid'}});`, resolveDir: root }))
    } }],
  })
  const css = (await postcss([tailwindcss(tailwindConfig), autoprefixer]).process(await fs.readFile(path.join(root, 'src/index.css'), 'utf8'), { from: path.join(root, 'src/index.css') })).css
  const js = result.outputFiles[0].text
  const url = 'https://ngst-fixture.invalid'
  const html = '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body style="background:#f8f9fb"><main class="pt-16"><div id="root"></div></main><script type="module" src="/fixture.js"></script></body></html>'
  const logo = await fs.readFile(path.join(root, 'public/assets/rajratan-erp-icon-light.png'))
  let browser
  try {
    const chrome = process.env.NGST_TEST_CHROME || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined)
    browser = await chromium.launch({ headless: true, ...(chrome ? { executablePath: chrome } : {}) })
    const context = await browser.newContext({ viewport: { width: 1365, height: 960 } })
    // Native print UI and CDP PDF export cannot run simultaneously reliably.
    // Assert the real handler invokes print, then use Chromium's PDF renderer.
    await context.addInitScript(() => {
      window.open = () => null
      window.print = () => { window.__printCalls = (window.__printCalls || 0) + 1 }
    })
    const errors = []
    context.on('requestfailed', request => t.diagnostic(`Request failed: ${request.url()} ${request.failure()?.errorText}`))
    await context.route('**/*', async route => {
      const request = route.request(), requestUrl = request.url()
      if (requestUrl.includes('sheets.googleapis.com')) return route.fulfill({ json: { values: [['ClientName', 'Location', 'Rate'], ['CRM Fixture Client', 'Peth', '4200']] } })
      if (requestUrl.endsWith('/api/without-gst-bills')) {
        if (request.method() === 'POST' && !request.postDataJSON().reconcile) postedSaveIds.push(request.postDataJSON().id)
        const response = await api(request.method() === 'POST' ? request.postDataJSON() : null)
        return route.fulfill({ status: response.statusCode, json: response.data })
      }
      if (requestUrl === `${url}/fixture.js`) return route.fulfill({ contentType: 'text/javascript', body: js })
      if (requestUrl === `${url}/fixture.css`) return route.fulfill({ contentType: 'text/css', body: css })
      if (requestUrl === `${url}/assets/rajratan-erp-icon-light.png`) return route.fulfill({ contentType: 'image/png', body: logo })
      if (requestUrl === `${url}/`) return route.fulfill({ contentType: 'text/html', body: html })
      return route.abort() // Tests never reach live business services.
    })
    const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message)); page.on('dialog', dialog => dialog.accept())
    await page.goto(url)
    const gstNumber = page.locator('input:visible').first()
    await gstNumber.fill('INV-GST-UNCHANGED')
    await page.getByRole('button', { name: 'Without GST Bill', exact: true }).click()
    await page.getByLabel('Client name', { exact: true }).fill('Browser Draft Customer')
    await page.getByLabel('Billing address', { exact: true }).fill('Vani, Maharashtra')
    await page.getByLabel('Delivery location', { exact: true }).fill('Vani')
    await page.getByLabel('Quantity', { exact: true }).fill('2.5')
    await page.getByLabel('Rate per unit (₹)', { exact: true }).fill('100.25')
    await page.getByRole('button', { name: 'Tax Invoice', exact: true }).click()
    assert.equal(await gstNumber.inputValue(), 'INV-GST-UNCHANGED')
    await page.getByRole('button', { name: 'Without GST Bill', exact: true }).click()
    assert.equal(await page.getByLabel('Client name', { exact: true }).inputValue(), 'Browser Draft Customer')
    assert.ok(await page.getByText('₹250.63', { exact: false }).count())
    await page.getByRole('button', { name: 'Duplicate', exact: true }).click()
    assert.equal(await page.getByLabel('Quantity', { exact: true }).count(), 2)
    await page.getByLabel('Quantity', { exact: true }).nth(1).fill('3')
    await page.getByLabel('Move delivery 2 up').click()
    assert.equal(await page.getByLabel('Quantity', { exact: true }).first().inputValue(), '3')
    await page.getByRole('button', { name: 'Remove', exact: true }).first().click()
    assert.equal(await page.getByLabel('Quantity', { exact: true }).count(), 1)
    await page.getByRole('button', { name: 'Save draft', exact: true }).click()
    await page.getByRole('status').filter({ hasText: 'draft saved' }).waitFor()
    await page.reload()
    await page.getByRole('button', { name: 'Without GST Bill', exact: true }).click()
    assert.equal(await page.getByLabel('Client name', { exact: true }).inputValue(), 'Browser Draft Customer')
    assert.equal(await page.getByLabel('Quantity', { exact: true }).inputValue(), '2.5')
    const kmCard = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Saved Without GST Bills' }) }).locator('div.rounded-xl').filter({ hasText: 'Kalpesh Mohite' })
    await kmCard.getByRole('button', { name: 'Open', exact: true }).click()
    assert.equal(await page.getByLabel('Quantity', { exact: true }).count(), 16)
    assert.ok(await page.getByText('₹4,79,300.00', { exact: true }).count())
    await page.getByRole('button', { name: 'Finalize bill', exact: true }).click()
    await page.getByRole('status').filter({ hasText: 'saved as issued' }).waitFor()
    assert.equal(await page.getByLabel('Client name', { exact: true }).isDisabled(), true)
    await page.getByRole('button', { name: 'Record / correct payments', exact: true }).click()
    await page.getByRole('button', { name: '+ Add payment', exact: true }).click()
    await page.getByLabel('Amount (₹)', { exact: true }).last().fill('1000')
    await page.getByLabel('Reference (optional, unique)', { exact: true }).last().fill('BROWSER-PAY-3')
    await page.getByLabel('Settlement / correction reason', { exact: true }).fill('Received subsequent payment')
    await page.getByRole('button', { name: 'Save settlement update', exact: true }).click()
    await page.getByRole('status').filter({ hasText: 'saved as issued' }).waitFor()
    assert.ok(await page.getByText('₹4,78,300.00', { exact: true }).count())
    await page.getByLabel('Correction reason', { exact: true }).fill('Update delivery specification')
    await page.getByRole('button', { name: 'Start revision', exact: true }).click()
    await page.getByRole('status').filter({ hasText: 'draft saved' }).waitFor()
    assert.equal(await page.getByLabel('Client name', { exact: true }).isDisabled(), false)

    await page.setViewportSize({ width: 390, height: 844 })
    await page.evaluate(() => window.scrollTo(0, 0))
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    await fs.mkdir(path.join(root, 'tmp/ngst-qa'), { recursive: true })
    await page.screenshot({ path: path.join(root, 'tmp/ngst-qa/mobile.png'), fullPage: false })
    await page.getByRole('button', { name: 'Preview bill', exact: true }).click()
    assert.equal(await page.locator('.ngst-document:visible tbody tr').count(), 16)

    const printPage = page.locator('body > .bill-print-page')
    let printCalls = 0
    const printPdf = async (file, selector) => {
      assert.equal(await printPage.isVisible(), false)
      await page.getByRole('button', { name: 'Print / Save as PDF', exact: true }).click()
      assert.equal(await page.evaluate(() => window.__printCalls), ++printCalls)
      assert.equal(context.pages().length, 1)
      await page.emulateMedia({ media: 'print' })
      try {
        assert.equal(await page.locator('#root').isVisible(), false)
        assert.equal(await page.locator(selector + ':visible').count(), 1)
        await printPage.locator('img').first().evaluate(img => img.decode())
        const pdf = await page.pdf({ path: path.join(root, 'tmp/ngst-qa', file), preferCSSPageSize: true, printBackground: true })
        const [, width, height] = pdf.toString('latin1').match(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/) || []
        assert.ok(Math.abs(Number(width) - 595) < 2 && Math.abs(Number(height) - 842) < 2, 'PDF uses A4 paper')
        return pdf
      } finally {
        await page.emulateMedia({ media: 'screen' })
      }
    }

    await printPdf('kalpesh.pdf', '.ngst-document')
    const longCard = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Saved Without GST Bills' }) }).locator('div.rounded-xl').filter({ hasText: 'Long Table Fixture' })
    await longCard.getByRole('button', { name: 'Open', exact: true }).click()
    await page.getByRole('button', { name: 'Preview bill', exact: true }).click()
    assert.equal(await printPage.locator('.ngst-lines tbody tr').count(), 100)
    const longPdf = await printPdf('long-table.pdf', '.ngst-document')
    assert.ok((longPdf.toString('latin1').match(/\/Type \/Page\b/g) || []).length > 1)

    for (const type of ['Tax Invoice', 'Delivery Challan']) {
      await page.getByRole('button', { name: type, exact: true }).click()
      await page.getByRole('button', { name: 'Preview', exact: true }).click()
      assert.equal(await printPage.locator('.ngst-document').count(), 0)
      const pdf = await printPdf(type + '.pdf', '.bill-sheet')
      assert.equal((pdf.toString('latin1').match(/\/Type \/Page\b/g) || []).length, 1)
    }
    await page.getByRole('button', { name: 'Without GST Bill', exact: true }).click()
    assert.deepEqual(errors, [])
    // A stale successful load must not allow a later schema failure to create a
    // fresh pending request. The server is checked again BEFORE pending is stored.
    await page.getByRole('button', { name: 'Back to bill', exact: true }).click()
    await page.getByRole('button', { name: 'New bill', exact: true }).click()
    const writesBeforeFailure = store.calls.length
    storageAvailable = false
    await page.getByRole('button', { name: 'Save draft', exact: true }).click()
    await page.getByRole('alert').filter({ hasText: 'worksheet is missing' }).waitFor()
    const storageKey = 'rajratan.ngst.v1.fixture@example.invalid'
    assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).pending, storageKey), null)
    assert.equal(store.calls.length, writesBeforeFailure)

    // Restore an old pending request as it exists in users' browser backups.
    const pendingBill = normalizeBill({ ...fixture('Pending Browser Fixture'), payments: [], freight: [] })
    const pendingRequest = { id: newId(), billId: newId(), action: 'SAVE', expectedVersion: '', reason: '', bill: pendingBill }
    const restorePending = async req => {
      await page.evaluate(({ key, request }) => localStorage.setItem(key, JSON.stringify({ schema: 1, bill: request.bill, record: null, billId: request.billId, pending: request })), { key: storageKey, request: req })
      await page.reload()
      await page.getByRole('button', { name: 'Without GST Bill', exact: true }).click()
    }
    await restorePending(pendingRequest)
    await page.getByRole('button', { name: 'Check pending save', exact: true }).click()
    await page.getByRole('alert').filter({ hasText: 'worksheet is missing' }).waitFor()
    assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).pending.id, storageKey), pendingRequest.id)
    assert.equal(store.calls.length, writesBeforeFailure)
    storageAvailable = true
    await page.getByRole('button', { name: 'Check pending save', exact: true }).click()
    await page.getByRole('status').filter({ hasText: 'No committed event was found' }).waitFor()
    assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).pending.id, storageKey), pendingRequest.id)
    assert.equal(store.calls.length, writesBeforeFailure)
    await page.getByRole('button', { name: 'Retry pending save', exact: true }).click()
    await page.getByRole('status').filter({ hasText: 'draft saved' }).waitFor()
    assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).pending, storageKey), null)
    assert.equal(postedSaveIds.filter(id => id === pendingRequest.id).length, 1)
    assert.equal(store.calls.length, writesBeforeFailure + 1)
    // A committed request with a lost client response is resolved read-only.
    await restorePending(pendingRequest)
    await page.getByRole('button', { name: 'Check pending save', exact: true }).click()
    await page.getByRole('status').filter({ hasText: 'draft saved' }).waitFor()
    assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).pending, storageKey), null)
    assert.equal(store.calls.length, writesBeforeFailure + 1)
    // A generic 409/ID mismatch must NOT clear the original pending state.
    const mismatch = { ...pendingRequest, bill: { ...pendingBill, clientName: 'Mismatched request payload' } }
    await restorePending(mismatch)
    await page.getByRole('button', { name: 'Check pending save', exact: true }).click()
    await page.getByRole('alert').filter({ hasText: 'different data' }).waitFor()
    assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).pending.id, storageKey), pendingRequest.id)
    assert.equal(store.calls.length, writesBeforeFailure + 1)
    t.diagnostic('Browser interaction checks passed; PDFs and mobile/desktop screenshots are in tmp/ngst-qa/. No live services were accessed.')
  } finally {
    await browser?.close()
  }
})
