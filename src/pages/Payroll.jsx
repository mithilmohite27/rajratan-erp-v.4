import React, { useState, useEffect } from 'react'
import { useApp } from '../App.jsx'
import { loadPayroll, loadProduction } from '../lib/sheets.js'
import { formatINR, today } from '../lib/formulas.js'
import { confirmDuplicateSave } from '../lib/safety.js'

// Labour cost = auto-calculated from Production_Log (LabourCost column)
// Advance = manual entry, synced to CashFlow with account source

async function savePayrollViaBackend(entry, accessToken, force = false) {
  const token = sessionStorage.getItem('gToken') || accessToken
  if (!token) throw new Error('Session expired. Please sign in again.')

  const res = await fetch('/api/payroll', {
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
    const message = payload.message || 'Payroll entry save failed.'
    if (res.status === 401) throw new Error(`Session expired or invalid login. ${message}`)
    if (res.status === 403) throw new Error(`Access denied. ${message}`)
    if (payload.code === 'INVALID_PAYROLL_ENTRY' || payload.code === 'INVALID_AMOUNT') {
      throw new Error(`Invalid payroll entry. ${message}`)
    }
    if (payload.code === 'PAYROLL_SAVE_FAILED') {
      throw new Error(`Backend not configured or payroll save failed. ${message}`)
    }
    throw new Error(message)
  }

  return payload
}

export default function Payroll() {
  const { accessToken, config } = useApp()
  const [tab,      setTab]      = useState('workers')
  const [rows,     setRows]     = useState([])
  const [prodRows, setProdRows] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [refresh,  setRefresh]  = useState(0)
  const [error,    setError]    = useState('')
  const [success,  setSuccess]  = useState('')

  const wageRate = parseFloat(config.labourRate) || 1.80

  const [advForm, setAdvForm] = useState({
    date: today(), workerName: '', amount: '', source: 'Factory', notes: ''
  })

  const fetchData = async () => {
    setLoading(true)
    try {
      const [pay, prod] = await Promise.all([
        loadPayroll(accessToken),
        loadProduction(accessToken).catch(() => [])
      ])
      setRows(pay)
      setProdRows(prod)
    } catch (e) { setError('Load failed: ' + e.message) }
    setLoading(false)
  }
  useEffect(() => { fetchData() }, [refresh])

  // ── Auto labour cost from Production_Log ──────
  // Production_Log stores LabourCost per day — sum these as "earned"
  const totalAutoLabour = prodRows.reduce((s, r) => s + (parseFloat(r.LabourCost) || 0), 0)
  const totalBlocks     = prodRows.reduce((s, r) => s + (parseFloat(r.Blocks) || 0), 0)

  // ── Manual advances from Payroll_Log ──────────
  const workers = rows.reduce((acc, r) => {
    const name = r.WorkerName
    if (!name) return acc
    if (!acc[name]) acc[name] = { name, totalAdvance: 0, entries: [] }
    if (r.Type === 'Advance') acc[name].totalAdvance += parseFloat(r.Amount) || 0
    acc[name].entries.push(r)
    return acc
  }, {})
  const workerList    = Object.values(workers)
  const totalAdvanced = workerList.reduce((s, w) => s + w.totalAdvance, 0)
  // Net owed = total auto labour - total advances paid
  const netOwed = Math.max(0, totalAutoLabour - totalAdvanced)

  const flash = msg => { setSuccess(msg); setTimeout(() => setSuccess(''), 3000) }

  // ── Save advance — also syncs to CashFlow ─────
  const handleAdvance = async () => {
    if (saving) return
    if (!advForm.workerName || !advForm.amount) { setError('Worker name and amount required.'); return }
    setSaving(true); setError('')
    try {
      const amount = parseFloat(advForm.amount)
      const entry = {
        date:       advForm.date,
        workerName: advForm.workerName,
        type:       'Advance',
        blocks:     0,
        wageRate:   0,
        amount:     parseFloat(advForm.amount),
        notes:      advForm.notes || `Advance - ${advForm.source} account`,
        source:     advForm.source,
      }
      const result = await savePayrollViaBackend(entry, accessToken)

      if (result.duplicate) {
        if (!confirmDuplicateSave('payroll advance', 1)) {
          setSaving(false)
          return
        }
        await savePayrollViaBackend(entry, accessToken, true)
      }

      setRefresh(v => v + 1)
      setAdvForm({ date: today(), workerName: '', amount: '', source: 'Factory', notes: '' })
      flash(`✅ Advance saved + ${advForm.source} account debited!`)
      setTab('workers')
    } catch (e) { setError('Save failed: ' + e.message) }
    setSaving(false)
  }

  return (
    <div className="max-w-lg mx-auto">
      <div className="px-4 pt-4 pb-2">
        <h1 className="text-2xl font-bold text-gray-900">Payroll</h1>
        <p className="text-sm text-gray-400 mt-0.5">Auto labour cost · Advance ledger · Cash sync</p>
      </div>

      <div className="flex gap-1.5 px-4 mb-4">
        {[['workers','👷 Workers'],['advance','+ Advance'],['history','History']].map(([k,l]) => (
          <button key={k} onClick={() => { setTab(k); setError('') }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all
              ${tab===k ? 'bg-orange-500 text-white shadow-md shadow-orange-200' : 'bg-white border border-gray-200 text-gray-500'}`}>
            {l}
          </button>
        ))}
      </div>

      <div className="px-4 space-y-3 pb-6">
        {error   && <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-2xl p-3">{error}</div>}
        {success && <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-2xl p-3 font-semibold text-center">{success}</div>}

        {/* ── WORKERS OVERVIEW ── */}
        {tab === 'workers' && (
          loading ? <div className="text-center py-16 text-gray-400">⏳ Loading...</div> : <>

            {/* Summary hero */}
            <div className="bg-orange-500 rounded-2xl p-5 text-white shadow-lg shadow-orange-200">
              <p className="text-sm opacity-80">Net Payable to Labour</p>
              <p className="text-4xl font-black mt-1">{formatINR(netOwed)}</p>
              <p className="text-xs opacity-70 mt-1">Total Earned − Total Advances Paid</p>
              <div className="grid grid-cols-3 gap-2 mt-4 text-center text-xs">
                <div className="bg-white/20 rounded-xl p-2">
                  <p className="font-bold text-sm">{formatINR(totalAutoLabour)}</p>
                  <p className="opacity-70">Auto Earned</p>
                </div>
                <div className="bg-white/20 rounded-xl p-2">
                  <p className="font-bold text-sm">{formatINR(totalAdvanced)}</p>
                  <p className="opacity-70">Advances Paid</p>
                </div>
                <div className="bg-white/20 rounded-xl p-2">
                  <p className="font-bold text-sm">{totalBlocks.toLocaleString('en-IN')}</p>
                  <p className="opacity-70">Blocks Made</p>
                </div>
              </div>
            </div>

            {/* Auto labour note */}
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-3">
              <p className="text-xs font-bold text-blue-600 mb-1">⚡ Auto Labour Calculation</p>
              <p className="text-xs text-gray-600">
                Labour cost is calculated automatically from daily production at <strong>₹{wageRate}/block</strong>.
                No manual wage entry needed — just save production daily and this updates automatically.
              </p>
            </div>

            {/* Per-worker advance summary */}
            {workerList.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <div className="text-4xl mb-2">👷</div>
                <p>No advance payments yet.</p>
                <button onClick={() => setTab('advance')}
                  className="mt-3 bg-orange-500 text-white px-4 py-2 rounded-xl text-sm font-bold">
                  + Record Advance
                </button>
              </div>
            ) : workerList.map((w, i) => (
              <div key={i} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
                <div className="flex justify-between items-center mb-3">
                  <p className="font-bold text-gray-800 text-base">{w.name}</p>
                  <span className="text-xs bg-yellow-100 text-yellow-700 font-bold px-2 py-1 rounded-full">
                    Advance: {formatINR(w.totalAdvance)}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs text-center">
                  <div className="bg-green-50 rounded-xl p-2">
                    <p className="font-bold text-green-600 text-sm">{formatINR(totalAutoLabour)}</p>
                    <p className="text-gray-400">Total Earned</p>
                  </div>
                  <div className="bg-yellow-50 rounded-xl p-2">
                    <p className="font-bold text-yellow-600 text-sm">{formatINR(w.totalAdvance)}</p>
                    <p className="text-gray-400">Advances</p>
                  </div>
                  <div className="bg-orange-50 rounded-xl p-2">
                    <p className="font-bold text-orange-600 text-sm">{formatINR(Math.max(0, totalAutoLabour - w.totalAdvance))}</p>
                    <p className="text-gray-400">Net Owed</p>
                  </div>
                </div>
                <button onClick={() => { setAdvForm(p => ({ ...p, workerName: w.name })); setTab('advance') }}
                  className="mt-3 w-full border border-orange-200 text-orange-500 text-sm font-bold py-2 rounded-xl">
                  + Record Advance
                </button>
              </div>
            ))}
          </>
        )}

        {/* ── ADVANCE TAB ── */}
        {tab === 'advance' && <>
          <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-3">
            <p className="text-xs font-bold text-yellow-700 mb-0.5">💰 Advance (Upad) Payment</p>
            <p className="text-xs text-gray-500">This payment will be deducted from the selected account in Cash Flow automatically.</p>
          </div>

          {/* Date */}
          <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide block mb-2">📅 Date</label>
            <input type="date" value={advForm.date}
              onChange={e => setAdvForm(p => ({ ...p, date: e.target.value }))}
              className="w-full text-lg font-bold text-gray-800 outline-none bg-transparent" />
          </div>

          {/* Worker */}
          <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide block mb-2">👤 Worker Name</label>
            {workerList.length > 0 ? (
              <select value={advForm.workerName}
                onChange={e => setAdvForm(p => ({ ...p, workerName: e.target.value }))}
                className="w-full text-base font-bold text-gray-800 outline-none bg-transparent mb-2">
                <option value="">— Select Worker —</option>
                {workerList.map(w => <option key={w.name} value={w.name}>{w.name}</option>)}
              </select>
            ) : null}
            <input type="text" value={advForm.workerName}
              placeholder={workerList.length > 0 ? "Or type new worker name" : "e.g. Nimesh Bhai"}
              onChange={e => setAdvForm(p => ({ ...p, workerName: e.target.value }))}
              className="w-full text-base font-bold text-gray-800 outline-none bg-transparent border-t border-gray-100 pt-2" />
          </div>

          {/* Amount */}
          <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide block mb-2">💵 Advance Amount (₹)</label>
            <input type="number" inputMode="decimal" value={advForm.amount} placeholder="0"
              onChange={e => setAdvForm(p => ({ ...p, amount: e.target.value }))}
              className="w-full text-4xl font-bold text-gray-800 outline-none bg-transparent" />
          </div>

          {/* Account source — KEY FEATURE */}
          <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide block mb-3">
              🏦 Pay From Which Account?
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { key: 'Factory',  label: '🏭 Factory Account',      sub: 'Factory revenue funds' },
                { key: 'External', label: '💼 External / Owner',      sub: 'Owner capital funds'   },
              ].map(opt => (
                <button key={opt.key}
                  onClick={() => setAdvForm(p => ({ ...p, source: opt.key }))}
                  className={`p-3 rounded-2xl border text-left transition-all
                    ${advForm.source === opt.key
                      ? 'bg-orange-500 border-orange-500 text-white shadow-lg shadow-orange-200'
                      : 'bg-gray-50 border-gray-200 text-gray-600'}`}>
                  <p className="text-sm font-bold">{opt.label}</p>
                  <p className={`text-xs mt-0.5 ${advForm.source === opt.key ? 'text-orange-100' : 'text-gray-400'}`}>
                    {opt.sub}
                  </p>
                </button>
              ))}
            </div>
            {advForm.amount > 0 && (
              <div className={`mt-3 rounded-xl p-3 text-xs font-semibold
                ${advForm.source === 'Factory' ? 'bg-orange-50 text-orange-700' : 'bg-blue-50 text-blue-700'}`}>
                ₹{parseFloat(advForm.amount || 0).toLocaleString('en-IN')} will be deducted from{' '}
                <strong>{advForm.source === 'Factory' ? 'Factory' : 'External/Owner'}</strong> account balance
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="bg-white border border-gray-100 rounded-2xl p-3 shadow-sm">
            <input type="text" value={advForm.notes} placeholder="📝 Notes (optional)"
              onChange={e => setAdvForm(p => ({ ...p, notes: e.target.value }))}
              className="w-full text-sm text-gray-700 outline-none bg-transparent" />
          </div>

          <button onClick={handleAdvance} disabled={saving}
            className="w-full bg-yellow-500 disabled:bg-yellow-300 text-white font-bold py-4 rounded-2xl text-base shadow-lg shadow-yellow-200 active:scale-95 transition-all">
            {saving ? '⏳ Saving...' : '💰 Record Advance + Deduct from Cash Flow'}
          </button>
        </>}

        {/* ── HISTORY ── */}
        {tab === 'history' && (
          loading ? <div className="text-center py-8 text-gray-400">⏳ Loading...</div>
          : rows.length === 0
            ? <div className="text-center py-16 text-gray-400"><div className="text-4xl mb-2">📋</div><p>No advance entries yet.</p></div>
            : [...rows].reverse().map((r, i) => (
              <div key={i} className="bg-white border border-gray-100 rounded-2xl p-3 shadow-sm mb-2">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-gray-800">{r.WorkerName}</span>
                  <span className="text-sm font-bold text-yellow-600">{formatINR(r.Amount)}</span>
                </div>
                <div className="text-xs text-gray-400 mt-1 flex gap-3 flex-wrap">
                  <span>{r.Date}</span>
                  <span className="bg-yellow-50 text-yellow-600 px-2 py-0.5 rounded-full font-semibold">{r.Type}</span>
                  {r.Notes && <span>{r.Notes}</span>}
                </div>
              </div>
            ))
        )}
      </div>
    </div>
  )
}
