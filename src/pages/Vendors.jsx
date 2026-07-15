import React, { useState, useEffect, useRef } from 'react'
import { useApp } from '../App.jsx'
import { loadVendors } from '../lib/sheets.js'
import { formatINR, today } from '../lib/formulas.js'
import { confirmDuplicateSave } from '../lib/safety.js'

// ── Material list matches materials.js MATERIAL_IDS exactly ──
// Color pigment is split by color so material stock deduction works correctly.
const MATERIALS = [
  { label: 'Cement',   id: 'Cement',   unit: 'bags', emoji: '' },
  { label: 'Greet',    id: 'Greet',    unit: 'ton',  emoji: '' },
  { label: 'Powder',   id: 'Powder',   unit: 'ton',  emoji: '' },
  { label: 'Chemical', id: 'Chemical', unit: 'L',    emoji: '' },
  { label: 'Yellow',   id: 'Yellow',   unit: 'kg',   emoji: '' },
  { label: 'Red',      id: 'Red',      unit: 'kg',   emoji: '' },
  { label: 'Black',    id: 'Black',    unit: 'kg',   emoji: '' },
  { label: 'White',    id: 'White',    unit: 'kg',   emoji: '' },
  { label: 'Plastic',  id: 'Plastic',  unit: 'ml',   emoji: '' },
  { label: 'Reti',     id: 'Reti',     unit: 'ghamela', emoji: '' },
  { label: 'Other',    id: 'Other',    unit: '',     emoji: '' },
]

// ── Vendor name autocomplete dropdown ─────────
function VendorAutocomplete({ value, onChange, vendorList, placeholder }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  // Filter existing vendor names by what's typed
  const filtered = vendorList
    .map(v => v.name)
    .filter((n, i, arr) => arr.indexOf(n) === i) // unique
    .filter(n => n.toLowerCase().includes(value.toLowerCase()))

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} className="relative">
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onChange={e => { onChange(e.target.value); setOpen(true) }}
        className="w-full text-base font-bold text-gray-800 outline-none bg-transparent"
      />
      {open && filtered.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-orange-200 rounded-xl shadow-lg z-50 overflow-hidden max-h-48 overflow-y-auto">
          {filtered.map(name => (
            <button
              key={name}
              type="button"
              onMouseDown={() => { onChange(name); setOpen(false) }}
              className="w-full text-left px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-orange-50 hover:text-orange-600 border-b border-gray-50 last:border-0"
            >
               {name}
            </button>
          ))}
        </div>
      )}
      {open && value.length > 0 && filtered.length === 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-orange-50 border border-orange-200 rounded-xl px-4 py-2 z-50">
          <p className="text-xs text-orange-600 font-semibold">+ New vendor will be created</p>
        </div>
      )}
    </div>
  )
}

async function saveVendorViaBackend(entry, accessToken, force = false) {
  const token = sessionStorage.getItem('gToken') || accessToken
  if (!token) throw new Error('Session expired. Please sign in again.')

  const res = await fetch('/api/vendors', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ entry: { ...entry, force } }),
  })

  const payload = await res.json().catch(() => ({}))
  if (payload.duplicate) return { duplicate: true, message: payload.message }

  if (!res.ok || !payload.ok) {
    const message = payload.message || 'Vendor entry save failed.'
    if (res.status === 401) throw new Error(`Session expired or invalid login. ${message}`)
    if (res.status === 403) throw new Error(`Access denied. ${message}`)
    if (payload.code === 'INVALID_VENDOR_ENTRY' || payload.code === 'INVALID_AMOUNT') {
      throw new Error(`Invalid vendor entry. ${message}`)
    }
    if (payload.code === 'VENDOR_SAVE_FAILED') {
      throw new Error(`Backend not configured or vendor save failed. ${message}`)
    }
    throw new Error(message)
  }

  return payload
}

