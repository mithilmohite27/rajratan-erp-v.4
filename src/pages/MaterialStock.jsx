import React, { useState, useEffect, useCallback } from 'react'
import { useApp } from '../App.jsx'
import {
  computeMaterialInventory,
  computeMaterialInventoryDebug,
  saveOpeningMaterialStock,
} from '../lib/sheets.js'
import { MATERIAL_LIST, formatMaterialQty, unitLabel } from '../lib/materials.js'
import { today } from '../lib/formulas.js'

function SourceRow({ label, count, ok }) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-gray-50">
      <span className="text-sm text-gray-600">{label}</span>
      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${ok ? 'bg-green-100 text-green-600' : 'bg-yellow-100 text-yellow-600'}`}>
        {ok ? `✓ ${count} rows` : '⚠ Empty'}
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

/** Teal dashboard card — material-wise (not mixed totals) */
function MaterialDashboardSummary({ inventory }) {
  const inStockCount = MATERIAL_LIST.filter(m => inventory[m.id].stock > 0).length

  return (
    <div className="bg-teal-600 rounded-2xl p-5 text-white">
      <p className="text-sm opacity-80">Materials tracked</p>
      <p className="text-3xl font-bold mt-1">{MATERIAL_LIST.length}</p>
      <p className="text-sm opacity-80 mt-0.5">Auto-synced from Production &amp; Vendors</p>
      <p className="text-xs opacity-70 mt-1">{inStockCount} material{inStockCount !== 1 ? 's' : ''} in stock right now</p>

      <div className="mt-4 space-y-2">
        {MATERIAL_LIST.map(meta => {
          const d = inventory[meta.id]
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
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Name-wise table — Opening + Purchased − Used = Balance (per material, correct unit) */
function MaterialTrackerTable({ inventory }) {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
      <p className="text-xs font-bold text-gray-500 uppercase tracking-wide px-3 pt-3 pb-1">
        Material tracker (name wise)
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs min-w-[320px]">
          <thead>
            <tr className="bg-teal-50 text-teal-800 border-b border-teal-100">
              <th className="text-left p-2.5 font-bold sticky left-0 bg-teal-50 z-10">Material</th>
              <th className="text-right p-2.5 font-semibold whitespace-nowrap">Opening</th>
              <th className="text-right p-2.5 font-semibold whitespace-nowrap">Purchased</th>
              <th className="text-right p-2.5 font-semibold whitespace-nowrap">Used</th>
              <th className="text-right p-2.5 font-bold whitespace-nowrap">Balance</th>
            </tr>
          </thead>
          <tbody>
            {MATERIAL_LIST.map(meta => {
              const d = inventory[meta.id]
              const low = d.stock <= 0 && (d.opening > 0 || d.purchased > 0)
              return (
                <tr
                  key={meta.id}
                  className={`border-b border-gray-50 ${low ? 'bg-red-50/50' : ''}`}
                >
                  <td className={`p-2.5 sticky left-0 z-10 border-r border-gray-50 ${low ? 'bg-red-50/50' : 'bg-white'}`}>
                    <p className={`font-bold ${meta.color}`}>{meta.emoji} {meta.label}</p>
                    <p className="text-[10px] text-gray-400">{unitLabel(meta.unit)}</p>
                  </td>
                  <td className="text-right p-2.5 text-gray-600 tabular-nums">
                    {formatMaterialQty(d.opening, meta.unit)}
                  </td>
                  <td className="text-right p-2.5 text-green-600 tabular-nums">
                    {d.purchased > 0 ? `+${formatMaterialQty(d.purchased, meta.unit)}` : '—'}
                  </td>
                  <td className="text-right p-2.5 text-red-500 tabular-nums">
                    {d.consumed > 0 ? `−${formatMaterialQty(d.consumed, meta.unit)}` : '—'}
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
        Balance = Opening + Purchased − Used (from Production & Vendors)
      </p>
    </div>
  )
}

function MaterialCard({ meta, data }) {
  const { opening, purchased, consumed, stock } = data
  const total = opening + purchased
  const pctUsed = total > 0 ? Math.min(100, (consumed / total) * 100) : 0

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
        <FormulaRow label="Opening Stock"     value={opening}   sign="●" unit={unitLabel(meta.unit)} color="text-gray-400" />
        <FormulaRow label="+ Purchased"       value={purchased} sign="+" unit={unitLabel(meta.unit)} color="text-green-500" />
        <FormulaRow label="− Production Used" value={consumed}  sign="−" unit={unitLabel(meta.unit)} color="text-red-400" />
        <div className="flex justify-between pt-2">
          <span className={`text-sm font-bold ${meta.color}`}>= Balance</span>
          <span className={`text-sm font-bold ${meta.color}`}>{formatMaterialQty(stock, meta.unit)} {unitLabel(meta.unit)}</span>
        </div>
      </div>

      {total > 0 && (
        <div className="mt-3">
          <div className="flex justify-between text-xs text-gray-400 mb-1">
            <span>Consumed</span><span>{pctUsed.toFixed(1)}% of inflow</span>
          </div>
          <div className="bg-white/60 rounded-full h-2">
            <div className="h-2 rounded-full bg-orange-400" style={{ width: `${pctUsed}%` }} />
          </div>
        </div>
      )}
    </div>
  )
}

export default function MaterialStock() {
  const { accessToken } = useApp()

  const [tab, setTab] = useState('dashboard')
  const [inventory, setInventory] = useState(null)
  const [debugData, setDebugData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [debugLoading, setDebugLoading] = useState(false)
  const [lastRefresh, setLastRefresh] = useState(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [showQuickFix, setShowQuickFix] = useState(false)
  const [quickStock, setQuickStock] = useState(
    MATERIAL_LIST.reduce((a, m) => ({ ...a, [m.id]: '' }), {})
  )
  const [quickSaving, setQuickSaving] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await computeMaterialInventory(accessToken)
      setInventory(data)
      setLastRefresh(new Date().toLocaleTimeString('en-IN'))
    } catch (e) {
      setError('Could not compute material stock: ' + e.message)
    }
    setLoading(false)
  }, [accessToken])

  const loadDebug = useCallback(async () => {
    setDebugLoading(true)
    try {
      setDebugData(await computeMaterialInventoryDebug(accessToken))
    } catch (e) {
      setError('Debug load failed: ' + e.message)
    }
    setDebugLoading(false)
  }, [accessToken])

  useEffect(() => { refresh() }, [refresh])

  useEffect(() => {
    if (tab === 'debug' && !debugData) loadDebug()
  }, [tab, debugData, loadDebug])

  const totals = inventory
    ? MATERIAL_LIST.reduce(
        (acc, m) => {
          acc.opening += inventory[m.id].opening
          acc.purchased += inventory[m.id].purchased
          acc.consumed += inventory[m.id].consumed
          acc.stock += inventory[m.id].stock
          return acc
        },
        { opening: 0, purchased: 0, consumed: 0, stock: 0 }
      )
    : null

  const hasNoData =
    inventory &&
    totals &&
    totals.stock === 0 &&
    totals.purchased === 0 &&
    totals.opening === 0 &&
    totals.consumed === 0

  const handleQuickFix = async () => {
    const toSave = MATERIAL_LIST.filter(m => parseFloat(quickStock[m.id]) > 0).map(m => ({
      material: m.id,
      quantity: parseFloat(quickStock[m.id]),
      unit: m.unit,
      setupDate: today(),
      notes: 'Quick fix from Material Stock',
    }))
    if (!toSave.length) {
      setError('Enter at least one material quantity.')
      return
    }
    setQuickSaving(true)
    setError('')
    try {
      await saveOpeningMaterialStock(accessToken, toSave)
      setSuccess('✅ Opening material stock saved! Refreshing...')
      setTimeout(() => setSuccess(''), 3000)
      setShowQuickFix(false)
      setQuickStock(MATERIAL_LIST.reduce((a, m) => ({ ...a, [m.id]: '' }), {}))
      await refresh()
    } catch (e) {
      setError('Save failed: ' + e.message)
    }
    setQuickSaving(false)
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center px-1">
        <p className="text-xs text-gray-400">
          Opening + Purchases − Production consumption
          {lastRefresh && <span className="ml-1 text-gray-300">· {lastRefresh}</span>}
        </p>
        <button
          onClick={refresh}
          className="bg-teal-50 border border-teal-200 text-teal-600 text-xs font-bold px-3 py-1.5 rounded-xl"
        >
          🔄 Refresh
        </button>
      </div>

      <div className="flex bg-white border border-gray-100 rounded-xl overflow-hidden">
        {[['dashboard', 'Dashboard'], ['materials', 'By Material'], ['formula', 'Formula'], ['debug', '🔍 Debug']].map(
          ([k, l]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`flex-1 py-2 text-xs font-semibold ${tab === k ? 'text-teal-600 bg-teal-50' : 'text-gray-400'}`}
            >
              {l}
            </button>
          )
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl p-3">{error}</div>
      )}
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-600 text-sm rounded-xl p-3 font-semibold text-center">
          {success}
        </div>
      )}

      {loading ? (
        <div className="text-center py-16 text-gray-400">
          <div className="text-4xl mb-3">⏳</div>
          <p>Computing material stock...</p>
          <p className="text-xs mt-1 text-gray-300">Reading Production, Vendor Ledger & Opening Stock</p>
        </div>
      ) : (
        <>
          {hasNoData && (
            <div className="bg-yellow-50 border border-yellow-300 rounded-2xl p-4">
              <p className="font-bold text-yellow-700 mb-1">⚠️ No material stock data yet</p>
              <p className="text-sm text-yellow-600 mb-3">
                Set opening balances, or add vendor invoices with <strong>quantity</strong>. Production saves
                automatically deduct consumed materials.
              </p>
              <button
                onClick={() => setShowQuickFix(v => !v)}
                className="w-full bg-yellow-500 text-white font-bold py-3 rounded-xl text-sm"
              >
                {showQuickFix ? '✕ Close' : '⚡ Quick Fix — Enter Opening Material Stock'}
              </button>
            </div>
          )}

          {showQuickFix && (
            <div className="bg-white border border-teal-200 rounded-2xl p-4 space-y-3">
              <p className="text-sm font-bold text-gray-700">Enter current on-hand quantity:</p>
              {MATERIAL_LIST.map(meta => (
                <div
                  key={meta.id}
                  className={`flex items-center gap-3 rounded-xl p-3 border ${parseFloat(quickStock[meta.id]) > 0 ? meta.bg : 'bg-white border-gray-200'}`}
                >
                  <span className="text-lg">{meta.emoji}</span>
                  <span className={`text-sm font-bold w-20 ${parseFloat(quickStock[meta.id]) > 0 ? meta.color : 'text-gray-500'}`}>
                    {meta.label}
                  </span>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={quickStock[meta.id] || ''}
                    placeholder="0"
                    onChange={e => setQuickStock(p => ({ ...p, [meta.id]: e.target.value }))}
                    className="flex-1 text-xl font-bold outline-none bg-transparent text-gray-800"
                  />
                  <span className="text-xs text-gray-400 shrink-0">{unitLabel(meta.unit)}</span>
                </div>
              ))}
              <button onClick={handleQuickFix} disabled={quickSaving}
                className="w-full bg-teal-600 disabled:bg-teal-300 text-white font-bold py-3 rounded-xl">
                {quickSaving ? '⏳ Saving...' : '💾 Save Opening Material Stock'}
              </button>
            </div>
          )}

          {tab === 'dashboard' && !hasNoData && (
            <>
              <MaterialDashboardSummary inventory={inventory} />

              <MaterialTrackerTable inventory={inventory} />

              <button
                onClick={() => setShowQuickFix(v => !v)}
                className="w-full border border-teal-200 text-teal-600 font-bold py-2.5 rounded-xl text-sm"
              >
                {showQuickFix ? '✕ Close opening stock form' : '⚡ Adjust opening balances'}
              </button>
            </>
          )}

          {tab === 'materials' &&
            MATERIAL_LIST.map(meta => (
              <MaterialCard key={meta.id} meta={meta} data={inventory[meta.id]} />
            ))}

          {tab === 'formula' && (
            <>
              <div className="bg-white border border-gray-100 rounded-2xl p-4">
                <p className="font-bold text-gray-700 mb-2">📐 Material Stock Formula</p>
                <div className="bg-gray-50 rounded-xl p-3 font-mono text-xs text-gray-700 mb-3 leading-relaxed">
                  Balance = Opening_Material_Stock
                  <br />
                  &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;+ Vendor_Ledger (Invoice + Quantity)
                  <br />
                  &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;− SUM(Production_Log consumption)
                </div>
                <p className="text-xs text-gray-500 mb-2">
                  Consumption per day comes from production formulas (cement bags, greet ton, powder ton, colour kg,
                  chemical/plastic litres, etc.) stored in
                  Production_Log when you save daily production.
                </p>
              </div>
              <div className="bg-white border border-gray-100 rounded-xl p-4">
                <p className="font-bold text-gray-700 mb-2">🔗 Data Sources</p>
                <div className="space-y-2 text-xs text-gray-500">
                  <p>🌱 <strong>Opening_Material_Stock</strong> — baseline (Setup or Quick Fix)</p>
                  <p>🧾 <strong>Vendor_Ledger</strong> — invoices with Quantity + Unit</p>
                  <p>🏭 <strong>Production_Log</strong> — auto consumption on each save</p>
                </div>
              </div>
            </>
          )}

          {tab === 'debug' && (
            <>
              <div className="bg-gray-800 text-white rounded-2xl p-4">
                <p className="text-sm font-bold mb-1">🔍 Material Stock Diagnostic</p>
                <p className="text-xs text-gray-400">Raw counts from Google Sheet tabs.</p>
              </div>

              {debugLoading ? (
                <div className="text-center py-8 text-gray-400">⏳ Reading tabs...</div>
              ) : !debugData ? (
                <button onClick={loadDebug} className="w-full bg-gray-700 text-white font-bold py-3 rounded-xl text-sm">
                  🔍 Run Diagnostic
                </button>
              ) : (
                <>
                  <div className="bg-white border border-gray-100 rounded-2xl p-4">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Tab Status</p>
                    <SourceRow
                      label="🌱 Opening_Material_Stock"
                      count={debugData.summary.openingRawCount}
                      ok={debugData.summary.openingRawCount > 0}
                    />
                    <SourceRow
                      label="🧾 Purchases (qty invoices)"
                      count={debugData.summary.purchaseCount}
                      ok={debugData.summary.purchaseCount > 0}
                    />
                    <SourceRow
                      label="🏭 Production_Log rows"
                      count={debugData.summary.productionCount}
                      ok={debugData.summary.productionCount > 0}
                    />
                    <SourceRow
                      label="🪨 Greet readable in Production"
                      count={debugData.summary.greetKgReadable ? 1 : 0}
                      ok={debugData.summary.greetKgReadable}
                    />
                    <SourceRow
                      label="⚪ Powder readable in Production"
                      count={debugData.summary.powderKgReadable ? 1 : 0}
                      ok={debugData.summary.powderKgReadable}
                    />
                  </div>

                  {!debugData.summary.greetKgReadable && debugData.summary.productionCount > 0 && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-xs text-yellow-800">
                      Production rows exist but <strong>Greet_kg</strong> / <strong>Powder_kg</strong> columns are
                      empty or misnamed. Check row 1 headers in Production_Log tab match: Greet_kg, Powder_kg.
                    </div>
                  )}

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

                  <button
                    onClick={loadDebug}
                    className="w-full border border-gray-200 text-gray-500 font-medium py-2.5 rounded-xl text-sm"
                  >
                    🔄 Re-run Diagnostic
                  </button>
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
