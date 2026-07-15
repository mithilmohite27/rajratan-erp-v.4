import React, { useEffect, useMemo, useState } from 'react'
import { useApp } from '../App.jsx'
import {
  computeInventory,
  computeMaterialInventory,
  loadCashFlow,
  loadCRM,
  loadPayroll,
  loadProduction,
  loadProductionVariants,
  loadQC,
  loadVendors,
} from '../lib/sheets.js'
import { blocksToBrass, formatINR, formatNum, today } from '../lib/formulas.js'
import { MATERIAL_LIST, formatMaterialQty, unitLabel, normalizeVendorMaterial } from '../lib/materials.js'
import { ModuleShell, SectionCard, StatCard, StatusBadge, ResponsiveTable, EmptyState, FormGrid } from '../components/ui.jsx'

const COLORS = ['Red', 'Yellow', 'Black', 'White']
const REPORTS = [
  ['production', 'Daily Production'],
  ['stock', 'Finished Stock'],
  ['materials', 'Raw Material Stock'],
  ['orders', 'Orders / CRM'],
  ['dispatch', 'Dispatch'],
  ['cash', 'Cash Flow'],
  ['payroll', 'Payroll'],
  ['vendors', 'Vendor'],
  ['qc', 'QC / Wastage'],
  ['pl', 'Profit & Loss'],
]

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

function getRange(filter, customStart, customEnd) {
  const now = new Date()
  if (filter === 'today') {
    const day = isoDate(now)
    return { start: day, end: day }
  }
  if (filter === 'week') return { start: isoDate(startOfWeek(now)), end: isoDate(now) }
  if (filter === 'month') return { start: isoDate(new Date(now.getFullYear(), now.getMonth(), 1)), end: isoDate(now) }
  return { start: customStart || '', end: customEnd || '' }
}

