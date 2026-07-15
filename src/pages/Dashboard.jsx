import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../App.jsx'
import {
  computeInventory,
  computeMaterialInventory,
  loadCashFlow,
  loadCRM,
  loadPayroll,
  loadProduction,
  loadQC,
  loadVendors,
} from '../lib/sheets.js'
import { blocksToBrass, formatINR, formatNum, today } from '../lib/formulas.js'
import { MODULES, canAccessModule } from '../lib/permissions.js'
import { ModuleShell, StatusBadge, EmptyState } from '../components/ui.jsx'

const COLORS = ['Red', 'Yellow', 'Black', 'White']

function num(value) {
  return parseFloat(value) || 0
}

function dateValue(value) {
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

function isoDate(d) {
  return d.toISOString().split('T')[0]
}

function startOfWeek(d) {
  const out = new Date(d)
  const day = out.getDay() || 7
  out.setDate(out.getDate() - day + 1)
  return out
}

function getRange(period) {
  const now = new Date()
  if (period === 'today') {
    const day = isoDate(now)
    return { start: day, end: day }
  }
  if (period === 'week') return { start: isoDate(startOfWeek(now)), end: isoDate(now) }
  return { start: isoDate(new Date(now.getFullYear(), now.getMonth(), 1)), end: isoDate(now) }
}

function inRange(row, range) {
  const d = dateValue(row.Date || row.date)
  if (!d) return false
  if (range.start && d < dateValue(range.start)) return false
  if (range.end) {
    const end = dateValue(range.end)
    end.setHours(23, 59, 59, 999)
    if (d > end) return false
  }
  return true
}

function periodTitle(period) {
  if (period === 'today') return 'Today'
  if (period === 'week') return 'This Week'
  return 'This Month'
}

function QuickAction({ to, title, helper }) {
  return (
    <Link to={to} className="group rounded-2xl border border-slate-200 bg-white p-4 transition hover:-translate-y-0.5 hover:border-orange-200 hover:shadow-lg hover:shadow-slate-200/80">
      <p className="text-sm font-black text-slate-900">{title}</p>
      <p className="mt-1 text-xs leading-5 text-slate-500">{helper}</p>
      <p className="mt-3 text-xs font-black uppercase tracking-wide text-orange-500 opacity-0 transition group-hover:opacity-100">Open</p>
    </Link>
  )
}

function PeriodFilter({ period, setPeriod }) {
  return (
    <div className="flex rounded-2xl border border-slate-200 bg-slate-100 p-1">
      {[
        ['today', 'Today'],
        ['week', 'Weekly'],
        ['month', 'Monthly'],
      ].map(([key, label]) => (
        <button
          key={key}
          onClick={() => setPeriod(key)}
          className={`rounded-xl px-3 py-2 text-xs font-black transition ${
            period === key ? 'bg-orange-500 text-white shadow-sm shadow-orange-100' : 'text-slate-500 hover:bg-white hover:text-slate-900'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

function CardMenuDots() {
  return (
    <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-slate-300">
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden="true">
        <circle cx="12" cy="5" r="1.8" />
        <circle cx="12" cy="12" r="1.8" />
        <circle cx="12" cy="19" r="1.8" />
      </svg>
    </span>
  )
}

function DashboardCard({ title, subtitle, action, children, className = '' }) {
  return (
    <section className={`rounded-[28px] border border-slate-200/80 bg-white shadow-[0_12px_36px_rgba(15,23,42,0.045)] ${className}`}>
      {(title || subtitle || action) && (
        <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            {title && <h2 className="text-base font-black tracking-tight text-slate-950">{title}</h2>}
            {subtitle && <p className="mt-1 text-xs leading-5 text-slate-500">{subtitle}</p>}
          </div>
          {action || <CardMenuDots />}
        </div>
      )}
      <div className="p-5">{children}</div>
    </section>
  )
}

function OverviewPanel({ items, period, setPeriod }) {
  return (
    <section className="rounded-[30px] border border-slate-200/80 bg-white p-5 shadow-[0_14px_40px_rgba(15,23,42,0.05)] sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-black tracking-tight text-slate-950">Overview</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">Factory performance snapshot for {periodTitle(period).toLowerCase()}.</p>
        </div>
        <PeriodFilter period={period} setPeriod={setPeriod} />
      </div>

      <div className="mt-7 overflow-hidden rounded-[26px] border border-slate-200 bg-white">
        <div className="grid divide-y divide-slate-100 sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-4">
        {items.map(item => (
          <div key={item.label} className="p-5 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">{item.label}</p>
                <p className="mt-3 truncate text-3xl font-black tracking-tight text-slate-950">{item.value}</p>
              </div>
              {item.badge && <StatusBadge tone={item.tone}>{item.badge}</StatusBadge>}
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-500">{item.helper}</p>
          </div>
        ))}
        </div>
      </div>
    </section>
  )
}

function VerticalBars({ rows }) {
  if (!rows.length) {
    return <EmptyState title="No production rows" message="No production data is available for this period." />
  }
  const max = Math.max(...rows.map(r => r.value), 1)
  return (
    <div className="relative flex h-52 items-end gap-3 overflow-hidden rounded-3xl border border-slate-100 bg-gradient-to-b from-white to-slate-50 px-4 pt-6">
      <div className="pointer-events-none absolute inset-x-4 top-8 h-px bg-slate-100" />
      <div className="pointer-events-none absolute inset-x-4 top-20 h-px bg-slate-100" />
      <div className="pointer-events-none absolute inset-x-4 top-32 h-px bg-slate-100" />
      {rows.map(row => (
        <div key={row.label} className="relative z-10 flex min-w-0 flex-1 flex-col items-center justify-end gap-2">
          <div className="flex h-36 w-full items-end rounded-t-2xl bg-white px-1 shadow-inner shadow-slate-100">
            <div
              className="w-full rounded-t-2xl bg-gradient-to-t from-orange-500 to-orange-300"
              style={{ height: `${Math.max(10, (row.value / max) * 100)}%` }}
            />
          </div>
          <p className="w-full truncate text-center text-[10px] font-bold text-slate-400">{String(row.label).slice(5) || row.label}</p>
        </div>
      ))}
    </div>
  )
}

function TrendSummary({ label, value, helper, tone = 'green' }) {
  return (
    <div className="mt-5 flex items-end justify-between gap-3">
      <div>
        <p className="text-3xl font-black tracking-tight text-slate-950">{value}</p>
        <p className="mt-1 text-xs font-semibold text-slate-500">{helper}</p>
      </div>
      <StatusBadge tone={tone}>{label}</StatusBadge>
    </div>
  )
}

function MiniStatGrid({ items }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {items.map(item => (
        <div key={item.label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">{item.label}</p>
          <p className="mt-2 text-xl font-black tracking-tight text-slate-950">{item.value}</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">{item.helper}</p>
        </div>
      ))}
    </div>
  )
}

function SummaryLine({ title, helper, value, tone = 'slate' }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-black text-slate-900">{title}</p>
        <p className="mt-1 text-xs leading-5 text-slate-500">{helper}</p>
      </div>
      <StatusBadge tone={tone}>{value}</StatusBadge>
    </div>
  )
}

function StockList({ rows }) {
  return (
    <div className="space-y-3">
      {rows.map(row => (
        <div key={row.label} className="rounded-2xl border border-slate-200 bg-white p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-black text-slate-900">{row.label}</p>
            <StatusBadge tone={row.stock <= 0 ? 'red' : 'green'}>{row.stock <= 0 ? 'Low' : 'OK'}</StatusBadge>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full ${row.stock <= 0 ? 'bg-red-500' : 'bg-emerald-500'}`}
              style={{ width: `${Math.min(100, Math.max(8, row.percent))}%` }}
            />
          </div>
          <p className="mt-2 text-xs font-semibold text-slate-500">{Number(row.stock).toLocaleString('en-IN')} blocks</p>
        </div>
      ))}
    </div>
  )
}

function ActivityList({ rows }) {
  if (!rows.length) {
    return <EmptyState title="No recent activity" message="Recent production, dispatch, and cash rows will appear here." />
  }
  return (
    <div className="divide-y divide-slate-100">
      {rows.map((row, index) => (
        <div key={`${row.date}-${row.title}-${index}`} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-black text-slate-900">{row.title}</p>
            <p className="text-xs leading-5 text-slate-500">{row.detail}</p>
          </div>
          <p className="text-xs font-bold text-slate-400">{row.date || 'No date'}</p>
        </div>
      ))}
    </div>
  )
}

export default function Dashboard() {
  const { accessToken, access } = useApp()
  const [period, setPeriod] = useState('month')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')

    Promise.all([
      loadProduction(accessToken).catch(() => []),
      computeInventory(accessToken).catch(() => null),
      computeMaterialInventory(accessToken).catch(() => null),
      loadCRM(accessToken).catch(() => []),
      loadCashFlow(accessToken).catch(() => []),
      loadPayroll(accessToken).catch(() => []),
      loadVendors(accessToken).catch(() => []),
      loadQC(accessToken).catch(() => []),
    ])
      .then(([production, inventory, materials, crm, cash, payroll, vendors, qc]) => {
        if (active) setData({ production, inventory, materials, crm, cash, payroll, vendors, qc })
      })
      .catch(e => {
        if (active) setError('Could not load dashboard: ' + e.message)
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => { active = false }
  }, [accessToken])

  const summary = useMemo(() => {
    if (!data) return null
    const range = getRange(period)
    const todayDate = today()
    const productionRows = data.production.filter(r => inRange(r, range))
    const crmRows = data.crm.filter(r => inRange(r, range))
    const cashRows = data.cash.filter(r => inRange(r, range))
    const payrollRows = data.payroll.filter(r => inRange(r, range))
    const vendorRows = data.vendors.filter(r => inRange(r, range))
    const qcRows = data.qc.filter(r => inRange(r, range))

    const todayProduction = data.production
      .filter(r => r.Date === todayDate)
      .reduce((s, r) => s + num(r.Blocks), 0)
    const periodProduction = productionRows.reduce((s, r) => s + num(r.Blocks), 0)
    const stockBlocks = data.inventory
      ? COLORS.reduce((s, color) => s + num(data.inventory[color]?.stock), 0)
      : 0

    const pendingOrderRows = data.crm.filter(r => (r.Status || 'Order') === 'Order')
    const pendingDispatchBlocks = pendingOrderRows.reduce((s, r) => s + num(r.OrderBlocks), 0)
    const dispatchRows = crmRows.filter(r => r.Status === 'Dispatched' || num(r.DispatchBrass) > 0 || num(r.DispatchBlocks) > 0)
    const dispatchBlocks = dispatchRows.reduce((s, r) => s + num(r.DispatchBlocks), 0)
    const cashIn = cashRows.filter(r => r.Type === 'In').reduce((s, r) => s + num(r.Amount), 0)
    const cashOut = cashRows.filter(r => r.Type === 'Out').reduce((s, r) => s + num(r.Amount), 0)
    const revenue = dispatchRows.reduce((s, r) => s + num(r.DispatchBrass || r.OrderBrass) * num(r.Rate), 0)
    const receivablesView = pendingOrderRows.reduce((s, r) => s + num(r.OrderBrass || blocksToBrass(num(r.OrderBlocks))) * num(r.Rate), 0)
    const payrollWages = payrollRows.filter(r => r.Type === 'Wage').reduce((s, r) => s + num(r.Amount), 0)
    const payrollAdvances = payrollRows.filter(r => r.Type === 'Advance').reduce((s, r) => s + num(r.Amount), 0)
    const vendorPurchases = vendorRows.filter(r => r.Type === 'Invoice').reduce((s, r) => s + num(r.Amount), 0)
    const qcLoss = qcRows.reduce((s, r) => s + num(r.TotalLoss), 0)
    const materialCost = productionRows.reduce((s, r) => s + Math.max(num(r.TotalDailyCost) - num(r.LabourCost), 0), 0)
    const freight = crmRows.filter(r => num(r.FreightCharge) > 0).reduce((s, r) => s + num(r.FreightCharge), 0)
    const expenses = materialCost + payrollWages + freight + qcLoss
    const profit = revenue - expenses

    const productionByDate = Object.entries(productionRows.reduce((acc, row) => {
      const label = row.Date || 'No date'
      acc[label] = (acc[label] || 0) + num(row.Blocks)
      return acc
    }, {}))
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => String(a.label).localeCompare(String(b.label)))
      .slice(-7)

    const stockRows = COLORS.map(color => ({
      label: color,
      stock: num(data.inventory?.[color]?.stock),
    }))
    const maxStock = Math.max(...stockRows.map(r => Math.max(r.stock, 0)), 1)
    const stockHealth = stockRows.map(row => ({ ...row, percent: (Math.max(row.stock, 0) / maxStock) * 100 }))
    const lowStockColors = stockRows.filter(row => row.stock <= 0)
    const lowMaterials = data.materials
      ? Object.entries(data.materials).filter(([, m]) => num(m.stock) <= 0 && (num(m.opening) > 0 || num(m.purchased) > 0))
      : []

    const recentActivity = [
      ...productionRows.slice(-5).map(row => ({
        date: row.Date,
        title: 'Production recorded',
        detail: `${Number(num(row.Blocks)).toLocaleString('en-IN')} blocks produced`,
      })),
      ...crmRows.slice(-5).map(row => ({
        date: row.Date,
        title: row.Status === 'Dispatched' ? 'Dispatch updated' : 'Order activity',
        detail: `${row.ClientName || 'Client'} - ${row.Color || 'Color'} - ${Number(num(row.DispatchBlocks || row.OrderBlocks)).toLocaleString('en-IN')} blocks`,
      })),
      ...cashRows.slice(-5).map(row => ({
        date: row.Date,
        title: `Cash ${row.Type || 'entry'}`,
        detail: `${row.Source || 'Source'} - ${formatINR(num(row.Amount))}`,
      })),
    ]
      .filter(row => row.date || row.detail)
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
      .slice(0, 8)

    return {
      range,
      todayProduction,
      periodProduction,
      stockBlocks,
      pendingOrders: pendingOrderRows.length,
      pendingDispatchBlocks,
      dispatchBlocks,
      cashBalance: cashIn - cashOut,
      receivablesView,
      revenue,
      expenses,
      profit,
      payrollPayable: payrollWages - payrollAdvances,
      vendorPurchases,
      qcLoss,
      productionByDate,
      stockHealth,
      lowStockColors,
      lowMaterials,
      recentActivity,
      pendingOrderRows: pendingOrderRows.slice(0, 5),
    }
  }, [data, period])

  const can = moduleName => canAccessModule(access, moduleName)

  const kpis = summary ? [
    {
      label: period === 'today' ? 'Today Production' : 'Production',
      value: Number(period === 'today' ? summary.todayProduction : summary.periodProduction).toLocaleString('en-IN'),
      helper: `${formatNum(blocksToBrass(period === 'today' ? summary.todayProduction : summary.periodProduction), 2)} brass in ${periodTitle(period).toLowerCase()}`,
      badge: 'Output',
      tone: 'orange',
    },
    {
      label: 'Finished Stock',
      value: Number(summary.stockBlocks).toLocaleString('en-IN'),
      helper: `${formatNum(blocksToBrass(summary.stockBlocks), 2)} brass currently available`,
      badge: summary.lowStockColors.length ? `${summary.lowStockColors.length} low` : 'OK',
      tone: summary.lowStockColors.length ? 'red' : 'green',
    },
    {
      label: 'Pending Dispatch',
      value: summary.pendingOrders.toLocaleString('en-IN'),
      helper: `${Number(summary.pendingDispatchBlocks).toLocaleString('en-IN')} blocks still pending`,
      badge: summary.pendingOrders ? 'Open' : 'Clear',
      tone: summary.pendingOrders ? 'amber' : 'green',
    },
    {
      label: 'Cash Balance',
      value: formatINR(summary.cashBalance),
      helper: `Cash in minus cash out for ${periodTitle(period).toLowerCase()}`,
      badge: summary.cashBalance >= 0 ? 'Safe' : 'Watch',
      tone: summary.cashBalance >= 0 ? 'green' : 'red',
    },
  ] : []

  return (
    <ModuleShell
      eyebrow="Owner Overview"
      title="Dashboard"
      subtitle="Factory overview and daily business snapshot."
    >
      {error && <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-600">{error}</div>}

      {loading || !summary ? (
        <div className="space-y-5">
          <section className="grid gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/70 sm:grid-cols-2 xl:grid-cols-4">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-100" />)}
          </section>
          <section className="grid gap-4 lg:grid-cols-[1fr_360px]">
            <div className="h-80 animate-pulse rounded-3xl bg-slate-100" />
            <div className="h-80 animate-pulse rounded-3xl bg-slate-100" />
          </section>
        </div>
      ) : (
        <div className="space-y-5">
          <OverviewPanel items={kpis} period={period} setPeriod={setPeriod} />

          <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
            <div className="space-y-5">
              <div className="grid gap-5 lg:grid-cols-2">
                <DashboardCard title="Production Trend" subtitle={`${periodTitle(period)} output using existing Production_Log rows.`}>
                  <VerticalBars rows={summary.productionByDate} />
                  <TrendSummary
                    label="Output"
                    value={Number(summary.periodProduction).toLocaleString('en-IN')}
                    helper={`${formatNum(blocksToBrass(summary.periodProduction), 2)} brass in selected period`}
                    tone="orange"
                  />
                </DashboardCard>

                <DashboardCard title="Stock Health" subtitle="Finished stock by color from existing inventory calculation.">
                  <StockList rows={summary.stockHealth} />
                </DashboardCard>
              </div>

              <DashboardCard title="Dispatch & Orders" subtitle="Open orders, dispatched blocks, and receivables view.">
                <MiniStatGrid
                  items={[
                    {
                      label: 'Pending Orders',
                      value: summary.pendingOrders,
                      helper: `${Number(summary.pendingDispatchBlocks).toLocaleString('en-IN')} blocks waiting`,
                    },
                    {
                      label: 'Dispatch',
                      value: Number(summary.dispatchBlocks).toLocaleString('en-IN'),
                      helper: `${periodTitle(period)} dispatch blocks`,
                    },
                    {
                      label: 'Receivables',
                      value: formatINR(summary.receivablesView),
                      helper: 'Pending CRM order value estimate',
                    },
                    {
                      label: 'Low Stock',
                      value: summary.lowStockColors.length + summary.lowMaterials.length,
                      helper: 'Finished colors plus raw material alerts',
                    },
                  ]}
                />
              </DashboardCard>
            </div>

            <aside className="space-y-5">
              <DashboardCard title="Owner Summary" subtitle="Compact attention panel for daily review.">
                <div className="space-y-3">
                  <SummaryLine title="Order Status" helper={`${Number(summary.pendingDispatchBlocks).toLocaleString('en-IN')} blocks pending dispatch`} value={summary.pendingOrders ? `${summary.pendingOrders} open` : 'Clear'} tone={summary.pendingOrders ? 'amber' : 'green'} />
                  <SummaryLine title="Low Stock" helper={`Finished colors: ${summary.lowStockColors.map(r => r.label).join(', ') || 'none'}`} value={summary.lowStockColors.length || summary.lowMaterials.length ? 'Review' : 'OK'} tone={summary.lowStockColors.length || summary.lowMaterials.length ? 'red' : 'green'} />
                  <SummaryLine title="Cash Flow" helper={`${periodTitle(period)} cash movement`} value={summary.cashBalance >= 0 ? 'Positive' : 'Negative'} tone={summary.cashBalance >= 0 ? 'green' : 'red'} />
                  <SummaryLine title="Profit / Loss" helper="Dispatch revenue minus expense view" value={summary.profit >= 0 ? 'Profit' : 'Loss'} tone={summary.profit >= 0 ? 'green' : 'red'} />
                </div>
              </DashboardCard>

              <DashboardCard title="Finance Snapshot" subtitle="Read-only display from existing rows.">
                <div className="space-y-3">
                  <div className="flex items-center justify-between rounded-2xl bg-slate-50 p-3">
                    <p className="text-sm font-bold text-slate-600">Revenue</p>
                    <p className="text-sm font-black text-slate-950">{formatINR(summary.revenue)}</p>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl bg-slate-50 p-3">
                    <p className="text-sm font-bold text-slate-600">Expenses</p>
                    <p className="text-sm font-black text-slate-950">{formatINR(summary.expenses)}</p>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl bg-orange-50 p-3">
                    <p className="text-sm font-bold text-orange-700">Profit / Loss</p>
                    <p className="text-sm font-black text-slate-950">{formatINR(summary.profit)}</p>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-1">
                    <SummaryLine title="Payroll Payable" helper="Wages minus advances" value={formatINR(summary.payrollPayable)} tone="slate" />
                    <SummaryLine title="Vendor Purchases" helper="Invoice rows" value={formatINR(summary.vendorPurchases)} tone="slate" />
                    <SummaryLine title="QC Loss" helper="Existing TotalLoss field" value={formatINR(summary.qcLoss)} tone={summary.qcLoss > 0 ? 'amber' : 'green'} />
                  </div>
                </div>
              </DashboardCard>
            </aside>
          </div>

          <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
            <DashboardCard title="Recent Activity" subtitle="Recent production, order, dispatch, and cash rows for the selected period.">
              <ActivityList rows={summary.recentActivity} />
            </DashboardCard>

            <DashboardCard title="Pending Orders" subtitle="Open CRM orders requiring dispatch attention.">
              {summary.pendingOrderRows.length ? (
                <div className="space-y-3">
                  {summary.pendingOrderRows.map((order, index) => (
                    <div key={`${order.Date}-${order.ClientName}-${index}`} className="rounded-2xl border border-slate-200 bg-white p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-slate-900">{order.ClientName || 'Unnamed client'}</p>
                          <p className="mt-1 text-xs text-slate-500">{order.Date || 'No date'} - {order.Color || 'No color'}</p>
                        </div>
                        <StatusBadge tone="amber">Pending</StatusBadge>
                      </div>
                      <p className="mt-2 text-xs font-bold text-slate-500">{Number(num(order.OrderBlocks)).toLocaleString('en-IN')} blocks pending</p>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="No pending orders" message="Open CRM orders will appear here." />
              )}
            </DashboardCard>
          </div>

          <DashboardCard title="Quick Actions" subtitle="Shortcuts only. No data is written from this dashboard.">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {can(MODULES.production) && <QuickAction to="/production" title="Add Production" helper="Record today's block output." />}
              {can(MODULES.crm) && <QuickAction to="/crm" title="Orders & Dispatch" helper="View orders or record dispatch." />}
              {can(MODULES.inventory) && <QuickAction to="/inventory" title="Check Stock" helper="Review finished stock by color." />}
              {can(MODULES.cashFlow) && <QuickAction to="/cashflow" title="Cash Flow" helper="Review cash in and out." />}
              {can(MODULES.pl) && <QuickAction to="/reports" title="Reports Center" helper="Open read-only owner reports." />}
              {!can(MODULES.production) && !can(MODULES.inventory) && !can(MODULES.crm) && (
                <EmptyState title="No quick actions available" message="Your account has limited module permissions." />
              )}
            </div>
          </DashboardCard>
        </div>
      )}
    </ModuleShell>
  )
}