export default function Vendors() {
  const { accessToken } = useApp()
  const [tab,     setTab]     = useState('ledger')
  const [rows,    setRows]    = useState([])
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [refresh, setRefresh] = useState(0)
  const [error,   setError]   = useState('')
  const [success, setSuccess] = useState('')

  const selectedMat = (id) => MATERIALS.find(m => m.id === id) || MATERIALS[0]

  const [invoiceForm, setInvoiceForm] = useState({
    date: today(), vendorName: '', material: 'Cement', quantity: '', amount: '', notes: ''
  })
  const [payForm, setPayForm] = useState({
    date: today(), vendorName: '', amount: '', source: 'Factory', notes: ''
  })

  const fetchData = async () => {
    setLoading(true)
    try { setRows(await loadVendors(accessToken)) }
    catch (e) { setError('Load failed: ' + e.message) }
    setLoading(false)
  }
  useEffect(() => { fetchData() }, [refresh])

  const flash = (msg) => { setSuccess(msg); setTimeout(() => setSuccess(''), 3000) }

  // Group by vendor
  const vendors = rows.reduce((acc, r) => {
    const name = r.VendorName
    if (!name) return acc
    if (!acc[name]) acc[name] = { name, material: r.Material, invoiced: 0, paid: 0, entries: [] }
    if (r.Type === 'Invoice')  acc[name].invoiced += parseFloat(r.Amount) || 0
    if (r.Type === 'Payment')  acc[name].paid     += parseFloat(r.Amount) || 0
    acc[name].entries.push(r)
    return acc
  }, {})
  const vendorList = Object.values(vendors)

  // ── SAVE INVOICE ──────────────────────────────
  const handleInvoice = async () => {
    if (saving) return
    if (!invoiceForm.vendorName) { setError('Vendor name is required.'); return }
    if (!invoiceForm.amount)     { setError('Invoice amount is required.'); return }
    setSaving(true); setError('')
    try {
      const mat = selectedMat(invoiceForm.material)
      const quantity = invoiceForm.quantity ? parseFloat(invoiceForm.quantity) : ''
      const amount = parseFloat(invoiceForm.amount)
      const entry = {
        date:       invoiceForm.date,
        vendorName: invoiceForm.vendorName,
        material:   invoiceForm.material,       // canonical ID e.g. 'Cement', 'Greet'
        type:       'Invoice',
        quantity,
        unit:       mat.unit,                   // correct unit saved → stock engine reads this
        amount,
        notes:      invoiceForm.notes,
      }
      const result = await saveVendorViaBackend(entry, accessToken)

      if (result.duplicate) {
        if (!confirmDuplicateSave('vendor invoice', 1)) {
          setSaving(false)
          return
        }
        await saveVendorViaBackend(entry, accessToken, true)
      }

      setRefresh(v => v + 1)
      setInvoiceForm({ date: today(), vendorName: '', material: 'Cement', quantity: '', amount: '', notes: '' })
      flash(' Invoice saved — Material Stock updated automatically!')
      setTab('ledger')
    } catch (e) { setError('Save failed: ' + e.message) }
    setSaving(false)
  }

  // ── SAVE PAYMENT ──────────────────────────────
  const handlePayment = async () => {
    if (saving) return
    if (!payForm.vendorName) { setError('Select a vendor.'); return }
    if (!payForm.amount)     { setError('Payment amount is required.'); return }
    setSaving(true); setError('')
    try {
      const amount = parseFloat(payForm.amount)
      const entry = {
        date:       payForm.date,
        vendorName: payForm.vendorName,
        material:   '',
        type:       'Payment',
        quantity:   '',
        unit:       '',
        amount,
        notes:      payForm.notes,
        source:     payForm.source,
      }
      const result = await saveVendorViaBackend(entry, accessToken)

      if (result.duplicate) {
        if (!confirmDuplicateSave('vendor payment', 1)) {
          setSaving(false)
          return
        }
        await saveVendorViaBackend(entry, accessToken, true)
      }

      setRefresh(v => v + 1)
      setPayForm({ date: today(), vendorName: '', amount: '', source: 'Factory', notes: '' })
      flash(' Payment recorded + Cash Flow updated!')
      setTab('ledger')
    } catch (e) { setError('Save failed: ' + e.message) }
    setSaving(false)
  }

  const currentMat = selectedMat(invoiceForm.material)

  return (
    <div className="max-w-lg mx-auto">
      {/* Header */}
      <div className="bg-white px-4 py-3 border-b border-gray-100 sticky top-12 z-10">
        <h1 className="text-lg font-bold text-gray-800"> Vendor Ledger</h1>
        <p className="text-xs text-gray-400">Invoices with quantity auto-update Material Stock</p>
      </div>

      {/* Tabs */}
      <div className="flex bg-white border-b border-gray-100 sticky top-[calc(3rem+4rem)] z-10">
        {[['ledger','Ledger'],['+invoice','+ Invoice'],['payment','Pay Vendor'],['history','History']].map(([k,l]) => (
          <button key={k} onClick={() => { setTab(k); setError('') }}
            className={`flex-1 py-2.5 text-xs font-semibold transition-colors
              ${tab===k ? 'text-orange-500 border-b-2 border-orange-500' : 'text-gray-400'}`}>
            {l}
          </button>
        ))}
      </div>

      <div className="p-4 space-y-3 pb-8">
        {error   && <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl p-3">{error}</div>}
        {success && <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-xl p-3 font-semibold text-center">{success}</div>}

        {/* ── LEDGER ── */}
        {tab === 'ledger' && (
          loading ? <div className="text-center py-12 text-gray-400"> Loading...</div>
          : vendorList.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <div className="text-4xl mb-2"></div>
              <p>No vendor accounts yet.</p>
              <button onClick={() => setTab('+invoice')}
                className="mt-3 bg-orange-500 text-white px-4 py-2 rounded-xl text-sm font-bold">
                + Add Invoice
              </button>
            </div>
          ) : <>
            <div className="bg-orange-500 rounded-2xl p-4 text-white">
              <p className="text-sm opacity-80">Total Outstanding to All Vendors</p>
              <p className="text-3xl font-bold mt-1">
                {formatINR(vendorList.reduce((s, v) => s + Math.max(0, v.invoiced - v.paid), 0))}
              </p>
            </div>

            {vendorList.map((v, i) => {
              const outstanding = Math.max(0, v.invoiced - v.paid)
              const pct = v.invoiced > 0 ? Math.min(100, (v.paid / v.invoiced) * 100) : 0
              return (
                <div key={i} className="bg-white border border-gray-100 rounded-xl p-4">
                  <div className="flex justify-between items-start mb-1">
                    <div>
                      <p className="font-bold text-gray-800">{v.name}</p>
                      <p className="text-xs text-gray-400">{v.material}</p>
                    </div>
                    <span className={`text-sm font-bold ${outstanding > 0 ? 'text-red-500' : 'text-green-500'}`}>
                      {outstanding > 0 ? `Owes ${formatINR(outstanding)}` : ' Cleared'}
                    </span>
                  </div>
                  <div className="mt-2 mb-1 bg-gray-100 rounded-full h-2">
                    <div className="bg-green-500 h-2 rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="grid grid-cols-3 gap-1 text-xs text-gray-500 mt-2 text-center">
                    <div><p className="font-bold text-gray-700">{formatINR(v.invoiced)}</p><p>Invoiced</p></div>
                    <div><p className="font-bold text-green-600">{formatINR(v.paid)}</p><p>Paid</p></div>
                    <div><p className={`font-bold ${outstanding > 0 ? 'text-red-500' : 'text-green-500'}`}>{formatINR(outstanding)}</p><p>Outstanding</p></div>
                  </div>
                  <button onClick={() => { setPayForm(p => ({ ...p, vendorName: v.name })); setTab('payment') }}
                    className="mt-3 w-full border border-orange-300 text-orange-500 text-sm font-bold py-2 rounded-xl">
                     Record Payment
                  </button>
                </div>
              )
            })}
          </>
        )}

        {/* ── + INVOICE ── */}
        {tab === '+invoice' && <>
          <div className="bg-teal-50 border border-teal-200 rounded-xl p-3 text-xs text-teal-700">
             Entering a <strong>quantity</strong> automatically increases Material Stock balance.
          </div>

          {/* Date */}
          <div className="bg-white border border-gray-200 rounded-xl p-3">
            <label className="text-xs text-gray-500 block mb-1"> Date</label>
            <input type="date" value={invoiceForm.date}
              onChange={e => setInvoiceForm(p => ({ ...p, date: e.target.value }))}
              className="w-full text-lg font-bold text-gray-800 outline-none bg-transparent" />
          </div>

          {/* Vendor name — autocomplete from existing vendors */}
          <div className="bg-white border border-gray-200 rounded-xl p-3">
            <label className="text-xs text-gray-500 block mb-1"> Vendor Name</label>
            <VendorAutocomplete
              value={invoiceForm.vendorName}
              onChange={val => setInvoiceForm(p => ({ ...p, vendorName: val }))}
              vendorList={vendorList}
              placeholder="e.g. Sharma Cement Depot"
            />
          </div>

          {/* Material picker */}
          <div className="bg-white border border-gray-200 rounded-xl p-3">
            <label className="text-xs text-gray-500 block mb-2"> Material</label>
            <div className="flex flex-wrap gap-2">
              {MATERIALS.map(m => (
                <button key={m.id}
                  onClick={() => setInvoiceForm(p => ({ ...p, material: m.id, quantity: '' }))}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all
                    ${invoiceForm.material === m.id ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600'}`}>
                  {m.emoji} {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Quantity — unit auto-set from material */}
          <div className="bg-teal-50 border border-teal-300 rounded-xl p-3">
            <label className="text-xs text-teal-700 font-semibold block mb-1">
               Quantity received <span className="text-teal-500">(adds to Material Stock)</span>
            </label>
            <div className="flex items-center gap-2">
              <input type="number" inputMode="decimal"
                value={invoiceForm.quantity} placeholder="0"
                onChange={e => setInvoiceForm(p => ({ ...p, quantity: e.target.value }))}
                className="flex-1 text-2xl font-bold text-gray-800 outline-none bg-transparent" />
              {currentMat.unit && (
                <span className="text-sm font-bold text-teal-600 bg-teal-100 px-3 py-1 rounded-lg shrink-0">
                  {currentMat.unit}
                </span>
              )}
            </div>
            <p className="text-[10px] text-teal-600 mt-1">Required for automatic stock increase in Stock → Materials</p>
          </div>

          {/* Amount */}
          <div className="bg-white border border-gray-200 rounded-xl p-3">
            <label className="text-xs text-gray-500 block mb-1"> Invoice Amount (₹)</label>
            <input type="number" inputMode="decimal"
              value={invoiceForm.amount} placeholder="0"
              onChange={e => setInvoiceForm(p => ({ ...p, amount: e.target.value }))}
              className="w-full text-2xl font-bold text-gray-800 outline-none bg-transparent" />
          </div>

          {/* Notes */}
          <div className="bg-white border border-gray-200 rounded-xl p-3">
            <label className="text-xs text-gray-500 block mb-1"> Notes</label>
            <input type="text" value={invoiceForm.notes}
              placeholder="e.g. 50 bags cement delivered"
              onChange={e => setInvoiceForm(p => ({ ...p, notes: e.target.value }))}
              className="w-full text-base text-gray-800 outline-none bg-transparent" />
          </div>

          <button onClick={handleInvoice} disabled={saving}
            className="w-full bg-orange-500 disabled:bg-orange-300 text-white font-bold py-4 rounded-xl text-lg shadow-lg shadow-orange-200">
            {saving ? ' Saving...' : ' Save Invoice'}
          </button>
        </>}

        {/* ── PAY VENDOR ── */}
        {tab === 'payment' && <>
          <div className="bg-white border border-gray-200 rounded-xl p-3">
            <label className="text-xs text-gray-500 block mb-1"> Date</label>
            <input type="date" value={payForm.date}
              onChange={e => setPayForm(p => ({ ...p, date: e.target.value }))}
              className="w-full text-lg font-bold text-gray-800 outline-none bg-transparent" />
          </div>

          {/* Vendor — dropdown of existing + free type */}
          <div className="bg-white border border-gray-200 rounded-xl p-3">
            <label className="text-xs text-gray-500 block mb-2"> Vendor</label>
            {vendorList.length > 0 ? (
              <select value={payForm.vendorName}
                onChange={e => setPayForm(p => ({ ...p, vendorName: e.target.value }))}
                className="w-full text-base font-bold text-gray-800 outline-none bg-transparent mb-2">
                <option value="">— Select Vendor —</option>
                {vendorList.map(v => (
                  <option key={v.name} value={v.name}>
                    {v.name} (owes {formatINR(Math.max(0, v.invoiced - v.paid))})
                  </option>
                ))}
              </select>
            ) : (
              <input type="text" value={payForm.vendorName} placeholder="Vendor name"
                onChange={e => setPayForm(p => ({ ...p, vendorName: e.target.value }))}
                className="w-full text-lg font-bold text-gray-800 outline-none bg-transparent" />
            )}
          </div>

          {/* Amount */}
          <div className="bg-white border border-gray-200 rounded-xl p-3">
            <label className="text-xs text-gray-500 block mb-1"> Payment Amount (₹)</label>
            <input type="number" inputMode="decimal"
              value={payForm.amount} placeholder="0"
              onChange={e => setPayForm(p => ({ ...p, amount: e.target.value }))}
              className="w-full text-2xl font-bold text-gray-800 outline-none bg-transparent" />
            {/* Show outstanding for selected vendor */}
            {payForm.vendorName && vendors[payForm.vendorName] && (
              <p className="text-xs text-orange-600 mt-1 font-semibold">
                Outstanding: {formatINR(Math.max(0, vendors[payForm.vendorName].invoiced - vendors[payForm.vendorName].paid))}
              </p>
            )}
          </div>

          {/* Account source */}
          <div className="bg-white border border-gray-200 rounded-xl p-3">
            <label className="text-xs text-gray-500 block mb-2"> Pay From Which Account?</label>
            <div className="grid grid-cols-2 gap-2">
              {[['Factory',' Factory Account'],['External',' External / Owner']].map(([k,l]) => (
                <button key={k} onClick={() => setPayForm(p => ({ ...p, source: k }))}
                  className={`py-3 rounded-xl text-xs font-bold transition-all
                    ${payForm.source === k ? 'bg-orange-500 text-white shadow-md shadow-orange-200' : 'bg-gray-50 border border-gray-200 text-gray-600'}`}>
                  {l}
                </button>
              ))}
            </div>
            {payForm.amount > 0 && (
              <p className="text-xs text-orange-600 mt-2 font-semibold">
                {formatINR(parseFloat(payForm.amount))} will be deducted from <strong>{payForm.source}</strong> account in Cash Flow
              </p>
            )}
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-3">
            <label className="text-xs text-gray-500 block mb-1"> Notes</label>
            <input type="text" value={payForm.notes} placeholder="Payment reference..."
              onChange={e => setPayForm(p => ({ ...p, notes: e.target.value }))}
              className="w-full text-base text-gray-800 outline-none bg-transparent" />
          </div>

          <button onClick={handlePayment} disabled={saving}
            className="w-full bg-green-500 disabled:bg-green-300 text-white font-bold py-4 rounded-xl text-lg shadow-lg shadow-green-200">
            {saving ? ' Saving...' : ' Record Payment + Deduct from Cash Flow'}
          </button>
        </>}

        {/* ── HISTORY ── */}
        {tab === 'history' && (
          loading ? <div className="text-center py-8 text-gray-400"> Loading...</div>
          : rows.length === 0
            ? <div className="text-center py-12 text-gray-400"><div className="text-4xl mb-2"></div><p>No entries yet.</p></div>
            : [...rows].reverse().map((r, i) => (
              <div key={i} className="bg-white border border-gray-100 rounded-xl p-3 mb-2">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-gray-800">{r.VendorName}</span>
                  <span className={`text-sm font-bold ${r.Type === 'Payment' ? 'text-green-500' : 'text-red-400'}`}>
                    {r.Type === 'Payment' ? 'Paid' : 'Invoice'} {formatINR(r.Amount)}
                  </span>
                </div>
                <div className="text-xs text-gray-400 mt-1 flex gap-3 flex-wrap">
                  <span>{r.Date}</span>
                  {r.Material && <span className="bg-gray-100 px-2 py-0.5 rounded-full">{r.Material}</span>}
                  {r.Quantity && r.Unit && <span className="bg-teal-50 text-teal-600 px-2 py-0.5 rounded-full font-semibold">{r.Quantity} {r.Unit}</span>}
                  {r.Notes && <span>{r.Notes}</span>}
                </div>
              </div>
            ))
        )}
      </div>
    </div>
  )
}
