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
import { ModuleShell, SectionCard, StatCard, StatusBadge, EmptyState } from '../components/ui.jsx'

const COLORS = ['Red', 'Yellow', 'Black', 'White']

function num(value) {
  return parseFloat(value) || 0
}

function QuickAction({ to, title, helper }) {
  return (
    <Link to={to} className="rounded-2xl border border-slate-200 bg-white p-3 transition hover:border-orange-200 hover:bg-orange-50">
      <p className="text-sm font-black text-slate-900">{title}</p>
      <p className="mt-1 text-xs leading-5 text-slate-500">{helper}</p>
    </Link>
  )
}

export default function Dashboard() {
  const { accessToken, access, user } = useApp()
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
    const todayDate = today()
    const todayProduction = data.production
      .filter(r => r.Date === todayDate)
      .reduce((s, r) => s + num(r.Blocks), 0)
    const monthKey = todayDate.slice(0, 7)
    const monthProduction = data.production
      .filter(r => String(r.Date || '').startsWith(monthKey))
      .reduce((s, r) => s + num(r.Blocks), 0)

    const stockBlocks = data.inventory
      ? COLORS.reduce((s, color) => s + num(data.inventory[color]?.stock), 0)
      : 0

    const pendingOrderRows = data.crm.filter(r => (r.Status || 'Order') === 'Order')
    const pendingOrders = pendingOrderRows.length
    const pendingDispatchBlocks = pendingOrderRows.reduce((s, r) => s + num(r.OrderBlocks), 0)
    const dispatchedToday = data.crm
      .filter(r => r.Date === todayDate && r.Status === 'Dispatched')
      .reduce((s, r) => s + num(r.DispatchBlocks), 0)

    const cashIn = data.cash.filter(r => r.Type === 'In').reduce((s, r) => s + num(r.Amount), 0)
    const cashOut = data.cash.filter(r => r.Type === 'Out').reduce((s, r) => s + num(r.Amount), 0)
    const payrollAdvances = data.payroll
      .filter(r => r.Type === 'Advance')
      .reduce((s, r) => s + num(r.Amount), 0)
    const payrollWages = data.payroll
      .filter(r => r.Type === 'Wage')
      .reduce((s, r) => s + num(r.Amount), 0)
    const vendorPurchases = data.vendors
      .filter(r => r.Type === 'Invoice')
      .reduce((s, r) => s + num(r.Amount), 0)
    const qcLoss = data.qc.reduce((s, r) => s + num(r.TotalLoss), 0)

    const lowMaterials = data.materials
      ? Object.entries(data.materials).filter(([, m]) => num(m.stock) <= 0 && (num(m.opening) > 0 || num(m.purchased) > 0))
      : []
    const lowStockColors = data.inventory
      ? COLORS.filter(color => num(data.inventory[color]?.stock) <= 0)
      : []

    return {
      todayProduction,
      monthProduction,
      stockBlocks,
      pendingOrders,
      pendingDispatchBlocks,
      dispatchedToday,
      cashBalance: cashIn - cashOut,
      payrollAdvances,
      payrollPayable: payrollWages - payrollAdvances,
      vendorPurchases,
      qcLoss,
      lowMaterials,
      lowStockColors,
    }
  }, [data])

  const can = moduleName => canAccessModule(access, moduleName)

  return (
    <ModuleShell
      eyebrow="Owner Overview"
      title={`Good day${user?.name ? `, ${user.name.split(' ')[0]}` : ''}`}
      subtitle="A read-only snapshot of production, stock, orders, cash, and payroll using existing Google Sheet data."
    >
      {error && <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-600">{error}</div>}

      {loading || !summary ? (
        <SectionCard>
          <div className="py-10 text-center text-sm font-semibold text-slate-400">Loading business overview...</div>
        </SectionCard>
      ) : (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Today Production"
              value={Number(summary.todayProduction).toLocaleString('en-IN')}
              helper={`${formatNum(blocksToBrass(summary.todayProduction), 2)} brass produced today`}
              icon="🏭"
            />
            <StatCard
              label="Finished Stock"
              value={Number(summary.stockBlocks).toLocaleString('en-IN')}
              helper={`${formatNum(blocksToBrass(summary.stockBlocks), 2)} brass available`}
              icon="📦"
              accent="slate"
            />
            <StatCard
              label="Pending Orders"
              value={summary.pendingOrders}
              helper={`${Number(summary.pendingDispatchBlocks).toLocaleString('en-IN')} blocks pending dispatch`}
              icon="🤝"
              accent="blue"
            />
            <StatCard
              label="Cash Position"
              value={formatINR(summary.cashBalance)}
              helper={`${formatINR(summary.payrollAdvances)} payroll advances recorded`}
              icon="💰"
              accent={summary.cashBalance >= 0 ? 'green' : 'orange'}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <SectionCard title="Factory Pulse" subtitle="Read-only checks from existing production, CRM, and stock tabs.">
              <div className="space-y-3">
                <div className="flex items-center justify-between rounded-2xl bg-slate-50 p-3">
                  <div>
                    <p className="text-sm font-black text-slate-900">This month production</p>
                    <p className="text-xs text-slate-500">{formatNum(blocksToBrass(summary.monthProduction), 2)} brass produced this month</p>
                  </div>
                  <StatusBadge tone="blue">
                    {Number(summary.monthProduction).toLocaleString('en-IN')} blocks
                  </StatusBadge>
                </div>
                <div className="flex items-center justify-between rounded-2xl bg-slate-50 p-3">
                  <div>
                    <p className="text-sm font-black text-slate-900">Dispatch status</p>
                    <p className="text-xs text-slate-500">Pending orders waiting for dispatch</p>
                  </div>
                  <StatusBadge tone={summary.pendingOrders > 0 ? 'amber' : 'green'}>
                    {summary.pendingOrders > 0 ? `${summary.pendingOrders} pending` : 'Clear'}
                  </StatusBadge>
                </div>
                <div className="flex items-center justify-between rounded-2xl bg-slate-50 p-3">
                  <div>
                    <p className="text-sm font-black text-slate-900">Material alerts</p>
                    <p className="text-xs text-slate-500">Materials with zero or negative balance</p>
                  </div>
                  <StatusBadge tone={summary.lowMaterials.length > 0 ? 'red' : 'green'}>
                    {summary.lowMaterials.length > 0 ? `${summary.lowMaterials.length} low` : 'Healthy'}
                  </StatusBadge>
                </div>
                <div className="flex items-center justify-between rounded-2xl bg-slate-50 p-3">
                  <div>
                    <p className="text-sm font-black text-slate-900">Finished stock warnings</p>
                    <p className="text-xs text-slate-500">Colors at zero stock: {summary.lowStockColors.join(', ') || 'none'}</p>
                  </div>
                  <StatusBadge tone={summary.lowStockColors.length > 0 ? 'red' : 'green'}>
                    {summary.lowStockColors.length > 0 ? `${summary.lowStockColors.length} alert` : 'OK'}
                  </StatusBadge>
                </div>
              </div>
            </SectionCard>

            <SectionCard title="What Needs Attention" subtitle="Owner insight cards. Read-only and deterministic.">
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white p-3">
                  <p className="text-xs font-black uppercase tracking-wide text-slate-400">Payroll Payable</p>
                  <p className="mt-1 text-lg font-black text-slate-900">{formatINR(summary.payrollPayable)}</p>
                  <p className="mt-1 text-xs text-slate-500">Wages minus advances from Payroll_Log.</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-3">
                  <p className="text-xs font-black uppercase tracking-wide text-slate-400">Vendor Purchases</p>
                  <p className="mt-1 text-lg font-black text-slate-900">{formatINR(summary.vendorPurchases)}</p>
                  <p className="mt-1 text-xs text-slate-500">Invoice rows in Vendor_Ledger.</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-3">
                  <p className="text-xs font-black uppercase tracking-wide text-slate-400">QC Loss</p>
                  <p className="mt-1 text-lg font-black text-slate-900">{formatINR(summary.qcLoss)}</p>
                  <p className="mt-1 text-xs text-slate-500">TotalLoss from QC_Log.</p>
                </div>
                <Link to="/reports" className="rounded-2xl border border-orange-200 bg-orange-50 p-3 transition hover:bg-orange-100">
                  <p className="text-sm font-black text-orange-700">Open Reports Center</p>
                  <p className="mt-1 text-xs leading-5 text-orange-600">Filter, review, and export owner reports.</p>
                </Link>
              </div>
            </SectionCard>
          </div>

          <SectionCard title="Quick Actions" subtitle="Shortcuts only. No data is written from this dashboard.">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              {can(MODULES.production) && <QuickAction to="/production" title="Add production" helper="Record today's block output." />}
              {can(MODULES.crm) && <QuickAction to="/crm" title="Orders and dispatch" helper="View orders or record dispatch." />}
              {can(MODULES.inventory) && <QuickAction to="/inventory" title="Check stock" helper="Review finished stock by color." />}
              {can(MODULES.cashFlow) && <QuickAction to="/cashflow" title="Cash flow" helper="Review cash in and out." />}
              {can(MODULES.pl) && <QuickAction to="/reports" title="Reports Center" helper="Open read-only owner reports." />}
              {!can(MODULES.production) && !can(MODULES.inventory) && !can(MODULES.crm) && (
                <EmptyState title="No quick actions available" message="Your account has limited module permissions." />
              )}
            </div>
          </SectionCard>
        </div>
      )}
    </ModuleShell>
  )
}
