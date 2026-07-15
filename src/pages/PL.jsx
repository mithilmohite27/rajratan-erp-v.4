import React, { useState, useEffect } from 'react'
import { useApp } from '../App.jsx'
import { loadProduction, loadCRM, loadPayroll, loadQC, loadCashFlow } from '../lib/sheets.js'
import { formatINR } from '../lib/formulas.js'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts'

const PERIODS = ['Daily', 'Weekly', 'Monthly', 'All Time']

function isInPeriod(dateStr, period) {
  if (!dateStr) return false
  const d = new Date(dateStr), now = new Date()
  if (period === 'Daily')    return d.toDateString() === now.toDateString()
  if (period === 'Weekly')   { const w = new Date(); w.setDate(now.getDate()-7); return d >= w && d <= now }
  if (period === 'Monthly')  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  return true
}

function buildTrend(prodRows, crmRows, days = 14) {
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (days - 1 - i))
    const ds = d.toDateString()
    const label = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
    const rev  = crmRows.filter(r => new Date(r.Date).toDateString() === ds && parseFloat(r.DispatchBrass) > 0)
      .reduce((s, r) => s + parseFloat(r.DispatchBrass) * (parseFloat(r.Rate) || 0), 0)
    const cost = prodRows.filter(r => new Date(r.Date).toDateString() === ds)
      .reduce((s, r) => s + (parseFloat(r.TotalDailyCost) || 0), 0)
    return { label, revenue: Math.round(rev), cost: Math.round(cost) }
  })
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-3 text-xs text-gray-200 shadow-xl">
      <p className="text-gray-400 font-semibold mb-1">{label}</p>
      {payload.map((p, i) => <p key={i} style={{ color: p.color }}>{p.name}: ₹{p.value?.toLocaleString('en-IN')}</p>)}
    </div>
  )
}

function PLRow({ label, value, type = 'normal', indent = false }) {
  const colors = { normal: 'text-gray-700', positive: 'text-green-600', negative: 'text-red-500', total: 'text-gray-900 font-bold' }
  return (
    <div className={`flex justify-between items-center py-2 ${indent ? 'pl-4' : ''} border-b border-gray-50`}>
      <span className={`text-sm ${indent ? 'text-gray-500' : 'text-gray-700 font-medium'}`}>{label}</span>
      <span className={`text-sm ${colors[type]}`}>{formatINR(value)}</span>
    </div>
  )
}

