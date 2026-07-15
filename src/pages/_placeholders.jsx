// ── Inventory Page ─────────────────────────────
import React from 'react'

function Placeholder({ emoji, title, desc, features }) {
  return (
    <div className="max-w-lg mx-auto p-4">
      <div className="bg-white border border-gray-100 rounded-2xl p-6 text-center mt-4">
        <div className="text-5xl mb-3">{emoji}</div>
        <h2 className="text-xl font-bold text-gray-800 mb-1">{title}</h2>
        <p className="text-sm text-gray-500 mb-4">{desc}</p>
        <div className="bg-orange-50 border border-orange-100 rounded-xl p-3 text-left space-y-2">
          <p className="text-xs font-bold text-orange-600 mb-2">This module will include:</p>
          {features.map((f, i) => (
            <p key={i} className="text-xs text-gray-600"> {f}</p>
          ))}
        </div>
        <div className="mt-4 bg-gray-100 rounded-xl py-3 px-4">
          <p className="text-xs text-gray-500"> Being built — tell your CEO to request this module next!</p>
        </div>
      </div>
    </div>
  )
}

export function Inventory() {
  return <Placeholder
    emoji="" title="Inventory & Stock"
    desc="Real-time block stock tracking by color in units and brass"
    features={[
      'Stock by color: Red, Yellow, Black, White',
      'Display in blocks AND brass (1 brass = 285)',
      'Sales entry: input brass → auto deduct stock',
      'Broken block deductions from QC module',
      'Live sellable stock dashboard',
    ]}
  />
}

export function CRM() {
  return <Placeholder
    emoji="" title="Client CRM & Orders"
    desc="Manage clients, orders, dispatch tracking, and transport"
    features={[
      'Register client with order in brass + rate',
      'Split delivery ledger per client',
      'Running balance: dispatched vs remaining',
      'Self-pickup or company transport toggle',
      'Freight charge tracking',
    ]}
  />
}

export function CashFlow() {
  return <Placeholder
    emoji="" title="Cash Flow"
    desc="Track all money in and out across Factory and Owner accounts"
    features={[
      'Cash In: Factory Revenue or Owner Capital',
      'Cash Out: select which account was used',
      'Net balance per source — no fund commingling',
      'Vendor payment sync with Vendor Ledger',
      'Daily / weekly / monthly summary',
    ]}
  />
}

export function QC() {
  return <Placeholder
    emoji="" title="Quality Control & Wastage"
    desc="Log broken blocks, auto-deduct from stock, calculate loss"
    features={[
      'Daily broken block count entry',
      'Auto-deduct from live sellable stock',
      'Financial loss = broken × cost per block',
      'Loss logged as operational expense in P&L',
    ]}
  />
}

export function Vendors() {
  return <Placeholder
    emoji="" title="Vendor / AP Ledger"
    desc="Manage supplier accounts, invoices, and outstanding balances"
    features={[
      'Separate ledger (khata) per vendor',
      'Log shipment + invoice → increases debt',
      'Payment from Cash Flow auto-reduces balance',
      'Total Purchased | Paid | Outstanding per vendor',
    ]}
  />
}

export function Payroll() {
  return <Placeholder
    emoji="" title="Payroll & Labour"
    desc="Piece-rate payroll, advance (upad) ledger, net payable tracker"
    features={[
      'Daily blocks per worker → auto wage (₹1.80/block)',
      'Advance (Upad) ledger — log anytime',
      'Rolling: Total Earned − Advances = Net Owed',
      'Weekly settlement view',
    ]}
  />
}

export function PL() {
  return <Placeholder
    emoji="" title="Executive P&L Dashboard"
    desc="Live profit & loss pulling data from all modules"
    features={[
      'Gross Revenue from CRM sales',
      'COGS: materials + labour + transport',
      'Wastage loss from QC module',
      'Net Profit: Daily | Weekly | Monthly',
    ]}
  />
}
