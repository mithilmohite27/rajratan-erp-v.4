import React, { useState, useEffect } from 'react'
import { useApp } from '../App.jsx'
import { loadVendors, saveVendorEntry, saveCashFlowEntry } from '../lib/sheets.js'
import { formatINR, today } from '../lib/formulas.js'
import { MATERIAL_LIST } from '../lib/materials.js'

const MATERIALS = ['Cement', 'Greet', 'Powder', 'Chemical', 'Color', 'Plastic', 'Reti', 'Other']
const UNIT_BY_MATERIAL = Object.fromEntries(MATERIAL_LIST.map(m => [m.id, m.unit]))

export default function Vendors() {
  const { accessToken } = useApp()
  const [tab,     setTab]     = useState('ledger')
  const [rows,    setRows]    = useState([])
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [refresh, setRefresh] = useState(0)
  const [error,   setError]   = useState('')

  const [invoiceForm, setInvoiceForm] = useState({
    date: today(), vendorName: '', material: 'Cement', quantity: '', unit: 'bags', amount: '', notes: ''
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

  const handleInvoice = async () => {
    if (!invoiceForm.vendorName || !invoiceForm.amount) { setError('Vendor name and amount required.'); return }
    const qty = parseFloat(invoiceForm.quantity)
    if (!qty || qty <= 0) { setError('Quantity required — material stock increases from invoice qty.'); return }
    setSaving(true); setError('')
    try {
      await saveVendorEntry(accessToken, {
        ...invoiceForm,
        type: 'Invoice',
        quantity: qty,
        unit: invoiceForm.unit || UNIT_BY_MATERIAL[invoiceForm.material] || '',
        amount: parseFloat(invoiceForm.amount),
      })
      setRefresh(v => v + 1)
      setInvoiceForm({ date: today(), vendorName: '', material: 'Cement', quantity: '', unit: 'bags', amount: '', notes: '' })
      setTab('ledger')
    } catch (e) { setError('Save failed: ' + e.message) }
    setSaving(false)
  }

  const selectMaterial = (m) => {
    setInvoiceForm(p => ({
      ...p,
      material: m,
      unit: UNIT_BY_MATERIAL[m] || p.unit,
    }))
  }

  const handlePayment = async () => {
    if (!payForm.vendorName || !payForm.amount) { setError('Vendor name and amount required.'); return }
    setSaving(true); setError('')
    try {
      // 1. Save to Vendor_Ledger
      await saveVendorEntry(accessToken, { ...payForm, material: '', type: 'Payment', amount: parseFloat(payForm.amount) })
      // 2. Sync to CashFlow — deducts from selected account
      await saveCashFlowEntry(accessToken, {
        date:        payForm.date,
        type:        'Out',
        source:      payForm.source,
        amount:      parseFloat(payForm.amount),
        description: `Vendor Payment — ${payForm.vendorName}`,
        vendorName:  payForm.vendorName,
      })
      setRefresh(v => v + 1)
      setPayForm({ date: today(), vendorName: '', amount: '', source: 'Factory', notes: '' })
      setTab('ledger')
    } catch (e) { setError('Save failed: ' + e.message) }
    setSaving(false)
  }

  return (
    <div className="max-w-lg mx-auto">
      <div className="bg-white px-4 py-3 border-b border-gray-100 sticky top-12 z-10">
        <h1 className="text-lg font-bold text-gray-800">🧾 Vendor Ledger</h1>
        <p className="text-xs text-gray-400">Invoices with quantity auto-update Material Stock</p>
      </div>
      <div className="flex bg-white border-b border-gray-100 sticky top-[calc(3rem+4rem)] z-10">
        {[['ledger','Ledger'],['invoice','+ Invoice'],['payment','Pay Vendor'],['history','History']].map(([k,l]) => (
          <button key={k} onClick={() => { setTab(k); setError('') }}
            className={`flex-1 py-2.5 text-xs font-semibold ${tab===k?'text-orange-500 border-b-2 border-orange-500':'text-gray-400'}`}>
            {l}
          </button>
        ))}
      </div>

      <div className="p-4 space-y-3">
        {error && <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl p-3">{error}</div>}

        {/* LEDGER */}
        {tab === 'ledger' && (
          loading ? <div className="text-center py-12 text-gray-400">⏳ Loading...</div>
          : vendorList.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <div className="text-4xl mb-2">🧾</div>
              <p>No vendor accounts yet.</p>
              <button onClick={() => setTab('invoice')} className="mt-3 bg-orange-500 text-white px-4 py-2 rounded-xl text-sm font-bold">+ Add Invoice</button>
            </div>
          ) : <>
            {/* Total outstanding */}
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
                      {outstanding > 0 ? `Owes ${formatINR(outstanding)}` : '✅ Cleared'}
                    </span>
                  </div>
                  <div className="mt-2 mb-1 bg-gray-100 rounded-full h-2">
                    <div className="bg-green-500 h-2 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="grid grid-cols-3 gap-1 text-xs text-gray-500 mt-2 text-center">
                    <div><p className="font-bold text-gray-700">{formatINR(v.invoiced)}</p><p>Invoiced</p></div>
                    <div><p className="font-bold text-green-600">{formatINR(v.paid)}</p><p>Paid</p></div>
                    <div><p className={`font-bold ${outstanding > 0 ? 'text-red-500' : 'text-green-500'}`}>{formatINR(outstanding)}</p><p>Outstanding</p></div>
                  </div>
                  <button onClick={() => { setPayForm(p => ({ ...p, vendorName: v.name })); setTab('payment') }}
                    className="mt-3 w-full border border-orange-300 text-orange-500 text-sm font-bold py-2 rounded-xl">
                    💵 Record Payment
                  </button>
                </div>
              )
            })}
          </>
        )}

        {/* ADD INVOICE */}
        {tab === 'invoice' && <>
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-1">Log New Invoice / Shipment</div>
          <div className="bg-white border border-gray-200 rounded-xl p-3">
            <label className="text-xs text-gray-500 block mb-1">📅 Date</label>
            <input type="date" value={invoiceForm.date} onChange={e => setInvoiceForm(p=>({...p,date:e.target.value}))}
              className="w-full text-lg font-bold text-gray-800 outline-none bg-transparent" />
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-3">
            <label className="text-xs text-gray-500 block mb-1">🏪 Vendor Name</label>
            <input type="text" value={invoiceForm.vendorName} placeholder="e.g. Sharma Cement Depot"
              onChange={e => setInvoiceForm(p=>({...p,vendorName:e.target.value}))}
              className="w-full text-lg font-bold text-gray-800 outline-none bg-transparent" />
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-3">
            <label className="text-xs text-gray-500 block mb-2">🧱 Material</label>
            <div className="flex flex-wrap gap-2">
              {MATERIALS.map(m => (
                <button key={m} onClick={() => selectMaterial(m)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold ${invoiceForm.material===m?'bg-orange-500 text-white':'bg-gray-100 text-gray-600'}`}>
                  {m}
                </button>
              ))}
            </div>
          </div>
          {invoiceForm.material !== 'Other' && (
            <div className="bg-teal-50 border border-teal-200 rounded-xl p-3">
              <label className="text-xs text-teal-700 font-semibold block mb-1">📦 Quantity received (adds to Material Stock)</label>
              <div className="flex items-center gap-2">
                <input type="number" inputMode="decimal" value={invoiceForm.quantity} placeholder="0"
                  onChange={e => setInvoiceForm(p => ({ ...p, quantity: e.target.value }))}
                  className="flex-1 text-2xl font-bold text-gray-800 outline-none bg-transparent" />
                <span className="text-sm font-bold text-teal-600 shrink-0">{invoiceForm.unit}</span>
              </div>
              <p className="text-xs text-teal-600 mt-1">Required for automatic stock increase in Stock → Materials</p>
            </div>
          )}
          <div className="bg-white border border-gray-200 rounded-xl p-3">
            <label className="text-xs text-gray-500 block mb-1">💰 Invoice Amount (₹)</label>
            <input type="number" inputMode="decimal" value={invoiceForm.amount} placeholder="0"
              onChange={e => setInvoiceForm(p=>({...p,amount:e.target.value}))}
              className="w-full text-2xl font-bold text-gray-800 outline-none bg-transparent" />
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-3">
            <label className="text-xs text-gray-500 block mb-1">📝 Notes</label>
            <input type="text" value={invoiceForm.notes} placeholder="e.g. 50 bags cement delivered"
              onChange={e => setInvoiceForm(p=>({...p,notes:e.target.value}))}
              className="w-full text-base text-gray-800 outline-none bg-transparent" />
          </div>
          <button onClick={handleInvoice} disabled={saving}
            className="w-full bg-orange-500 disabled:bg-orange-300 text-white font-bold py-4 rounded-xl text-lg">
            {saving ? '⏳ Saving...' : '💾 Save Invoice'}
          </button>
        </>}

        {/* PAYMENT */}
        {tab === 'payment' && <>
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-1">Record Vendor Payment</div>
          <div className="bg-white border border-gray-200 rounded-xl p-3">
            <label className="text-xs text-gray-500 block mb-1">📅 Date</label>
            <input type="date" value={payForm.date} onChange={e => setPayForm(p=>({...p,date:e.target.value}))}
              className="w-full text-lg font-bold text-gray-800 outline-none bg-transparent" />
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-3">
            <label className="text-xs text-gray-500 block mb-2">🏪 Vendor</label>
            {vendorList.length > 0 ? (
              <select value={payForm.vendorName} onChange={e => setPayForm(p=>({...p,vendorName:e.target.value}))}
                className="w-full text-base font-bold text-gray-800 outline-none bg-transparent">
                <option value="">— Select Vendor —</option>
                {vendorList.map(v => <option key={v.name} value={v.name}>{v.name} (owes {formatINR(Math.max(0,v.invoiced-v.paid))})</option>)}
              </select>
            ) : (
              <input type="text" value={payForm.vendorName} placeholder="Vendor name"
                onChange={e => setPayForm(p=>({...p,vendorName:e.target.value}))}
                className="w-full text-lg font-bold text-gray-800 outline-none bg-transparent" />
            )}
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-3">
            <label className="text-xs text-gray-500 block mb-1">💸 Payment Amount (₹)</label>
            <input type="number" inputMode="decimal" value={payForm.amount} placeholder="0"
              onChange={e => setPayForm(p=>({...p,amount:e.target.value}))}
              className="w-full text-2xl font-bold text-gray-800 outline-none bg-transparent" />
          </div>

          {/* Account source — syncs to CashFlow */}
          <div className="bg-white border border-gray-200 rounded-xl p-3">
            <label className="text-xs text-gray-500 block mb-2">🏦 Pay From Which Account?</label>
            <div className="grid grid-cols-2 gap-2">
              {[['Factory','🏭 Factory Account'],['External','💼 External / Owner']].map(([k,l]) => (
                <button key={k} onClick={() => setPayForm(p=>({...p,source:k}))}
                  className={`py-3 rounded-xl text-xs font-bold transition-all
                    ${payForm.source===k ? 'bg-orange-500 text-white shadow-md shadow-orange-200' : 'bg-gray-50 border border-gray-200 text-gray-600'}`}>
                  {l}
                </button>
              ))}
            </div>
            {payForm.amount > 0 && (
              <p className="text-xs text-orange-600 mt-2 font-semibold">
                {formatINR(payForm.amount)} will be deducted from <strong>{payForm.source}</strong> account in Cash Flow
              </p>
            )}
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-3">
            <label className="text-xs text-gray-500 block mb-1">📝 Notes</label>
            <input type="text" value={payForm.notes} placeholder="Payment reference..."
              onChange={e => setPayForm(p=>({...p,notes:e.target.value}))}
              className="w-full text-base text-gray-800 outline-none bg-transparent" />
          </div>
          <button onClick={handlePayment} disabled={saving}
            className="w-full bg-green-500 disabled:bg-green-300 text-white font-bold py-4 rounded-xl text-lg shadow-lg shadow-green-200">
            {saving ? '⏳ Saving...' : '✅ Record Payment + Deduct from Cash Flow'}
          </button>
        </>}

        {/* HISTORY */}
        {tab === 'history' && (
          loading ? <div className="text-center py-8 text-gray-400">⏳ Loading...</div>
          : [...rows].reverse().map((r, i) => (
            <div key={i} className="bg-white border border-gray-100 rounded-xl p-3 mb-2">
              <div className="flex justify-between items-center">
                <span className="font-bold text-gray-800">{r.VendorName}</span>
                <span className={`text-sm font-bold ${r.Type==='Payment'?'text-green-500':'text-red-400'}`}>
                  {r.Type==='Payment'?'Paid':'Invoice'} {formatINR(r.Amount)}
                </span>
              </div>
              <div className="text-xs text-gray-400 mt-1 flex flex-wrap gap-3">
                <span>{r.Date}</span>
                {r.Material && <span>{r.Material}</span>}
                {r.Quantity && <span className="text-teal-600 font-semibold">+{r.Quantity} {r.Unit || ''}</span>}
                {r.Notes && <span>{r.Notes}</span>}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
