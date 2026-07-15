import React, { useState, useEffect, useRef } from 'react'
import { useApp } from '../App.jsx'
import { loadCRM } from '../lib/sheets.js'
import { today } from '../lib/formulas.js'
import { DEFAULT_CONFIG } from '../lib/config.js'

// ── Company Details (fixed) ───────────────────
const COMPANY = {
  name:    'RAJ RATAN ENTERPRISE',
  address: 'H.NO.628, CHUNKHADA FALIYU HANUMANBARI\nHANUMANBARI 396580\nGujarat, India',
  gstin:   '24AOUPM1117L1ZP',
  pan:     'AOUPM1117L',
  phone:   '8141680323',
  bank:    'BARODA GUJARAT GRAMIN BANK',
  account: '30670200000471',
  ifsc:    'BARB0BGGBXX',
  accName: 'RAJ RATAN ENTERPRISE',
}

const HSN_PAVING = '7016'
const ITEM_DESC  = 'paving block'

// ── State Code / Place of Supply ──────────────
const STATE_CODE_MAP = {
  'Andhra Pradesh': 'AP',
  'Arunachal Pradesh': 'AR',
  Assam: 'AS',
  Bihar: 'BR',
  Chhattisgarh: 'CG',
  Goa: 'GA',
  Gujarat: 'GJ',
  Haryana: 'HR',
  'Himachal Pradesh': 'HP',
  Jharkhand: 'JH',
  Karnataka: 'KA',
  Kerala: 'KL',
  'Madhya Pradesh': 'MP',
  Maharashtra: 'MH',
  Manipur: 'MN',
  Meghalaya: 'ML',
  Mizoram: 'MZ',
  Nagaland: 'NL',
  Odisha: 'OD',
  Punjab: 'PB',
  Rajasthan: 'RJ',
  Sikkim: 'SK',
  'Tamil Nadu': 'TN',
  Telangana: 'TS',
  Tripura: 'TR',
  'Uttar Pradesh': 'UP',
  Uttarakhand: 'UK',
  'West Bengal': 'WB',
  Delhi: 'DL',
}

const INDIAN_STATES = Object.keys(STATE_CODE_MAP)

const getSupplyState = place => place || 'Gujarat'
const getStateCode = place => STATE_CODE_MAP[getSupplyState(place)] || ''
const isInterStateSupply = place => getSupplyState(place) !== 'Gujarat'

const formatPlaceOfSupply = place => {
  const state = getSupplyState(place)
  const code = getStateCode(state)
  return code ? `[${code}] - ${state}` : state
}

// ── Number to words ───────────────────────────
function numToWords(n) {
  const ones = [
    '',
    'One',
    'Two',
    'Three',
    'Four',
    'Five',
    'Six',
    'Seven',
    'Eight',
    'Nine',
    'Ten',
    'Eleven',
    'Twelve',
    'Thirteen',
    'Fourteen',
    'Fifteen',
    'Sixteen',
    'Seventeen',
    'Eighteen',
    'Nineteen'
  ]

  const tens = [
    '',
    '',
    'Twenty',
    'Thirty',
    'Forty',
    'Fifty',
    'Sixty',
    'Seventy',
    'Eighty',
    'Ninety'
  ]

  if (n === 0) return 'Zero'

  const convert = x => {
    if (x < 20) return ones[x]
    if (x < 100) return tens[Math.floor(x / 10)] + (x % 10 ? ' ' + ones[x % 10] : '')
    if (x < 1000) return ones[Math.floor(x / 100)] + ' Hundred' + (x % 100 ? ' ' + convert(x % 100) : '')
    if (x < 100000) return convert(Math.floor(x / 1000)) + ' Thousand' + (x % 1000 ? ' ' + convert(x % 1000) : '')
    if (x < 10000000) return convert(Math.floor(x / 100000)) + ' Lakh' + (x % 100000 ? ' ' + convert(x % 100000) : '')
    return convert(Math.floor(x / 10000000)) + ' Crore' + (x % 10000000 ? ' ' + convert(x % 10000000) : '')
  }

  const rupees = Math.floor(n)
  const paise = Math.round((n - rupees) * 100)

  let words = 'Rupees ' + convert(rupees)
  if (paise) words += ' and ' + convert(paise) + ' Paise'

  return words + ' Only'
}

