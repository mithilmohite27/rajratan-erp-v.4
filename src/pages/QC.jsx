import React, { useState, useEffect } from 'react'
import { useApp } from '../App.jsx'
import { loadQC, loadProduction } from '../lib/sheets.js'
import { formatINR, formatNum, today } from '../lib/formulas.js'
import { confirmDuplicateSave } from '../lib/safety.js'

const COLORS   = ['Red', 'Yellow', 'Black', 'White', 'All Colors']
const EMOJI    = { Red: '🔴', Yellow: '🟡', Black: '⚫', White: '⚪', 'All Colors': '🎨' }
const COLOR_BG = { Red: 'bg-red-50 border-red-200', Yellow: 'bg-yellow-50 border-yellow-200', Black: 'bg-gray-100 border-gray-300', White: 'bg-blue-50 border-blue-200', 'All Colors': 'bg-purple-50 border-purple-200' }

async function saveQCViaBackend(entry, accessToken, force = false) {
  const token = sessionStorage.getItem('gToken') || accessToken
  if (!token) throw new Error('Session expired. Please sign in again.')

  const res = await fetch('/api/qc', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ entry, force }),
  })

  const payload = await res.json().catch(() => ({}))
  if (payload.duplicate) return { duplicate: true, message: payload.message }

  if (!res.ok || !payload.ok) {
    const message = payload.message || 'QC entry save failed.'
    if (res.status === 401) throw new Error(`Session expired or invalid login. ${message}`)
    if (res.status === 403) throw new Error(`Access denied. ${message}`)
    if (payload.code === 'INVALID_QC_ENTRY' || payload.code === 'INVALID_AMOUNT') {
      throw new Error(`Invalid QC entry. ${message}`)
    }
    if (payload.code === 'QC_SAVE_FAILED') {
      throw new Error(`Backend not configured or QC save failed. ${message}`)
    }
    throw new Error(message)
  }

  return payload
}

