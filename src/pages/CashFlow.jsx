import React, { useState, useEffect } from 'react'
import { useApp } from '../App.jsx'
import { loadCashFlow } from '../lib/sheets.js'
import { formatINR, today } from '../lib/formulas.js'
import { confirmDuplicateSave } from '../lib/safety.js'

const SOURCES = ['Factory', 'External']

function SummaryCard({ label, amount, color }) {
  return (
    <div className={`rounded-xl p-3 border ${color}`}>
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-xl font-bold text-gray-800">{formatINR(amount)}</p>
    </div>
  )
}

async function saveCashFlowViaBackend(entry, accessToken, force = false) {
  const token = sessionStorage.getItem('gToken') || accessToken
  if (!token) throw new Error('Session expired. Please sign in again.')

  const res = await fetch('/api/cash-flow', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ entry: { ...entry, force } }),
  })

  const payload = await res.json().catch(() => ({}))
  if (payload.duplicate) {
    return { duplicate: true, message: payload.message }
  }

  if (!res.ok || !payload.ok) {
    const message = payload.message || 'Cash entry save failed.'
    if (res.status === 401) throw new Error(`Session expired or invalid login. ${message}`)
    if (res.status === 403) throw new Error(`Access denied. ${message}`)
    if (payload.code === 'INVALID_CASH_ENTRY' || payload.code === 'INVALID_AMOUNT') {
      throw new Error(`Invalid cash entry. ${message}`)
    }
    if (payload.code === 'CASH_FLOW_SAVE_FAILED') {
      throw new Error(`Backend not configured or cash entry save failed. ${message}`)
    }
    throw new Error(message)
  }

  return payload
}

async function saveVendorLedgerViaBackend(entry, accessToken, force = false) {
  const token = sessionStorage.getItem('gToken') || accessToken
  if (!token) throw new Error('Session expired. Please sign in again.')

  const res = await fetch('/api/vendors', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ entry: { ...entry, force }, skipCashFlow: true }),
  })

  const payload = await res.json().catch(() => ({}))
  if (payload.duplicate) return { duplicate: true, message: payload.message }

  if (!res.ok || !payload.ok) {
    const message = payload.message || 'Vendor ledger sync failed.'
    if (res.status === 401) throw new Error(`Session expired or invalid login. ${message}`)
    if (res.status === 403) throw new Error(`Access denied. ${message}`)
    if (payload.code === 'INVALID_VENDOR_ENTRY' || payload.code === 'INVALID_AMOUNT') {
      throw new Error(`Invalid vendor entry. ${message}`)
    }
    if (payload.code === 'VENDOR_SAVE_FAILED') {
      throw new Error(`Backend not configured or vendor ledger sync failed. ${message}`)
    }
    throw new Error(message)
  }

  return payload
}