const fmt2 = n => parseFloat(n || 0).toFixed(2)
const fmt  = n => parseFloat(n || 0).toLocaleString('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const cfg = (config, key) => config?.[key] ?? DEFAULT_CONFIG[key] ?? ''
const getGstRate = config => {
  const rate = parseFloat(cfg(config, 'DEFAULT_GST_RATE'))
  return rate > 0 ? rate : 18
}
const getCompany = config => ({
  name: cfg(config, 'COMPANY_NAME') || COMPANY.name,
  address: cfg(config, 'BUSINESS_ADDRESS') || COMPANY.address,
  gstin: cfg(config, 'GST_NUMBER') || COMPANY.gstin,
  pan: COMPANY.pan,
  phone: cfg(config, 'BUSINESS_PHONE') || COMPANY.phone,
  email: cfg(config, 'BUSINESS_EMAIL'),
  bank: cfg(config, 'BANK_NAME') || COMPANY.bank,
  account: cfg(config, 'BANK_ACCOUNT_NUMBER') || COMPANY.account,
  ifsc: cfg(config, 'IFSC_CODE') || COMPANY.ifsc,
  accName: cfg(config, 'BANK_ACCOUNT_NAME') || COMPANY.accName,
  paymentTerms: cfg(config, 'PAYMENT_TERMS'),
  footerNote: cfg(config, 'INVOICE_FOOTER_NOTE'),
})

// ── Tax Invoice Template ──────────────────────
function TaxInvoicePreview({ data, config }) {
  const company = getCompany(config)
  const gstRate = getGstRate(config)
  const halfGstRate = gstRate / 2
  const qty      = parseFloat(data.qty)  || 0
  const rate     = parseFloat(data.rate) || 0
  const taxable  = parseFloat(fmt2(qty * rate))

  const isInterState = isInterStateSupply(data.placeOfSupply)

  const cgst = isInterState ? 0 : parseFloat(fmt2(taxable * (halfGstRate / 100)))
  const sgst = isInterState ? 0 : parseFloat(fmt2(taxable * (halfGstRate / 100)))
  const igst = isInterState ? parseFloat(fmt2(taxable * (gstRate / 100))) : 0

  const taxTotal = parseFloat(fmt2(cgst + sgst + igst))
  const rawTotal = taxable + taxTotal
  const rounded  = Math.round(rawTotal)
  const roundOff = parseFloat(fmt2(rounded - rawTotal))
  const total    = rounded

  return (
    <div
      className="bill-sheet"
      style={{
        fontFamily: 'Arial, sans-serif',
        fontSize: '11px',
        color: '#000',
        background: '#fff',
        width: '210mm',
        minHeight: '297mm',
        margin: '0 auto',
        padding: '12mm',
        boxSizing: 'border-box'
      }}
    >
      {/* Header */}
      <div
        style={{
          textAlign: 'center',
          fontWeight: 'bold',
          fontSize: '15px',
          borderBottom: '2px solid #000',
          paddingBottom: '4px',
          marginBottom: '6px'
        }}
      >
        TAX INVOICE
      </div>

      <div style={{ textAlign: 'right', fontSize: '10px', marginBottom: '6px' }}>
        Original for Customer
      </div>

      {/* Company + Invoice Info */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '0' }}>
        <tbody>
          <tr>
            <td style={{ border: '1px solid #000', padding: '6px', verticalAlign: 'top', width: '55%' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                <img
                  src="/assets/rajratan-erp-icon-light.png"
                  alt="Rajratan ERP"
                  style={{ width: '85px', height: '85px', objectFit: 'contain', flexShrink: 0 }}
                />

                <div>
                  <div style={{ fontWeight: 'bold', fontSize: '13px' }}>{company.name}</div>
                  <div style={{ whiteSpace: 'pre-line', fontSize: '10px', lineHeight: '1.4' }}>{company.address}</div>
                  <div style={{ fontSize: '10px', marginTop: '3px' }}>GSTIN: {company.gstin || '______________________'}</div>
                  <div style={{ fontSize: '10px' }}>PAN: {company.pan || '______________________'}</div>
                  <div style={{ fontSize: '10px' }}>Phone: {company.phone}</div>
                  {company.email && <div style={{ fontSize: '10px' }}>Email: {company.email}</div>}
                </div>
              </div>
            </td>

            <td style={{ border: '1px solid #000', padding: '6px', verticalAlign: 'top' }}>
              <table style={{ width: '100%' }}>
                <tbody>
                  <tr>
                    <td style={{ fontSize: '10px', color: '#555' }}>Invoice No.:</td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 'bold', fontSize: '13px', paddingBottom: '4px' }}>
                      {data.invoiceNo || `${cfg(config, 'INVOICE_PREFIX') || 'INV'}1`}
                    </td>
                  </tr>

                  <tr>
                    <td style={{ fontSize: '10px', color: '#555' }}>Date:</td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 'bold', fontSize: '12px', paddingBottom: '8px' }}>
                      {data.date ? new Date(data.date).toLocaleDateString('en-GB').replace(/\//g, '/') : ''}
                    </td>
                  </tr>

                  <tr>
                    <td style={{ fontSize: '10px', color: '#555' }}>Place of Supply:</td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 'bold', fontSize: '11px' }}>
                      {formatPlaceOfSupply(data.placeOfSupply)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>
        </tbody>
      </table>

      {/* Bill To / Ship To */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '0' }}>
        <tbody>
          <tr>
            {['Bill To', 'Ship To'].map(label => (
              <td
                key={label}
                style={{
                  border: '1px solid #000',
                  padding: '6px',
                  verticalAlign: 'top',
                  width: '50%'
                }}
              >
                <div style={{ fontWeight: 'bold', fontSize: '10px', marginBottom: '3px' }}>{label}</div>
                <div style={{ fontWeight: 'bold', fontSize: '12px' }}>{data.clientName || '—'}</div>
                <div style={{ fontSize: '10px', lineHeight: '1.5', whiteSpace: 'pre-line' }}>{data.clientAddress || ''}</div>
                <div style={{ fontSize: '10px', marginTop: '3px' }}>GSTIN: {data.clientGSTIN || ''}</div>
                <div style={{ fontSize: '10px' }}>PAN: {data.clientPAN || ''}</div>
              </td>
            ))}
          </tr>
        </tbody>
      </table>

      {/* Items Table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '0' }}>
        <thead>
          <tr style={{ background: '#e8e8e8' }}>
            {['#', 'Item & Description', 'HSN/SAC', 'Tax%', 'Qty.', 'Rate/Item', 'Per', 'Amount'].map(h => (
              <th
                key={h}
                style={{
                  border: '1px solid #000',
                  padding: '4px 6px',
                  textAlign: h === '#' || h === 'Tax%' || h === 'Qty.' || h === 'Rate/Item' || h === 'Per' || h === 'Amount' ? 'right' : 'left',
                  fontSize: '10px',
                  fontWeight: 'bold'
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          <tr>
            <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'right' }}>1</td>
            <td style={{ border: '1px solid #000', padding: '6px' }}>{data.itemDesc || ITEM_DESC}</td>
            <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'right' }}>{data.hsn || HSN_PAVING}</td>
            <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'right' }}>{fmt2(gstRate)}%</td>
            <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'right' }}>{qty || ''}</td>
            <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'right' }}>{fmt2(rate)}</td>
            <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'center' }}>{data.per || '-'}</td>
            <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'right' }}>{fmt2(taxable)}</td>
          </tr>

          {[1, 2].map(i => (
            <tr key={i}>
              <td colSpan={8} style={{ border: '1px solid #000', padding: '6px', height: '18px' }}></td>
            </tr>
          ))}

          {[
            { label: 'Taxable Amount', value: fmt2(taxable) },
            ...(isInterState
              ? [{ label: `IGST ${fmt2(gstRate)}%`, value: fmt2(igst) }]
              : [
                  { label: `CGST ${fmt2(halfGstRate)}%`, value: fmt2(cgst) },
                  { label: `SGST ${fmt2(halfGstRate)}%`, value: fmt2(sgst) },
                ]
            ),
            { label: 'Round off', value: roundOff !== 0 ? fmt2(roundOff) : '' },
          ].map(row => (
            <tr key={row.label}>
              <td
                colSpan={7}
                style={{
                  border: '1px solid #000',
                  padding: '4px 6px',
                  textAlign: 'right',
                  fontStyle: 'italic',
                  fontSize: '10px'
                }}
              >
                {row.label}
              </td>
              <td style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'right', fontSize: '10px' }}>
                {row.value}
              </td>
            </tr>
          ))}

          <tr style={{ fontWeight: 'bold' }}>
            <td colSpan={4} style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'right', fontStyle: 'italic' }}>
              Total
            </td>
            <td style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'right' }}>{fmt2(qty)}</td>
            <td colSpan={2} style={{ border: '1px solid #000', padding: '4px 6px' }}></td>
            <td style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'right' }}>₹{fmt(total)}</td>
          </tr>
        </tbody>
      </table>

      {/* Amount in words */}
      <div style={{ border: '1px solid #000', borderTop: 'none', padding: '4px 6px', fontSize: '10px' }}>
        Amount Chargeable (in Words): <strong>{numToWords(total)}</strong> &nbsp;<em>E &amp; O.E</em>
      </div>

      {/* HSN Summary */}
      {!isInterState ? (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '0' }}>
          <thead>
            <tr style={{ background: '#e8e8e8' }}>
              <th style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'left', fontSize: '10px' }}>HSN/SAC</th>
              <th style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'right', fontSize: '10px' }}>Taxable Value</th>
              <th colSpan={2} style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'center', fontSize: '10px' }}>CGST</th>
              <th colSpan={2} style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'center', fontSize: '10px' }}>SGST</th>
              <th style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'right', fontSize: '10px' }}>Total Tax Amount</th>
            </tr>

            <tr style={{ background: '#f5f5f5' }}>
              <th style={{ border: '1px solid #000', padding: '3px 6px' }}></th>
              <th style={{ border: '1px solid #000', padding: '3px 6px' }}></th>
              <th style={{ border: '1px solid #000', padding: '3px 6px', textAlign: 'center', fontSize: '10px' }}>Rate</th>
              <th style={{ border: '1px solid #000', padding: '3px 6px', textAlign: 'right', fontSize: '10px' }}>Amount</th>
              <th style={{ border: '1px solid #000', padding: '3px 6px', textAlign: 'center', fontSize: '10px' }}>Rate</th>
              <th style={{ border: '1px solid #000', padding: '3px 6px', textAlign: 'right', fontSize: '10px' }}>Amount</th>
              <th style={{ border: '1px solid #000', padding: '3px 6px' }}></th>
            </tr>
          </thead>

          <tbody>
            <tr>
              <td style={{ border: '1px solid #000', padding: '4px 6px', fontSize: '10px' }}>{data.hsn || HSN_PAVING}</td>
              <td style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'right', fontSize: '10px' }}>{fmt2(taxable)}</td>
              <td style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'center', fontSize: '10px' }}>{fmt2(halfGstRate)}</td>
              <td style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'right', fontSize: '10px' }}>{fmt2(cgst)}</td>
              <td style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'center', fontSize: '10px' }}>{fmt2(halfGstRate)}</td>
              <td style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'right', fontSize: '10px' }}>{fmt2(sgst)}</td>
              <td style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'right', fontSize: '10px' }}>{fmt2(taxTotal)}</td>
            </tr>

            <tr style={{ fontWeight: 'bold', background: '#f5f5f5' }}>
              <td style={{ border: '1px solid #000', padding: '4px 6px', fontSize: '10px' }}>TOTAL</td>
              <td style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'right', fontSize: '10px' }}>{fmt2(taxable)}</td>
              <td style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'center', fontSize: '10px' }}>-</td>
              <td style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'right', fontSize: '10px' }}>{fmt2(cgst)}</td>
              <td style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'center', fontSize: '10px' }}>-</td>
              <td style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'right', fontSize: '10px' }}>{fmt2(sgst)}</td>
              <td style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'right', fontSize: '10px' }}>{fmt2(taxTotal)}</td>
            </tr>
          </tbody>
        </table>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '0' }}>
          <thead>
            <tr style={{ background: '#e8e8e8' }}>
              <th style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'left', fontSize: '10px' }}>HSN/SAC</th>
              <th style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'right', fontSize: '10px' }}>Taxable Value</th>
              <th colSpan={2} style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'center', fontSize: '10px' }}>IGST</th>
              <th style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'right', fontSize: '10px' }}>Total Tax Amount</th>
            </tr>

            <tr style={{ background: '#f5f5f5' }}>
              <th style={{ border: '1px solid #000', padding: '3px 6px' }}></th>
              <th style={{ border: '1px solid #000', padding: '3px 6px' }}></th>
              <th style={{ border: '1px solid #000', padding: '3px 6px', textAlign: 'center', fontSize: '10px' }}>Rate</th>
              <th style={{ border: '1px solid #000', padding: '3px 6px', textAlign: 'right', fontSize: '10px' }}>Amount</th>
              <th style={{ border: '1px solid #000', padding: '3px 6px' }}></th>
            </tr>
          </thead>

          <tbody>
            <tr>
              <td style={{ border: '1px solid #000', padding: '4px 6px', fontSize: '10px' }}>{data.hsn || HSN_PAVING}</td>
              <td style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'right', fontSize: '10px' }}>{fmt2(taxable)}</td>
              <td style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'center', fontSize: '10px' }}>{fmt2(gstRate)}</td>
              <td style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'right', fontSize: '10px' }}>{fmt2(igst)}</td>
              <td style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'right', fontSize: '10px' }}>{fmt2(taxTotal)}</td>
            </tr>

            <tr style={{ fontWeight: 'bold', background: '#f5f5f5' }}>
              <td style={{ border: '1px solid #000', padding: '4px 6px', fontSize: '10px' }}>TOTAL</td>
              <td style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'right', fontSize: '10px' }}>{fmt2(taxable)}</td>
              <td style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'center', fontSize: '10px' }}>-</td>
              <td style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'right', fontSize: '10px' }}>{fmt2(igst)}</td>
              <td style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'right', fontSize: '10px' }}>{fmt2(taxTotal)}</td>
            </tr>
          </tbody>
        </table>
      )}

      {/* Footer */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '0' }}>
        <tbody>
          <tr>
            <td style={{ border: '1px solid #000', padding: '6px', verticalAlign: 'top', width: '60%' }}>
              <div style={{ fontWeight: 'bold', fontSize: '10px', textDecoration: 'underline', marginBottom: '2px' }}>
                Bank Details:
              </div>
              <div style={{ fontSize: '10px' }}>Bank Name: {company.bank}</div>
              <div style={{ fontSize: '10px' }}>Account Number: {company.account}</div>
              <div style={{ fontSize: '10px' }}>IFSC Code: {company.ifsc}</div>
              <div style={{ fontSize: '10px' }}>Account Name: {company.accName}</div>
              {company.paymentTerms && <div style={{ fontSize: '10px', marginTop: '3px' }}>Terms: {company.paymentTerms}</div>}
              {company.footerNote && <div style={{ fontSize: '10px', marginTop: '3px' }}>{company.footerNote}</div>}
            </td>

            <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'right', verticalAlign: 'top' }}>
              <div style={{ fontSize: '10px', marginBottom: '30px' }}>Authorised Signatory</div>
              <div style={{ fontWeight: 'bold', fontSize: '10px', marginTop: '24px' }}>{company.name}</div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

