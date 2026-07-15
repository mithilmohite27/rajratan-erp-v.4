import React, { useState, useEffect, useCallback } from 'react'
import { useApp } from '../App.jsx'
import {
  computeMaterialInventory,
  computeMaterialInventoryDebug,
  loadExternalMaterialUsage,
} from '../lib/sheets.js'
import { MATERIAL_LIST, formatMaterialQty, unitLabel, MATERIAL_UNITS } from '../lib/materials.js'
import { today } from '../lib/formulas.js'
import { confirmDuplicateSave, confirmSheetWrite } from '../lib/safety.js'

// ── Only materials that make sense for external sale ──
const EXTERNAL_MATERIALS = MATERIAL_LIST.filter(m =>
  ['Cement', 'Greet', 'Powder', 'Chemical', 'Yellow', 'Red', 'Black', 'White', 'Reti', 'Plastic'].includes(m.id)
)

const REASONS = ['External Sale', 'Block Fitting', 'Damaged / Waste', 'Other']

async function saveOpeningMaterialViaBackend(rows, accessToken, force = false) {
  const token = sessionStorage.getItem('gToken') || accessToken
  if (!token) throw new Error('Session expired. Please sign in again.')

  const res = await fetch('/api/setup', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action: 'opening_material_stock', rows, force, confirmHighRisk: true }),
  })

  const payload = await res.json().catch(() => ({}))
  if (payload.duplicate) return { duplicate: true, ...payload }

  if (!res.ok || !payload.ok) {
    const message = payload.message || 'Opening material stock save failed.'
    if (res.status === 401) throw new Error(`Session expired or invalid login. ${message}`)
    if (res.status === 403) throw new Error(`Access denied. ${message}`)
    if (payload.code === 'MISSING_HIGH_RISK_CONFIRMATION') throw new Error(`Missing high-risk confirmation. ${message}`)
    if (payload.code === 'INVALID_OPENING_MATERIAL_ROW' || payload.code === 'INVALID_AMOUNT') throw new Error(`Invalid opening material row. ${message}`)
    if (payload.code === 'SETUP_ACTION_FAILED') throw new Error(`Backend not configured or setup action failed. ${message}`)
    throw new Error(message)
  }

  return payload
}

async function saveExternalMaterialUsageViaBackend(entry, accessToken, force = false) {
  const token = sessionStorage.getItem('gToken') || accessToken
  if (!token) throw new Error('Session expired. Please sign in again.')

  const res = await fetch('/api/material-usage', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ entry, force }),
  })

  const payload = await res.json().catch(() => ({}))
  if (payload.duplicate) return { duplicate: true, ...payload }

  if (!res.ok || !payload.ok) {
    const message = payload.message || 'External material usage save failed.'
    if (res.status === 401) throw new Error(`Session expired or invalid login. ${message}`)
    if (res.status === 403) throw new Error(`Access denied. ${message}`)
    if (payload.code === 'INVALID_MATERIAL_USAGE' || payload.code === 'INVALID_AMOUNT') {
      throw new Error(`Invalid material usage entry. ${message}`)
    }
    if (payload.code === 'MATERIAL_USAGE_SAVE_FAILED') {
      throw new Error(`Backend not configured or material usage save failed. ${message}`)
    }
    throw new Error(message)
  }

  return payload
}