function inRange(row, range) {
  if (!range.start && !range.end) return true
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

function groupSum(rows, key, valueKey) {
  return rows.reduce((acc, row) => {
    const label = row[key] || 'Unspecified'
    acc[label] = (acc[label] || 0) + num(row[valueKey])
    return acc
  }, {})
}

function toRows(map) {
  return Object.entries(map).map(([label, value]) => ({ label, value }))
}

function reportLabel(key) {
  return REPORTS.find(([reportKey]) => reportKey === key)?.[1] || 'Report'
}

function rangeText(filter, range) {
  if (filter === 'today') return 'Today'
  if (filter === 'week') return 'This week'
  if (filter === 'month') return 'This month'
  if (range.start || range.end) return `${range.start || 'Start'} to ${range.end || 'Today'}`
  return 'All available dates'
}

function downloadCSV(filename, rows) {
  if (!rows.length) return
  const headers = Object.keys(rows[0])
  const escape = value => `"${String(value ?? '').replaceAll('"', '""')}"`
  const csv = [headers.join(','), ...rows.map(row => headers.map(h => escape(row[h])).join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function ReportTabs({ active, onChange }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-3 shadow-sm shadow-slate-200/60">
      <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Report Modules</p>
          <p className="mt-1 text-sm font-bold text-slate-900">Choose one clean business report at a time.</p>
        </div>
        <StatusBadge tone="blue">{REPORTS.length} reports</StatusBadge>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {REPORTS.map(([key, label]) => (
          <button
            key={key}
            onClick={() => onChange(key)}
            className={`shrink-0 rounded-2xl px-4 py-2.5 text-xs font-black transition ${
              active === key
                ? 'bg-slate-950 text-white shadow-lg shadow-slate-200'
                : 'border border-slate-200 bg-slate-50 text-slate-600 hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}

function FilterBar({ filter, setFilter, customStart, setCustomStart, customEnd, setCustomEnd }) {
  return (
    <SectionCard title="Date Filter" subtitle="Client-side only. Nothing is saved to Google Sheets.">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          {[
            ['today', 'Today'],
            ['week', 'This Week'],
            ['month', 'This Month'],
            ['custom', 'Custom'],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`rounded-2xl px-4 py-2 text-xs font-black transition ${
                filter === key ? 'bg-slate-950 text-white shadow-md shadow-slate-200' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="rounded-2xl bg-slate-50 px-3 py-2 text-xs font-bold text-slate-500">
          Active: {filter === 'custom' ? 'Custom range' : filter === 'week' ? 'This week' : filter === 'today' ? 'Today' : 'This month'}
        </p>
      </div>
      {filter === 'custom' && (
        <FormGrid className="mt-3">
          <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)}
            className="rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold text-slate-800 outline-none" />
          <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)}
            className="rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold text-slate-800 outline-none" />
        </FormGrid>
      )}
    </SectionCard>
  )
}

function SimpleTable({ columns, rows, empty = 'No rows for this period.' }) {
  if (!rows.length) return <EmptyState title={empty} message="Try a different date filter or confirm data exists in the connected Sheet." />
  return (
    <ResponsiveTable>
      <thead>
        <tr className="bg-slate-50 text-xs uppercase tracking-[0.12em] text-slate-500">
          {columns.map(col => <th key={col.key} className="whitespace-nowrap px-4 py-3 text-left font-black">{col.label}</th>)}
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {rows.map((row, i) => (
          <tr key={i} className="transition hover:bg-orange-50/50">
            {columns.map(col => (
              <td key={col.key} className="px-4 py-3 text-sm font-semibold text-slate-700">
                {col.render ? col.render(row[col.key], row) : row[col.key]}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </ResponsiveTable>
  )
}

function ExportButton({ reportKey, rows }) {
  return (
    <button
      onClick={() => downloadCSV(`rajratan-${reportKey}-${today()}.csv`, rows)}
      disabled={!rows.length}
      className="rounded-2xl bg-slate-950 px-4 py-2.5 text-xs font-black text-white shadow-lg shadow-slate-200 transition hover:bg-orange-600 disabled:bg-slate-300 disabled:shadow-none"
    >
      {rows.length ? 'Export CSV' : 'No Rows to Export'}
    </button>
  )
}

export default function Reports() {
  const { accessToken } = useApp()
  const [active, setActive] = useState('production')
  const [filter, setFilter] = useState('month')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError('')
    Promise.all([
      loadProduction(accessToken).catch(() => []),
      loadProductionVariants(accessToken).catch(() => []),
      computeInventory(accessToken).catch(() => null),
      computeMaterialInventory(accessToken).catch(() => null),
      loadCRM(accessToken).catch(() => []),
      loadCashFlow(accessToken).catch(() => []),
      loadPayroll(accessToken).catch(() => []),
      loadVendors(accessToken).catch(() => []),
      loadQC(accessToken).catch(() => []),
    ])
      .then(([production, variants, inventory, materials, crm, cash, payroll, vendors, qc]) => {
        if (alive) setData({ production, variants, inventory, materials, crm, cash, payroll, vendors, qc })
      })
      .catch(e => {
        if (alive) setError('Could not load reports: ' + e.message)
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => { alive = false }
  }, [accessToken])

  const range = useMemo(() => getRange(filter, customStart, customEnd), [filter, customStart, customEnd])

  const report = useMemo(() => {
    if (!data) return null
    const production = data.production.filter(r => inRange(r, range))
    const variants = data.variants.filter(r => inRange(r, range))
    const crm = data.crm.filter(r => inRange(r, range))
    const cash = data.cash.filter(r => inRange(r, range))
    const payroll = data.payroll.filter(r => inRange(r, range))
    const vendors = data.vendors.filter(r => inRange(r, range))
    const qc = data.qc.filter(r => inRange(r, range))
    const dispatches = crm.filter(r => (r.Status === 'Dispatched') || num(r.DispatchBlocks) > 0 || num(r.DispatchBrass) > 0)
    const orders = crm.filter(r => num(r.OrderBlocks) > 0 || num(r.OrderBrass) > 0)
    const pendingOrders = crm.filter(r => (r.Status || 'Order') === 'Order')

    const revenue = dispatches.reduce((s, r) => s + num(r.DispatchBrass || r.OrderBrass) * num(r.Rate), 0)
    const productionCost = production.reduce((s, r) => s + num(r.TotalDailyCost), 0)
    const materialCost = production.reduce((s, r) => s + num(r.TotalDailyCost) - num(r.LabourCost), 0)
    const labour = payroll.filter(r => r.Type === 'Wage').reduce((s, r) => s + num(r.Amount), 0)
    const freight = crm.filter(r => num(r.FreightCharge) > 0).reduce((s, r) => s + num(r.FreightCharge), 0)
    const wastageLoss = qc.reduce((s, r) => s + num(r.TotalLoss), 0)
    const cogs = materialCost + labour + freight
    const expenses = cogs + wastageLoss
    const profit = revenue - expenses

    return {
      production,
      variants,
      crm,
      cash,
      payroll,
      vendors,
      qc,
      dispatches,
      orders,
      pendingOrders,
      pl: { revenue, productionCost, labour, materialCost, freight, wastageLoss, expenses, profit },
    }
  }, [data, range])

  const exportRows = useMemo(() => {
    if (!report || !data) return []
    if (active === 'production') return report.production
    if (active === 'stock') return COLORS.map(color => ({ color, ...(data.inventory?.[color] || {}) }))
    if (active === 'materials') return MATERIAL_LIST.map(m => ({ material: m.label, unit: unitLabel(m.unit), ...(data.materials?.[m.id] || {}) }))
    if (active === 'orders') return report.orders
    if (active === 'dispatch') return report.dispatches
    if (active === 'cash') return report.cash
    if (active === 'payroll') return report.payroll
    if (active === 'vendors') return report.vendors
    if (active === 'qc') return report.qc
    if (active === 'pl') return [report.pl]
    return []
  }, [active, data, report])

  if (loading || !report || !data) {
    return (
      <ModuleShell eyebrow="Owner Reports" title="Reports Center" subtitle="Read-only reports from existing Google Sheet data.">
        <SectionCard>
          <div className="grid gap-3 py-2 sm:grid-cols-3">
            {[1, 2, 3].map(i => <div key={i} className="h-24 animate-pulse rounded-3xl bg-slate-100" />)}
          </div>
          <div className="py-5 text-center text-sm font-semibold text-slate-400">Loading reports...</div>
        </SectionCard>
      </ModuleShell>
    )
  }

  const productionBlocks = report.production.reduce((s, r) => s + num(r.Blocks), 0)
  const productionCost = report.production.reduce((s, r) => s + num(r.TotalDailyCost), 0)
  const colorProduction = toRows(groupSum(report.variants, 'Color', 'Blocks'))
  const stockRows = COLORS.map(color => ({ color, ...(data.inventory?.[color] || { opening: 0, produced: 0, sold: 0, broken: 0, stock: 0 }) }))
  const materialRows = MATERIAL_LIST.map(meta => ({ meta, ...(data.materials?.[meta.id] || { opening: 0, purchased: 0, consumed: 0, externalUsed: 0, stock: 0 }) }))
  const orderCustomers = toRows(groupSum(report.orders, 'ClientName', 'OrderBlocks'))
  const pendingByColor = toRows(groupSum(report.pendingOrders, 'Color', 'OrderBlocks'))
  const dispatchCustomers = toRows(groupSum(report.dispatches, 'ClientName', 'DispatchBlocks'))
  const dispatchColors = toRows(groupSum(report.dispatches, 'Color', 'DispatchBlocks'))
  const cashIn = report.cash.filter(r => r.Type === 'In').reduce((s, r) => s + num(r.Amount), 0)
  const cashOut = report.cash.filter(r => r.Type === 'Out').reduce((s, r) => s + num(r.Amount), 0)
  const cashSources = toRows(groupSum(report.cash, 'Source', 'Amount'))
  const workerAmount = toRows(groupSum(report.payroll, 'WorkerName', 'Amount'))
  const advances = report.payroll.filter(r => r.Type === 'Advance').reduce((s, r) => s + num(r.Amount), 0)
  const wages = report.payroll.filter(r => r.Type === 'Wage').reduce((s, r) => s + num(r.Amount), 0)
  const vendorPurchases = report.vendors.filter(r => r.Type === 'Invoice')
  const vendorPayments = report.vendors.filter(r => r.Type === 'Payment')
  const vendorSummary = toRows(groupSum(report.vendors, 'VendorName', 'Amount'))
  const materialPurchaseRows = toRows(report.vendors.reduce((acc, r) => {
    const material = normalizeVendorMaterial(r.Material) || r.Material || 'Unspecified'
    acc[material] = (acc[material] || 0) + num(r.Amount)
    return acc
  }, {}))
  const qcBroken = report.qc.reduce((s, r) => s + num(r.BrokenBlocks), 0)
  const qcLoss = report.qc.reduce((s, r) => s + num(r.TotalLoss), 0)
  const qcColorRows = toRows(groupSum(report.qc, 'Color', 'BrokenBlocks'))
  const qcDateRows = toRows(groupSum(report.qc, 'Date', 'BrokenBlocks'))
  const visibleRows = exportRows.length

  return (
    <ModuleShell
      eyebrow="Owner Reports"
      title="Reports Center"
      subtitle="Read-only factory reports with safe client-side filters and CSV export."
      actions={<ExportButton reportKey={active} rows={exportRows} />}
    >
      {error && <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-600">{error}</div>}
      <div className="mb-4 space-y-3">
        <ReportTabs active={active} onChange={setActive} />
        <FilterBar
          filter={filter}
          setFilter={setFilter}
          customStart={customStart}
          setCustomStart={setCustomStart}
          customEnd={customEnd}
          setCustomEnd={setCustomEnd}
        />
        <section className="grid gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/60 md:grid-cols-4">
          <div className="rounded-2xl bg-slate-50 p-3">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Current Report</p>
            <p className="mt-1 text-sm font-black text-slate-950">{reportLabel(active)}</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-3">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Date Range</p>
            <p className="mt-1 text-sm font-black text-slate-950">{rangeText(filter, range)}</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-3">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Visible Rows</p>
            <p className="mt-1 text-sm font-black text-slate-950">{visibleRows.toLocaleString('en-IN')}</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-3">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Export Status</p>
            <p className={`mt-1 text-sm font-black ${visibleRows ? 'text-emerald-700' : 'text-slate-500'}`}>
              {visibleRows ? 'Ready for CSV' : 'No rows found'}
            </p>
          </div>
        </section>
      </div>

      {active === 'production' && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard label="Total Blocks" value={productionBlocks.toLocaleString('en-IN')} helper={`${formatNum(blocksToBrass(productionBlocks), 2)} brass`} />
            <StatCard label="Production Cost" value={formatINR(productionCost)} helper="From existing Production_Log cost fields" accent="slate" />
            <StatCard label="Rows" value={report.production.length} helper="Daily production entries" accent="white" />
          </div>
          <SectionCard title="Color-wise Production" subtitle="Uses Production_Variants when available.">
            <SimpleTable columns={[
              { key: 'label', label: 'Color' },
              { key: 'value', label: 'Blocks', render: v => Number(v).toLocaleString('en-IN') },
            ]} rows={colorProduction} />
          </SectionCard>
          <SectionCard title="Material Usage Summary" subtitle="Existing Production_Log usage columns only.">
            <SimpleTable columns={[
              { key: 'label', label: 'Material' },
              { key: 'value', label: 'Used' },
            ]} rows={[
              { label: 'Cement bags', value: formatNum(report.production.reduce((s, r) => s + num(r.TotalCement), 0), 2) },
              { label: 'Greet ton', value: formatNum(report.production.reduce((s, r) => s + num(r.Greet_kg), 0) / 1000, 3) },
              { label: 'Powder ton', value: formatNum(report.production.reduce((s, r) => s + num(r.Powder_kg), 0) / 1000, 3) },
              { label: 'Chemical L', value: formatNum(report.production.reduce((s, r) => s + num(r.Chemical_L), 0), 2) },
              { label: 'Color kg', value: formatNum(report.production.reduce((s, r) => s + num(r.YellowKG) + num(r.RedKG) + num(r.BlackKG) + num(r.WhiteKG), 0), 2) },
            ]} />
          </SectionCard>
        </div>
      )}

      {active === 'stock' && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard label="Total Blocks" value={stockRows.reduce((s, r) => s + num(r.stock), 0).toLocaleString('en-IN')} helper="Current computed stock" />
            <StatCard label="Total Brass" value={formatNum(blocksToBrass(stockRows.reduce((s, r) => s + num(r.stock), 0)), 2)} helper="1 brass = 285 blocks" accent="slate" />
            <StatCard label="Warnings" value={stockRows.filter(r => num(r.stock) <= 0).length} helper="Zero stock color count" accent="white" />
          </div>
          <SectionCard title="Finished Stock by Color" subtitle="Opening + production - dispatch - QC wastage.">
            <SimpleTable columns={[
              { key: 'color', label: 'Color' },
              { key: 'opening', label: 'Opening' },
              { key: 'produced', label: 'Produced' },
              { key: 'sold', label: 'Dispatched' },
              { key: 'broken', label: 'Broken' },
              { key: 'stock', label: 'Balance' },
              { key: 'status', label: 'Status', render: (_, row) => <StatusBadge tone={num(row.stock) <= 0 ? 'red' : 'green'}>{num(row.stock) <= 0 ? 'Zero stock' : 'In stock'}</StatusBadge> },
            ]} rows={stockRows} />
          </SectionCard>
        </div>
      )}

      {active === 'materials' && (
        <SectionCard title="Raw Material Stock" subtitle="Opening + vendor purchases - production usage - external usage.">
          <SimpleTable columns={[
            { key: 'name', label: 'Material' },
            { key: 'opening', label: 'Opening' },
            { key: 'purchased', label: 'Inward' },
            { key: 'consumed', label: 'Production Used' },
            { key: 'externalUsed', label: 'External Used' },
            { key: 'stock', label: 'Balance' },
            { key: 'status', label: 'Status', render: (_, row) => <StatusBadge tone={num(row.rawStock) <= 0 ? 'red' : 'green'}>{num(row.rawStock) <= 0 ? 'Zero stock' : 'OK'}</StatusBadge> },
          ]} rows={materialRows.map(r => ({
            name: r.meta.label,
            opening: `${formatMaterialQty(r.opening, r.meta.unit)} ${unitLabel(r.meta.unit)}`,
            purchased: `${formatMaterialQty(r.purchased, r.meta.unit)} ${unitLabel(r.meta.unit)}`,
            consumed: `${formatMaterialQty(r.consumed, r.meta.unit)} ${unitLabel(r.meta.unit)}`,
            externalUsed: `${formatMaterialQty(r.externalUsed, r.meta.unit)} ${unitLabel(r.meta.unit)}`,
            stock: `${formatMaterialQty(r.stock, r.meta.unit)} ${unitLabel(r.meta.unit)}`,
            rawStock: r.stock,
          }))} />
        </SectionCard>
      )}

      {active === 'orders' && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <StatCard label="Orders" value={report.orders.length} helper="Rows with order quantity" />
            <StatCard label="Pending" value={report.pendingOrders.length} helper="Status = Order" accent="orange" />
            <StatCard label="Partial" value={report.crm.filter(r => r.Status === 'Partial').length} helper="If present in data" accent="white" />
            <StatCard label="Dispatched" value={report.dispatches.length} helper="Dispatch rows" accent="green" />
          </div>
          <SectionCard title="Customer-wise Orders"><SimpleTable columns={[
            { key: 'label', label: 'Customer' },
            { key: 'value', label: 'Order Blocks', render: v => Number(v).toLocaleString('en-IN') },
          ]} rows={orderCustomers} /></SectionCard>
          <SectionCard title="Color-wise Pending Dispatch"><SimpleTable columns={[
            { key: 'label', label: 'Color' },
            { key: 'value', label: 'Pending Blocks', render: v => Number(v).toLocaleString('en-IN') },
          ]} rows={pendingByColor} /></SectionCard>
        </div>
      )}

      {active === 'dispatch' && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard label="Dispatch Blocks" value={report.dispatches.reduce((s, r) => s + num(r.DispatchBlocks), 0).toLocaleString('en-IN')} helper="Dispatched quantity" accent="green" />
            <StatCard label="Pending Blocks" value={report.pendingOrders.reduce((s, r) => s + num(r.OrderBlocks), 0).toLocaleString('en-IN')} helper="Open order quantity" accent="orange" />
            <StatCard label="Dispatch Rows" value={report.dispatches.length} helper="Filtered period" accent="white" />
          </div>
          <SectionCard title="Customer-wise Dispatch"><SimpleTable columns={[
            { key: 'label', label: 'Customer' },
            { key: 'value', label: 'Dispatch Blocks', render: v => Number(v).toLocaleString('en-IN') },
          ]} rows={dispatchCustomers} /></SectionCard>
          <SectionCard title="Color-wise Dispatch"><SimpleTable columns={[
            { key: 'label', label: 'Color' },
            { key: 'value', label: 'Dispatch Blocks', render: v => Number(v).toLocaleString('en-IN') },
          ]} rows={dispatchColors} /></SectionCard>
        </div>
      )}

      {active === 'cash' && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard label="Cash In" value={formatINR(cashIn)} helper="Type = In" accent="green" />
            <StatCard label="Cash Out" value={formatINR(cashOut)} helper="Type = Out" accent="orange" />
            <StatCard label="Net Cash" value={formatINR(cashIn - cashOut)} helper="In - Out" accent={cashIn - cashOut >= 0 ? 'slate' : 'orange'} />
          </div>
          <SectionCard title="Source-wise Summary"><SimpleTable columns={[
            { key: 'label', label: 'Source' },
            { key: 'value', label: 'Amount', render: v => formatINR(v) },
          ]} rows={cashSources} /></SectionCard>
        </div>
      )}

      {active === 'payroll' && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard label="Wages" value={formatINR(wages)} helper="Type = Wage" accent="green" />
            <StatCard label="Advances" value={formatINR(advances)} helper="Type = Advance" accent="orange" />
            <StatCard label="Payable View" value={formatINR(wages - advances)} helper="Wages - advances" accent="slate" />
          </div>
          <SectionCard title="Worker-wise Amount"><SimpleTable columns={[
            { key: 'label', label: 'Worker' },
            { key: 'value', label: 'Amount', render: v => formatINR(v) },
          ]} rows={workerAmount} /></SectionCard>
        </div>
      )}

      {active === 'vendors' && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard label="Purchases" value={formatINR(vendorPurchases.reduce((s, r) => s + num(r.Amount), 0))} helper="Invoice rows" />
            <StatCard label="Payments" value={formatINR(vendorPayments.reduce((s, r) => s + num(r.Amount), 0))} helper="Payment rows" accent="green" />
            <StatCard label="Outstanding" value={formatINR(vendorPurchases.reduce((s, r) => s + num(r.Amount), 0) - vendorPayments.reduce((s, r) => s + num(r.Amount), 0))} helper="Safe estimate only" accent="orange" />
          </div>
          <SectionCard title="Vendor-wise Summary"><SimpleTable columns={[
            { key: 'label', label: 'Vendor' },
            { key: 'value', label: 'Amount', render: v => formatINR(v) },
          ]} rows={vendorSummary} /></SectionCard>
          <SectionCard title="Material-wise Purchase Summary"><SimpleTable columns={[
            { key: 'label', label: 'Material' },
            { key: 'value', label: 'Amount', render: v => formatINR(v) },
          ]} rows={materialPurchaseRows} /></SectionCard>
        </div>
      )}

      {active === 'qc' && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard label="Broken Blocks" value={qcBroken.toLocaleString('en-IN')} helper="QC_Log broken blocks" accent="orange" />
            <StatCard label="Loss Amount" value={formatINR(qcLoss)} helper="Existing TotalLoss field" accent="slate" />
            <StatCard label="QC Rows" value={report.qc.length} helper="Filtered period" accent="white" />
          </div>
          <SectionCard title="Color-wise Wastage"><SimpleTable columns={[
            { key: 'label', label: 'Color' },
            { key: 'value', label: 'Broken Blocks', render: v => Number(v).toLocaleString('en-IN') },
          ]} rows={qcColorRows} /></SectionCard>
          <SectionCard title="Date-wise Wastage"><SimpleTable columns={[
            { key: 'label', label: 'Date' },
            { key: 'value', label: 'Broken Blocks', render: v => Number(v).toLocaleString('en-IN') },
          ]} rows={qcDateRows} /></SectionCard>
        </div>
      )}

      {active === 'pl' && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard label="Revenue" value={formatINR(report.pl.revenue)} helper="Dispatch brass x rate" accent="green" />
            <StatCard label="Expenses" value={formatINR(report.pl.expenses)} helper="Materials + labour + freight + wastage" accent="orange" />
            <StatCard label="Est. Profit/Loss" value={formatINR(report.pl.profit)} helper="Read-only estimate" accent={report.pl.profit >= 0 ? 'slate' : 'orange'} />
          </div>
          <SectionCard title="Profit & Loss Summary" subtitle="Uses existing row fields only. No formula module changes.">
            <SimpleTable columns={[
              { key: 'label', label: 'Line Item' },
              { key: 'value', label: 'Amount', render: v => formatINR(v) },
            ]} rows={[
              { label: 'Revenue', value: report.pl.revenue },
              { label: 'Production Cost', value: report.pl.productionCost },
              { label: 'Labour', value: report.pl.labour },
              { label: 'Material Cost', value: report.pl.materialCost },
              { label: 'Freight', value: report.pl.freight },
              { label: 'Wastage Loss', value: report.pl.wastageLoss },
              { label: 'Total Expenses', value: report.pl.expenses },
              { label: 'Estimated Profit/Loss', value: report.pl.profit },
            ]} />
          </SectionCard>
        </div>
      )}
    </ModuleShell>
  )
}