// ── Delivery Challan Template ─────────────────
function ChallanPreview({ data, config }) {
  const company = getCompany(config)
  const gstRate = getGstRate(config)
  const halfGstRate = gstRate / 2
  const qty     = parseFloat(data.qty)  || 0
  const rate    = parseFloat(data.rate) || 0
  const taxable = parseFloat(fmt2(qty * rate))

  const isInterState = isInterStateSupply(data.placeOfSupply)

  const cgst = isInterState ? 0 : parseFloat(fmt2(taxable * (halfGstRate / 100)))
  const sgst = isInterState ? 0 : parseFloat(fmt2(taxable * (halfGstRate / 100)))
  const igst = isInterState ? parseFloat(fmt2(taxable * (gstRate / 100))) : 0

  const taxTotal = parseFloat(fmt2(cgst + sgst + igst))
  const total = taxable + taxTotal

  return (
    <div
      className="bill-sheet"
      style={{
        fontFamily: 'Arial, sans-serif',
        fontSize: '11px',
        color: '#000',
        background: '#fff',
        width: '210mm',
        minHeight: '297mm',
        margin: '0 auto',
        padding: '12mm',
        boxSizing: 'border-box'
      }}
    >
      {/* Header */}
      <div
        style={{
          textAlign: 'center',
          fontWeight: 'bold',
          fontSize: '15px',
          borderBottom: '2px solid #000',
          paddingBottom: '4px',
          marginBottom: '6px'
        }}
      >
        DELIVERY CHALLAN
      </div>

      {/* Company + Challan Info */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '0' }}>
        <tbody>
          <tr>
            <td style={{ border: '1px solid #000', padding: '6px', verticalAlign: 'top', width: '55%' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                <img
                  src="/assets/rajratan-erp-icon-light.png"
                  alt="Rajratan ERP"
                  style={{ width: '85px', height: '85px', objectFit: 'contain', flexShrink: 0 }}
                />

                <div>
                  <div style={{ fontWeight: 'bold', fontSize: '13px' }}>{company.name}</div>
                  <div style={{ whiteSpace: 'pre-line', fontSize: '10px', lineHeight: '1.4' }}>{company.address}</div>
                  <div style={{ fontSize: '10px', marginTop: '3px' }}>GSTIN: {company.gstin || '______________________'}</div>
                  <div style={{ fontSize: '10px' }}>PAN: {company.pan || '______________________'}</div>
                  <div style={{ fontSize: '10px' }}>Phone: {company.phone}</div>
                  {company.email && <div style={{ fontSize: '10px' }}>Email: {company.email}</div>}
                </div>
              </div>
            </td>

            <td style={{ border: '1px solid #000', padding: '6px', verticalAlign: 'top' }}>
              <table style={{ width: '100%' }}>
                <tbody>
                  <tr>
                    <td style={{ fontSize: '10px', color: '#555' }}>Challan No.:</td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 'bold', fontSize: '13px', paddingBottom: '4px' }}>
                      {data.challanNo || `${cfg(config, 'CHALLAN_PREFIX') || 'CHN'}1`}
                    </td>
                  </tr>

                  <tr>
                    <td style={{ fontSize: '10px', color: '#555' }}>Date:</td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 'bold', fontSize: '12px', paddingBottom: '8px' }}>
                      {data.date ? new Date(data.date).toLocaleDateString('en-GB') : ''}
                    </td>
                  </tr>

                  <tr>
                    <td style={{ fontSize: '10px', color: '#555' }}>Place of Supply:</td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 'bold', fontSize: '11px' }}>
                      {formatPlaceOfSupply(data.placeOfSupply)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>
        </tbody>
      </table>

      {/* Bill To / Ship To */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '0' }}>
        <tbody>
          <tr>
            {['Bill To', 'Ship To'].map(label => (
              <td
                key={label}
                style={{
                  border: '1px solid #000',
                  padding: '6px',
                  verticalAlign: 'top',
                  width: '50%'
                }}
              >
                <div style={{ fontWeight: 'bold', fontSize: '10px', marginBottom: '3px' }}>{label}</div>
                <div style={{ fontWeight: 'bold', fontSize: '12px' }}>{data.clientName || '—'}</div>
                <div style={{ fontSize: '10px', lineHeight: '1.5', whiteSpace: 'pre-line' }}>{data.clientAddress || ''}</div>
                {data.clientPhone && <div style={{ fontSize: '10px', marginTop: '3px' }}>Phone: {data.clientPhone}</div>}
              </td>
            ))}
          </tr>
        </tbody>
      </table>

      {/* Items Table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '0' }}>
        <thead>
          <tr style={{ background: '#e8e8e8' }}>
            {['#', 'Item & Description', 'HSN/SAC', 'VEHICLE NO', 'Tax%', 'Qty.', 'Per', 'Rate/Item', 'Amount'].map(h => (
              <th
                key={h}
                style={{
                  border: '1px solid #000',
                  padding: '4px 5px',
                  textAlign: h === '#' || h === 'Tax%' || h === 'Qty.' || h === 'Rate/Item' || h === 'Per' || h === 'Amount' ? 'right' : 'left',
                  fontSize: '10px',
                  fontWeight: 'bold',
                  whiteSpace: 'nowrap'
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          <tr>
            <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'right' }}>1</td>
            <td style={{ border: '1px solid #000', padding: '6px' }}>{data.itemDesc || ITEM_DESC}</td>
            <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'right' }}>{data.hsn || HSN_PAVING}</td>
            <td style={{ border: '1px solid #000', padding: '6px', fontSize: '9px' }}>{data.vehicleNo || ''}</td>
            <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'right' }}>{fmt2(gstRate)}%</td>
            <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'right' }}>{fmt2(qty)}</td>
            <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'right' }}>{data.per || ''}</td>
            <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'right' }}>{fmt2(rate)}</td>
            <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'right' }}>{rate > 0 ? fmt2(taxable) : '0.00'}</td>
          </tr>

          {[1, 2].map(i => (
            <tr key={i}>
              <td colSpan={9} style={{ border: '1px solid #000', padding: '6px', height: '18px' }}></td>
            </tr>
          ))}

          {[
            { label: 'Taxable Amount', value: rate > 0 ? fmt2(taxable) : '0.00' },
            ...(isInterState
              ? [{ label: `IGST ${fmt2(gstRate)}%`, value: rate > 0 ? fmt2(igst) : '0.00' }]
              : [
                  { label: `CGST ${fmt2(halfGstRate)}%`, value: rate > 0 ? fmt2(cgst) : '0.00' },
                  { label: `SGST ${fmt2(halfGstRate)}%`, value: rate > 0 ? fmt2(sgst) : '0.00' },
                ]
            ),
            { label: 'Round off', value: '0.00' },
          ].map(row => (
            <tr key={row.label}>
              <td
                colSpan={8}
                style={{
                  border: '1px solid #000',
                  padding: '4px 6px',
                  textAlign: 'right',
                  fontStyle: 'italic',
                  fontSize: '10px'
                }}
              >
                {row.label}
              </td>

              <td style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'right', fontSize: '10px' }}>
                {row.value}
              </td>
            </tr>
          ))}

          <tr style={{ fontWeight: 'bold' }}>
            <td colSpan={5} style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'right', fontStyle: 'italic' }}>
              Total
            </td>
            <td style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'right' }}>{fmt2(qty)}</td>
            <td colSpan={2} style={{ border: '1px solid #000', padding: '4px 6px' }}></td>
            <td style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'right' }}>
              ₹{rate > 0 ? fmt(total) : '0.00'}
            </td>
          </tr>
        </tbody>
      </table>

      {/* Footer */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '0' }}>
        <tbody>
          <tr>
            <td style={{ border: '1px solid #000', padding: '40px 6px 6px', verticalAlign: 'bottom', width: '60%' }}>
              {company.footerNote && <div style={{ fontSize: '10px' }}>{company.footerNote}</div>}
            </td>

            <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'right', verticalAlign: 'top' }}>
              <div style={{ fontSize: '10px', marginBottom: '30px' }}>Authorised Signatory</div>
              <div style={{ fontWeight: 'bold', fontSize: '10px', marginTop: '24px' }}>{company.name}</div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

