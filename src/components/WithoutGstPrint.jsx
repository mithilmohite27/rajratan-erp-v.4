import React from 'react'
import { decimal, money, totals } from '../lib/withoutGst.js'
import { DEFAULT_CONFIG } from '../lib/config.js'

function inWords(paise) {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']
  const words = n => n < 20 ? ones[n] : n < 100 ? `${tens[Math.floor(n / 10)]} ${ones[n % 10]}`.trim() : n < 1000 ? `${ones[Math.floor(n / 100)]} Hundred ${words(n % 100)}`.trim() : n < 100000 ? `${words(Math.floor(n / 1000))} Thousand ${words(n % 1000)}`.trim() : n < 10000000 ? `${words(Math.floor(n / 100000))} Lakh ${words(n % 100000)}`.trim() : `${words(Math.floor(n / 10000000))} Crore ${words(n % 10000000)}`.trim()
  return `Rupees ${words(Math.floor(paise / 100)) || 'Zero'}${paise % 100 ? ` and ${words(paise % 100)} Paise` : ''} Only`
}
export const quantitySummary = quantities => Object.entries(quantities).map(([unit, qty]) => `${(qty / 10000).toLocaleString('en-IN', { maximumFractionDigits: 4 })} ${unit}`).join(' · ') || '—'

// Included in both the in-app preview and the isolated print window.
export const WITHOUT_GST_PRINT_CSS = `
  .ngst-document { width: 100%; color: #17232e; font: 11px/1.5 Arial, sans-serif; background: white; padding: 12mm; box-sizing: border-box; }
  .ngst-document * { box-sizing: border-box; }
  .ngst-document h1, .ngst-document h2, .ngst-document p { margin: 0; }
  .ngst-header { display: flex; justify-content: space-between; gap: 20px; border-bottom: 3px solid #dd7123; padding-bottom: 16px; overflow-wrap: anywhere; }
  .ngst-header > div { min-width: 0; }
  .ngst-header > div:first-child { flex: 1; }
  .ngst-header > div:last-child { max-width: 45%; }
  .ngst-brand { display: flex; gap: 12px; align-items: center; }
  .ngst-brand img { width: 65px; height: 65px; object-fit: contain; flex-shrink: 0; }
  .ngst-document h1 { font-size: 16px; letter-spacing: .5px; }
  .ngst-title { font-size: 14px; font-weight: bold; text-align: right; }
  .ngst-customer { background: #f4f6f8; padding: 12px; margin: 16px 0; border-left: 3px solid #dd7123; }
  .ngst-lines { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .ngst-lines th { background: #edf0f3; font-size: 9px; text-transform: uppercase; }
  .ngst-lines th, .ngst-lines td { border-bottom: 1px solid #d6dce1; padding: 7px 5px; text-align: left; vertical-align: top; overflow-wrap: anywhere; }
  .ngst-lines .numeric { text-align: right; font-variant-numeric: tabular-nums; }
  .ngst-muted { color: #546373; font-size: 10px; }
  .ngst-summary { margin: 18px 0; padding: 12px; border: 1px solid #d6dce1; }
  .ngst-summary-line { display: flex; justify-content: space-between; gap: 20px; padding: 3px 0; }
  .ngst-balance { border-top: 2px solid #dd7123; margin-top: 6px; padding-top: 8px; font-size: 14px; font-weight: bold; }
  .ngst-footer { display: flex; justify-content: space-between; gap: 30px; border-top: 1px solid #d6dce1; padding-top: 14px; }
  .ngst-signature { min-width: 170px; text-align: right; }
  .ngst-entry { border-bottom: 1px solid #e3e6e9; padding: 5px 0; overflow-wrap: anywhere; }
  .ngst-wrap { white-space: pre-wrap; overflow-wrap: anywhere; }
  @page { size: A4; margin: 12mm; @bottom-right { content: 'Page ' counter(page) ' of ' counter(pages); font: 8px Arial, sans-serif; color: #546373; } }
  @media print {
    body { margin: 0; background: white; }
    .ngst-document { padding: 0; width: 100%; }
    .ngst-lines thead { display: table-header-group; }
    .ngst-lines tr, .ngst-summary, .ngst-footer, .ngst-entry, .ngst-header, .ngst-customer { break-inside: avoid; page-break-inside: avoid; }
    .ngst-document { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
  }
`