function SourceRow({ label, count, ok }) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-gray-50">
      <span className="text-sm text-gray-600">{label}</span>
      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${ok ? 'bg-green-100 text-green-600' : 'bg-yellow-100 text-yellow-600'}`}>
        {ok ? ` ${count} rows` : ' Empty'}
      </span>
    </div>
  )
}

function FormulaRow({ label, value, sign, unit, color }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-50">
      <div className="flex items-center gap-2">
        <span className={`text-sm font-bold w-4 ${color}`}>{sign}</span>
        <span className="text-sm text-gray-600">{label}</span>
      </div>
      <span className="text-sm font-bold text-gray-800">
        {formatMaterialQty(value, unit)} <span className="text-xs text-gray-400 font-normal">{unitLabel(unit)}</span>
      </span>
    </div>
  )
}

function MaterialDashboardSummary({ inventory }) {
  const inStockCount = MATERIAL_LIST.filter(m => (inventory[m.id]?.stock || 0) > 0).length

  return (
    <div className="bg-teal-600 rounded-2xl p-5 text-white">
      <p className="text-sm opacity-80">Materials tracked</p>
      <p className="text-3xl font-bold mt-1">{MATERIAL_LIST.length}</p>
      <p className="text-sm opacity-80 mt-0.5">Auto-synced from Production &amp; Vendors</p>
      <p className="text-xs opacity-70 mt-1">{inStockCount} material{inStockCount !== 1 ? 's' : ''} in stock right now</p>

      <div className="mt-4 space-y-2">
        {MATERIAL_LIST.map(meta => {
          const d = inventory[meta.id] || { opening: 0, purchased: 0, consumed: 0, externalUsed: 0, stock: 0 }
          return (
            <div key={meta.id} className="bg-white/15 rounded-xl p-3 text-xs">
              <p className="font-bold text-sm mb-2">
                {meta.emoji} {meta.label}{' '}
                <span className="font-normal opacity-80">({unitLabel(meta.unit)})</span>
              </p>
              <div className="grid grid-cols-4 gap-1 text-center">
                <div className="bg-white/10 rounded-lg p-1.5">
                  <p className="font-bold text-sm leading-tight">{formatMaterialQty(d.opening, meta.unit)}</p>
                  <p className="opacity-70 text-[10px] mt-0.5">Opening</p>
                </div>
                <div className="bg-white/10 rounded-lg p-1.5">
                  <p className="font-bold text-sm leading-tight text-green-200">
                    {formatMaterialQty(d.purchased, meta.unit)}
                  </p>
                  <p className="opacity-70 text-[10px] mt-0.5">Purchased</p>
                </div>
                <div className="bg-white/10 rounded-lg p-1.5">
                  <p className="font-bold text-sm leading-tight text-orange-200">
                    {formatMaterialQty(d.consumed, meta.unit)}
                  </p>
                  <p className="opacity-70 text-[10px] mt-0.5">Used</p>
                </div>
                <div className="bg-white/25 rounded-lg p-1.5">
                  <p className="font-bold text-sm leading-tight">{formatMaterialQty(d.stock, meta.unit)}</p>
                  <p className="opacity-90 text-[10px] mt-0.5 font-semibold">In stock</p>
                </div>
              </div>
              {/* Show external used if any */}
              {d.externalUsed > 0 && (
                <div className="mt-1.5 bg-white/10 rounded-lg px-2 py-1 text-center">
                  <span className="text-[10px] opacity-80"> External out: </span>
                  <span className="text-[10px] font-bold text-red-200">{formatMaterialQty(d.externalUsed, meta.unit)} {unitLabel(meta.unit)}</span>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function MaterialTrackerTable({ inventory }) {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
      <p className="text-xs font-bold text-gray-500 uppercase tracking-wide px-3 pt-3 pb-1">
        Material tracker (name wise)
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs min-w-[340px]">
          <thead>
            <tr className="bg-teal-50 text-teal-800 border-b border-teal-100">
              <th className="text-left p-2.5 font-bold sticky left-0 bg-teal-50 z-10">Material</th>
              <th className="text-right p-2.5 font-semibold whitespace-nowrap">Opening</th>
              <th className="text-right p-2.5 font-semibold whitespace-nowrap">Purchased</th>
              <th className="text-right p-2.5 font-semibold whitespace-nowrap">Used</th>
              <th className="text-right p-2.5 font-semibold whitespace-nowrap text-red-400">External</th>
              <th className="text-right p-2.5 font-bold whitespace-nowrap">Balance</th>
            </tr>
          </thead>
          <tbody>
            {MATERIAL_LIST.map(meta => {
              const d = inventory[meta.id] || { opening: 0, purchased: 0, consumed: 0, externalUsed: 0, stock: 0 }
              const low = d.stock <= 0 && (d.opening > 0 || d.purchased > 0)
              return (
                <tr key={meta.id} className={`border-b border-gray-50 ${low ? 'bg-red-50/50' : ''}`}>
                  <td className={`p-2.5 sticky left-0 z-10 border-r border-gray-50 ${low ? 'bg-red-50/50' : 'bg-white'}`}>
                    <p className={`font-bold ${meta.color}`}>{meta.emoji} {meta.label}</p>
                    <p className="text-[10px] text-gray-400">{unitLabel(meta.unit)}</p>
                  </td>
                  <td className="text-right p-2.5 text-gray-600 tabular-nums">{formatMaterialQty(d.opening, meta.unit)}</td>
                  <td className="text-right p-2.5 text-green-600 tabular-nums">
                    {d.purchased > 0 ? `+${formatMaterialQty(d.purchased, meta.unit)}` : '—'}
                  </td>
                  <td className="text-right p-2.5 text-red-500 tabular-nums">
                    {d.consumed > 0 ? `−${formatMaterialQty(d.consumed, meta.unit)}` : '—'}
                  </td>
                  <td className="text-right p-2.5 text-orange-500 tabular-nums font-semibold">
                    {d.externalUsed > 0 ? `−${formatMaterialQty(d.externalUsed, meta.unit)}` : '—'}
                  </td>
                  <td className={`text-right p-2.5 font-bold tabular-nums ${d.stock > 0 ? 'text-gray-900' : 'text-red-500'}`}>
                    {formatMaterialQty(d.stock, meta.unit)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-gray-400 px-3 py-2 border-t border-gray-50">
        Balance = Opening + Purchased − Used (Production) − External (Sales/Personal)
      </p>
    </div>
  )
}

function MaterialCard({ meta, data }) {
  const { opening, purchased, consumed, externalUsed = 0, stock } = data
  const total = opening + purchased
  const pctUsed = total > 0 ? Math.min(100, ((consumed + externalUsed) / total) * 100) : 0

  return (
    <div className={`border rounded-2xl p-4 ${meta.bg}`}>
      <div className="flex justify-between items-start mb-3">
        <div>
          <p className={`font-bold text-base ${meta.color}`}>{meta.emoji} {meta.label}</p>
          <p className="text-xs text-gray-400">Available · {unitLabel(meta.unit)}</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-gray-800">{formatMaterialQty(stock, meta.unit)}</p>
          <p className="text-xs text-gray-400">remaining</p>
        </div>
      </div>

      <div className="bg-white/70 rounded-xl p-3">
        <FormulaRow label="Opening Stock"         value={opening}      sign="●" unit={unitLabel(meta.unit)} color="text-gray-400" />
        <FormulaRow label="+ Purchased"            value={purchased}    sign="+" unit={unitLabel(meta.unit)} color="text-green-500" />
        <FormulaRow label="− Production Used"      value={consumed}     sign="−" unit={unitLabel(meta.unit)} color="text-red-400" />
        {externalUsed > 0 && (
          <FormulaRow label="− External (Sale/Personal)" value={externalUsed} sign="−" unit={unitLabel(meta.unit)} color="text-orange-500" />
        )}
        <div className="flex justify-between pt-2">
          <span className={`text-sm font-bold ${meta.color}`}>= Balance</span>
          <span className={`text-sm font-bold ${meta.color}`}>{formatMaterialQty(stock, meta.unit)} {unitLabel(meta.unit)}</span>
        </div>
      </div>

      {total > 0 && (
        <div className="mt-3">
          <div className="flex justify-between text-xs text-gray-400 mb-1">
            <span>Total consumed</span><span>{pctUsed.toFixed(1)}% of inflow</span>
          </div>
          <div className="bg-white/60 rounded-full h-2">
            <div className="h-2 rounded-full bg-orange-400" style={{ width: `${pctUsed}%` }} />
          </div>
        </div>
      )}
    </div>
  )
}

// ── External Usage Form ───────────────────────
function ExternalUsageTab({ accessToken, onSaved }) {
  const [form, setForm] = useState({
    date: today(), material: 'Cement', quantity: '', reason: 'External Sale', notes: ''
  })
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')
  const [success, setSuccess] = useState('')
  const [history, setHistory] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [subTab, setSubTab]   = useState('add') // 'add' | 'history'

  const currentMeta = MATERIAL_LIST.find(m => m.id === form.material) || MATERIAL_LIST[0]

  useEffect(() => {
    setLoadingHistory(true)
    loadExternalMaterialUsage(accessToken)
      .then(rows => setHistory([...rows].reverse()))
      .catch(() => {})
      .finally(() => setLoadingHistory(false))
  }, [success])

  const handleSave = async () => {
    if (!form.quantity || parseFloat(form.quantity) <= 0) {
      setError('Enter a valid quantity.')
      return
    }
    setSaving(true); setError('')
    try {
      const entry = {
        date:     form.date,
        material: form.material,
        quantity: parseFloat(form.quantity),
        unit:     MATERIAL_UNITS[form.material] || '',
        reason:   form.reason,
        notes:    form.notes,
      }
      const result = await saveExternalMaterialUsageViaBackend(entry, accessToken)
      if (result.duplicate) {
        if (!confirmDuplicateSave('external material usage', 1)) {
          setSaving(false)
          return
        }
        await saveExternalMaterialUsageViaBackend(entry, accessToken, true)
      }
      setSuccess(` ${form.material} external usage saved — stock updated!`)
      setTimeout(() => setSuccess(''), 3000)
      setForm(p => ({ ...p, quantity: '', notes: '' }))
      onSaved()    // trigger parent refresh
      setSubTab('history')
    } catch (e) { setError('Save failed: ' + e.message) }
    setSaving(false)
  }

  return (
    <div className="space-y-3">
      {/* Sub-tabs */}
      <div className="flex bg-white border border-gray-100 rounded-xl overflow-hidden">
        {[['add','+ Log Usage'],['history',' History']].map(([k,l]) => (
          <button key={k} onClick={() => setSubTab(k)}
            className={`flex-1 py-2 text-xs font-semibold ${subTab===k ? 'text-orange-600 bg-orange-50' : 'text-gray-400'}`}>
            {l}
          </button>
        ))}
      </div>

      {error   && <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl p-3">{error}</div>}
      {success && <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-xl p-3 font-semibold text-center">{success}</div>}

      {subTab === 'add' && (
        <>
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 text-xs text-orange-700">
             Use this to record cement (or any material) <strong>sold or used outside the factory</strong>. This will be automatically deducted from your material stock balance.
          </div>

          {/* Date */}
          <div className="bg-white border border-gray-200 rounded-xl p-3">
            <label className="text-xs text-gray-400 font-semibold block mb-1"> Date</label>
            <input type="date" value={form.date}
              onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
              className="w-full text-lg font-bold text-gray-800 outline-none bg-transparent" />
          </div>

          {/* Material selector */}
          <div className="bg-white border border-gray-200 rounded-xl p-3">
            <label className="text-xs text-gray-400 font-semibold block mb-2"> Material</label>
            <div className="flex flex-wrap gap-2">
              {EXTERNAL_MATERIALS.map(m => (
                <button key={m.id} onClick={() => setForm(p => ({ ...p, material: m.id }))}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all
                    ${form.material === m.id ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600'}`}>
                  {m.emoji} {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Quantity */}
          <div className="bg-white border border-gray-200 rounded-xl p-3">
            <label className="text-xs text-gray-400 font-semibold block mb-1">
               Quantity <span className="text-orange-500 font-bold">({MATERIAL_UNITS[form.material] || currentMeta.unit})</span>
            </label>
            <div className="flex items-center gap-2">
              <input type="number" inputMode="decimal"
                value={form.quantity} placeholder="0"
                onChange={e => setForm(p => ({ ...p, quantity: e.target.value }))}
                className="flex-1 text-3xl font-bold text-gray-800 outline-none bg-transparent" />
              <span className="text-sm font-bold text-orange-500 bg-orange-50 px-3 py-1.5 rounded-lg shrink-0">
                {MATERIAL_UNITS[form.material] || currentMeta.unit}
              </span>
            </div>
          </div>

          {/* Reason */}
          <div className="bg-white border border-gray-200 rounded-xl p-3">
            <label className="text-xs text-gray-400 font-semibold block mb-2"> Reason</label>
            <div className="flex flex-wrap gap-2">
              {REASONS.map(r => (
                <button key={r} onClick={() => setForm(p => ({ ...p, reason: r }))}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all
                    ${form.reason === r ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600'}`}>
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div className="bg-white border border-gray-200 rounded-xl p-3">
            <label className="text-xs text-gray-400 font-semibold block mb-1"> Notes (optional)</label>
            <input type="text" value={form.notes}
              placeholder="e.g. Sold to Ramesh bhai, 25 bags"
              onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
              className="w-full text-sm text-gray-800 outline-none bg-transparent" />
          </div>

          <button onClick={handleSave} disabled={saving}
            className="w-full bg-orange-500 disabled:bg-orange-300 text-white font-bold py-4 rounded-2xl text-base shadow-lg shadow-orange-200">
            {saving ? ' Saving...' : ' Save External Usage — Deduct from Stock'}
          </button>
        </>
      )}

      {subTab === 'history' && (
        loadingHistory
          ? <div className="text-center py-8 text-gray-400"> Loading...</div>
          : history.length === 0
            ? (
              <div className="text-center py-12 text-gray-400">
                <div className="text-4xl mb-2"></div>
                <p>No external usage recorded yet.</p>
                <button onClick={() => setSubTab('add')}
                  className="mt-3 bg-orange-500 text-white px-4 py-2 rounded-xl text-sm font-bold">
                  + Log Usage
                </button>
              </div>
            )
            : history.map((r, i) => {
                const meta = MATERIAL_LIST.find(m => m.id === r.Material) || {}
                return (
                  <div key={i} className="bg-white border border-gray-100 rounded-xl p-3 mb-2">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-gray-800">
                        {meta.emoji || ''} {r.Material}
                      </span>
                      <span className="text-sm font-bold text-orange-600">
                        −{r.Quantity} {r.Unit}
                      </span>
                    </div>
                    <div className="flex gap-3 mt-1 text-xs text-gray-400 flex-wrap">
                      <span>{r.Date}</span>
                      <span className="bg-gray-100 px-2 py-0.5 rounded-full font-semibold text-gray-600">{r.Reason}</span>
                      {r.Notes && <span>{r.Notes}</span>}
                    </div>
                  </div>
                )
              })
      )}
    </div>
  )
}

