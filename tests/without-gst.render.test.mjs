import fs from 'node:fs'
import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { buildSync, transformSync } from 'esbuild'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { DEFAULT_CONFIG } from '../src/lib/config.js'
import { fixture, line } from './fixtures/without-gst.mjs'

const require = createRequire(import.meta.url)
function evaluate(code, config = DEFAULT_CONFIG) {
  const module = { exports: {} }
  new Function('require', 'module', 'exports', 'DEFAULT_CONFIG', code)(require, module, module.exports, config)
  return module.exports
}
const page = fs.readFileSync('src/pages/Billgenerator.jsx', 'utf8').replace(/^import .* from '(?!react')[^']+'\r?\n/gm, '')
const legacy = evaluate(transformSync(`${page}\nexport { TaxInvoicePreview, ChallanPreview }`, { loader: 'jsx', format: 'cjs' }).code)
const print = evaluate(buildSync({ entryPoints: ['src/components/WithoutGstPrint.jsx'], bundle: true, write: false, format: 'cjs', external: ['react'] }).outputFiles[0].text).default

test('GST regression: local/interstate tax, prefix, totals and existing challan layout', () => {
  for (const placeOfSupply of ['Gujarat', 'Maharashtra']) {
    const data = { qty: '2.5', rate: '100.25', invoiceNo: 'INV42', challanNo: 'CHN42', date: '2026-10-31', clientName: 'GST Fixture', placeOfSupply }
    const html = renderToStaticMarkup(React.createElement(legacy.TaxInvoicePreview, { data, config: DEFAULT_CONFIG }))
    assert.ok(html.includes('TAX INVOICE')); assert.ok(html.includes('INV42')); assert.ok(html.includes('₹296.00'))
    assert.ok(html.includes(placeOfSupply === 'Gujarat' ? 'CGST' : 'IGST'))
    const challan = renderToStaticMarkup(React.createElement(legacy.ChallanPreview, { data, config: DEFAULT_CONFIG }))
    assert.ok(challan.includes('DELIVERY CHALLAN')); assert.ok(challan.includes('CHN42'))
  }
})
test('professional Without GST print: both modes, settings, correct summary and no tax fields', () => {
  for (const mode of ['standard', 'consolidated']) {
    const bill = { ...fixture(), mode }
    const html = renderToStaticMarkup(React.createElement(print, { bill, config: { ...DEFAULT_CONFIG, COMPANY_NAME: 'Custom Company' }, number: 'NGST42', status: 'finalized', revision: 1 }))
    assert.ok(html.includes(mode === 'standard' ? 'WITHOUT GST BILL' : 'CONSOLIDATED SUPPLY BILL'))
    for (const content of ['NGST42', 'Custom Company', '250 brass', '₹10,45,200.00', '₹4,79,300.00', 'Ten Lakh Forty Five Thousand Two Hundred', 'Issued · Revision 1', '05/02/2026']) assert.ok(html.includes(content), content)
    assert.doesNotMatch(html, /GSTIN|CGST|SGST|IGST|Taxable Value|TAX INVOICE/)
    assert.ok(html.includes('/assets/rajratan-erp-icon-light.png'))
  }
})
test('100-delivery print has every row, repeated headers and pagination guards', () => {
  const bill = fixture(); bill.deliveries = Array.from({ length: 100 }, (_, i) => ({ ...line(), product: `Unique Product ${i + 1}` }))
  const html = renderToStaticMarkup(React.createElement(print, { bill, config: DEFAULT_CONFIG, status: 'draft' }))
  for (let i = 1; i <= 100; i++) assert.equal(html.split(`Unique Product ${i}<`).length - 1, 1)
  assert.ok(html.includes('table-header-group')); assert.ok(html.includes('break-inside: avoid'))
  assert.ok(html.includes('DRAFT — Not issued'))
})
