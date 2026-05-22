import React, { useState, useEffect } from 'react'
import { useApp } from '../App.jsx'
import { calcProduction, calcDailyCost, formatINR, formatNum, today } from '../lib/formulas.js'
import { saveProductionEntry, saveProductionVariants, loadProduction } from '../lib/sheets.js'
import { blocksToBrass } from '../lib/formulas.js'

const COLORS  = ['Red', 'Yellow', 'Black', 'White']
const EMOJI   = { Red: '🔴', Yellow: '🟡', Black: '⚫', White: '⚪' }
const COLOR_BG = { Red: 'bg-red-50 border-red-200', Yellow: 'bg-yellow-50 border-yellow-200', Black: 'bg-gray-100 border-gray-300', White: 'bg-blue-50 border-blue-200' }
const COLOR_TEXT = { Red: 'text-red-600', Yellow: 'text-yellow-600', Black: 'text-gray-700', White: 'text-blue-600' }

// ── Shared input field ────────────────────────
function Field({ label, value, onChange, readOnly = false, unit = '', highlight = false, type = 'number' }) {
  return (
    <div className={`rounded-xl p-3 border ${highlight ? 'bg-orange-50 border-orange-200' : 'bg-white border-gray-200'}`}>
      <label className="text-xs text-gray-400 font-medium block mb-1">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type={type} inputMode={type === 'number' ? 'decimal' : undefined}
          value={value} onChange={e => onChange && onChange(e.target.value)}
          readOnly={readOnly} placeholder="0"
          className={`flex-1 text-lg font-bold outline-none bg-transparent
            ${readOnly ? 'text-orange-600' : 'text-gray-800'}`}
        />
        {unit && <span className="text-xs text-gray-400 shrink-0">{unit}</span>}
      </div>
    </div>
  )
}

// ── Color variant row ─────────────────────────
function ColorRow({ color, blocks, onChange }) {
  const active = parseFloat(blocks) > 0
  return (
    <div className={`flex items-center gap-3 rounded-xl p-3 border transition-all
      ${active ? COLOR_BG[color] : 'bg-white border-gray-200'}`}>
      <span className="text-xl shrink-0">{EMOJI[color]}</span>
      <div className="w-16 shrink-0">
        <p className={`text-sm font-bold ${active ? COLOR_TEXT[color] : 'text-gray-500'}`}>{color}</p>
      </div>
      <div className="flex-1">
        <input
          type="number" inputMode="numeric"
          value={blocks || ''} placeholder="0 blocks"
          onChange={e => onChange(color, e.target.value)}
          className={`w-full text-xl font-bold outline-none bg-transparent
            ${active ? COLOR_TEXT[color] : 'text-gray-400'}`}
        />
        {active && (
          <p className="text-xs text-gray-400 mt-0.5">
            = {formatNum(blocksToBrass(blocks), 2)} brass
          </p>
        )}
      </div>
      <span className="text-xs text-gray-400 shrink-0">blocks</span>
      {active && (
        <button onClick={() => onChange(color, '')} className="text-gray-300 text-lg leading-none shrink-0">×</button>
      )}
    </div>
  )
}

// ── Cost row ──────────────────────────────────
function CostRow({ label, value, highlight }) {
  return (
    <div className={`flex justify-between items-center py-2 px-3 rounded-lg ${highlight ? 'bg-orange-500 text-white' : 'bg-white'}`}>
      <span className={`text-sm ${highlight ? 'font-bold' : 'text-gray-600'}`}>{label}</span>
      <span className={`text-sm font-semibold ${highlight ? '' : 'text-gray-800'}`}>{formatINR(value)}</span>
    </div>
  )
}