// ── Main Component ────────────────────────────
export default function MaterialStock() {
  const { accessToken } = useApp()

  const [tab, setTab]               = useState('dashboard')
  const [inventory, setInventory]   = useState(null)
  const [debugData, setDebugData]   = useState(null)
  const [loading, setLoading]       = useState(true)
  const [debugLoading, setDebugLoading] = useState(false)
  const [lastRefresh, setLastRefresh]   = useState(null)
  const [error, setError]           = useState('')
  const [success, setSuccess]       = useState('')
  const [showQuickFix, setShowQuickFix] = useState(false)
  const [quickStock, setQuickStock] = useState(
    MATERIAL_LIST.reduce((a, m) => ({ ...a, [m.id]: '' }), {})
  )
  const [quickSaving, setQuickSaving] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const data = await computeMaterialInventory(accessToken)
      setInventory(data)
      setLastRefresh(new Date().toLocaleTimeString('en-IN'))
    } catch (e) { setError('Could not compute material stock: ' + e.message) }
    setLoading(false)
  }, [accessToken])

  const loadDebug = useCallback(async () => {
    setDebugLoading(true)
    try { setDebugData(await computeMaterialInventoryDebug(accessToken)) }
    catch (e) { setError('Debug load failed: ' + e.message) }
    setDebugLoading(false)
  }, [accessToken])

  useEffect(() => { refresh() }, [refresh])
  useEffect(() => { if (tab === 'debug' && !debugData) loadDebug() }, [tab, debugData, loadDebug])

  const totals = inventory
    ? MATERIAL_LIST.reduce(
        (acc, m) => {
          const d = inventory[m.id] || {}
          acc.opening      += d.opening      || 0
          acc.purchased    += d.purchased    || 0
          acc.consumed     += d.consumed     || 0
          acc.externalUsed += d.externalUsed || 0
          acc.stock        += d.stock        || 0
          return acc
        },
        { opening: 0, purchased: 0, consumed: 0, externalUsed: 0, stock: 0 }
      )
    : null

  const hasNoData = inventory && totals &&
    totals.stock === 0 && totals.purchased === 0 &&
    totals.opening === 0 && totals.consumed === 0

  const handleQuickFix = async () => {
    const toSave = MATERIAL_LIST.filter(m => parseFloat(quickStock[m.id]) > 0).map(m => ({
      material: m.id,
      quantity: parseFloat(quickStock[m.id]),
      unit: m.unit,
      setupDate: today(),
      notes: 'Quick fix from Material Stock',
    }))
    if (!toSave.length) { setError('Enter at least one material quantity.'); return }
    if (!confirmSheetWrite('This will append opening raw material stock rows from Material Stock. Use only after confirming the physical count and backup.')) return
    setQuickSaving(true); setError('')
    try {
      const result = await saveOpeningMaterialViaBackend(toSave, accessToken)
      if (result.duplicate) {
        if (!confirmDuplicateSave('opening material stock row', result.duplicateRows || 1)) {
          setQuickSaving(false)
          return
        }
        await saveOpeningMaterialViaBackend(toSave, accessToken, true)
      }
      setSuccess('Opening material stock saved. Refreshing...')
      setTimeout(() => setSuccess(''), 3000)
      setShowQuickFix(false)
      setQuickStock(MATERIAL_LIST.reduce((a, m) => ({ ...a, [m.id]: '' }), {}))
      await refresh()
    } catch (e) { setError('Save failed: ' + e.message) }
    setQuickSaving(false)
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center px-1">
        <p className="text-xs text-gray-400">
          Opening + Purchases − Production − External
          {lastRefresh && <span className="ml-1 text-gray-300">· {lastRefresh}</span>}
        </p>
        <button onClick={refresh}
          className="bg-teal-50 border border-teal-200 text-teal-600 text-xs font-bold px-3 py-1.5 rounded-xl">
           Refresh
        </button>
      </div>

      {/* Tabs — now 5 including External */}
      <div className="flex bg-white border border-gray-100 rounded-xl overflow-hidden">
        {[
          ['dashboard', 'Dashboard'],
          ['materials', 'By Material'],
          ['external',  ' External'],
          ['formula',   'Formula'],
          ['debug',     ' Debug'],
        ].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`flex-1 py-2 text-xs font-semibold leading-tight
              ${tab === k
                ? k === 'external' ? 'text-orange-600 bg-orange-50' : 'text-teal-600 bg-teal-50'
                : 'text-gray-400'}`}>
            {l}
          </button>
        ))}
      </div>

      {error   && <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl p-3">{error}</div>}
      {success && <div className="bg-green-50 border border-green-200 text-green-600 text-sm rounded-xl p-3 font-semibold text-center">{success}</div>}

      {/* ── EXTERNAL USAGE TAB — shown before loading check ── */}
      {tab === 'external' && (
        <ExternalUsageTab accessToken={accessToken} onSaved={refresh} />
      )}

      {tab !== 'external' && (
        loading ? (
          <div className="text-center py-16 text-gray-400">
            <div className="text-4xl mb-3"></div>
            <p>Computing material stock...</p>
            <p className="text-xs mt-1 text-gray-300">Reading Production, Vendor Ledger & Opening Stock</p>
          </div>
        ) : (
          <>
            {hasNoData && (
              <div className="bg-yellow-50 border border-yellow-300 rounded-2xl p-4">
                <p className="font-bold text-yellow-700 mb-1"> No material stock data yet</p>
                <p className="text-sm text-yellow-600 mb-3">
                  Set opening balances, or add vendor invoices with <strong>quantity</strong>.
                </p>
                <button onClick={() => setShowQuickFix(v => !v)}
                  className="w-full bg-yellow-500 text-white font-bold py-3 rounded-xl text-sm">
                  {showQuickFix ? ' Close' : ' Quick Fix — Enter Opening Material Stock'}
                </button>
              </div>
            )}

            {showQuickFix && (
              <div className="bg-white border border-teal-200 rounded-2xl p-4 space-y-3">
                <p className="text-sm font-bold text-gray-700">Enter current on-hand quantity:</p>
                {MATERIAL_LIST.map(meta => (
                  <div key={meta.id}
                    className={`flex items-center gap-3 rounded-xl p-3 border
                      ${parseFloat(quickStock[meta.id]) > 0 ? meta.bg : 'bg-white border-gray-200'}`}>
                    <span className="text-lg">{meta.emoji}</span>
                    <span className={`text-sm font-bold w-20 ${parseFloat(quickStock[meta.id]) > 0 ? meta.color : 'text-gray-500'}`}>
                      {meta.label}
                    </span>
                    <input type="number" inputMode="decimal"
                      value={quickStock[meta.id] || ''} placeholder="0"
                      onChange={e => setQuickStock(p => ({ ...p, [meta.id]: e.target.value }))}
                      className="flex-1 text-xl font-bold outline-none bg-transparent text-gray-800" />
                    <span className="text-xs text-gray-400 shrink-0">{unitLabel(meta.unit)}</span>
                  </div>
                ))}
                <button onClick={handleQuickFix} disabled={quickSaving}
                  className="w-full bg-teal-600 disabled:bg-teal-300 text-white font-bold py-3 rounded-xl">
                  {quickSaving ? ' Saving...' : ' Save Opening Material Stock'}
                </button>
              </div>
            )}

            {/* ── DASHBOARD ── */}
            {tab === 'dashboard' && !hasNoData && (
              <>
                <MaterialDashboardSummary inventory={inventory} />
                <MaterialTrackerTable inventory={inventory} />
                <button onClick={() => setShowQuickFix(v => !v)}
                  className="w-full border border-teal-200 text-teal-600 font-bold py-2.5 rounded-xl text-sm">
                  {showQuickFix ? ' Close opening stock form' : ' Adjust opening balances'}
                </button>
              </>
            )}

            {/* ── BY MATERIAL ── */}
            {tab === 'materials' && inventory &&
              MATERIAL_LIST.map(meta => (
                <MaterialCard key={meta.id} meta={meta}
                  data={inventory[meta.id] || { opening:0, purchased:0, consumed:0, externalUsed:0, stock:0 }} />
              ))
            }

            {/* ── FORMULA ── */}
            {tab === 'formula' && (
              <>
                <div className="bg-white border border-gray-100 rounded-2xl p-4">
                  <p className="font-bold text-gray-700 mb-2"> Material Stock Formula</p>
                  <div className="bg-gray-50 rounded-xl p-3 font-mono text-xs text-gray-700 mb-3 leading-relaxed">
                    Balance = Opening_Material_Stock<br />
                    &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;+ Vendor_Ledger (Invoice + Qty)<br />
                    &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;− Production_Log consumption<br />
                    &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;− External_Material_Usage
                  </div>
                  <p className="text-xs text-gray-500">
                    External usage = cement sold outside factory, personal use, or damaged material recorded via the External tab.
                  </p>
                </div>
                <div className="bg-white border border-gray-100 rounded-xl p-4">
                  <p className="font-bold text-gray-700 mb-2"> Data Sources</p>
                  <div className="space-y-2 text-xs text-gray-500">
                    <p> <strong>Opening_Material_Stock</strong> — baseline (Setup or Quick Fix)</p>
                    <p> <strong>Vendor_Ledger</strong> — invoices with Quantity + Unit</p>
                    <p> <strong>Production_Log</strong> — auto consumption on each save</p>
                    <p> <strong>External_Material_Usage</strong> — sales/personal use outside factory</p>
                  </div>
                </div>
              </>
            )}

            {/* ── DEBUG ── */}
            {tab === 'debug' && (
              <>
                <div className="bg-gray-800 text-white rounded-2xl p-4">
                  <p className="text-sm font-bold mb-1"> Material Stock Diagnostic</p>
                  <p className="text-xs text-gray-400">Raw counts from Google Sheet tabs.</p>
                </div>
                {debugLoading ? (
                  <div className="text-center py-8 text-gray-400"> Reading tabs...</div>
                ) : !debugData ? (
                  <button onClick={loadDebug} className="w-full bg-gray-700 text-white font-bold py-3 rounded-xl text-sm">
                     Run Diagnostic
                  </button>
                ) : (
                  <>
                    <div className="bg-white border border-gray-100 rounded-2xl p-4">
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Tab Status</p>
                      <SourceRow label=" Opening_Material_Stock"    count={debugData.summary.openingRawCount}  ok={debugData.summary.openingRawCount > 0} />
                      <SourceRow label=" Purchases (qty invoices)"  count={debugData.summary.purchaseCount}    ok={debugData.summary.purchaseCount > 0} />
                      <SourceRow label=" Production_Log rows"       count={debugData.summary.productionCount}  ok={debugData.summary.productionCount > 0} />
                      <SourceRow label=" Greet readable"            count={debugData.summary.greetKgReadable ? 1 : 0}  ok={debugData.summary.greetKgReadable} />
                      <SourceRow label=" Powder readable"           count={debugData.summary.powderKgReadable ? 1 : 0} ok={debugData.summary.powderKgReadable} />
                    </div>
                    <div className="bg-white border border-gray-100 rounded-2xl p-4">
                      <p className="text-xs font-bold text-gray-500 uppercase mb-2">Production consumption (totals)</p>
                      {MATERIAL_LIST.map(meta => (
                        <div key={meta.id} className="flex justify-between text-sm py-1 border-b border-gray-50">
                          <span>{meta.emoji} {meta.label}</span>
                          <span className="font-bold">
                            {formatMaterialQty(debugData.consumedMap[meta.id] || 0, meta.unit)} {unitLabel(meta.unit)}
                          </span>
                        </div>
                      ))}
                    </div>
                    <button onClick={loadDebug}
                      className="w-full border border-gray-200 text-gray-500 font-medium py-2.5 rounded-xl text-sm">
                       Re-run Diagnostic
                    </button>
                  </>
                )}
              </>
            )}
          </>
        )
      )}
    </div>
  )
}
