import React, { useState, useEffect, useCallback } from 'react'
import { useApp } from '../App.jsx'
import { computeInventory, computeInventoryDebug, saveOpeningStock } from '../lib/sheets.js'
import { blocksToBrass, formatNum, today } from '../lib/formulas.js'

const COLORS    = ['Red', 'Yellow', 'Black', 'White']
const EMOJI     = { Red: '🔴', Yellow: '🟡', Black: '⚫', White: '⚪' }
const COLOR_BG  = { Red: 'bg-red-50 border-red-200', Yellow: 'bg-yellow-50 border-yellow-200', Black: 'bg-gray-100 border-gray-300', White: 'bg-blue-50 border-blue-200' }
const COLOR_TEXT = { Red: 'text-red-600', Yellow: 'text-yellow-600', Black: 'text-gray-700', White: 'text-blue-600' }

// ── Source status indicator ───────────────────
function SourceRow({ label, count, ok }) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-gray-50">
      <span className="text-sm text-gray-600">{label}</span>
      <div className="flex items-center gap-2">
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${ok ? 'bg-green-100 text-green-600' : 'bg-yellow-100 text-yellow-600'}`}>
          {ok ? `✓ ${count} rows` : '⚠ Empty'}
        </span>
      </div>
    </div>
  )
}

// ── Formula row ───────────────────────────────
function FormulaRow({ label, value, sign, color }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-50">
      <div className="flex items-center gap-2">
        <span className={`text-sm font-bold w-4 ${color}`}>{sign}</span>
        <span className="text-sm text-gray-600">{label}</span>
      </div>
      <span className="text-sm font-bold text-gray-800">
        {Number(value).toLocaleString('en-IN')} <span className="text-xs text-gray-400 font-normal">blocks</span>
      </span>
    </div>
  )
}

// ── Stat card ─────────────────────────────────
function StatCard({ label, blocks, highlight }) {
  return (
    <div className={`rounded-xl p-3 border text-center ${highlight ? 'bg-orange-500 border-orange-400' : 'bg-white border-gray-100'}`}>
      <p className={`text-xs mb-1 ${highlight ? 'text-orange-100' : 'text-gray-400'}`}>{label}</p>
      <p className={`text-xl font-bold leading-tight ${highlight ? 'text-white' : 'text-gray-800'}`}>
        {Number(blocks).toLocaleString('en-IN')}
      </p>
      <p className={`text-xs mt-0.5 ${highlight ? 'text-orange-100' : 'text-gray-400'}`}>
        {formatNum(blocksToBrass(blocks), 2)} brass
      </p>
    </div>
  )
}

// ── Color card ────────────────────────────────
function ColorCard({ color, data }) {
  const { opening, produced, sold, broken, stock } = data
  const total = opening + produced
  const pctSold = total > 0 ? Math.min(100, (sold / total) * 100) : 0
  const barColors = { Red: '#dc2626', Yellow: '#ca8a04', Black: '#374151', White: '#2563eb' }

  return (
    <div className={`border rounded-2xl p-4 ${COLOR_BG[color]}`}>
      <div className="flex justify-between items-start mb-3">
        <div>
          <p className={`font-bold text-base ${COLOR_TEXT[color]}`}>{EMOJI[color]} {color}</p>
          <p className="text-xs text-gray-400">Live sellable stock</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-gray-800">{Number(stock).toLocaleString('en-IN')}</p>
          <p className="text-xs text-gray-400">{formatNum(blocksToBrass(stock), 2)} brass</p>
        </div>
      </div>

      <div className="bg-white/70 rounded-xl p-3">
        <FormulaRow label="Opening Stock"    value={opening}  sign="●" color="text-gray-400" />
        <FormulaRow label="+ Produced"       value={produced} sign="+" color="text-green-500" />
        <FormulaRow label="− CRM Sales"      value={sold}     sign="−" color="text-red-400" />
        <FormulaRow label="− Broken/Wastage" value={broken}   sign="−" color="text-gray-400" />
        <div className="flex justify-between pt-2">
          <span className={`text-sm font-bold ${COLOR_TEXT[color]}`}>= Current Stock</span>
          <span className={`text-sm font-bold ${COLOR_TEXT[color]}`}>{Number(stock).toLocaleString('en-IN')} blocks</span>
        </div>
      </div>

      {total > 0 && (
        <div className="mt-3">
          <div className="flex justify-between text-xs text-gray-400 mb-1">
            <span>Sold</span><span>{pctSold.toFixed(1)}% of total</span>
          </div>
          <div className="bg-white/60 rounded-full h-2">
            <div className="h-2 rounded-full" style={{ width: `${pctSold}%`, backgroundColor: barColors[color] }} />
          </div>
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════
//  MAIN INVENTORY PAGE
// ══════════════════════════════════════════════
export default function Inventory() {
  const { accessToken } = useApp()

  const [tab,         setTab]         = useState('dashboard')
  const [inventory,   setInventory]   = useState(null)
  const [debugData,   setDebugData]   = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [debugLoading,setDebugLoading]= useState(false)
  const [lastRefresh, setLastRefresh] = useState(null)
  const [error,       setError]       = useState('')
  const [success,     setSuccess]     = useState('')

  // Quick opening stock fix form
  const [showQuickFix, setShowQuickFix] = useState(false)
  const [quickStock, setQuickStock]     = useState(COLORS.reduce((a,c) => ({...a,[c]:''}), {}))
  const [quickSaving, setQuickSaving]   = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const data = await computeInventory(accessToken)
      setInventory(data)
      setLastRefresh(new Date().toLocaleTimeString('en-IN'))
    } catch (e) {
      setError('Could not compute inventory: ' + e.message)
    }
    setLoading(false)
  }, [accessToken])

  const loadDebug = useCallback(async () => {
    setDebugLoading(true)
    try {
      const d = await computeInventoryDebug(accessToken)
      setDebugData(d)
    } catch (e) {
      setError('Debug load failed: ' + e.message)
    }
    setDebugLoading(false)
  }, [accessToken])

  useEffect(() => { refresh() }, [])

  // When debug tab is opened, auto-load
  useEffect(() => {
    if (tab === 'debug' && !debugData) loadDebug()
  }, [tab])

  const totals = inventory
    ? COLORS.reduce((acc, c) => {
        acc.opening  += inventory[c].opening
        acc.produced += inventory[c].produced
        acc.sold     += inventory[c].sold
        acc.broken   += inventory[c].broken
        acc.stock    += inventory[c].stock
        return acc
      }, { opening: 0, produced: 0, sold: 0, broken: 0, stock: 0 })
    : null

  const hasNoData = inventory && totals && totals.stock === 0 && totals.produced === 0 && totals.opening === 0

  // Quick fix: save opening stock directly from inventory page
  const handleQuickFix = async () => {
    const toSave = COLORS.filter(c => parseFloat(quickStock[c]) > 0)
    if (!toSave.length) { setError('Enter at least one color.'); return }
    setQuickSaving(true); setError('')
    try {
      await saveOpeningStock(accessToken, toSave.map(color => ({
        color, blocks: parseInt(quickStock[color]), setupDate: today(), notes: 'Quick fix from Inventory'
      })))
      setSuccess('✅ Opening stock saved! Refreshing...')
      setTimeout(() => setSuccess(''), 3000)
      setShowQuickFix(false)
      setQuickStock(COLORS.reduce((a,c) => ({...a,[c]:''}), {}))
      await refresh()
    } catch (e) { setError('Save failed: ' + e.message) }
    setQuickSaving(false)
  }

  return (
    <div className="max-w-lg mx-auto">
      {/* Header */}
      <div className="bg-white px-4 py-3 border-b border-gray-100 sticky top-12 z-10">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-lg font-bold text-gray-800">📦 Inventory</h1>
            <p className="text-xs text-gray-400">
              Opening + Production − CRM Sales − Wastage
              {lastRefresh && <span className="ml-1 text-gray-300">· {lastRefresh}</span>}
            </p>
          </div>
          <button onClick={refresh}
            className="bg-orange-50 border border-orange-200 text-orange-500 text-xs font-bold px-3 py-1.5 rounded-xl">
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-white border-b border-gray-100 sticky top-[calc(3rem+4rem)] z-10">
        {[['dashboard','Dashboard'],['colors','By Color'],['formula','Formula'],['debug','🔍 Debug']].map(([k,l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`flex-1 py-2.5 text-xs font-semibold ${tab===k?'text-orange-500 border-b-2 border-orange-500':'text-gray-400'}`}>
            {l}
          </button>
        ))}
      </div>

      <div className="p-4 space-y-3">
        {error   && <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl p-3">{error}</div>}
        {success && <div className="bg-green-50 border border-green-200 text-green-600 text-sm rounded-xl p-3 font-semibold text-center">{success}</div>}

        {loading ? (
          <div className="text-center py-16 text-gray-400">
            <div className="text-4xl mb-3">⏳</div>
            <p>Computing live inventory...</p>
            <p className="text-xs mt-1 text-gray-300">Reading Production, CRM, QC & Opening Stock</p>
          </div>
        ) : <>

          {/* ── No data banner ── */}
          {hasNoData && (
            <div className="bg-yellow-50 border border-yellow-300 rounded-2xl p-4">
              <p className="font-bold text-yellow-700 mb-1">⚠️ No inventory data found</p>
              <p className="text-sm text-yellow-600 mb-3">
                Your opening stock is in Google Sheets but the app can't read it yet. This usually means the <strong>Opening_Stock</strong> tab or <strong>Production_Variants</strong> tab doesn't exist in your Sheet.
              </p>
              <div className="space-y-2">
                <button onClick={() => setShowQuickFix(v => !v)}
                  className="w-full bg-yellow-500 text-white font-bold py-3 rounded-xl text-sm">
                  {showQuickFix ? '✕ Close' : '⚡ Quick Fix — Enter Opening Stock Here'}
                </button>
                <button onClick={() => setTab('debug')}
                  className="w-full border border-yellow-300 text-yellow-700 font-bold py-2 rounded-xl text-sm">
                  🔍 Diagnose — See What Data Is Being Read
                </button>
              </div>
            </div>
          )}

          {/* ── Quick Fix form ── */}
          {showQuickFix && (
            <div className="bg-white border border-orange-200 rounded-2xl p-4 space-y-3">
              <p className="text-sm font-bold text-gray-700">Enter your opening block count:</p>
              {COLORS.map(color => (
                <div key={color} className={`flex items-center gap-3 rounded-xl p-3 border ${quickStock[color]>0 ? COLOR_BG[color] : 'bg-white border-gray-200'}`}>
                  <span className="text-lg">{EMOJI[color]}</span>
                  <span className={`text-sm font-bold w-14 ${quickStock[color]>0 ? COLOR_TEXT[color] : 'text-gray-500'}`}>{color}</span>
                  <input type="number" inputMode="numeric" value={quickStock[color]||''} placeholder="0 blocks"
                    onChange={e => setQuickStock(p=>({...p,[color]:e.target.value}))}
                    className={`flex-1 text-xl font-bold outline-none bg-transparent ${quickStock[color]>0?COLOR_TEXT[color]:'text-gray-400'}`} />
                  <span className="text-xs text-gray-400">blocks</span>
                </div>
              ))}
              <button onClick={handleQuickFix} disabled={quickSaving}
                className="w-full bg-orange-500 disabled:bg-orange-300 text-white font-bold py-3 rounded-xl">
                {quickSaving ? '⏳ Saving...' : '💾 Save Opening Stock'}
              </button>
            </div>
          )}

          {/* ── DASHBOARD ── */}
          {tab === 'dashboard' && !hasNoData && <>
            <div className="bg-orange-500 rounded-2xl p-5 text-white">
              <p className="text-sm opacity-80">Total Live Stock</p>
              <p className="text-4xl font-bold mt-1">{Number(totals.stock).toLocaleString('en-IN')}</p>
              <p className="text-sm opacity-80 mt-0.5">{formatNum(blocksToBrass(totals.stock), 2)} brass available</p>
              <div className="grid grid-cols-3 gap-2 mt-4 text-center text-xs">
                <div className="bg-white/20 rounded-xl p-2">
                  <p className="font-bold text-base">{Number(totals.produced).toLocaleString('en-IN')}</p>
                  <p className="opacity-70">Produced</p>
                </div>
                <div className="bg-white/20 rounded-xl p-2">
                  <p className="font-bold text-base">{Number(totals.sold).toLocaleString('en-IN')}</p>
                  <p className="opacity-70">Sold</p>
                </div>
                <div className="bg-white/20 rounded-xl p-2">
                  <p className="font-bold text-base">{Number(totals.broken).toLocaleString('en-IN')}</p>
                  <p className="opacity-70">Broken</p>
                </div>
              </div>
            </div>

            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-1">Stock by Color</div>
            <div className="grid grid-cols-2 gap-2">
              {COLORS.map(color => (
                <div key={color} className={`border rounded-xl p-3 ${COLOR_BG[color]}`}>
                  <p className={`text-xs font-semibold ${COLOR_TEXT[color]}`}>{EMOJI[color]} {color}</p>
                  <p className="text-xl font-bold text-gray-800 mt-1">{Number(inventory[color].stock).toLocaleString('en-IN')}</p>
                  <p className="text-xs text-gray-400">{formatNum(blocksToBrass(inventory[color].stock), 2)} brass</p>
                </div>
              ))}
            </div>

            <div className="bg-white border border-gray-100 rounded-xl p-3">
              <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-1">How to record sales</p>
              <p className="text-sm text-gray-600">Go to <strong>🤝 CRM</strong> → select client → tap <strong>"Record Dispatch"</strong>. Stock deducts automatically.</p>
            </div>
          </>}

          {/* ── BY COLOR ── */}
          {tab === 'colors' && (
            COLORS.map(color => <ColorCard key={color} color={color} data={inventory[color]} />)
          )}

          {/* ── FORMULA ── */}
          {tab === 'formula' && <>
            <div className="bg-white border border-gray-100 rounded-2xl p-4">
              <p className="font-bold text-gray-700 mb-2">📐 Stock Formula</p>
              <div className="bg-gray-50 rounded-xl p-3 font-mono text-xs text-gray-700 mb-3 leading-relaxed">
                Stock = Opening_Stock<br/>
                &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;+ Production_Variants<br/>
                &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;− CRM (Status=Dispatched)<br/>
                &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;− QC_Log (broken blocks)
              </div>
              {totals && <>
                <FormulaRow label="Opening Stock"    value={totals.opening}  sign="●" color="text-gray-400" />
                <FormulaRow label="+ Total Produced" value={totals.produced} sign="+" color="text-green-500" />
                <FormulaRow label="− Total Sold"     value={totals.sold}     sign="−" color="text-red-400" />
                <FormulaRow label="− Total Broken"   value={totals.broken}   sign="−" color="text-gray-400" />
                <div className="mt-2 bg-orange-50 border border-orange-200 rounded-xl p-3 flex justify-between">
                  <span className="font-bold text-orange-600">= Live Stock</span>
                  <span className="font-bold text-orange-600">{Number(totals.stock).toLocaleString('en-IN')} blocks</span>
                </div>
              </>}
            </div>
            <div className="bg-white border border-gray-100 rounded-xl p-4">
              <p className="font-bold text-gray-700 mb-2">🔗 Data Sources</p>
              <div className="space-y-2 text-xs text-gray-500">
                <p>🌱 <strong>Opening_Stock</strong> tab → set in Setup or Quick Fix above</p>
                <p>🏭 <strong>Production_Variants</strong> tab → written when you save production with color entries</p>
                <p>🤝 <strong>CRM_Log</strong> (Status=Dispatched) → written when you confirm a dispatch</p>
                <p>🔴 <strong>QC_Log</strong> → written when you log broken blocks</p>
              </div>
            </div>
          </>}

          {/* ── DEBUG TAB ── */}
          {tab === 'debug' && <>
            <div className="bg-gray-800 text-white rounded-2xl p-4">
              <p className="text-sm font-bold mb-1">🔍 Data Source Diagnostic</p>
              <p className="text-xs text-gray-400">Shows exactly what the app is reading from your Google Sheet.</p>
            </div>

            {debugLoading ? (
              <div className="text-center py-8 text-gray-400">⏳ Reading all tabs...</div>
            ) : !debugData ? (
              <button onClick={loadDebug} className="w-full bg-gray-700 text-white font-bold py-3 rounded-xl text-sm">
                🔍 Run Diagnostic
              </button>
            ) : <>
              {/* Source status */}
              <div className="bg-white border border-gray-100 rounded-2xl p-4">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Tab Status</p>
                <SourceRow label="🌱 Opening_Stock (raw rows)"    count={debugData.summary.openingRawCount}  ok={debugData.summary.openingRawCount > 0} />
                <SourceRow label="🌱 Opening_Stock (parsed colors)" count={debugData.summary.openingMapColors?.length || 0} ok={(debugData.summary.openingMapColors?.length || 0) > 0} />
                <SourceRow label="🏭 Production_Variants"         count={debugData.summary.variantsCount}    ok={debugData.summary.variantsCount > 0} />
                <SourceRow label="🤝 CRM Dispatched rows"         count={debugData.summary.dispatchCount}    ok={true} />
                <SourceRow label="🔴 QC_Log rows"                 count={debugData.summary.qcCount}          ok={true} />
              </div>

              {/* Opening stock — show BOTH raw rows and parsed map */}
              <div className="bg-white border border-gray-100 rounded-2xl p-4">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
                  Opening Stock ({debugData.summary.openingRawCount} raw rows in Sheet)
                </p>

                {/* Parsed map — what the app actually uses */}
                {Object.keys(debugData.openingMap || {}).length > 0 ? (
                  <div className="bg-green-50 border border-green-200 rounded-xl p-3 mb-3">
                    <p className="text-xs font-bold text-green-600 mb-2">✅ Parsed Successfully</p>
                    {Object.entries(debugData.openingMap).map(([color, blocks]) => (
                      <div key={color} className="flex justify-between text-sm py-1 border-b border-green-100">
                        <span>{EMOJI[color] || '🎨'} {color}</span>
                        <span className="font-bold text-green-700">{Number(blocks).toLocaleString('en-IN')} blocks</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-3">
                    <p className="text-sm text-red-600 font-semibold">⚠️ Could not parse opening stock!</p>
                    <p className="text-xs text-gray-500 mt-1">Your Sheet has {debugData.summary.openingRawCount} rows but color names weren't found. Use Quick Fix below.</p>
                  </div>
                )}

                {/* Raw rows from sheet */}
                {debugData.openingRaw?.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-400 mb-1">Raw data in Sheet (first 5 rows):</p>
                    <div className="bg-gray-50 rounded-xl p-2 font-mono text-xs text-gray-600 space-y-0.5">
                      {debugData.openingRaw.slice(0,5).map((row, i) => (
                        <div key={i} className="flex gap-3">
                          <span className="text-gray-300">row{i+1}</span>
                          <span>{row.join(' | ')}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Production variants rows */}
              <div className="bg-white border border-gray-100 rounded-2xl p-4">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
                  Production Variants ({debugData.variantRows.length} rows)
                </p>
                {debugData.variantRows.length === 0 ? (
                  <div>
                    <p className="text-sm text-yellow-600">⚠️ No production variants yet.</p>
                    <p className="text-xs text-gray-400 mt-1">Save a production entry with color blocks to populate this. Until then, opening stock alone drives inventory.</p>
                  </div>
                ) : (
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {debugData.variantRows.slice(0,10).map((r,i) => (
                      <div key={i} className="flex gap-3 text-xs py-1 border-b border-gray-50">
                        <span className="text-gray-400">{r.Date}</span>
                        <span>{EMOJI[r.Color]||'🎨'} {r.Color}</span>
                        <span className="font-bold ml-auto">{Number(r.Blocks).toLocaleString('en-IN')}</span>
                      </div>
                    ))}
                    {debugData.variantRows.length > 10 && (
                      <p className="text-xs text-gray-400 pt-1">...and {debugData.variantRows.length - 10} more</p>
                    )}
                  </div>
                )}
              </div>

              <button onClick={loadDebug}
                className="w-full border border-gray-200 text-gray-500 font-medium py-2.5 rounded-xl text-sm">
                🔄 Re-run Diagnostic
              </button>
            </>}
          </>}
        </>}
      </div>
    </div>
  )
}
