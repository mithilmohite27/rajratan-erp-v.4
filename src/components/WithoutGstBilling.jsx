import React, { useEffect, useRef, useState } from 'react'
import { billToday as today, createBill, linePaise, money, newId, normalizeBill, paymentStatus, totals } from '../lib/withoutGst.js'
import { billRequest } from '../lib/withoutGstApi.js'
import WithoutGstPrint, { quantitySummary, WITHOUT_GST_PRINT_CSS } from './WithoutGstPrint.jsx'

const inputClass = 'w-full min-w-0 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 disabled:bg-gray-100'
const buttonClass = 'rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-700 disabled:opacity-40'
function Field({ label, value, onChange, type = 'text', ...props }) {
  return <label className="block min-w-0 text-xs font-semibold text-gray-500">{label}<input className={`${inputClass} mt-1`} type={type} value={value} onChange={e => onChange(e.target.value)} {...props} /></label>
}
function amount(row) { try { return money(linePaise(row)) } catch { return 'Enter quantity and rate' } }
function localDraft(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key))
    if (value?.schema === 1 && value.bill && Array.isArray(value.bill.deliveries) && Array.isArray(value.bill.payments) && Array.isArray(value.bill.freight)) return value
  } catch { /* Missing or unavailable browser storage: retain the in-memory draft. */ }
  return null
}