export default function PL() {
  const { accessToken } = useApp()
  const [period,  setPeriod]  = useState('Monthly')
  const [tab,     setTab]     = useState('overview')
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

  const [prodRows, setProdRows] = useState([])
  const [crmRows,  setCrmRows]  = useState([])
  const [payRows,  setPayRows]  = useState([])
  const [qcRows,   setQcRows]   = useState([])
  const [cashRows, setCashRows] = useState([])

  useEffect(() => {
    setLoading(true)
    Promise.all([
      loadProduction(accessToken).catch(() => []),
      loadCRM(accessToken).catch(() => []),
      loadPayroll(accessToken).catch(() => []),
      loadQC(accessToken).catch(() => []),
      loadCashFlow(accessToken).catch(() => []),
    ]).then(([prod, crm, pay, qc, cash]) => {
      setProdRows(prod); setCrmRows(crm); setPayRows(pay); setQcRows(qc); setCashRows(cash)
      setLoading(false)
    }).catch(e => { setError(e.message); setLoading(false) })
  }, [])

  const fp = rows => rows.filter(r => isInPeriod(r.Date, period))
  const prod = fp(prodRows), crm = fp(crmRows), pay = fp(payRows), qc = fp(qcRows)

  const grossRevenue = crmRows
    .filter(r => parseFloat(r.DispatchBrass) > 0 && isInPeriod(r.Date, period))
    .reduce((s, r) => {
      const order = crmRows.find(o => o.ClientName === r.ClientName && parseFloat(o.OrderBrass) > 0)
      return s + parseFloat(r.DispatchBrass) * (parseFloat(order?.Rate) || parseFloat(r.Rate) || 0)
    }, 0)

  const totalMaterialOnly = prod.reduce((s, r) =>
    s + (parseFloat(r.TotalDailyCost) || 0) - (parseFloat(r.LabourCost) || 0), 0)
  const totalLabour   = pay.filter(r => r.Type === 'Wage').reduce((s, r) => s + (parseFloat(r.Amount) || 0), 0)
  const totalFreight  = crm.filter(r => parseFloat(r.FreightCharge) > 0).reduce((s, r) => s + (parseFloat(r.FreightCharge) || 0), 0)
  const totalWastage  = qc.reduce((s, r) => s + (parseFloat(r.TotalLoss) || 0), 0)
  const totalCOGS     = totalMaterialOnly + totalLabour + totalFreight
  const totalExpenses = totalCOGS + totalWastage
  const netProfit     = grossRevenue - totalExpenses
  const margin        = grossRevenue > 0 ? (netProfit / grossRevenue) * 100 : 0
  const totalBlocks   = prod.reduce((s, r) => s + (parseFloat(r.Blocks) || 0), 0)
  const totalBroken   = qc.reduce((s, r) => s + (parseFloat(r.BrokenBlocks) || 0), 0)
  const costPerBlock  = totalBlocks > 0 ? totalMaterialOnly / totalBlocks : 0
  const cashIn        = cashRows.filter(r => r.Type === 'In').reduce((s, r) => s + (parseFloat(r.Amount) || 0), 0)
  const cashOut       = cashRows.filter(r => r.Type === 'Out').reduce((s, r) => s + (parseFloat(r.Amount) || 0), 0)
  const isProfit      = netProfit >= 0

  const trendData = buildTrend(prodRows, crmRows, 14)
  const prodBarData = prodRows.filter(r => isInPeriod(r.Date, 'Monthly')).slice(-10).map(r => ({
    label: new Date(r.Date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
    blocks: parseFloat(r.Blocks) || 0,
  }))
  const costPieData = [
    { name: 'Materials', value: Math.round(totalMaterialOnly), color: '#f97316' },
    { name: 'Labour',    value: Math.round(totalLabour),       color: '#3b82f6' },
    { name: 'Freight',   value: Math.round(totalFreight),      color: '#8b5cf6' },
    { name: 'Wastage',   value: Math.round(totalWastage),      color: '#ef4444' },
  ].filter(d => d.value > 0)

  const TABS = [['overview','Overview'],['statement','P&L'],['charts','Charts'],['cash','Cash']]

  return (
    <div className="max-w-lg mx-auto">
      {/* Header */}
      <div className="px-4 pt-4 pb-2">
        <h1 className="text-2xl font-bold text-gray-900"> P&L Dashboard</h1>
        <p className="text-sm text-gray-400 mt-0.5">Live from all modules · auto-calculated</p>
      </div>

      {/* Period selector */}
      <div className="px-4 mb-3">
        <div className="bg-white border border-gray-100 rounded-2xl p-1 shadow-sm flex">
          {PERIODS.map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all
                ${period===p ? 'bg-orange-500 text-white shadow-md shadow-orange-200' : 'text-gray-400'}`}>
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Section tabs */}
      <div className="flex gap-1.5 px-4 mb-4 overflow-x-auto pb-1">
        {TABS.map(([k,l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap shrink-0 transition-all
              ${tab===k ? 'bg-orange-500 text-white shadow-md shadow-orange-200' : 'bg-white border border-gray-200 text-gray-500'}`}>
            {l}
          </button>
        ))}
      </div>

      <div className="px-4 space-y-3 pb-6">
        {error && <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-2xl p-3">{error}</div>}

        {loading ? (
          <div className="text-center py-20 text-gray-400">
            <div className="text-5xl mb-3"></div>
            <p className="font-semibold">Loading dashboard...</p>
          </div>
        ) : <>

          {/* ── OVERVIEW ── */}
          {tab === 'overview' && <>
            {/* Hero */}
            <div className={`rounded-3xl p-5 text-white shadow-xl
              ${isProfit ? 'bg-gradient-to-br from-green-500 to-emerald-600 shadow-green-200'
                         : 'bg-gradient-to-br from-red-500 to-red-600 shadow-red-200'}`}>
              <p className="text-xs opacity-75 uppercase tracking-wide font-semibold">{period} Net {isProfit ? 'Profit' : 'Loss'}</p>
              <p className="text-4xl font-black mt-1">{formatINR(Math.abs(netProfit))}</p>
              <div className="grid grid-cols-3 gap-2 mt-4 text-xs">
                {[['Revenue', formatINR(grossRevenue)], ['Expenses', formatINR(totalExpenses)], ['Margin', `${margin.toFixed(1)}%`]].map(([l,v]) => (
                  <div key={l} className="bg-white/20 rounded-xl px-2 py-2.5 backdrop-blur-sm">
                    <p className="opacity-70 mb-1">{l}</p>
                    <p className="font-bold text-sm">{v}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Blocks Made',  value: totalBlocks.toLocaleString('en-IN'), icon: '', bg: 'bg-orange-50 border-orange-100' },
                { label: 'Cost / Block', value: formatINR(costPerBlock),             icon: '', bg: 'bg-blue-50 border-blue-100' },
                { label: 'Total Broken', value: totalBroken.toLocaleString('en-IN'), icon: '', bg: 'bg-red-50 border-red-100' },
                { label: 'Cash Balance', value: formatINR(cashIn - cashOut),         icon: '', bg: 'bg-green-50 border-green-100' },
              ].map(k => (
                <div key={k.label} className={`rounded-2xl p-4 border shadow-sm ${k.bg}`}>
                  <div className="flex justify-between items-start mb-2">
                    <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">{k.label}</p>
                    <span className="text-xl">{k.icon}</span>
                  </div>
                  <p className="text-xl font-bold text-gray-900">{k.value}</p>
                </div>
              ))}
            </div>

            {/* Margin bar */}
            {grossRevenue > 0 && (
              <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
                <div className="flex justify-between items-center mb-2">
                  <p className="text-sm font-bold text-gray-700">Profit Margin</p>
                  <p className={`text-lg font-black ${isProfit ? 'text-green-600' : 'text-red-500'}`}>{margin.toFixed(1)}%</p>
                </div>
                <div className="bg-gray-100 rounded-full h-3 overflow-hidden">
                  <div className={`h-3 rounded-full transition-all ${isProfit ? 'bg-green-500' : 'bg-red-500'}`}
                    style={{ width: `${Math.min(100, Math.abs(margin))}%` }} />
                </div>
              </div>
            )}
          </>}

          {/* ── P&L STATEMENT ── */}
          {tab === 'statement' && (
            <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3"> {period} Statement</p>

              <div className="bg-green-50 rounded-xl p-3 mb-3">
                <div className="flex justify-between"><span className="text-sm font-semibold text-green-700">↑ Gross Revenue</span>
                  <span className="text-sm font-bold text-green-600">{formatINR(grossRevenue)}</span></div>
              </div>

              <p className="text-xs text-gray-400 font-bold uppercase tracking-wide mb-1 mt-3">Cost of Goods Sold</p>
              <PLRow label=" Materials"  value={totalMaterialOnly} type="negative" indent />
              <PLRow label=" Labour"     value={totalLabour}       type="negative" indent />
              <PLRow label=" Freight"    value={totalFreight}      type="negative" indent />
              <PLRow label="Total COGS"    value={totalCOGS}         type="total" />

              <p className="text-xs text-gray-400 font-bold uppercase tracking-wide mb-1 mt-3">Other Losses</p>
              <PLRow label=" Wastage (QC)" value={totalWastage} type="negative" indent />

              <div className={`mt-3 rounded-2xl p-4 flex justify-between items-center
                ${isProfit ? 'bg-green-50' : 'bg-red-50'}`}>
                <span className={`font-bold ${isProfit ? 'text-green-700' : 'text-red-700'}`}>
                  = Net {isProfit ? 'Profit' : 'Loss'}
                </span>
                <span className={`text-xl font-black ${isProfit ? 'text-green-600' : 'text-red-600'}`}>
                  {formatINR(Math.abs(netProfit))}
                </span>
              </div>

              {/* Production stats */}
              <p className="text-xs text-gray-400 font-bold uppercase tracking-wide mb-2 mt-4"> Production</p>
              <div className="grid grid-cols-3 gap-2 text-xs text-center">
                {[
                  { label: 'Blocks', value: totalBlocks.toLocaleString('en-IN'), bg: 'bg-orange-50' },
                  { label: 'Broken', value: totalBroken.toLocaleString('en-IN'), bg: 'bg-red-50' },
                  { label: '₹/Block', value: formatINR(costPerBlock),            bg: 'bg-blue-50' },
                ].map(s => (
                  <div key={s.label} className={`${s.bg} rounded-xl p-2`}>
                    <p className="font-bold text-gray-800">{s.value}</p>
                    <p className="text-gray-400 mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── CHARTS ── */}
          {tab === 'charts' && <>
            {/* Revenue vs Cost trend */}
            <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
              <p className="text-sm font-bold text-gray-800 mb-1">Revenue vs Cost — 14 Days</p>
              <p className="text-xs text-gray-400 mb-3">Daily from CRM & Production</p>
              <ResponsiveContainer width="100%" height={170}>
                <AreaChart data={trendData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                  <defs>
                    <linearGradient id="rG" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#22c55e" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="cG" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#f97316" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#94a3b8' }} tickLine={false} axisLine={false} interval={2} />
                  <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} tickLine={false} axisLine={false} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#22c55e" strokeWidth={2} fill="url(#rG)" dot={false} />
                  <Area type="monotone" dataKey="cost"    name="Cost"    stroke="#f97316" strokeWidth={2} fill="url(#cG)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
              <div className="flex gap-4 justify-center mt-2">
                {[['#22c55e','Revenue'],['#f97316','Cost']].map(([c,l]) => (
                  <div key={l} className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full" style={{ background: c }} />
                    <span className="text-xs text-gray-500 font-semibold">{l}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Daily production bar */}
            {prodBarData.length > 0 && (
              <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
                <p className="text-sm font-bold text-gray-800 mb-1">Daily Production — This Month</p>
                <p className="text-xs text-gray-400 mb-3">Blocks produced per day</p>
                <ResponsiveContainer width="100%" height={140}>
                  <BarChart data={prodBarData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} tickLine={false} axisLine={false} tickFormatter={v => `${(v/1000).toFixed(1)}k`} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="blocks" name="Blocks" fill="#f97316" radius={[6,6,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Cost pie */}
            {costPieData.length > 0 && (
              <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
                <p className="text-sm font-bold text-gray-800 mb-3">Cost Breakdown</p>
                <div className="flex items-center gap-4">
                  <ResponsiveContainer width="50%" height={150}>
                    <PieChart>
                      <Pie data={costPieData} cx="50%" cy="50%" innerRadius={40} outerRadius={65}
                        dataKey="value" paddingAngle={3} stroke="none">
                        {costPieData.map((e, i) => <Cell key={i} fill={e.color} />)}
                      </Pie>
                      <Tooltip formatter={v => `₹${v.toLocaleString('en-IN')}`} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex-1 space-y-2">
                    {costPieData.map(item => (
                      <div key={item.name} className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: item.color }} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-gray-500 font-semibold">{item.name}</p>
                          <p className="text-xs font-bold text-gray-800">{formatINR(item.value)}</p>
                        </div>
                        <span className="text-xs text-gray-400">
                          {totalExpenses > 0 ? ((item.value/totalExpenses)*100).toFixed(0) : 0}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>}

          {/* ── CASH ── */}
          {tab === 'cash' && (
            <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3"> Cash Flow — All Time</p>
              <div className={`rounded-2xl p-4 mb-3 text-white ${(cashIn - cashOut) >= 0 ? 'bg-green-500' : 'bg-red-500'}`}>
                <p className="text-xs opacity-75 mb-1">Net Balance</p>
                <p className="text-3xl font-black">{formatINR(cashIn - cashOut)}</p>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                {[
                  { label: 'Cash In',  value: formatINR(cashIn),          bg: 'bg-green-50', color: 'text-green-600' },
                  { label: 'Cash Out', value: formatINR(cashOut),         bg: 'bg-red-50',   color: 'text-red-500' },
                  { label: 'Balance',  value: formatINR(cashIn - cashOut), bg: 'bg-blue-50',  color: 'text-blue-600' },
                ].map(c => (
                  <div key={c.label} className={`${c.bg} rounded-xl p-3`}>
                    <p className={`font-bold text-sm ${c.color}`}>{c.value}</p>
                    <p className="text-gray-400 mt-0.5">{c.label}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* No data */}
          {grossRevenue === 0 && totalExpenses === 0 && tab === 'overview' && (
            <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6 text-center">
              <p className="text-2xl mb-2"></p>
              <p className="font-semibold text-gray-600 text-sm">No data for {period.toLowerCase()} period</p>
              <p className="text-xs text-gray-400 mt-1">Try switching to "All Time" to see historical data</p>
            </div>
          )}

          <button onClick={() => window.location.reload()}
            className="w-full border border-gray-200 bg-white text-gray-500 font-semibold py-3 rounded-2xl text-sm shadow-sm">
             Refresh All Data
          </button>
        </>}
      </div>
    </div>
  )
}