export default function WithoutGstPrint({ bill, config, number, status, revision }) {
  const company = { ...DEFAULT_CONFIG, ...config }
  const t = totals(bill)
  return <article className="ngst-document">
    <style>{WITHOUT_GST_PRINT_CSS}</style>
    <header className="ngst-header">
      <div>
        <div className="ngst-brand"><img src="/assets/rajratan-erp-icon-light.png" alt="Rajratan Enterprise" /><h1>{company.COMPANY_NAME}</h1></div>
        <div className="ngst-wrap">{company.BUSINESS_ADDRESS}</div>
        <div>{company.BUSINESS_PHONE}{company.BUSINESS_EMAIL && ` · ${company.BUSINESS_EMAIL}`}</div>
      </div>
      <div style={{ textAlign: 'right' }}><h2 className="ngst-title">{bill.mode === 'consolidated' ? 'CONSOLIDATED SUPPLY BILL' : 'WITHOUT GST BILL'}</h2><p>Bill No. <strong>{number || 'Unnumbered draft'}</strong></p><p>Date: {displayDate(bill.date)}</p><p className="ngst-muted">{status === 'finalized' ? `Issued · Revision ${revision}` : 'DRAFT — Not issued'}</p><p className="ngst-muted">GST not charged</p></div>
    </header>
    <section className="ngst-customer"><div className="ngst-muted">BILL TO</div><strong>{bill.clientName || 'Customer name'}</strong><div className="ngst-wrap">{bill.clientAddress}</div><div>State: {bill.state}</div>{bill.clientPhone && <div>Phone: {bill.clientPhone}</div>}</section>
    <table className="ngst-lines">
      <colgroup>{['5%', '12%', '23%', '19%', '13%', '13%', '15%'].map((width, i) => <col key={i} style={{ width }} />)}</colgroup>
      <thead><tr>{['#', 'Delivery Date', 'Product / Description', 'Delivery Location', 'Quantity', 'Rate', 'Amount'].map((h, i) => <th key={h} className={i > 3 ? 'numeric' : ''}>{h}</th>)}</tr></thead>
      <tbody>{bill.deliveries.map((row, i) => <tr key={row.id}><td>{i + 1}</td><td>{displayDate(row.date)}</td><td><strong>{row.product}</strong><div className="ngst-muted">{row.specification}</div></td><td>{row.location}</td><td className="numeric">{row.qty} {row.unit}</td><td className="numeric">{moneySafe(row.rate)}</td><td className="numeric">{money(totals({ deliveries: [row] }).total)}</td></tr>)}</tbody>
    </table>
    <section className="ngst-summary">
      <div className="ngst-summary-line"><span>Total deliveries</span><strong>{t.count}</strong></div>
      <div className="ngst-summary-line"><span>Total quantity</span><strong>{quantitySummary(t.quantities)}</strong></div>
      <div className="ngst-summary-line"><span>Grand total</span><strong>{money(t.total)}</strong></div>
      <div className="ngst-summary-line"><span>Payments allocated</span><strong>{money(t.payments)}</strong></div>
      <div className="ngst-summary-line"><span>Deductible freight</span><strong>{money(t.freight)}</strong></div>
      <div className="ngst-summary-line ngst-balance"><span>Outstanding balance</span><strong>{money(t.outstanding)}</strong></div>
      {t.credit > 0 && <div className="ngst-summary-line"><span>Credit / overpayment</span><strong>{money(t.credit)}</strong></div>}
      <p className="ngst-muted">Grand total in words: {inWords(t.total)}</p>
    </section>
    {bill.payments.length > 0 && <section style={{ marginBottom: 15 }}><strong>Payments allocated to this bill</strong>{bill.payments.map(p => <div key={p.id} className="ngst-entry">{p.date} · {p.method} · {moneySafe(p.amount)}{p.reference && ` · Ref: ${p.reference}`}{p.notes && ` · ${p.notes}`}</div>)}</section>}
    {bill.freight.length > 0 && <section style={{ marginBottom: 15 }}><strong>Freight adjustments</strong>{bill.freight.map(p => <div key={p.id} className="ngst-entry">{p.date} · {p.description} · {moneySafe(p.amount)} · Paid by {p.paidBy} · {p.deductible ? 'Deducted from bill' : 'Not deductible'}</div>)}</section>}
    <footer className="ngst-footer"><div><strong>Notes & payment details</strong><p className="ngst-wrap">{bill.notes}</p><p className="ngst-wrap">{company.PAYMENT_TERMS}</p><p>{company.BANK_NAME} · {company.BANK_ACCOUNT_NAME}</p><p>A/c: {company.BANK_ACCOUNT_NUMBER} · IFSC: {company.IFSC_CODE}</p><p className="ngst-wrap">{company.INVOICE_FOOTER_NOTE}</p></div><div className="ngst-signature"><strong>For {company.COMPANY_NAME}</strong><p style={{ marginTop: 55 }}>Authorized Signatory</p></div></footer>
  </article>
}

function moneySafe(value) { try { return money(decimal(value)) } catch { return money(0) } }
function displayDate(date) { return String(date || '').split('-').reverse().join('/') }