export default function QC() {
  const { accessToken } = useApp()
  const [tab,      setTab]      = useState('log')
  const [rows,     setRows]     = useState([])
  const [prodRows, setProdRows] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [refresh,  setRefresh]  = useState(0)
  const [error,    setError]    = useState('')
  const [saved,    setSaved]    = useState(false)

  const [form, setForm] = useState({ date: today(), color: 'All Colors', brokenBlocks: '', notes: '' })

  const fetchData = async () => {
    setLoading(true)
    try {
      const [qc, prod] = await Promise.all([
        loadQC(accessToken),
        loadProduction(accessToken).catch(() => [])
      ])
      setRows(qc)
      setProdRows(prod)
    } catch (e) { setError('Load failed: ' + e.message) }
    setLoading(false)
  }
  useEffect(() => { fetchData() }, [refresh])

  const latestProd   = prodRows[prodRows.length - 1]
  const costPerBlock = latestProd
    ? ((parseFloat(latestProd.TotalDailyCost) / parseFloat(latestProd.Blocks)) || 0)
    : 0

  const brokenInput   = parseFloat(form.brokenBlocks) || 0
  const estimatedLoss = brokenInput * costPerBlock
  const totalBroken   = rows.reduce((s, r) => s + (parseFloat(r.BrokenBlocks) || 0), 0)
  const totalLoss     = rows.reduce((s, r) => s + (parseFloat(r.TotalLoss) || 0), 0)

  // Per-color breakdown
  const colorStats = ['Red','Yellow','Black','White'].map(color => ({
    color,
    broken: rows.filter(r => r.Color === color || r.Color === 'All Colors' || r.Color === 'All')
      .reduce((s, r) => {
        if (r.Color === color) return s + (parseFloat(r.BrokenBlocks) || 0)
        return s + (parseFloat(r.BrokenBlocks) || 0) / 4
      }, 0)
  }))

  const handleSave = async () => {
    if (!form.brokenBlocks) { setError('Enter number of broken blocks.'); return }
    setSaving(true); setError('')
    try {
      const entry = {
        date:         form.date,
        color:        form.color,   // ← now saved per-color for accurate inventory deduction
        brokenBlocks: parseInt(form.brokenBlocks),
        costPerBlock: formatNum(costPerBlock, 2),
        totalLoss:    formatNum(estimatedLoss, 2),
        notes:        form.notes,
      }

      const result = await saveQCViaBackend(entry, accessToken)
      if (result.duplicate) {
        if (!confirmDuplicateSave('QC entry', 1)) {
          setSaving(false)
          return
        }
        await saveQCViaBackend(entry, accessToken, true)
      }
      setRefresh(v => v + 1)
      setForm({ date: today(), color: 'All Colors', brokenBlocks: '', notes: '' })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
      setTab('summary')
    } catch (e) { setError('Save failed: ' + e.message) }
    setSaving(false)
  }

  return (
    <div className="max-w-lg mx-auto">
      {/* Header */}
      <div className="px-4 pt-4 pb-2">
        <h1 className="text-2xl font-bold text-gray-900">Quality Control</h1>
        <p className="text-sm text-gray-400 mt-0.5">Log broken blocks — auto-deducted from inventory</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-4 mb-4">
        {[['log','📝 Log'],['summary','📊 Summary'],['history','🕘 History']].map(([k,l]) => (
          <button key={k} onClick={() => { setTab(k); setError('') }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all
              ${tab===k ? 'bg-orange-500 text-white shadow-md shadow-orange-200' : 'bg-white text-gray-500 border border-gray-200'}`}>
            {l}
          </button>
        ))}
      </div>

      <div className="px-4 space-y-3">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-2xl p-3 flex items-start gap-2">
            <span>⚠️</span><span>{error}</span>
          </div>
        )}
        {saved && (
          <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-2xl p-3 text-center font-semibold">
            ✅ Breakage logged — stock updated automatically!
          </div>
        )}

        {/* ── LOG TAB ── */}
        {tab === 'log' && <>
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 flex gap-2">
            <span className="text-lg">⚠️</span>
            <p className="text-xs text-amber-700">Selecting the correct color ensures accurate per-color inventory deduction.</p>
          </div>

          {/* Date */}
          <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide block mb-2">📅 Date</label>
            <input type="date" value={form.date}
              onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
              className="w-full text-lg font-bold text-gray-800 outline-none bg-transparent" />
          </div>

          {/* Color selector — KEY SYNC FIX */}
          <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide block mb-3">Which color broke?</label>
            <div className="grid grid-cols-3 gap-2">
              {COLORS.map(c => (
                <button key={c} onClick={() => setForm(p => ({ ...p, color: c }))}
                  className={`py-2.5 rounded-xl text-xs font-bold transition-all
                    ${form.color === c
                      ? 'bg-orange-500 text-white shadow-md shadow-orange-200 scale-105'
                      : 'bg-gray-50 border border-gray-200 text-gray-600'}`}>
                  {EMOJI[c]}<br/>{c}
                </button>
              ))}
            </div>
            {form.color === 'All Colors' && (
              <p className="text-xs text-purple-600 mt-2">Broken blocks will be split equally across Red, Yellow, Black, White</p>
            )}
          </div>

          {/* Broken blocks input */}
          <div className={`border rounded-2xl p-4 shadow-sm transition-all ${brokenInput > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-gray-100'}`}>
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide block mb-2">Number of Broken Blocks</label>
            <input type="number" inputMode="numeric" value={form.brokenBlocks} placeholder="0"
              onChange={e => setForm(p => ({ ...p, brokenBlocks: e.target.value }))}
              className={`w-full text-4xl font-bold outline-none bg-transparent ${brokenInput > 0 ? 'text-red-500' : 'text-gray-300'}`} />
          </div>

          {/* Loss preview */}
          {brokenInput > 0 && (
            <div className="bg-red-500 rounded-2xl p-4 text-white text-center shadow-lg shadow-red-200">
              <p className="text-xs opacity-80 mb-1">Estimated Financial Loss</p>
              <p className="text-3xl font-bold">{formatINR(estimatedLoss)}</p>
              <p className="text-xs opacity-70 mt-1">
                {brokenInput} blocks × {formatINR(costPerBlock)}/block
                {!costPerBlock && ' · save production data first for accurate cost'}
              </p>
            </div>
          )}

          {/* Notes */}
          <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide block mb-2">Notes (optional)</label>
            <input type="text" value={form.notes} placeholder="Reason: curing issue, transport damage..."
              onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
              className="w-full text-base text-gray-700 outline-none bg-transparent" />
          </div>

          <button onClick={handleSave} disabled={saving}
            className="w-full bg-red-500 disabled:bg-red-300 text-white font-bold py-4 rounded-2xl text-base shadow-lg shadow-red-200 transition-all active:scale-95">
            {saving ? '⏳ Logging...' : `🔴 Log ${brokenInput > 0 ? brokenInput.toLocaleString('en-IN') + ' Broken ' : ''}Blocks`}
          </button>
        </>}

        {/* ── SUMMARY TAB ── */}
        {tab === 'summary' && (
          loading ? <div className="text-center py-16 text-gray-400">⏳ Loading...</div>
          : <>
            {/* Hero */}
            <div className="bg-red-500 rounded-2xl p-5 text-white shadow-lg shadow-red-200">
              <p className="text-sm opacity-80">Total Breakage Loss</p>
              <p className="text-4xl font-bold mt-1">{formatINR(totalLoss)}</p>
              <p className="text-sm opacity-80 mt-1">{totalBroken.toLocaleString('en-IN')} blocks broken total</p>
            </div>

            {/* Per-color breakdown */}
            <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Breakage by Color</p>
              <div className="grid grid-cols-2 gap-2">
                {colorStats.map(({ color, broken }) => (
                  <div key={color} className={`rounded-xl p-3 border ${COLOR_BG[color] || 'bg-gray-50 border-gray-200'}`}>
                    <p className="text-xs font-semibold text-gray-600">{EMOJI[color]} {color}</p>
                    <p className="text-lg font-bold text-gray-800 mt-1">{Math.round(broken).toLocaleString('en-IN')}</p>
                    <p className="text-xs text-gray-400">blocks</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
              <p className="text-xs text-gray-400 mb-1">Cost per block (from latest production)</p>
              <p className="text-xl font-bold text-gray-800">{formatINR(costPerBlock)}<span className="text-sm text-gray-400 font-normal"> / block</span></p>
              {latestProd && <p className="text-xs text-gray-400 mt-1">Based on {latestProd.Date} · {Number(latestProd.Blocks).toLocaleString('en-IN')} blocks</p>}
            </div>
          </>
        )}

        {/* ── HISTORY TAB ── */}
        {tab === 'history' && (
          loading ? <div className="text-center py-8 text-gray-400">⏳ Loading...</div>
          : rows.length === 0
            ? <div className="text-center py-16 text-gray-400">
                <div className="text-5xl mb-3">✅</div>
                <p className="font-semibold">No breakage recorded yet</p>
              </div>
            : [...rows].reverse().map((r, i) => (
              <div key={i} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm mb-2">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-sm font-bold text-gray-800">{r.Date}</span>
                    <span className="ml-2 text-xs bg-red-100 text-red-600 font-bold px-2 py-0.5 rounded-full">
                      {EMOJI[r.Color] || '🎨'} {r.Color}
                    </span>
                  </div>
                  <span className="text-sm font-bold text-red-500">-{formatINR(r.TotalLoss)}</span>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  {r.BrokenBlocks} blocks broken · {formatINR(r.CostPerBlock)}/block
                </p>
                {r.Notes && <p className="text-xs text-gray-400 mt-1 italic">{r.Notes}</p>}
              </div>
            ))
        )}
      </div>
    </div>
  )
}
