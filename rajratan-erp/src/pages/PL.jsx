import React, { useState, useEffect } from 'react'
import { useApp } from '../App.jsx'
import { loadProduction, loadCRM, loadPayroll, loadQC } from '../lib/sheets.js'
import { formatINR } from '../lib/formulas.js'

const PERIODS = ['Daily', 'Weekly', 'Monthly']

function isInPeriod(dateStr, period) {
  if (!dateStr) return false
  const d   = new Date(dateStr)
  const now = new Date()
  if (period === 'Daily')   return d.toDateString() === now.toDateString()
  if (period === 'Weekly')  { const w = new Date(); w.setDate(now.getDate()-7); return d >= w && d <= now }
  if (period === 'Monthly') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  return true
}

function PLRow({ label, value, type = 'normal', indent = false, border = false }) {
  const colors = {
    normal:   'text-gray-700',
    positive: 'text-green-600',
    negative: 'text-red-500',
    total:    'text-gray-900 font-bold',
    profit:   'text-green-600 font-bold',
    loss:     'text-red-500 font-bold',
  }
  return (
    <div className={`flex justify-between items-center py-2.5 ${indent ? 'pl-4' : ''} ${border ? 'border-t border-gray-100 mt-1 pt-3' : 'border-b border-gray-50'}`}>
      <span className={`text-sm ${indent ? 'text-gray-500' : 'text-gray-700 font-medium'}`}>{label}</span>
      <span className={`text-sm ${colors[type]}`}>{formatINR(value)}</span>
    </div>
  )
}

