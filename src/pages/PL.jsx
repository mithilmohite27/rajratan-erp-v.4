import React, { useState, useEffect } from 'react'
import { useApp } from '../App.jsx'
import { loadProduction, loadCRM, loadPayroll, loadQC, loadCashFlow } from '../lib/sheets.js'
import { formatINR } from '../lib/formulas.js'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts'

// ── Period helpers ─────────────────────────────
const PERIODS = ['Daily', 'Weekly', 'Monthly', 'All Time']

function isInPeriod(dateStr, period) {
  if (!dateStr) return false
  const d   = new Date(dateStr)
  const now = new Date()
  if (period === 'Daily')    return d.toDateString() === now.toDateString()
  if (period === 'Weekly')   { const w = new Date(); w.setDate(now.getDate()-7); return d >= w && d <= now }
  if (period === 'Monthly')  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  if (period === 'All Time') return true
  return true
}

// Build last-N-days revenue + cost trend
function buildTrendData(prodRows, crmRows, days = 14) {
  const result = []
  const now = new Date()
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(now.getDate() - i)
    const label = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
    const dateStr = d.toDateString()

    const rev = crmRows
      .filter(r => new Date(r.Date).toDateString() === dateStr && parseFloat(r.DispatchBrass) > 0)
      .reduce((s, r) => {
        const rate = parseFloat(r.Rate) || 0
        return s + parseFloat(r.DispatchBrass) * rate
      }, 0)

    const cost = prodRows
      .filter(r => new Date(r.Date).toDateString() === dateStr)
      .reduce((s, r) => s + (parseFloat(r.TotalDailyCost) || 0), 0)

    result.push({ label, revenue: Math.round(rev), cost: Math.round(cost), profit: Math.round(rev - cost) })
  }
  return result
}

// Custom tooltip for charts
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: '#1e293b', border: '1px solid #334155', borderRadius: 12,
      padding: '10px 14px', fontSize: 12, color: '#e2e8f0', boxShadow: '0 8px 32px rgba(0,0,0,0.3)'
    }}>
      <p style={{ fontWeight: 700, marginBottom: 6, color: '#94a3b8' }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color, marginBottom: 2 }}>
          {p.name}: ₹{p.value?.toLocaleString('en-IN')}
        </p>
      ))}
    </div>
  )
}

// ── KPI Card ──────────────────────────────────
function KpiCard({ label, value, sub, icon, color, trend, trendUp }) {
  return (
    <div style={{
      background: '#fff', borderRadius: 16, padding: '18px 20px',
      border: '1px solid #f1f5f9', boxShadow: '0 2px 12px rgba(15,23,42,0.06)',
      display: 'flex', flexDirection: 'column', gap: 8, position: 'relative', overflow: 'hidden'
    }}>
      <div style={{ position: 'absolute', top: 0, right: 0, width: 80, height: 80,
        background: `${color}10`, borderRadius: '0 16px 0 80px' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {label}
        </span>
        <span style={{ fontSize: 20 }}>{icon}</span>
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>{value}</div>
      {(sub || trend) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {trend && (
            <span style={{
              fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
              background: trendUp ? '#dcfce7' : '#fee2e2',
              color: trendUp ? '#16a34a' : '#dc2626'
            }}>
              {trendUp ? '▲' : '▼'} {trend}
            </span>
          )}
          {sub && <span style={{ fontSize: 11, color: '#94a3b8' }}>{sub}</span>}
        </div>
      )}
    </div>
  )
}

// ── Section header ────────────────────────────
function SectionHead({ title, sub }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <p style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', margin: 0 }}>{title}</p>
      {sub && <p style={{ fontSize: 11, color: '#94a3b8', margin: '2px 0 0' }}>{sub}</p>}
    </div>
  )
}