// ── History row ───────────────────────────────
function HistoryCard({ entry }) {
  const cost = parseFloat(entry.TotalDailyCost) || 0
  const blocks = parseFloat(entry.Blocks) || 0
  const costPerBlock = cost > 0 && blocks > 0 ? cost / blocks : 0
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-3 mb-2">
      <div className="flex justify-between items-start mb-2">
        <span className="text-sm font-bold text-gray-700">{entry.Date}</span>
        {cost > 0
          ? <span className="text-sm font-bold text-orange-500">{formatINR(cost)}</span>
          : <span className="text-xs text-gray-300">cost not recorded</span>
        }
      </div>
      <div className="grid grid-cols-3 gap-1 text-xs text-gray-500">
        <span>🧱 {Number(entry.Blocks).toLocaleString('en-IN')} blocks</span>
        <span>🏗 {entry.MortarCement} bags mortar</span>
        <span>🎨 {entry.ColorCement} bags color</span>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════
//  MAIN PRODUCTION PAGE
// ══════════════════════════════════════════════
export default function Production() {
  const { accessToken, config } = useApp()

  const [tab, setTab] = useState('entry')

  // Main inputs
  const [inputs, setInputs] = useState({
    date: today(), blocks: '', mortarCement: '', colorCement: '',
    yellowKG: '', redKG: '', misc: config.miscDefault || 1000,
  })

  // ── Per-color variant blocks ──────────────
  const emptyVariants = () => COLORS.reduce((a, c) => ({ ...a, [c]: '' }), {})
  const [variants, setVariants] = useState(emptyVariants())

  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)
  const [error,   setError]   = useState('')
  const [history, setHistory] = useState([])
  const [lastCalc, setLastCalc] = useState(null) // snapshot after save

  // Live calcs
  const calc = calcProduction(inputs, config)
  const cost = calcDailyCost(inputs, calc, config)

  const set = key => val => setInputs(p => ({ ...p, [key]: val }))

  // Auto-sum variant blocks → total blocks field
  useEffect(() => {
    const total = COLORS.reduce((s, c) => s + (parseFloat(variants[c]) || 0), 0)
    if (total > 0) setInputs(p => ({ ...p, blocks: total }))
  }, [variants])

  useEffect(() => {
    loadProduction(accessToken).then(r => setHistory([...r].reverse())).catch(() => {})
  }, [saved])

  const handleSave = async () => {
    if (!inputs.date || !inputs.mortarCement) {
      setError('Date and Mortar Cement are required.')
      return
    }
    const filledVariants = COLORS.filter(c => parseFloat(variants[c]) > 0)
    if (filledVariants.length === 0) {
      setError('Enter blocks produced for at least one color variant.')
      return
    }

    setSaving(true); setError('')
    try {
      // 1. Save main production log entry
      await saveProductionEntry(accessToken, {
        date: inputs.date, blocks: inputs.blocks,
        mortarCement: inputs.mortarCement, colorCement: inputs.colorCement,
        totalCement: calc.totalCement, greet: calc.greet, powder: calc.powder,
        chemical: calc.chemical, yellowKG: inputs.yellowKG, redKG: inputs.redKG,
        yellowFinal: calc.yellowFinal, redFinal: calc.redFinal,
        reti: calc.reti, plastic: calc.plastic, misc: inputs.misc,
        cementCost: cost.cementCost, greetCost: cost.greetCost,
        powderCost: cost.powderCost, chemicalCost: cost.chemicalCost,
        colorCost: cost.colorCost, plasticCost: cost.plasticCost,
        retiCost: cost.retiCost, labourCost: cost.labourCost,
        totalDailyCost: cost.totalDailyCost,
      })

      // 2. Save per-color variants → drives inventory inflow
      const variantRows = filledVariants.map(color => ({
        date:    inputs.date,
        color,
        blocks:  parseInt(variants[color]),
        brass:   blocksToBrass(variants[color]),
        batchId: inputs.date,
        notes:   '',
      }))
      await saveProductionVariants(accessToken, variantRows)

      // Snapshot calc & cost BEFORE clearing inputs — results/cost tab reads snapshot
      setLastCalc({ calc, cost, blocks: inputs.blocks, date: inputs.date })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
      setVariants(emptyVariants())
      setInputs({ date: today(), blocks: '', mortarCement: '', colorCement: '', yellowKG: '', redKG: '', misc: config.miscDefault || 1000 })
      setTab('results')
    } catch (e) { setError('Save failed: ' + e.message) }
    setSaving(false)
  }

  const variantTotal = COLORS.reduce((s, c) => s + (parseFloat(variants[c]) || 0), 0)
  const filledCount  = COLORS.filter(c => parseFloat(variants[c]) > 0).length

  return (
    <div className="max-w-lg mx-auto">
      <div className="bg-white px-4 py-3 border-b border-gray-100 sticky top-12 z-10">
        <h1 className="text-lg font-bold text-gray-800">🏭 Daily Production</h1>
        <p className="text-xs text-gray-400">Multi-color entry — auto-syncs to Inventory</p>
      </div>

      <div className="flex bg-white border-b border-gray-100 sticky top-[calc(3rem+4rem)] z-10">
        {[['entry','Entry'],['variants','🎨 Colors'],['results','Results'],['cost','Cost'],['history','History']].map(([k,l]) => (
          <button key={k} onClick={() => { setTab(k); setError('') }}
            className={`flex-1 py-2.5 text-xs font-semibold leading-tight ${tab===k?'text-orange-500 border-b-2 border-orange-500':'text-gray-400'}`}>
            {l}
          </button>
        ))}
      </div>

      <div className="p-4 space-y-3">
        {error && <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl p-3">{error}</div>}
        {saved && <div className="bg-green-50 border border-green-200 text-green-600 text-sm rounded-xl p-3 text-center font-semibold">✅ Saved to Sheets — Inventory updated automatically!</div>}

        {/* ── ENTRY TAB ── */}
        {tab === 'entry' && <>
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700">
            💡 Fill cement inputs here, then go to <strong>🎨 Colors</strong> tab to enter per-color blocks produced.
          </div>
          <Field label="📅 Date" value={inputs.date} onChange={set('date')} type="date" />

          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-1 pt-1">Cement</div>
          <Field label="🏗 Mortar Cement Bags" value={inputs.mortarCement} onChange={set('mortarCement')} unit="bags" />
          <Field label="🎨 Color Cement Bags"  value={inputs.colorCement}  onChange={set('colorCement')}  unit="bags" />
          <Field label="📊 Total Cement" value={calc.totalCement || ''} readOnly unit="bags" highlight />

          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-1 pt-1">Color Pigment</div>
          <div className="grid grid-cols-2 gap-2 text-xs text-gray-500 px-1">
            <span>Yellow Share: <strong className="text-yellow-600">{calc.yellowShare} bags</strong></span>
            <span>Red Share: <strong className="text-red-600">{calc.redShare} bags</strong></span>
          </div>
          <Field label="🟡 Yellow Color KG" value={inputs.yellowKG} onChange={set('yellowKG')} unit="kg" />
          <Field label="🔴 Red Color KG"    value={inputs.redKG}    onChange={set('redKG')}    unit="kg" />

          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-1 pt-1">Expenses</div>
          <Field label="💸 Miscellaneous (₹)" value={inputs.misc} onChange={set('misc')} unit="₹" />

          {/* Summary of variant entry */}
          <div className={`rounded-xl p-3 border ${filledCount > 0 ? 'bg-orange-50 border-orange-200' : 'bg-gray-50 border-gray-200'}`}>
            <p className="text-xs text-gray-500 mb-1">🎨 Color Variants</p>
            {filledCount === 0 ? (
              <button onClick={() => setTab('variants')} className="text-orange-500 text-sm font-bold">
                → Go to Colors tab to enter per-color blocks
              </button>
            ) : (
              <div className="space-y-1">
                {COLORS.filter(c => variants[c] > 0).map(c => (
                  <div key={c} className="flex justify-between text-sm">
                    <span>{EMOJI[c]} {c}</span>
                    <span className={`font-bold ${COLOR_TEXT[c]}`}>{parseInt(variants[c]).toLocaleString('en-IN')} blocks</span>
                  </div>
                ))}
                <div className="border-t border-orange-200 pt-1 flex justify-between text-sm font-bold text-orange-600">
                  <span>Total</span>
                  <span>{variantTotal.toLocaleString('en-IN')} blocks</span>
                </div>
              </div>
            )}
          </div>

          <button onClick={handleSave} disabled={saving}
            className="w-full bg-orange-500 disabled:bg-orange-300 text-white font-bold py-4 rounded-xl text-lg mt-2">
            {saving ? '⏳ Saving & Syncing Inventory...' : '💾 Save Production + Update Inventory'}
          </button>
        </>}

        {/* ── VARIANTS TAB (per-color blocks) ── */}
        {tab === 'variants' && <>
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-3">
            <p className="text-xs font-bold text-orange-600 mb-0.5">🎨 Multi-Color Production Entry</p>
            <p className="text-xs text-gray-500">Enter blocks produced per color. These automatically update your live inventory stock when saved.</p>
          </div>

          <div className="space-y-2">
            {COLORS.map(color => (
              <ColorRow key={color} color={color} blocks={variants[color]}
                onChange={(c, v) => setVariants(p => ({ ...p, [c]: v }))} />
            ))}
          </div>

          {variantTotal > 0 && (
            <div className="bg-gray-800 rounded-2xl p-4 text-white">
              <p className="text-xs text-gray-400 mb-2 uppercase tracking-wide font-semibold">
                Batch Summary — {filledCount} color{filledCount > 1 ? 's' : ''}
              </p>
              {COLORS.filter(c => variants[c] > 0).map(color => (
                <div key={color} className="flex justify-between text-sm py-0.5">
                  <span>{EMOJI[color]} {color}</span>
                  <span className="font-bold">{parseInt(variants[color]).toLocaleString('en-IN')} blocks
                    <span className="text-gray-400 text-xs font-normal"> ({formatNum(blocksToBrass(variants[color]), 2)} brass)</span>
                  </span>
                </div>
              ))}
              <div className="border-t border-gray-600 mt-2 pt-2 flex justify-between font-bold text-orange-400">
                <span>Total</span>
                <span>{variantTotal.toLocaleString('en-IN')} blocks ({formatNum(blocksToBrass(variantTotal), 2)} brass)</span>
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={() => setVariants(emptyVariants())}
              className="flex-1 border border-gray-200 text-gray-500 text-sm font-semibold py-2.5 rounded-xl">
              🗑 Clear
            </button>
            <button onClick={() => setTab('entry')}
              className="flex-1 bg-orange-500 text-white text-sm font-bold py-2.5 rounded-xl">
              ← Back to Entry
            </button>
          </div>
        </>}

        {/* ── RESULTS TAB — uses snapshot after save, live values while editing ── */}
        {tab === 'results' && (() => {
          const c = lastCalc?.calc || calc
          const hasData = parseFloat(c.totalCement) > 0
          return <>
            {!hasData && !lastCalc && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-xs text-yellow-700">
                💡 Enter Mortar Cement and Color Cement on the Entry tab first, then results appear here automatically.
              </div>
            )}
            {lastCalc && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-2 text-xs text-green-600 text-center font-semibold">
                ✅ Results from last save — {lastCalc.date} · {Number(lastCalc.blocks).toLocaleString('en-IN')} blocks
              </div>
            )}
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-1">Material Calculations</div>
            <div className="grid grid-cols-2 gap-2">
              {[
                ['Greet',    formatNum(c.greet/1000, 3),  'tons'],
                ['Powder',   formatNum(c.powder/1000, 3), 'tons'],
                ['Chemical', formatNum(c.chemical),    'litres'],
                ['Reti',     formatNum(c.reti),        'ghamela'],
                ['Plastic',  formatNum(c.plastic),     'ml'],
                ['Cement',   formatNum(c.totalCement), 'bags'],
              ].map(([label, value, unit]) => (
                <div key={label} className="bg-white border border-gray-100 rounded-xl p-3">
                  <p className="text-xs text-gray-400 mb-0.5">{label}</p>
                  <p className="text-base font-bold text-gray-800">{value} <span className="text-xs text-gray-400 font-normal">{unit}</span></p>
                </div>
              ))}
            </div>
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-1 pt-1">Color Output</div>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3">
                <p className="text-xs text-yellow-600">🟡 Yellow Final</p>
                <p className="text-base font-bold text-gray-800">{formatNum(c.yellowFinal)} <span className="text-xs font-normal text-gray-400">kg</span></p>
              </div>
              <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                <p className="text-xs text-red-600">🔴 Red Final</p>
                <p className="text-base font-bold text-gray-800">{formatNum(c.redFinal)} <span className="text-xs font-normal text-gray-400">kg</span></p>
              </div>
            </div>
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 text-center">
              <p className="text-xs text-orange-600 mb-1">Cost Per Block</p>
              <p className="text-3xl font-bold text-orange-600">{formatINR((lastCalc?.cost || cost).costPerBlock)}</p>
            </div>
          </>
        })()}

        {/* ── COST TAB — uses snapshot after save ── */}
        {tab === 'cost' && (() => {
          const co = lastCalc?.cost || cost
          const bl = lastCalc?.blocks || inputs.blocks
          return <>
            {lastCalc && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-2 text-xs text-green-600 text-center font-semibold">
                ✅ Cost from last save — {lastCalc.date}
              </div>
            )}
            {!lastCalc && !parseFloat(inputs.mortarCement) && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-xs text-yellow-700">
                💡 Enter cement data on Entry tab to see cost breakdown.
              </div>
            )}
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-1">Daily Cost Breakdown</div>
            <div className="space-y-1.5">
              <CostRow label="🏗 Cement"   value={co.cementCost} />
              <CostRow label="🪨 Greet"    value={co.greetCost} />
              <CostRow label="⚪ Powder"   value={co.powderCost} />
              <CostRow label="🧪 Chemical" value={co.chemicalCost} />
              <CostRow label="🎨 Color"    value={co.colorCost} />
              <CostRow label="🧴 Plastic"  value={co.plasticCost} />
              <CostRow label="🏖 Reti"     value={co.retiCost} />
              <CostRow label="👷 Labour"   value={co.labourCost} />
              <CostRow label="💸 Misc"     value={co.miscCost} />
              <div className="h-px bg-gray-200 my-1" />
              <CostRow label="💰 TOTAL DAILY COST" value={co.totalDailyCost} highlight />
            </div>
            <p className="text-xs text-center text-gray-400">
              {Number(bl).toLocaleString('en-IN')} blocks · {formatINR(co.costPerBlock)}/block
            </p>
          </>
        })()}

        {/* ── HISTORY TAB ── */}
        {tab === 'history' && <>
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-1">Recent Production ({history.length})</div>
          {history.length === 0
            ? <div className="text-center py-12 text-gray-400"><div className="text-4xl mb-2">📋</div><p>No entries yet.</p></div>
            : history.map((e, i) => <HistoryCard key={i} entry={e} />)
          }
        </>}
      </div>
    </div>
  )
}