export default function CashFlow() {
  const { accessToken } = useApp()
  const [tab,     setTab]     = useState('dashboard')
  const [rows,    setRows]    = useState([])
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [refresh, setRefresh] = useState(0)
  const [error,   setError]   = useState('')

  const [inForm, setInForm] = useState({ date: today(), source: 'Factory', amount: '', description: '' })
  const [outForm, setOutForm] = useState({ date: today(), source: 'Factory', amount: '', description: '', vendorName: '' })
  const [isVendorPayment, setIsVendorPayment] = useState(false)

  const fetchData = async () => {
    setLoading(true)
    try { setRows(await loadCashFlow(accessToken)) }
    catch (e) { setError('Load failed: ' + e.message) }
    setLoading(false)
  }
  useEffect(() => { fetchData() }, [refresh])

  // Compute summaries
  const summary = SOURCES.reduce((acc, src) => {
    acc[src] = {
      in:  rows.filter(r => r.Type === 'In'  && r.Source === src).reduce((s,r) => s + (parseFloat(r.Amount)||0), 0),
      out: rows.filter(r => r.Type === 'Out' && r.Source === src).reduce((s,r) => s + (parseFloat(r.Amount)||0), 0),
    }
    acc[src].net = acc[src].in - acc[src].out
    return acc
  }, {})
  const totalIn  = Object.values(summary).reduce((s,v) => s + v.in,  0)
  const totalOut = Object.values(summary).reduce((s,v) => s + v.out, 0)
  const totalNet = totalIn - totalOut

  const handleIn = async () => {
    if (saving) return
    if (!inForm.amount || !inForm.description) { setError('Amount and description required.'); return }
    setSaving(true); setError('')
    try {
      const entry = { ...inForm, type: 'In', amount: parseFloat(inForm.amount), vendorName: '' }
      const result = await saveCashFlowViaBackend(entry, accessToken)

      if (result.duplicate) {
        if (!confirmDuplicateSave('cash in entry', 1)) {
          setSaving(false)
          return
        }
        await saveCashFlowViaBackend(entry, accessToken, true)
      }

      setRefresh(v => v+1)
      setInForm({ date: today(), source: 'Factory', amount: '', description: '' })
      setTab('dashboard')
    } catch (e) { setError('Save failed: ' + e.message) }
    setSaving(false)
  }

  const handleOut = async () => {
    if (saving) return
    if (!outForm.amount || !outForm.description) { setError('Amount and description required.'); return }
    setSaving(true); setError('')
    try {
      const entry = { ...outForm, type: 'Out', amount: parseFloat(outForm.amount) }
      const result = await saveCashFlowViaBackend(entry, accessToken)

      if (result.duplicate) {
        if (!confirmDuplicateSave('cash out entry', 1)) {
          setSaving(false)
          return
        }
        await saveCashFlowViaBackend(entry, accessToken, true)
      }

      // If vendor payment, also sync to vendor ledger
      if (isVendorPayment && outForm.vendorName) {
        const vendorEntry = {
          date: outForm.date, vendorName: outForm.vendorName, material: '',
          type: 'Payment', amount: entry.amount, notes: outForm.description
        }
        const vendorResult = await saveVendorLedgerViaBackend(vendorEntry, accessToken)
        if (vendorResult.duplicate) {
          if (!confirmDuplicateSave('vendor payment', 1)) {
            setSaving(false)
            return
          }
          await saveVendorLedgerViaBackend(vendorEntry, accessToken, true)
        }
      }
      setRefresh(v => v+1)
      setOutForm({ date: today(), source: 'Factory', amount: '', description: '', vendorName: '' })
      setIsVendorPayment(false)
      setTab('dashboard')
    } catch (e) { setError('Save failed: ' + e.message) }
    setSaving(false)
  }

  return (
    <div className="max-w-lg mx-auto">
      <div className="bg-white px-4 py-3 border-b border-gray-100 sticky top-12 z-10">
        <h1 className="text-lg font-bold text-gray-800"> Cash Flow</h1>
        <p className="text-xs text-gray-400">Track money in and out across Factory & External</p>
      </div>
      <div className="flex bg-white border-b border-gray-100 sticky top-[calc(3rem+4rem)] z-10">
        {[['dashboard','Dashboard'],['in','Cash In'],['out','Cash Out'],['history','History']].map(([k,l]) => (
          <button key={k} onClick={() => { setTab(k); setError('') }}
            className={`flex-1 py-2.5 text-xs font-semibold ${tab===k?'text-orange-500 border-b-2 border-orange-500':'text-gray-400'}`}>
            {l}
          </button>
        ))}
      </div>

      <div className="p-4 space-y-3">
        {error && <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl p-3">{error}</div>}

        {/* DASHBOARD */}
        {tab === 'dashboard' && (
          loading ? <div className="text-center py-12 text-gray-400"> Loading...</div> : <>
            <div className="bg-orange-500 rounded-2xl p-4 text-white">
              <p className="text-sm opacity-80 mb-1">Net Available Balance</p>
              <p className="text-4xl font-bold">{formatINR(totalNet)}</p>
              <div className="flex gap-4 mt-3 text-sm">
                <span>↑ In: {formatINR(totalIn)}</span>
                <span>↓ Out: {formatINR(totalOut)}</span>
              </div>
            </div>

            {SOURCES.map(src => (
              <div key={src} className="bg-white border border-gray-100 rounded-xl p-4">
                <p className="font-bold text-gray-700 mb-3">
                  {src === 'Factory' ? ' Factory Account' : ' External (Owner) Account'}
                </p>
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="bg-green-50 rounded-xl p-2">
                    <p className="text-green-600 font-bold text-base">{formatINR(summary[src].in)}</p>
                    <p className="text-gray-400">Cash In</p>
                  </div>
                  <div className="bg-red-50 rounded-xl p-2">
                    <p className="text-red-500 font-bold text-base">{formatINR(summary[src].out)}</p>
                    <p className="text-gray-400">Cash Out</p>
                  </div>
                  <div className={`rounded-xl p-2 ${summary[src].net >= 0 ? 'bg-blue-50' : 'bg-red-50'}`}>
                    <p className={`font-bold text-base ${summary[src].net >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                      {formatINR(summary[src].net)}
                    </p>
                    <p className="text-gray-400">Balance</p>
                  </div>
                </div>
              </div>
            ))}

            <div className="flex gap-2">
              <button onClick={() => setTab('in')} className="flex-1 bg-green-500 text-white font-bold py-3 rounded-xl">+ Cash In</button>
              <button onClick={() => setTab('out')} className="flex-1 bg-red-500 text-white font-bold py-3 rounded-xl">- Cash Out</button>
            </div>
          </>
        )}

        {/* CASH IN */}
        {tab === 'in' && <>
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-1">Record Cash In</div>
          <div className="bg-white border border-gray-200 rounded-xl p-3">
            <label className="text-xs text-gray-500 block mb-1"> Date</label>
            <input type="date" value={inForm.date} onChange={e => setInForm(p=>({...p,date:e.target.value}))}
              className="w-full text-lg font-bold text-gray-800 outline-none bg-transparent" />
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-3">
            <label className="text-xs text-gray-500 block mb-2"> Source</label>
            <div className="grid grid-cols-2 gap-2">
              {SOURCES.map(s => (
                <button key={s} onClick={() => setInForm(p=>({...p,source:s}))}
                  className={`py-3 rounded-xl font-bold text-sm ${inForm.source===s?'bg-orange-500 text-white':'bg-gray-100 text-gray-600'}`}>
                  {s === 'Factory' ? ' Factory Revenue' : ' Owner Capital'}
                </button>
              ))}
            </div>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-3">
            <label className="text-xs text-gray-500 block mb-1"> Amount (₹)</label>
            <input type="number" inputMode="decimal" value={inForm.amount} placeholder="0"
              onChange={e => setInForm(p=>({...p,amount:e.target.value}))}
              className="w-full text-2xl font-bold text-gray-800 outline-none bg-transparent" />
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-3">
            <label className="text-xs text-gray-500 block mb-1"> Description</label>
            <input type="text" value={inForm.description} placeholder="e.g. Payment from Ramesh Patel"
              onChange={e => setInForm(p=>({...p,description:e.target.value}))}
              className="w-full text-base text-gray-800 outline-none bg-transparent" />
          </div>
          <button onClick={handleIn} disabled={saving}
            className="w-full bg-green-500 disabled:bg-green-300 text-white font-bold py-4 rounded-xl text-lg">
            {saving ? ' Saving...' : ' Record Cash In'}
          </button>
        </>}

        {/* CASH OUT */}
        {tab === 'out' && <>
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-1">Record Cash Out</div>
          <div className="bg-white border border-gray-200 rounded-xl p-3">
            <label className="text-xs text-gray-500 block mb-1"> Date</label>
            <input type="date" value={outForm.date} onChange={e => setOutForm(p=>({...p,date:e.target.value}))}
              className="w-full text-lg font-bold text-gray-800 outline-none bg-transparent" />
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-3">
            <label className="text-xs text-gray-500 block mb-2"> Paid From</label>
            <div className="grid grid-cols-2 gap-2">
              {SOURCES.map(s => (
                <button key={s} onClick={() => setOutForm(p=>({...p,source:s}))}
                  className={`py-3 rounded-xl font-bold text-sm ${outForm.source===s?'bg-orange-500 text-white':'bg-gray-100 text-gray-600'}`}>
                  {s === 'Factory' ? ' Factory' : ' External'}
                </button>
              ))}
            </div>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-3">
            <label className="text-xs text-gray-500 block mb-1"> Amount (₹)</label>
            <input type="number" inputMode="decimal" value={outForm.amount} placeholder="0"
              onChange={e => setOutForm(p=>({...p,amount:e.target.value}))}
              className="w-full text-2xl font-bold text-gray-800 outline-none bg-transparent" />
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-3">
            <label className="text-xs text-gray-500 block mb-1"> Description</label>
            <input type="text" value={outForm.description} placeholder="e.g. Cement payment to Sharma"
              onChange={e => setOutForm(p=>({...p,description:e.target.value}))}
              className="w-full text-base text-gray-800 outline-none bg-transparent" />
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">Is this a Vendor Payment?</label>
              <button onClick={() => setIsVendorPayment(v=>!v)}
                className={`w-12 h-6 rounded-full transition-colors ${isVendorPayment?'bg-orange-500':'bg-gray-300'}`}>
                <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform mx-0.5 ${isVendorPayment?'translate-x-6':''}`} />
              </button>
            </div>
            {isVendorPayment && (
              <input type="text" value={outForm.vendorName} placeholder="Vendor name (syncs to Vendor Ledger)"
                onChange={e => setOutForm(p=>({...p,vendorName:e.target.value}))}
                className="w-full text-base text-gray-800 outline-none bg-transparent mt-2 border-t border-gray-100 pt-2" />
            )}
          </div>
          <button onClick={handleOut} disabled={saving}
            className="w-full bg-red-500 disabled:bg-red-300 text-white font-bold py-4 rounded-xl text-lg">
            {saving ? ' Saving...' : ' Record Cash Out'}
          </button>
        </>}

        {/* HISTORY */}
        {tab === 'history' && (
          loading ? <div className="text-center py-8 text-gray-400"> Loading...</div>
          : [...rows].reverse().map((r, i) => (
            <div key={i} className="bg-white border border-gray-100 rounded-xl p-3 mb-2">
              <div className="flex justify-between items-center">
                <span className="text-sm font-bold text-gray-700">{r.Description}</span>
                <span className={`text-sm font-bold ${r.Type==='In'?'text-green-500':'text-red-500'}`}>
                  {r.Type==='In'?'+':'-'}{formatINR(r.Amount)}
                </span>
              </div>
              <div className="flex gap-3 mt-1 text-xs text-gray-400">
                <span>{r.Date}</span>
                <span>{r.Source}</span>
                {r.VendorName && <span>→ {r.VendorName}</span>}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