// ── Main PL Dashboard ─────────────────────────
export default function PL() {
  const { accessToken } = useApp()
  const [period, setPeriod] = useState('Monthly')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

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
      setProdRows(prod); setCrmRows(crm); setPayRows(pay)
      setQcRows(qc); setCashRows(cash)
      setLoading(false)
    }).catch(e => { setError(e.message); setLoading(false) })
  }, [])

  const fp = rows => rows.filter(r => isInPeriod(r.Date, period))
  const prod = fp(prodRows); const crm = fp(crmRows)
  const pay  = fp(payRows);  const qc  = fp(qcRows)

  // ── Core Metrics ──────────────────────────
  const grossRevenue = crmRows
    .filter(r => parseFloat(r.DispatchBrass) > 0 && isInPeriod(r.Date, period))
    .reduce((s, r) => s + parseFloat(r.DispatchBrass) * (parseFloat(r.Rate) || 0), 0)

  const totalMaterialOnly = prod.reduce((s, r) =>
    s + (parseFloat(r.TotalDailyCost) || 0) - (parseFloat(r.LabourCost) || 0), 0)

  const totalLabour = pay.filter(r => r.Type === 'Wage')
    .reduce((s, r) => s + (parseFloat(r.Amount) || 0), 0)

  const totalFreight = crm.filter(r => parseFloat(r.FreightCharge) > 0)
    .reduce((s, r) => s + (parseFloat(r.FreightCharge) || 0), 0)

  const totalWastage = qc.reduce((s, r) => s + (parseFloat(r.TotalLoss) || 0), 0)

  const totalCOGS    = totalMaterialOnly + totalLabour + totalFreight
  const totalExpenses = totalCOGS + totalWastage
  const netProfit    = grossRevenue - totalExpenses
  const margin       = grossRevenue > 0 ? (netProfit / grossRevenue) * 100 : 0

  const totalBlocks  = prod.reduce((s, r) => s + (parseFloat(r.Blocks) || 0), 0)
  const totalBroken  = qc.reduce((s, r) => s + (parseFloat(r.BrokenBlocks) || 0), 0)
  const costPerBlock = totalBlocks > 0 ? totalMaterialOnly / totalBlocks : 0

  // Cash flow summary
  const cashIn  = cashRows.filter(r => r.Type === 'In').reduce((s, r) => s + (parseFloat(r.Amount) || 0), 0)
  const cashOut = cashRows.filter(r => r.Type === 'Out').reduce((s, r) => s + (parseFloat(r.Amount) || 0), 0)

  // ── Chart Data ────────────────────────────
  const trendData = buildTrendData(prodRows, crmRows, 14)

  const costPieData = [
    { name: 'Materials', value: Math.round(totalMaterialOnly), color: '#f97316' },
    { name: 'Labour',    value: Math.round(totalLabour),       color: '#3b82f6' },
    { name: 'Freight',   value: Math.round(totalFreight),      color: '#8b5cf6' },
    { name: 'Wastage',   value: Math.round(totalWastage),      color: '#ef4444' },
  ].filter(d => d.value > 0)

  // Monthly production blocks per day
  const prodBarData = prodRows
    .filter(r => isInPeriod(r.Date, 'Monthly'))
    .slice(-10)
    .map(r => ({
      label: new Date(r.Date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
      blocks: parseFloat(r.Blocks) || 0,
      cost:   parseFloat(r.TotalDailyCost) || 0,
    }))

  const isProfit = netProfit >= 0

  // ── Styles ────────────────────────────────
  const S = {
    page:    { background: '#f8fafc', minHeight: '100vh', fontFamily: "'DM Sans', system-ui, sans-serif", paddingBottom: 80 },
    header:  { background: '#fff', padding: '16px 20px 14px', borderBottom: '1px solid #f1f5f9', position: 'sticky', top: 48, zIndex: 10 },
    section: { margin: '0 16px 16px', background: '#fff', borderRadius: 20, padding: '18px 16px', border: '1px solid #f1f5f9', boxShadow: '0 2px 12px rgba(15,23,42,0.04)' },
    grid2:   { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, margin: '0 16px 16px' },
    grid4:   { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, margin: '0 16px 16px' },
  }

  if (loading) return (
    <div style={{ ...S.page, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '80vh', gap: 12 }}>
      <div style={{ fontSize: 48 }}>📊</div>
      <p style={{ color: '#64748b', fontWeight: 600, fontSize: 16 }}>Loading dashboard...</p>
      <p style={{ color: '#94a3b8', fontSize: 12 }}>Production · CRM · Payroll · QC · Cash</p>
    </div>
  )

  return (
    <div style={S.page}>
      {/* ── Header ── */}
      <div style={S.header}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', margin: 0 }}>📊 P&L Dashboard</h1>
            <p style={{ fontSize: 11, color: '#94a3b8', margin: '2px 0 0' }}>Live from all modules · auto-calculated</p>
          </div>
          <button onClick={() => window.location.reload()}
            style={{ background: '#f1f5f9', border: 'none', borderRadius: 10, padding: '6px 12px', fontSize: 12, fontWeight: 600, color: '#64748b', cursor: 'pointer' }}>
            🔄 Refresh
          </button>
        </div>

        {/* Period pills */}
        <div style={{ display: 'flex', gap: 6, marginTop: 12, background: '#f8fafc', borderRadius: 12, padding: 4 }}>
          {PERIODS.map(p => (
            <button key={p} onClick={() => setPeriod(p)} style={{
              flex: 1, padding: '7px 4px', borderRadius: 8, border: 'none', cursor: 'pointer',
              fontSize: 11, fontWeight: 700,
              background: period === p ? '#f97316' : 'transparent',
              color: period === p ? '#fff' : '#94a3b8',
              transition: 'all 0.15s',
            }}>{p}</button>
          ))}
        </div>
      </div>

      {error && (
        <div style={{ margin: '12px 16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: '10px 14px', color: '#dc2626', fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* ── Hero Net Profit Banner ── */}
      <div style={{
        margin: '16px 16px 0',
        background: isProfit
          ? 'linear-gradient(135deg, #16a34a 0%, #059669 100%)'
          : 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
        borderRadius: 20, padding: '22px 20px',
        boxShadow: isProfit ? '0 8px 32px rgba(22,163,74,0.25)' : '0 8px 32px rgba(220,38,38,0.25)',
        color: '#fff', position: 'relative', overflow: 'hidden'
      }}>
        {/* Background pattern */}
        <div style={{ position: 'absolute', top: -30, right: -30, width: 160, height: 160, background: 'rgba(255,255,255,0.06)', borderRadius: '50%' }} />
        <div style={{ position: 'absolute', bottom: -50, right: 40, width: 100, height: 100, background: 'rgba(255,255,255,0.04)', borderRadius: '50%' }} />

        <p style={{ fontSize: 12, opacity: 0.75, margin: '0 0 6px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {period} Net {isProfit ? 'Profit' : 'Loss'}
        </p>
        <p style={{ fontSize: 36, fontWeight: 900, margin: '0 0 16px', letterSpacing: '-0.02em' }}>
          {formatINR(Math.abs(netProfit))}
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          {[
            { label: 'Revenue', value: formatINR(grossRevenue) },
            { label: 'Expenses', value: formatINR(totalExpenses) },
            { label: 'Margin', value: `${margin.toFixed(1)}%` },
          ].map(item => (
            <div key={item.label} style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 12, padding: '10px 12px', backdropFilter: 'blur(8px)' }}>
              <p style={{ fontSize: 10, opacity: 0.75, margin: '0 0 4px', fontWeight: 600 }}>{item.label}</p>
              <p style={{ fontSize: 13, fontWeight: 800, margin: 0 }}>{item.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── KPI Grid ── */}
      <div style={{ ...S.grid4, marginTop: 16 }}>
        <KpiCard label="Blocks Made"   value={totalBlocks.toLocaleString('en-IN')} icon="🧱" color="#f97316" sub={`${period}`} />
        <KpiCard label="Cost / Block"  value={formatINR(costPerBlock)}             icon="💰" color="#3b82f6" sub="from production" />
        <KpiCard label="Cash In"       value={formatINR(cashIn)}                   icon="📈" color="#16a34a" sub="all time" />
        <KpiCard label="Blocks Broken" value={totalBroken.toLocaleString('en-IN')} icon="🔴" color="#ef4444" sub="QC losses" />
      </div>

      {/* ── Revenue vs Cost Trend (14 days) ── */}
      <div style={S.section}>
        <SectionHead title="Revenue vs Cost — Last 14 Days" sub="Daily comparison from CRM & Production" />
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={trendData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#22c55e" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="costGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#f97316" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#94a3b8' }} tickLine={false} axisLine={false} interval={1} />
            <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} tickLine={false} axisLine={false} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} />
            <Tooltip content={<CustomTooltip />} />
            <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#22c55e" strokeWidth={2} fill="url(#revGrad)" dot={false} />
            <Area type="monotone" dataKey="cost"    name="Cost"    stroke="#f97316" strokeWidth={2} fill="url(#costGrad)" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
        <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 8 }}>
          {[['#22c55e','Revenue'],['#f97316','Cost']].map(([c,l]) => (
            <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: c }} />
              <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>{l}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Production Blocks Bar ── */}
      {prodBarData.length > 0 && (
        <div style={S.section}>
          <SectionHead title="Daily Production — This Month" sub="Blocks produced per day" />
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={prodBarData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} tickLine={false} axisLine={false} tickFormatter={v => `${(v/1000).toFixed(1)}k`} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="blocks" name="Blocks" fill="#f97316" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── P&L Statement + Cost Pie ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12, margin: '0 16px 16px' }}>

        {/* P&L Statement */}
        <div style={{ background: '#fff', borderRadius: 20, padding: '18px 16px', border: '1px solid #f1f5f9', boxShadow: '0 2px 12px rgba(15,23,42,0.04)' }}>
          <SectionHead title="📋 P&L Statement" sub={`${period} breakdown`} />

          {/* Revenue */}
          <div style={{ background: '#f0fdf4', borderRadius: 12, padding: '10px 14px', marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#15803d' }}>↑ Gross Revenue</span>
              <span style={{ fontSize: 14, fontWeight: 800, color: '#16a34a' }}>{formatINR(grossRevenue)}</span>
            </div>
          </div>

          {/* Cost rows */}
          <p style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '12px 0 6px' }}>Cost of Goods Sold</p>
          {[
            { label: '🏗 Materials',   value: totalMaterialOnly, pct: grossRevenue > 0 ? (totalMaterialOnly/grossRevenue)*100 : 0 },
            { label: '👷 Labour',      value: totalLabour,       pct: grossRevenue > 0 ? (totalLabour/grossRevenue)*100       : 0 },
            { label: '🚛 Freight',     value: totalFreight,      pct: grossRevenue > 0 ? (totalFreight/grossRevenue)*100      : 0 },
          ].map(row => (
            <div key={row.label} style={{ display: 'flex', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid #f8fafc' }}>
              <span style={{ flex: 1, fontSize: 12, color: '#475569', paddingLeft: 8 }}>{row.label}</span>
              <div style={{ width: 60, height: 4, background: '#f1f5f9', borderRadius: 4, marginRight: 10, overflow: 'hidden' }}>
                <div style={{ width: `${Math.min(100, row.pct)}%`, height: '100%', background: '#f97316', borderRadius: 4 }} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#ef4444', minWidth: 80, textAlign: 'right' }}>{formatINR(row.value)}</span>
            </div>
          ))}

          {/* Total COGS */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 8px', background: '#fef3c7', borderRadius: 10, margin: '8px 0' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#92400e' }}>Total COGS</span>
            <span style={{ fontSize: 13, fontWeight: 800, color: '#d97706' }}>{formatINR(totalCOGS)}</span>
          </div>

          {/* Other losses */}
          <p style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '10px 0 6px' }}>Other Losses</p>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 8px', borderBottom: '1px solid #f8fafc' }}>
            <span style={{ fontSize: 12, color: '#475569', paddingLeft: 8 }}>🔴 Breakage & Wastage (QC)</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#ef4444' }}>{formatINR(totalWastage)}</span>
          </div>

          {/* Net profit */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '14px 16px', marginTop: 10, borderRadius: 14,
            background: isProfit ? 'linear-gradient(135deg, #dcfce7, #bbf7d0)' : 'linear-gradient(135deg, #fee2e2, #fecaca)'
          }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: isProfit ? '#15803d' : '#b91c1c' }}>
              = Net {isProfit ? 'Profit' : 'Loss'}
            </span>
            <span style={{ fontSize: 18, fontWeight: 900, color: isProfit ? '#16a34a' : '#dc2626' }}>
              {formatINR(Math.abs(netProfit))}
            </span>
          </div>
        </div>

        {/* Cost Pie + Cash */}
        {costPieData.length > 0 && (
          <div style={{ background: '#fff', borderRadius: 20, padding: '18px 16px', border: '1px solid #f1f5f9', boxShadow: '0 2px 12px rgba(15,23,42,0.04)' }}>
            <SectionHead title="💸 Cost Breakdown" sub="Where money goes" />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ResponsiveContainer width="50%" height={150}>
                <PieChart>
                  <Pie data={costPieData} cx="50%" cy="50%" innerRadius={40} outerRadius={65}
                    dataKey="value" paddingAngle={3} stroke="none">
                    {costPieData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={v => `₹${v.toLocaleString('en-IN')}`} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ flex: 1 }}>
                {costPieData.map(item => (
                  <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: item.color, flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 11, color: '#475569', fontWeight: 600, margin: 0 }}>{item.name}</p>
                      <p style={{ fontSize: 12, color: '#0f172a', fontWeight: 800, margin: 0 }}>{formatINR(item.value)}</p>
                    </div>
                    <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>
                      {totalExpenses > 0 ? ((item.value / totalExpenses) * 100).toFixed(0) : 0}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Cash Flow summary */}
        <div style={{ background: '#fff', borderRadius: 20, padding: '18px 16px', border: '1px solid #f1f5f9', boxShadow: '0 2px 12px rgba(15,23,42,0.04)' }}>
          <SectionHead title="💰 Cash Flow (All Time)" sub="Factory + External accounts" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            {[
              { label: 'Total In',  value: formatINR(cashIn),          color: '#16a34a', bg: '#f0fdf4' },
              { label: 'Total Out', value: formatINR(cashOut),         color: '#dc2626', bg: '#fef2f2' },
              { label: 'Balance',   value: formatINR(cashIn - cashOut), color: cashIn >= cashOut ? '#2563eb' : '#dc2626', bg: '#eff6ff' },
            ].map(c => (
              <div key={c.label} style={{ background: c.bg, borderRadius: 12, padding: '12px 10px', textAlign: 'center' }}>
                <p style={{ fontSize: 10, color: '#64748b', fontWeight: 600, margin: '0 0 4px' }}>{c.label}</p>
                <p style={{ fontSize: 12, fontWeight: 800, color: c.color, margin: 0 }}>{c.value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Production Stats */}
        <div style={{ background: '#fff', borderRadius: 20, padding: '18px 16px', border: '1px solid #f1f5f9', boxShadow: '0 2px 12px rgba(15,23,42,0.04)' }}>
          <SectionHead title="🏭 Production Stats" sub={`${period} summary`} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            {[
              { label: 'Blocks Made',  value: totalBlocks.toLocaleString('en-IN'),  bg: '#fff7ed', color: '#c2410c' },
              { label: 'Broken',       value: totalBroken.toLocaleString('en-IN'),   bg: '#fef2f2', color: '#dc2626' },
              { label: 'Cost/Block',   value: formatINR(costPerBlock),               bg: '#eff6ff', color: '#1d4ed8' },
            ].map(s => (
              <div key={s.label} style={{ background: s.bg, borderRadius: 12, padding: '12px 10px', textAlign: 'center' }}>
                <p style={{ fontSize: 10, color: '#64748b', fontWeight: 600, margin: '0 0 4px' }}>{s.label}</p>
                <p style={{ fontSize: 13, fontWeight: 800, color: s.color, margin: 0 }}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* Margin bar */}
          {grossRevenue > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Profit Margin</span>
                <span style={{ fontSize: 14, fontWeight: 800, color: isProfit ? '#16a34a' : '#dc2626' }}>
                  {margin.toFixed(1)}%
                </span>
              </div>
              <div style={{ background: '#f1f5f9', borderRadius: 8, height: 10, overflow: 'hidden' }}>
                <div style={{
                  width: `${Math.min(100, Math.abs(margin))}%`, height: '100%', borderRadius: 8,
                  background: isProfit ? 'linear-gradient(90deg, #22c55e, #16a34a)' : '#ef4444',
                  transition: 'width 0.6s ease'
                }} />
              </div>
            </div>
          )}
        </div>

      </div>

      {/* No data */}
      {grossRevenue === 0 && totalExpenses === 0 && (
        <div style={{ margin: '0 16px 16px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 20, padding: '32px 20px', textAlign: 'center' }}>
          <p style={{ fontSize: 32, margin: '0 0 8px' }}>📭</p>
          <p style={{ fontSize: 15, fontWeight: 700, color: '#475569', margin: '0 0 4px' }}>No data for {period.toLowerCase()} period</p>
          <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>Log production, dispatch orders in CRM, and record wages in Payroll</p>
        </div>
      )}
    </div>
  )
}