// ── Main Component ────────────────────────────
export default function BillGenerator() {
  const { accessToken, config } = useApp()
  const invoicePrefix = cfg(config, 'INVOICE_PREFIX') || 'INV'
  const challanPrefix = cfg(config, 'CHALLAN_PREFIX') || 'CHN'
  const defaultGstRate = getGstRate(config)
  const defaultHalfGstRate = defaultGstRate / 2
  const [billType, setBillType] = useState('invoice')
  const [preview, setPreview]   = useState(false)
  const printRef = useRef(null)

  // ── CRM sync ────────────────────────────────
  const [clients, setClients] = useState([])
  const [crmLoading, setCrmLoading] = useState(false)
  const [selectedClient, setSelectedClient] = useState('')

  const [form, setForm] = useState({
    date: today(),
    placeOfSupply: 'Gujarat',
    clientName: '',
    clientAddress: '',
    clientGSTIN: '',
    clientPAN: '',
    clientPhone: '',
    itemDesc: ITEM_DESC,
    qty: '',
    rate: '',
    per: 'Brass',
    hsn: HSN_PAVING,
    invoiceNo: `${invoicePrefix}1`,
    challanNo: `${challanPrefix}1`,
    vehicleNo: '',
  })

  useEffect(() => {
    setForm(p => ({
      ...p,
      invoiceNo: !p.invoiceNo || p.invoiceNo === 'INV1' ? `${invoicePrefix}1` : p.invoiceNo,
      challanNo: !p.challanNo || p.challanNo === 'CHN1' ? `${challanPrefix}1` : p.challanNo,
    }))
  }, [invoicePrefix, challanPrefix])

  useEffect(() => {
    if (!accessToken) return

    setCrmLoading(true)

    loadCRM(accessToken)
      .catch(() => [])
      .then(rows => {
        const map = {}

        rows.forEach(r => {
          if (!r.ClientName) return

          if (!map[r.ClientName]) {
            map[r.ClientName] = {
              name: r.ClientName,
              location: r.Location || '',
              rate: r.Rate || '',
            }
          }

          if (r.Rate) map[r.ClientName].rate = r.Rate
        })

        setClients(Object.values(map))
        setCrmLoading(false)
      })
  }, [accessToken])

  const detectStateFromLocation = location => {
    const text = String(location || '').toLowerCase()

    if (text.includes('maharashtra') || text.includes('mumbai') || text.includes('nashik') || text.includes('pune')) {
      return 'Maharashtra'
    }

    if (text.includes('gujarat') || text.includes('navsari') || text.includes('surat') || text.includes('vapi') || text.includes('valsad') || text.includes('chikhli') || text.includes('vansda')) {
      return 'Gujarat'
    }

    return 'Gujarat'
  }

  const handleClientSelect = clientName => {
    setSelectedClient(clientName)

    if (!clientName) return

    const c = clients.find(x => x.name === clientName)
    if (!c) return

    setForm(p => ({
      ...p,
      clientName: c.name,
      clientAddress: c.location || '',
      rate: c.rate || p.rate,
      placeOfSupply: c.location ? detectStateFromLocation(c.location) : p.placeOfSupply,
    }))
  }

  const handlePrint = () => {
    const el = printRef.current
    if (!el) return

    const logoUrl = `${window.location.origin}/assets/rajratan-erp-icon-light.png`

    const printHTML = el.innerHTML.replaceAll(
      '/assets/rajratan-erp-icon-light.png',
      logoUrl
    )

    const printWindow = window.open('', '_blank', 'width=900,height=700')

    printWindow.document.write(`
      <html>
        <head>
          <title>${billType === 'invoice' ? 'Tax Invoice' : 'Delivery Challan'} - ${billType === 'invoice' ? form.invoiceNo : form.challanNo}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { background: #fff; }
            img { display: block; }

            @media print {
              body { margin: 0; }
              @page { size: A4; margin: 0; }
            }
          </style>
        </head>

        <body>
          ${printHTML}

          <script>
            window.onload = function () {
              setTimeout(function () {
                window.print()
                window.close()
              }, 1500)
            }
          </script>
        </body>
      </html>
    `)

    printWindow.document.close()
  }

  return (
    <div className="max-w-lg mx-auto">
      {/* Print styles injected globally */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }

          .bill-sheet,
          .bill-sheet * {
            visibility: visible !important;
          }

          .bill-sheet {
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
          }
        }
      `}</style>

      {/* Header */}
      <div className="bg-white px-4 py-3 border-b border-gray-100 sticky top-12 z-10">
        <h1 className="text-lg font-bold text-gray-800"> Bill Generator</h1>
        <p className="text-xs text-gray-400">Tax Invoice · Delivery Challan · Print to PDF</p>
      </div>

      {/* Bill type toggle */}
      <div className="flex gap-2 p-4 pb-0">
        {[
          ['invoice', ' Tax Invoice'],
          ['challan', ' Delivery Challan']
        ].map(([k, l]) => (
          <button
            key={k}
            onClick={() => setBillType(k)}
            className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all ${
              billType === k
                ? 'bg-orange-500 text-white shadow-lg shadow-orange-200'
                : 'bg-white border border-gray-200 text-gray-500'
            }`}
          >
            {l}
          </button>
        ))}
      </div>

      {/* Preview toggle */}
      <div className="flex gap-2 px-4 pt-3">
        {[
          ['form', ' Fill Form'],
          ['preview', ' Preview']
        ].map(([k, l]) => (
          <button
            key={k}
            onClick={() => setPreview(k === 'preview')}
            className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
              (preview ? 'preview' : 'form') === k
                ? 'bg-gray-800 text-white'
                : 'bg-gray-100 text-gray-500'
            }`}
          >
            {l}
          </button>
        ))}
      </div>

      {/* FORM */}
      {!preview && (
        <div className="p-4 space-y-3">
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-3">
            <p className="text-xs font-bold text-orange-700 mb-1">
              {billType === 'invoice' ? ' Tax Invoice' : ' Delivery Challan'} — Fill the details below
            </p>
            <p className="text-xs text-orange-600">Switch to Preview tab to see the bill, then click Print PDF.</p>
          </div>

          {/* CRM Client Picker */}
          <div className="bg-white border border-gray-100 rounded-2xl p-4">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">
               Pick from CRM Clients {crmLoading && <span className="text-orange-400 font-normal">(loading...)</span>}
            </p>

            {clients.length > 0 ? (
              <>
                <select
                  value={selectedClient}
                  onChange={e => handleClientSelect(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-bold text-gray-800 outline-none bg-white mb-2"
                >
                  <option value="">— Select existing client —</option>

                  {clients.map(c => (
                    <option key={c.name} value={c.name}>
                      {c.name}{c.location ? ` · ${c.location}` : ''}
                    </option>
                  ))}
                </select>

                {selectedClient && (
                  <div className="bg-teal-50 border border-teal-200 rounded-xl px-3 py-2 text-xs text-teal-700 font-semibold">
                     Client auto-filled from CRM — edit below if needed
                  </div>
                )}
              </>
            ) : (
              <p className="text-xs text-gray-400">
                {crmLoading ? ' Loading CRM clients...' : 'No clients in CRM yet. Fill manually below.'}
              </p>
            )}
          </div>

          {/* Bill Info */}
          <div className="bg-white border border-gray-100 rounded-2xl p-4 space-y-3">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide"> Bill Info</p>

            <div>
              <label className="block text-xs text-gray-500 font-semibold mb-1">
                {billType === 'invoice' ? 'Invoice No.' : 'Challan No.'}
              </label>

              <input
                type="text"
                value={billType === 'invoice' ? form.invoiceNo : form.challanNo}
                placeholder={billType === 'invoice' ? `${invoicePrefix}1` : `${challanPrefix}1`}
                onChange={e =>
                  setForm(p => ({
                    ...p,
                    [billType === 'invoice' ? 'invoiceNo' : 'challanNo']: e.target.value
                  }))
                }
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 outline-none bg-white"
              />
            </div>

            <div>
              <label className="block text-xs text-gray-500 font-semibold mb-1">Date</label>

              <input
                type="date"
                value={form.date}
                onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 outline-none bg-white"
              />
            </div>

            <div>
              <label className="block text-xs text-gray-500 font-semibold mb-1">Place of Supply</label>

              <select
                value={form.placeOfSupply}
                onChange={e => setForm(p => ({ ...p, placeOfSupply: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 outline-none bg-white"
              >
                {INDIAN_STATES.map(state => (
                  <option key={state} value={state}>
                    [{STATE_CODE_MAP[state]}] - {state}
                  </option>
                ))}
              </select>

              <p className="text-[11px] text-gray-400 mt-1">
                Gujarat = CGST + SGST · Other states = IGST
              </p>
            </div>
          </div>

          {/* Client Info */}
          <div className="bg-white border border-gray-100 rounded-2xl p-4 space-y-3">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide"> Client / Bill To</p>

            <div>
              <label className="block text-xs text-gray-500 font-semibold mb-1">Client Name</label>

              <input
                type="text"
                value={form.clientName}
                placeholder="e.g. Samroli Vibhag Mandali"
                onChange={e => setForm(p => ({ ...p, clientName: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 outline-none bg-white"
              />
            </div>

            <div>
              <label className="block text-xs text-gray-500 font-semibold mb-1">Address</label>

              <textarea
                rows={3}
                value={form.clientAddress}
                placeholder="Full address..."
                onChange={e => setForm(p => ({ ...p, clientAddress: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 outline-none bg-white resize-none"
              />
            </div>

            {billType === 'invoice' && (
              <>
                <div>
                  <label className="block text-xs text-gray-500 font-semibold mb-1">Client GSTIN</label>

                  <input
                    type="text"
                    value={form.clientGSTIN}
                    placeholder="22XXXXX..."
                    onChange={e => setForm(p => ({ ...p, clientGSTIN: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 outline-none bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs text-gray-500 font-semibold mb-1">Client PAN</label>

                  <input
                    type="text"
                    value={form.clientPAN}
                    placeholder="XXXXX1234X"
                    onChange={e => setForm(p => ({ ...p, clientPAN: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 outline-none bg-white"
                  />
                </div>
              </>
            )}

            {billType === 'challan' && (
              <div>
                <label className="block text-xs text-gray-500 font-semibold mb-1">Phone</label>

                <input
                  type="text"
                  value={form.clientPhone}
                  placeholder="98XXXXXXXX"
                  onChange={e => setForm(p => ({ ...p, clientPhone: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 outline-none bg-white"
                />
              </div>
            )}
          </div>

          {/* Item Details */}
          <div className="bg-white border border-gray-100 rounded-2xl p-4 space-y-3">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide"> Item Details</p>

            <div>
              <label className="block text-xs text-gray-500 font-semibold mb-1">Item Description</label>

              <input
                type="text"
                value={form.itemDesc}
                placeholder="paving block"
                onChange={e => setForm(p => ({ ...p, itemDesc: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 outline-none bg-white"
              />
            </div>

            <div>
              <label className="block text-xs text-gray-500 font-semibold mb-1">HSN/SAC Code</label>

              <input
                type="text"
                value={form.hsn}
                placeholder="7016"
                onChange={e => setForm(p => ({ ...p, hsn: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 outline-none bg-white"
              />
            </div>

            {billType === 'challan' && (
              <>
                <div>
                  <label className="block text-xs text-gray-500 font-semibold mb-1">Vehicle No.</label>

                  <input
                    type="text"
                    value={form.vehicleNo}
                    placeholder="GJ05XX1234"
                    onChange={e => setForm(p => ({ ...p, vehicleNo: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 outline-none bg-white"
                  />
                </div>
              </>
            )}

            <div>
              <label className="block text-xs text-gray-500 font-semibold mb-1">Per / Unit</label>

              <input
                type="text"
                value={form.per}
                placeholder="Brass / Nos"
                onChange={e => setForm(p => ({ ...p, per: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 outline-none bg-white"
              />
            </div>

            <div>
              <label className="block text-xs text-gray-500 font-semibold mb-1">Quantity</label>

              <input
                type="number"
                inputMode="decimal"
                value={form.qty}
                placeholder="15"
                onChange={e => setForm(p => ({ ...p, qty: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 outline-none bg-white"
              />
            </div>

            <div>
              <label className="block text-xs text-gray-500 font-semibold mb-1">
                Rate per Item (₹){billType === 'challan' ? ' — leave 0 for delivery-only' : ''}
              </label>

              <input
                type="number"
                inputMode="decimal"
                value={form.rate}
                placeholder="0"
                onChange={e => setForm(p => ({ ...p, rate: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 outline-none bg-white"
              />
            </div>

            {/* Live calculation preview */}
            {parseFloat(form.qty) > 0 && parseFloat(form.rate) > 0 && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-xs">
                <div className="flex justify-between">
                  <span>Taxable:</span>
                  <span className="font-bold">₹{fmt2(parseFloat(form.qty) * parseFloat(form.rate))}</span>
                </div>

                {isInterStateSupply(form.placeOfSupply) ? (
                  <div className="flex justify-between">
                    <span>IGST {fmt2(defaultGstRate)}%:</span>
                    <span className="font-bold">₹{fmt2(parseFloat(form.qty) * parseFloat(form.rate) * (defaultGstRate / 100))}</span>
                  </div>
                ) : (
                  <>
                    <div className="flex justify-between">
                      <span>CGST {fmt2(defaultHalfGstRate)}%:</span>
                      <span className="font-bold">₹{fmt2(parseFloat(form.qty) * parseFloat(form.rate) * (defaultHalfGstRate / 100))}</span>
                    </div>

                    <div className="flex justify-between">
                      <span>SGST {fmt2(defaultHalfGstRate)}%:</span>
                      <span className="font-bold">₹{fmt2(parseFloat(form.qty) * parseFloat(form.rate) * (defaultHalfGstRate / 100))}</span>
                    </div>
                  </>
                )}

                <div className="flex justify-between border-t border-green-200 mt-1 pt-1 font-bold text-green-700">
                  <span>Total:</span>
                  <span>₹{fmt(Math.round(parseFloat(form.qty) * parseFloat(form.rate) * (1 + defaultGstRate / 100)))}</span>
                </div>
              </div>
            )}
          </div>

          <button
            onClick={() => setPreview(true)}
            className="w-full bg-orange-500 text-white font-bold py-4 rounded-2xl text-base shadow-lg shadow-orange-200"
          >
             Preview Bill
          </button>
        </div>
      )}

      {/* PREVIEW */}
      {preview && (
        <div className="p-4">
          <button
            onClick={handlePrint}
            className="w-full bg-green-500 text-white font-bold py-4 rounded-2xl text-base shadow-lg shadow-green-200 mb-4"
          >
             Print / Save as PDF
          </button>

          <p className="text-xs text-center text-gray-400 mb-4">
            A print dialog will open → select "Save as PDF" as destination
          </p>

          <div ref={printRef} className="bill-preview-frame">
            {billType === 'invoice'
              ? <TaxInvoicePreview data={form} config={config} />
              : <ChallanPreview data={form} config={config} />
            }
          </div>

          <button
            onClick={() => setPreview(false)}
            className="w-full mt-4 border border-gray-200 text-gray-500 font-bold py-3 rounded-2xl text-sm"
          >
            ← Back to Edit
          </button>
        </div>
      )}
    </div>
  )
}