function KpiCard({ label, value, sub, color, large }) {
  return (
    <div className={`rounded-2xl p-4 border shadow-sm ${color}`}>
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`font-bold text-gray-900 ${large ? 'text-2xl' : 'text-lg'}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

export default function PL() {
  const { accessToken } = useApp()
  const [period,  setPeriod]  = useState('Monthly')
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

  const [prodRows, setProdRows] = useState([])
  const [crmRows,  setCrmRows]  = useState([])
  const [payRows,  setPayRows]  = useState([])
  const [qcRows,   setQcRows]   = useState([])

  useEffect(() => {
    setLoading(true)
    Promise.all([
      loadProduction(accessToken).catch(() => []),
      loadCRM(accessToken).catch(() => []),
      loadPayroll(accessToken).catch(() => []),
      loadQC(accessToken).catch(() => []),
    ]).then(([prod, crm, pay, qc]) => {
      setProdRows(prod); setCrmRows(crm); setPayRows(pay); setQcRows(qc)
      setLoading(false)
    }).catch(e => { setError(e.message); setLoading(false) })
  }, [])

  const fp = (rows) => rows.filter(r => isInPeriod(r.Date, period))

  const prod = fp(prodRows)
  const crm  = fp(crmRows)
  const pay  = fp(payRows)
  const qc   = fp(qcRows)

  // ── Revenue: dispatched rows × rate from order ─
  const grossRevenue = crmRows
    .filter(r => parseFloat(r.DispatchBrass) > 0 && isInPeriod(r.Date, period))
    .reduce((s, r) => {
      const orderEntry = crmRows.find(o => o.ClientName === r.ClientName && parseFloat(o.OrderBrass) > 0)
      const rate = orderEntry ? parseFloat(orderEntry.Rate) || 0 : 0
      return s + (parseFloat(r.DispatchBrass) * rate)
    }, 0)

  // ── COGS — FIX: Production_Log TotalDailyCost already includes labour.
  //    We only add ADDITIONAL labour from Payroll that wasn't in production cost.
  //    Strategy: use Production material cost only (TotalDailyCost - LabourCost)
  //    then add Payroll separately as the ground truth for labour.
  const totalMaterialOnly  = prod.reduce((s, r) => {
    const total  = parseFloat(r.TotalDailyCost) || 0
    const labour = parseFloat(r.LabourCost)     || 0
    return s + (total - labour) // material cost without labour
  }, 0)

  const totalLabourPayroll = pay
    .filter(r => r.Type === 'Wage')
    .reduce((s, r) => s + (parseFloat(r.Amount) || 0), 0)

  const totalFreight = crmRows
    .filter(r => isInPeriod(r.Date, period) && parseFloat(r.FreightCharge) > 0)
    .reduce((s, r) => s + (parseFloat(r.FreightCharge) || 0), 0)

  // ── Wastage ────────────────────────────────
  const totalWastage = qc.reduce((s, r) => s + (parseFloat(r.TotalLoss) || 0), 0)

  // ── Totals ─────────────────────────────────
  const totalCOGS    = totalMaterialOnly + totalLabourPayroll + totalFreight
  const totalExpenses = totalCOGS + totalWastage
  const netProfit     = grossRevenue - totalExpenses

  // ── Production stats ──────────────────────
  const totalBlocks = prod.reduce((s, r) => s + (parseFloat(r.Blocks) || 0), 0)
  const totalBroken = qc.reduce((s, r) => s + (parseFloat(r.BrokenBlocks) || 0), 0)
  const margin      = grossRevenue > 0 ? ((netProfit / grossRevenue) * 100) : 0

  return (
    <div className="max-w-lg mx-auto">
      {/* Header */}
      <div className="px-4 pt-4 pb-3">
        <h1 className="text-2xl font-bold text-gray-900">P&L Dashboard</h1>
        <p className="text-sm text-gray-400 mt-0.5">Live from all modules · auto-calculated</p>
      </div>

      {/* Period selector */}
      <div className="px-4 mb-4">
        <div className="bg-white border border-gray-100 rounded-2xl p-1 shadow-sm flex">
          {PERIODS.map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all
                ${period===p ? 'bg-orange-500 text-white shadow-md shadow-orange-200' : 'text-gray-400'}`}>
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 space-y-4 pb-4">
        {error && <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-2xl p-3">{error}</div>}

        {loading ? (
          <div className="text-center py-20 text-gray-400">
            <div className="text-5xl mb-3">📊</div>
            <p className="font-semibold">Loading all modules...</p>
            <p className="text-xs mt-1">Production · CRM · Payroll · QC</p>
          </div>
        ) : <>

          {/* Hero net profit */}
          <div className={`rounded-3xl p-6 text-white shadow-xl ${netProfit >= 0 ? 'bg-gradient-to-br from-green-500 to-emerald-600 shadow-green-200' : 'bg-gradient-to-br from-red-500 to-red-600 shadow-red-200'}`}>
            <p className="text-sm opacity-80">{period} Net {netProfit >= 0 ? 'Profit' : 'Loss'}</p>
            <p className="text-5xl font-black mt-1">{formatINR(Math.abs(netProfit))}</p>
            <div className="flex gap-4 mt-4 text-sm">
              <div className="bg-white/20 rounded-xl px-3 py-2">
                <p className="opacity-70 text-xs">Revenue</p>
                <p className="font-bold">{formatINR(grossRevenue)}</p>
              </div>
              <div className="bg-white/20 rounded-xl px-3 py-2">
                <p className="opacity-70 text-xs">Expenses</p>
                <p className="font-bold">{formatINR(totalExpenses)}</p>
              </div>
              <div className="bg-white/20 rounded-xl px-3 py-2">
                <p className="opacity-70 text-xs">Margin</p>
                <p className="font-bold">{margin.toFixed(1)}%</p>
              </div>
            </div>
          </div>

          {/* P&L Statement */}
          <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
            <p className="text-sm font-bold text-gray-800 mb-3">📋 Profit & Loss Statement</p>

            <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-1">Revenue</p>
            <PLRow label="Gross Revenue (CRM Dispatches)" value={grossRevenue} type="positive" />

            <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mt-3 mb-1">Cost of Goods Sold</p>
            <PLRow label="Materials (Cement, Greet, Powder...)" value={totalMaterialOnly}  type="negative" indent />
            <PLRow label="Labour (Payroll Wages)"               value={totalLabourPayroll} type="negative" indent />
            <PLRow label="Transport & Freight"                  value={totalFreight}       type="negative" indent />
            <PLRow label="Total COGS"                           value={totalCOGS}          type="total" border />

            <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mt-3 mb-1">Other Losses</p>
            <PLRow label="Breakage & Wastage (QC)" value={totalWastage} type="negative" indent />

            <div className={`mt-3 rounded-2xl p-4 flex justify-between items-center ${netProfit >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
              <span className={`font-bold ${netProfit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                = Net {netProfit >= 0 ? 'Profit' : 'Loss'}
              </span>
              <span className={`text-xl font-black ${netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatINR(Math.abs(netProfit))}
              </span>
            </div>
          </div>

          {/* Production stats */}
          <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
            <p className="text-sm font-bold text-gray-800 mb-3">🏭 Production — {period}</p>
            <div className="grid grid-cols-3 gap-2">
              <KpiCard label="Blocks Made"   value={totalBlocks.toLocaleString('en-IN')} color="bg-orange-50 border-orange-100" />
              <KpiCard label="Blocks Broken" value={totalBroken.toLocaleString('en-IN')} color="bg-red-50 border-red-100" />
              <KpiCard label="Cost/Block"    value={totalBlocks > 0 ? formatINR(totalMaterialOnly/totalBlocks) : '—'} color="bg-blue-50 border-blue-100" />
            </div>
          </div>

          {/* Margin bar */}
          {grossRevenue > 0 && (
            <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
              <div className="flex justify-between items-center mb-2">
                <p className="text-sm font-bold text-gray-800">Profit Margin</p>
                <p className={`text-lg font-black ${netProfit >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                  {margin.toFixed(1)}%
                </p>
              </div>
              <div className="bg-gray-100 rounded-full h-3 overflow-hidden">
                <div
                  className={`h-3 rounded-full transition-all ${netProfit >= 0 ? 'bg-green-500' : 'bg-red-500'}`}
                  style={{ width: `${Math.min(100, Math.abs(margin))}%` }}
                />
              </div>
              <p className="text-xs text-gray-400 mt-2 text-center">
                {formatINR(grossRevenue)} revenue · {formatINR(totalExpenses)} total expenses
              </p>
            </div>
          )}

          {/* No data state */}
          {grossRevenue === 0 && totalExpenses === 0 && (
            <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6 text-center">
              <p className="text-2xl mb-2">📭</p>
              <p className="font-semibold text-gray-600">No data for {period.toLowerCase()} period</p>
              <p className="text-xs text-gray-400 mt-1">Log production, dispatch orders in CRM, and record wages in Payroll</p>
            </div>
          )}

          <button onClick={() => window.location.reload()}
            className="w-full border border-gray-200 bg-white text-gray-500 font-semibold py-3 rounded-2xl text-sm shadow-sm">
            🔄 Refresh All Data
          </button>
        </>}
      </div>
    </div>
  )
}