export default function WithoutGstBilling({ active, clients, config, accessToken, user }) {
  const storageKey = `rajratan.ngst.v1.${user?.email || 'session'}`
  const [initial] = useState(() => localDraft(storageKey))
  const [bill, setBill] = useState(() => initial?.bill || createBill(today()))
  const [record, setRecord] = useState(initial?.record || null)
  const [billId, setBillId] = useState(() => initial?.billId || newId())
  const [pending, setPending] = useState(initial?.pending || null)
  const [saved, setSaved] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [schemaReady, setSchemaReady] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [storageError, setStorageError] = useState('')
  const [preview, setPreview] = useState(false)
  const [settling, setSettling] = useState(false)
  const [reason, setReason] = useState('')
  const [historical, setHistorical] = useState(null)
  const [search, setSearch] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const busy = useRef(false)
  const printRef = useRef(null)
  const issued = record?.status === 'finalized'
  const disabled = saving || Boolean(pending) || Boolean(historical)
  const summary = totals(bill)
  const hasContent = Boolean(bill.clientName || bill.clientAddress || bill.clientPhone || bill.notes || bill.payments.length || bill.freight.length || bill.mode !== 'standard' || bill.state !== 'Gujarat' || bill.date !== today() || bill.deliveries.length !== 1 || bill.deliveries.some(row => row.qty || row.rate || row.location || row.specification || row.product !== 'Paver Blocks' || row.unit !== 'Brass'))
  const dirty = record ? JSON.stringify(record.bill) !== JSON.stringify(bill) : hasContent
  let validation = ''
  try { normalizeBill(bill) } catch (e) { validation = e.message }

  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify({ schema: 1, bill, record, billId, pending })); setStorageError('') }
    catch { setStorageError('Browser draft backup is unavailable or full. Save to Sheets before leaving this page.') }
  }, [storageKey, bill, record, billId, pending])
  useEffect(() => {
    if (!dirty && !pending) return
    const warn = e => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty, pending])
  useEffect(() => {
    if (!active || loaded) return
    let cancelled = false
    setLoading(true)
    billRequest(accessToken).then(result => {
      if (cancelled) return
      setSaved(result.bills); setLoaded(true); setSchemaReady(result.schemaReady === true); setError('')
      if (result.rejectedAttempts) setNotice(`${result.rejectedAttempts} stale or rejected save attempts remain in the audit journal.`)
    }).catch(e => { if (!cancelled) { setError(e.message); setLoaded(true); setSchemaReady(false) } }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [active, loaded, accessToken])

  const change = patch => { setBill(previous => ({ ...previous, ...patch })); setNotice('') }
  const updateRow = (key, id, patch) => setBill(previous => ({ ...previous, [key]: previous[key].map(row => row.id === id ? { ...row, ...patch } : row) }))
  const removeRow = (key, id) => { if (window.confirm('Remove this entry from the working bill? Saved versions remain in history.')) setBill(previous => ({ ...previous, [key]: previous[key].filter(row => row.id !== id) })) }
  const addDelivery = source => change({ deliveries: [...bill.deliveries, source ? { ...source, id: newId() } : { id: newId(), date: bill.date, product: 'Paver Blocks', specification: '', location: bill.clientAddress, qty: '', unit: 'Brass', rate: '' }] })
  const reorder = (index, delta) => {
    const rows = [...bill.deliveries]
    ;[rows[index], rows[index + delta]] = [rows[index + delta], rows[index]]
    change({ deliveries: rows })
  }
  const replaceWorking = (nextRecord, duplicate = false) => {
    if (pending) { setError('Retry the pending save before opening another bill.'); return }
    if (dirty && !window.confirm('Replace the current working draft? Save it first if you want to keep it.')) return
    const next = nextRecord ? structuredClone(nextRecord.bill) : createBill(today())
    if (duplicate) { next.date = today(); next.payments = []; next.freight = []; next.deliveries = next.deliveries.map(row => ({ ...row, id: newId() })) }
    setBill(next); setRecord(duplicate ? null : nextRecord); setBillId(duplicate || !nextRecord ? newId() : nextRecord.id)
    setPreview(false); setSettling(false); setHistorical(null); setReason(''); setError(''); setNotice('')
  }
  const save = async (action, correctionReason = reason, retry = false, checkOnly = false) => {
    if (busy.current) return
    let request = retry ? pending : null
    busy.current = true; setSaving(true); setError(''); setNotice('')
    try {
      if (!request) {
        if (pending) throw new Error('Retry the pending request first.')
        const normalized = normalizeBill(bill, action === 'FINALIZE' || action === 'SETTLE')
        if (['REVISE', 'SETTLE'].includes(action) && !correctionReason.trim()) throw new Error('Enter a reason for this correction or settlement update.')
        if (action === 'FINALIZE' && !window.confirm('Issue this bill? The issued snapshot will be preserved. Later corrections require a revision.')) return
        const preflight = await billRequest(accessToken)
        if (preflight.schemaReady !== true) throw new Error('Storage validation could not be confirmed. Ask the owner to check Without GST storage in Setup.')
        setSchemaReady(true)
        request = { id: newId(), billId, expectedVersion: record?.version || '', action, reason: correctionReason, bill: normalized }
        // Persist the retry identity before sending; losing it could duplicate a new bill.
        localStorage.setItem(storageKey, JSON.stringify({ schema: 1, bill, record, billId, pending: request }))
        setPending(request)
      }
      let result
      if (retry) {
        result = await billRequest(accessToken, { ...request, reconcile: true })
        if (result.schemaReady === true) setSchemaReady(true)
        if (result.requestState === 'not_found') {
          if (checkOnly) { setNotice(result.message); return }
          result = await billRequest(accessToken, request)
        }
      } else result = await billRequest(accessToken, request)
      if (result.requestId !== request.id || result.authoritative !== true || result.requestState !== 'committed' || !result.record) throw new Error('The server could not confirm this request. Keep the pending ID and check it again; do not create a replacement bill.')
      localStorage.setItem(storageKey, JSON.stringify({ schema: 1, bill: result.record.bill, record: result.record, billId, pending: null }))
      setRecord(result.record); setBill(result.record.bill); setPending(null); setSettling(false); setReason(''); setHistorical(null)
      setSchemaReady(true)
      setSaved(previous => [result.record, ...previous.filter(row => row.id !== result.record.id)])
      setNotice(`${result.record.number} ${result.record.status === 'finalized' ? 'saved as issued' : 'draft saved'}.`)
    } catch (e) {
      setError(e.message)
      if (e.details?.schemaReady === false) setSchemaReady(false)
      if (request && e.details?.requestId === request.id && e.details?.authoritative === true && e.details?.requestState === 'rejected') {
        localStorage.setItem(storageKey, JSON.stringify({ schema: 1, bill, record, billId, pending: null }))
        setPending(null); setLoaded(false); setNotice('The journal confirms this request was rejected without changing the bill. Your working changes are retained; reload the saved bill to resolve the conflict.')
      }
    } finally { busy.current = false; setSaving(false) }
  }
  const showPreview = () => {
    try { normalizeBill(bill, true); setError(''); setPreview(true) } catch (e) { setError(e.message) }
  }
  const print = async () => {
    if (!printRef.current) return
    const popup = window.open('', '_blank', 'width=1000,height=800')
    if (!popup) { setError('Allow pop-ups to print or save this bill as PDF.'); return }
    popup.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Without GST Bill</title></head><body></body></html>')
    popup.document.close()
    const style = popup.document.createElement('style'); style.textContent = WITHOUT_GST_PRINT_CSS; popup.document.head.appendChild(style)
    try {
      const original = printRef.current.querySelector('.ngst-document')
      const documentNode = original.cloneNode(true)
      // Embed the loaded official logo so the new document does not depend on a
      // second network request or a cross-document image-loader race.
      const sourceImages = [...original.querySelectorAll('img')]
      const clonedImages = [...documentNode.querySelectorAll('img')]
      for (let i = 0; i < sourceImages.length; i++) {
        await sourceImages[i].decode()
        const canvas = document.createElement('canvas')
        canvas.width = sourceImages[i].naturalWidth; canvas.height = sourceImages[i].naturalHeight
        canvas.getContext('2d').drawImage(sourceImages[i], 0, 0)
        clonedImages[i].src = canvas.toDataURL('image/png')
      }
      if (popup.closed) return
      popup.document.body.appendChild(documentNode)
      popup.document.title = `${record?.number || 'NGST Draft'}${historical ? ` - Revision ${historical.revision}` : ''}`
      await Promise.all(clonedImages.map(img => img.decode()))
      if (!popup.closed) { popup.focus(); popup.print() }
    } catch {
      popup.close(); setError('The company logo could not load for printing. Refresh the preview and try again.')
    }
  }
  const filtered = saved.filter(row => `${row.number} ${row.bill.clientName}`.toLowerCase().includes(search.toLowerCase()) && (!from || row.bill.date >= from) && (!to || row.bill.date <= to) && (!statusFilter || paymentStatus(row.bill) === statusFilter))

  return <div className="p-4 space-y-4">
    <div className="rounded-xl border border-orange-200 bg-orange-50 p-3 text-xs text-orange-800">Without GST bills have a separate NGST sequence. Drafts receive a reserved number when first saved. Payments here allocate money to this bill; they do not create Cashflow or CRM transactions.</div>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {storageError && <p role="alert" className="text-xs text-red-700">{storageError}</p>}
    {notice && <p role="status" className="rounded-xl bg-teal-50 p-3 text-sm text-teal-800">{notice}</p>}
    {!schemaReady && <div className="rounded-xl border border-orange-200 bg-orange-50 p-3 text-xs text-orange-800"><p>{loading ? 'Checking required billing worksheets and NGST configuration…' : 'Saving is blocked until billing storage is ready. Ask the owner to use Setup → Without GST storage → Check, then explicitly repair if needed.'} <a className="underline" href="/setup">Open Setup</a></p><button type="button" disabled={loading || saving} onClick={() => setLoaded(false)} className={`${buttonClass} mt-2`}>Recheck storage</button></div>}
    {pending && <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm">A save is pending. Its original request ID is preserved: <code className="break-all">{pending.id}</code><p className="mt-1 text-xs">Check whether it committed before retrying. Schema errors or an absent event will not clear this request.</p><div className="mt-2 flex flex-wrap gap-2"><button type="button" disabled={saving} onClick={() => save('', '', true, true)} className={buttonClass}>Check pending save</button><button type="button" disabled={saving} onClick={() => save('', '', true)} className={buttonClass}>{saving ? 'Checking / saving…' : 'Retry pending save'}</button></div></div>}
    <div className="flex flex-wrap items-center justify-between gap-2"><div><strong>{record?.number || 'New Without GST Bill'}</strong><p className="text-xs text-gray-500">{issued ? `Issued · revision ${record.revision}` : 'Draft'}{dirty && ' · unsaved changes'}</p></div><button type="button" disabled={saving || Boolean(pending)} onClick={() => replaceWorking(null)} className={buttonClass}>New bill</button></div>
    {preview ? <>
      <div className="flex flex-wrap gap-2"><button type="button" onClick={() => { setPreview(false); setHistorical(null) }} className={buttonClass}>Back to bill</button><button type="button" onClick={print} className="rounded-xl bg-green-600 px-4 py-2 text-sm font-bold text-white">Print / Save as PDF</button></div>
      {historical && <p className="text-xs text-orange-700">Historical snapshot · {historical.timestamp} · {historical.actor}</p>}
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-slate-200 p-2"><div ref={printRef} style={{ width: '210mm', minHeight: '297mm', margin: '0 auto' }}><WithoutGstPrint bill={historical?.bill || bill} config={historical?.company || record?.company || config} number={record?.number} status={historical?.status || record?.status || 'draft'} revision={historical?.revision || record?.revision || 0} /></div></div>
    </> : <>
      <fieldset disabled={disabled || issued} className="space-y-4 min-w-0">
        <section className="rounded-2xl border border-gray-100 bg-white p-4 space-y-3">
          <label className="block text-xs font-semibold text-gray-500">Billing mode<select className={`${inputClass} mt-1`} value={bill.mode} onChange={e => change({ mode: e.target.value })}><option value="standard">Standard Bill</option><option value="consolidated">Consolidated Supply Bill</option></select></label>
          <p className="text-xs text-gray-500">{bill.mode === 'standard' ? 'A simple sale or standard itemized bill.' : 'Combine deliveries across dates, locations, products, and rates.'}</p>
          <Field label="Bill date" type="date" value={bill.date} onChange={date => change({ date })} />
          <label className="block text-xs font-semibold text-gray-500">Pick from CRM clients<select className={`${inputClass} mt-1`} value="" onChange={e => { const client = clients.find(c => c.name === e.target.value); if (client) change({ clientName: client.name, clientAddress: client.location, deliveries: bill.deliveries.map(row => ({ ...row, location: row.location || client.location, rate: row.rate || String(client.rate || '') })) }) }}><option value="">Select client or enter manually</option>{clients.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}</select></label>
          <Field label="Client name" value={bill.clientName} onChange={clientName => change({ clientName })} />
          <label className="block text-xs font-semibold text-gray-500">Billing address<textarea rows={3} className={`${inputClass} mt-1`} value={bill.clientAddress} onChange={e => change({ clientAddress: e.target.value })} /></label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><Field label="State" value={bill.state} onChange={state => change({ state })} /><Field label="Phone (optional)" type="tel" value={bill.clientPhone} onChange={clientPhone => change({ clientPhone })} /></div>
        </section>
        <section className="space-y-3">
          <div className="flex items-center justify-between"><h2 className="text-sm font-bold text-gray-700">{bill.mode === 'consolidated' ? 'Deliveries' : 'Sale items / deliveries'}</h2><button type="button" onClick={() => addDelivery()} className={buttonClass}>+ Add delivery</button></div>
          <datalist id="ngst-products"><option value="Paver Blocks" />{[...new Set(bill.deliveries.map(row => row.product).filter(Boolean))].filter(name => name !== 'Paver Blocks').map(name => <option key={name} value={name} />)}</datalist>
          <datalist id="ngst-specifications"><option value="60mm" /><option value="80mm" /></datalist>
          <datalist id="ngst-units"><option value="Brass" /><option value="Pieces" /><option value="Nos" /><option value="Sq. ft." /></datalist>
          {bill.deliveries.map((row, index) => <div key={row.id} className="rounded-2xl border border-gray-200 bg-white p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm">Delivery {index + 1}</strong><div className="flex gap-1"><button type="button" aria-label={`Move delivery ${index + 1} up`} disabled={index === 0} onClick={() => reorder(index, -1)} className={buttonClass}>↑</button><button type="button" aria-label={`Move delivery ${index + 1} down`} disabled={index === bill.deliveries.length - 1} onClick={() => reorder(index, 1)} className={buttonClass}>↓</button><button type="button" onClick={() => addDelivery(row)} className={buttonClass}>Duplicate</button><button type="button" onClick={() => removeRow('deliveries', row.id)} className={`${buttonClass} text-red-600`}>Remove</button></div></div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><Field label="Delivery date" type="date" value={row.date} onChange={date => updateRow('deliveries', row.id, { date })} /><Field label="Product name" list="ngst-products" value={row.product} onChange={product => updateRow('deliveries', row.id, { product })} /><Field label="Specification (optional)" list="ngst-specifications" value={row.specification} onChange={specification => updateRow('deliveries', row.id, { specification })} /><Field label="Delivery location" value={row.location} onChange={location => updateRow('deliveries', row.id, { location })} /></div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3"><Field label="Quantity" type="number" min="0.0001" step="0.0001" value={row.qty} onChange={qty => updateRow('deliveries', row.id, { qty })} /><Field label="Unit" list="ngst-units" value={row.unit} onChange={unit => updateRow('deliveries', row.id, { unit })} /><Field label="Rate per unit (₹)" type="number" min="0" step="0.01" value={row.rate} onChange={rate => updateRow('deliveries', row.id, { rate })} /></div>
            <p className="text-right text-sm font-bold text-gray-700">Amount: {amount(row)}</p>
          </div>)}
          <button type="button" onClick={() => addDelivery()} className={`${buttonClass} w-full`}>+ Add delivery</button>
        </section>
        <section className="rounded-2xl bg-white p-4"><label className="block text-xs font-semibold text-gray-500">Bill notes<textarea rows={3} className={`${inputClass} mt-1`} value={bill.notes} onChange={e => change({ notes: e.target.value })} /></label></section>
      </fieldset>
      {issued && !settling && <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-2"><p className="text-xs text-gray-600">This issued snapshot is preserved. Start a revision to change customer or deliveries.</p><Field label="Correction reason" value={reason} onChange={setReason} /><div className="flex flex-wrap gap-2"><button type="button" disabled={disabled || !schemaReady} onClick={() => save('REVISE')} className={buttonClass}>Start revision</button><button type="button" disabled={disabled} onClick={() => { setSettling(true); setReason('') }} className={buttonClass}>Record / correct payments</button></div></div>}
      <fieldset disabled={disabled || (issued && !settling)} className="min-w-0 rounded-2xl border border-gray-200 bg-white p-4 space-y-4">
        <legend className="px-1 text-sm font-bold text-gray-700">Payments & Adjustments (optional)</legend>
        <p className="text-xs text-gray-500">Allocate each payment once. Reference numbers identify existing payments. Freight is deducted only when explicitly checked. No automatic ledger posting occurs.</p>
        {bill.payments.map((row, index) => <div key={row.id} className="space-y-3 rounded-xl border border-gray-100 p-3"><div className="flex items-center justify-between"><strong className="text-xs">Payment {index + 1}</strong><button type="button" onClick={() => removeRow('payments', row.id)} className={buttonClass}>Remove</button></div><div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><Field label="Payment date" type="date" value={row.date} onChange={date => updateRow('payments', row.id, { date })} /><Field label="Amount (₹)" type="number" min="0.01" step="0.01" value={row.amount} onChange={value => updateRow('payments', row.id, { amount: value })} /><label className="block text-xs font-semibold text-gray-500">Payment method<select className={`${inputClass} mt-1`} value={row.method} onChange={e => updateRow('payments', row.id, { method: e.target.value })}>{['Bank transfer', 'UPI', 'Cash', 'Cheque', 'Other'].map(method => <option key={method}>{method}</option>)}</select></label><Field label="Reference (optional, unique)" value={row.reference} onChange={reference => updateRow('payments', row.id, { reference })} /></div><Field label="Notes (optional)" value={row.notes} onChange={notes => updateRow('payments', row.id, { notes })} /></div>)}
        <button type="button" onClick={() => change({ payments: [...bill.payments, { id: newId(), date: today(), amount: '', method: 'Bank transfer', reference: '', notes: '' }] })} className={buttonClass}>+ Add payment</button>
        {bill.freight.map((row, index) => <div key={row.id} className="space-y-3 rounded-xl border border-gray-100 p-3"><div className="flex items-center justify-between"><strong className="text-xs">Freight {index + 1}</strong><button type="button" onClick={() => removeRow('freight', row.id)} className={buttonClass}>Remove</button></div><div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><Field label="Freight date" type="date" value={row.date} onChange={date => updateRow('freight', row.id, { date })} /><Field label="Freight amount (₹)" type="number" min="0.01" step="0.01" value={row.amount} onChange={value => updateRow('freight', row.id, { amount: value })} /><Field label="Description" value={row.description} onChange={description => updateRow('freight', row.id, { description })} /><Field label="Paid by" value={row.paidBy} onChange={paidBy => updateRow('freight', row.id, { paidBy })} /></div><label className="flex items-start gap-2 text-xs font-semibold text-gray-700"><input type="checkbox" checked={row.deductible} onChange={e => updateRow('freight', row.id, { deductible: e.target.checked })} />Deduct this freight from the bill balance</label></div>)}
        <button type="button" onClick={() => change({ freight: [...bill.freight, { id: newId(), date: today(), amount: '', description: '', paidBy: '', deductible: false }] })} className={buttonClass}>+ Add freight adjustment</button>
      </fieldset>
      {settling && <div className="space-y-2"><Field label="Settlement / correction reason" value={reason} onChange={setReason} /><button type="button" disabled={disabled || !schemaReady} onClick={() => save('SETTLE')} className={buttonClass}>Save settlement update</button><button type="button" disabled={disabled} onClick={() => { if (!dirty || window.confirm('Discard unsaved payment changes?')) { setBill(record.bill); setSettling(false) } }} className={`${buttonClass} ml-2`}>Cancel</button></div>}
      {validation && <p role="alert" className="text-xs text-red-700">{validation}</p>}
      <section className="rounded-2xl border border-green-200 bg-green-50 p-4 space-y-2 text-sm"><div className="flex justify-between gap-3"><span>Deliveries</span><strong>{summary.count}</strong></div><div className="flex justify-between gap-3"><span>Quantity by unit</span><strong className="text-right">{quantitySummary(summary.quantities)}</strong></div>{[['Grand total', summary.total], ['Payments allocated', summary.payments], ['Deductible freight', summary.freight], ['Outstanding balance', summary.outstanding]].map(([label, value]) => <div key={label} className="flex justify-between gap-3"><span>{label}</span><strong>{money(value)}</strong></div>)}{summary.credit > 0 && <div className="flex justify-between gap-3 text-orange-700"><span>Credit / overpayment</span><strong>{money(summary.credit)}</strong></div>}{validation && <p className="text-xs text-red-700">Totals are provisional until the validation errors are fixed.</p>}</section>
      <div className="flex flex-wrap gap-2"><button type="button" disabled={disabled || settling} onClick={showPreview} className={buttonClass}>Preview bill</button>{!issued && <><button type="button" disabled={disabled || !schemaReady} onClick={() => save('SAVE')} className={buttonClass}>{saving ? 'Saving…' : 'Save draft'}</button><button type="button" disabled={disabled || !schemaReady} onClick={() => save('FINALIZE')} className="rounded-xl bg-orange-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-40">Finalize bill</button></>}</div>
    </>}
    {record?.history && <details className="rounded-xl border border-gray-200 bg-white p-3"><summary className="cursor-pointer text-sm font-bold">Revision & settlement history ({record.history.length})</summary>{record.history.map(entry => <div key={entry.version} className="border-t border-gray-100 py-2 text-xs"><strong>{entry.action} · {entry.status} · Revision {entry.revision}</strong><p>{entry.actor} · {entry.timestamp}</p>{entry.reason && <p>{entry.reason}</p>}<button type="button" disabled={saving || Boolean(pending)} onClick={() => { setHistorical(entry); setPreview(true) }} className={`${buttonClass} mt-1`}>View snapshot</button></div>)}</details>}
    <section className="rounded-2xl border border-gray-200 bg-white p-4 space-y-3"><div className="flex items-center justify-between"><h2 className="text-sm font-bold">Saved Without GST Bills</h2><button type="button" disabled={loading} onClick={() => setLoaded(false)} className={buttonClass}>{loading ? 'Loading…' : 'Refresh'}</button></div><Field label="Search client or bill number" value={search} onChange={setSearch} /><div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><Field label="From bill date" type="date" value={from} onChange={setFrom} /><Field label="To bill date" type="date" value={to} onChange={setTo} /></div><label className="block text-xs font-semibold text-gray-500">Payment status<select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className={`${inputClass} mt-1`}><option value="">All payment statuses</option>{['Unpaid', 'Partial', 'Paid', 'Credit'].map(value => <option key={value}>{value}</option>)}</select></label>{filtered.map(row => <div key={row.id} className="rounded-xl border border-gray-100 p-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><strong>{row.number} · {row.bill.clientName || 'Unnamed client'}</strong><span className="text-xs text-gray-500">{row.status} · {paymentStatus(row.bill)}</span></div><p className="text-xs text-gray-500">{row.bill.date} · Outstanding {money(totals(row.bill).outstanding)}{totals(row.bill).credit > 0 && ` · Credit ${money(totals(row.bill).credit)}`}</p><div className="mt-2 flex gap-2"><button type="button" disabled={saving || Boolean(pending)} onClick={() => replaceWorking(row)} className={buttonClass}>Open</button><button type="button" disabled={saving || Boolean(pending)} onClick={() => replaceWorking(row, true)} className={buttonClass}>Duplicate as new bill</button></div></div>)}{!loading && !filtered.length && <p className="text-xs text-gray-500">No saved bills match these filters.</p>}</section>
  </div>
}
