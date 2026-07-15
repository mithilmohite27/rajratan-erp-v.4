import React, { createContext, useContext, useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom'
import { useGoogleLogin } from '@react-oauth/google'
import { loadConfig } from './lib/sheets.js'
import { DEFAULT_CONFIG } from './lib/config.js'
import { getSheetEnvironmentLabel } from './lib/safety.js'
import { MODULES, getUserAccess, canAccessModule } from './lib/permissions.js'

import Production from './pages/Production.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Inventory from './pages/Inventory.jsx'
import MaterialStock from './pages/MaterialStock.jsx'
import CRM from './pages/CRM.jsx'
import CashFlow from './pages/CashFlow.jsx'
import QC from './pages/QC.jsx'
import Vendors from './pages/Vendors.jsx'
import Payroll from './pages/Payroll.jsx'
import PL from './pages/PL.jsx'
import Reports from './pages/Reports.jsx'
import Settings from './pages/Settings.jsx'
import Setup from './pages/Setup.jsx'
import BillGenerator from './pages/Billgenerator.jsx'

export const AppContext = createContext(null)
export const useApp = () => useContext(AppContext)

const BRAND_ASSETS = {
  icon: '/assets/rajratan-erp-icon.png',
  iconLight: '/assets/rajratan-erp-icon-light.png',
}

const NAV_GROUPS = ['Overview', 'Daily Operations', 'Stock Control', 'Finance', 'Insights', 'Admin']

const DASHBOARD_NAV = { to: '/dashboard', icon: 'OV', label: 'Dashboard', group: 'Overview', always: true }

const NAV = [
  { to: '/production', module: MODULES.production, icon: 'PR', label: 'Production', group: 'Daily Operations' },
  { to: '/crm', module: MODULES.crm, icon: 'CR', label: 'CRM / Dispatch', group: 'Daily Operations' },
  { to: '/qc', module: MODULES.qc, icon: 'QC', label: 'QC', group: 'Daily Operations' },
  { to: '/inventory', module: MODULES.inventory, icon: 'FS', label: 'Finished Stock', group: 'Stock Control' },
  { to: '/material-stock', module: MODULES.materialStock, icon: 'MS', label: 'Material Stock', group: 'Stock Control' },
  { to: '/cashflow', module: MODULES.cashFlow, icon: 'CF', label: 'Cash Flow', group: 'Finance' },
  { to: '/vendors', module: MODULES.vendors, icon: 'VE', label: 'Vendors', group: 'Finance' },
  { to: '/payroll', module: MODULES.payroll, icon: 'PY', label: 'Payroll', group: 'Finance' },
  { to: '/pl', module: MODULES.pl, icon: 'PL', label: 'P&L', group: 'Finance' },
  { to: '/bills', module: MODULES.bills, icon: 'BI', label: 'Bills & Challans', group: 'Finance' },
  { to: '/reports', module: MODULES.pl, icon: 'RP', label: 'Reports', group: 'Insights' },
  { to: '/settings', module: MODULES.settings, icon: 'SE', label: 'Settings', group: 'Admin' },
  { to: '/setup', module: MODULES.setup, icon: 'SU', label: 'Setup', group: 'Admin' },
]

const BOTTOM_NAV = [
  { to: '/production', module: MODULES.production, icon: 'PR', label: 'Produce' },
  { to: '/inventory', module: MODULES.inventory, icon: 'FS', label: 'Stock' },
  { to: '/crm', module: MODULES.crm, icon: 'CR', label: 'CRM' },
  { to: '/cashflow', module: MODULES.cashFlow, icon: 'CF', label: 'Cash' },
]

function ModuleMark({ value, active = false, className = '' }) {
  return (
    <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-xl text-[10px] font-black tracking-wide ${active ? 'bg-white/20 text-white' : 'bg-slate-800 text-slate-200'} ${className}`}>
      {value}
    </span>
  )
}

function allowedNavItems(access) {
  if (!access?.isAllowed) return []
  return [DASHBOARD_NAV, ...NAV.filter(n => canAccessModule(access, n.module))]
}

function firstAllowedPath(access) {
  return access?.isAllowed ? '/dashboard' : '/denied'
}

function groupNavItems(items) {
  return NAV_GROUPS
    .map(group => ({ group, items: items.filter(n => n.group === group) }))
    .filter(section => section.items.length > 0)
}

function databaseLabel(sheetLabel) {
  const clean = String(sheetLabel || '').replace('Connected Sheet: ', '').trim()
  if (/^(demo|test|staging)$/i.test(clean)) return `${clean.charAt(0).toUpperCase()}${clean.slice(1).toLowerCase()} Database`
  if (/^(production|prod|live)$/i.test(clean)) return 'Production Database'
  return sheetLabel || 'Connected Sheet: Active Google Sheet'
}

const AUTH_WORKFLOW_STEPS = [
  { code: '01', title: 'Production', detail: 'Daily output, batches and QC flow' },
  { code: '02', title: 'Stock Control', detail: 'Finished stock and raw material visibility' },
  { code: '03', title: 'Dispatch & Billing', detail: 'Orders, challans, invoices and customer updates' },
  { code: '04', title: 'Owner Reports', detail: 'Cash flow, payroll, vendors and P&L review' },
]

const AUTH_FEATURE_PILLS = [
  'Real-time Production',
  'Live Stock',
  'Smart Dispatch',
  'Accurate Billing',
  'Reports',
]

const AUTH_GLASS_CARD_STYLE = {
  WebkitBackdropFilter: 'blur(28px) saturate(170%)',
  backdropFilter: 'blur(28px) saturate(170%)',
  background: 'linear-gradient(145deg, rgba(255,255,255,0.16) 0%, rgba(22,50,82,0.62) 48%, rgba(13,32,56,0.54) 100%)',
  boxShadow: '0 34px 90px rgba(0,0,0,0.38), 0 0 0 1px rgba(255,255,255,0.04), inset 0 1px 0 rgba(255,255,255,0.22), inset 0 -1px 0 rgba(255,255,255,0.06)',
}

function EnterpriseBrand() {
  return (
    <div className="flex items-center gap-3.5">
      <img
        src={BRAND_ASSETS.icon}
        alt="Rajratan ERP"
        style={{
          height: 38,
          width: 38,
          borderRadius: 10,
          objectFit: 'contain',
          background: 'transparent',
          border: 'none',
        }}
      />
      <div>
        <div
          style={{
            fontSize: 15,
            fontWeight: 700,
            color: 'white',
            letterSpacing: '0.08em',
            lineHeight: 1.2,
          }}
        >
          RAJRATAN ERP
        </div>
        <div
          style={{
            fontSize: 9,
            fontWeight: 600,
            color: '#f97316',
            letterSpacing: '0.15em',
            marginTop: 2,
          }}
        >
          FACTORY MANAGEMENT SYSTEM
        </div>
      </div>
    </div>
  )
}

function AuthWorkflowMap() {
  const visibleSteps = AUTH_WORKFLOW_STEPS.slice(0, 3)
  const remainingSteps = AUTH_WORKFLOW_STEPS.length - visibleSteps.length

  return (
    <div className="rounded-[22px] border border-white/10 bg-white/[0.045] p-2.5 shadow-[0_24px_70px_rgba(0,0,0,0.18)]">
      <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-2 sm:items-center">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-orange-200">ERP workflow</p>
          <p className="mt-0.5 text-sm font-semibold text-white/[0.86]">Factory operations in one path</p>
        </div>
        <span className="shrink-0 rounded-full border border-orange-300/20 bg-orange-400/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-orange-200">
          Live-ready
        </span>
      </div>

      <div className="mt-2.5 space-y-2">
        {visibleSteps.map((step, index) => (
          <div key={step.code} className="group relative flex min-w-0 gap-3 rounded-xl border border-white/[0.08] bg-white/[0.035] px-3 py-1 transition hover:border-orange-300/25 hover:bg-white/[0.07]">
            {index < visibleSteps.length - 1 && (
              <span className="absolute left-[26px] top-9 h-5 w-px bg-white/[0.12]" aria-hidden="true" />
            )}
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-[#10263B] text-[10px] font-black text-orange-200">
              {step.code}
            </span>
            <div className="min-w-0">
              <p className="text-[13px] font-bold text-white">{step.title}</p>
              <p className="mt-0.5 text-xs leading-[1.25] text-white/[0.52]">{step.detail}</p>
            </div>
          </div>
        ))}
        {remainingSteps > 0 && (
          <p className="pt-0.5 pl-10 text-[11px] font-semibold leading-none text-orange-200/70">
            +{remainingSteps} more module
          </p>
        )}
      </div>
    </div>
  )
}

function AuthFeaturePills() {
  return (
    <div className="mt-2 mb-2 flex max-w-full flex-wrap gap-2 pb-1">
      {AUTH_FEATURE_PILLS.map(label => (
        <span key={label} className="flex min-h-[32px] min-w-[108px] flex-1 items-center justify-center rounded-full border border-white/10 bg-white/[0.055] px-3 py-1 text-center text-[10px] font-bold leading-[1.1] text-white/[0.72]">
          {label}
        </span>
      ))}
    </div>
  )
}

function InfoCircleIcon({ className = 'h-5 w-5' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" />
      <path d="M12 11v5" />
      <path d="M12 8h.01" />
    </svg>
  )
}

function TinyLockIcon({ className = 'h-4 w-4' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M7 11V8a5 5 0 0 1 10 0v3" />
      <path d="M6 11h12v9H6z" />
    </svg>
  )
}

function AuthLockIcon({ centered = true }) {
  return (
    <div className={`${centered ? 'mx-auto' : ''} flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-orange-50 text-orange-600 ring-1 ring-orange-100`}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6" aria-hidden="true">
        <path d="M7 11V8a5 5 0 0 1 10 0v3" />
        <path d="M6 11h12v9H6z" />
      </svg>
    </div>
  )
}

function TinyShield({ className = 'h-4 w-4' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M12 3 19 6v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6l7-3Z" />
      <path d="m9.5 12.5 1.7 1.7 3.5-4.4" />
    </svg>
  )
}

function AuthShell({ pending = false, children }) {
  const content = pending
    ? {
        eyebrow: 'Access Control',
        title: 'Secure ERP access for approved users',
        tagline: 'Owner-approved access protects your factory workspace.',
        support: 'Rajratan ERP opens only for authorized business emails with the right module permissions.',
        focusLabel: 'Access status',
        focus: 'Please contact the owner/admin to enable this email before using the ERP.',
      }
    : {
        eyebrow: 'Rajratan ERP Workspace',
        title: 'Factory Management System for Paver Block Manufacturers',
        tagline: 'Built by a Factory Owner. Designed for Manufacturers.',
        support: 'Manage production, stock, dispatch, billing, payroll, cash flow and reports from one secure ERP workspace.',
        focusLabel: 'Product focus',
        focus: 'Built for daily factory control, owner review, and client-ready professionalism.',
      }

  return (
    <div
      className="h-dvh min-h-dvh w-full overflow-hidden text-white"
      style={{ background: 'linear-gradient(135deg, #0a0f1e 0%, #0d1929 50%, #0f1f35 100%)' }}
    >
      <main className="grid h-dvh min-h-dvh w-full overflow-hidden md:grid-cols-[55fr_45fr]">
        <section className="relative order-2 flex flex-col overflow-hidden px-6 py-8 sm:px-8 md:order-1 md:h-dvh md:px-10 md:py-9 lg:px-12 xl:px-14">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.18]"
            style={{
              backgroundImage: 'linear-gradient(rgba(255,255,255,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.12) 1px, transparent 1px)',
              backgroundSize: '48px 48px',
            }}
            aria-hidden="true"
          />
          <div className="pointer-events-none absolute -bottom-24 -left-24 h-[300px] w-[300px] rounded-full bg-[#f97316] opacity-[0.08] blur-[120px]" aria-hidden="true" />
          <div className="pointer-events-none absolute inset-0 opacity-70" aria-hidden="true">
            <div className="absolute -left-24 top-16 h-72 w-72 rounded-full bg-orange-500/[0.08] blur-3xl" />
            <div className="absolute bottom-0 right-0 h-96 w-96 rounded-full bg-sky-500/[0.08] blur-3xl" />
          </div>
          <div className="relative z-10 flex min-h-0 flex-1 flex-col">
          <div style={{ marginBottom: 32 }}>
            <EnterpriseBrand />
          </div>

          <div className="mb-5 max-w-[640px] md:mb-auto md:mt-0">
            <h1 className="max-w-[620px] text-[clamp(28px,3.1vw,44px)] font-bold leading-[1.09] tracking-[-0.03em] text-white">
              {content.title}
            </h1>
            <p className="mt-5 max-w-[560px] text-[15px] font-semibold leading-7 text-white/[0.84]">
              {pending ? content.tagline : (
                <>
                  <span className="text-orange-300">Built by a Factory Owner.</span> Designed for Manufacturers.
                </>
              )}
            </p>
            <p className="mt-4 max-w-[560px] text-sm leading-7 text-white/[0.62]">
              {content.support}
            </p>

            <div className="mt-5 max-w-[610px]">
              <AuthWorkflowMap />
              <AuthFeaturePills />
            </div>
          </div>

          <div className="border-t border-white/10 pt-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/[0.32]">{content.focusLabel}</p>
            <p className="mt-2 max-w-[620px] text-sm font-medium leading-6 text-white/[0.66]">
              {content.focus}
            </p>
          </div>
          </div>
        </section>

        <section className="order-1 flex min-h-dvh flex-col bg-transparent px-5 py-6 sm:px-7 md:order-2 md:h-dvh md:min-h-0 md:px-10 md:py-9 lg:px-14">
          <div className="flex items-center justify-between gap-4 md:hidden">
            <div className="md:hidden">
              <EnterpriseBrand />
            </div>
          </div>

          <div className="flex flex-1 items-center justify-center py-8 md:py-0">
            {children}
          </div>

          <p className="pb-2 text-center text-[11px] font-medium text-white/25">
            Secure - Reliable - Built for Manufacturers
          </p>
        </section>
      </main>
    </div>
  )
}
function LoginScreen({ onLogin }) {
  return (
    <AuthShell>
      <div
        className="relative w-full max-w-[420px] overflow-hidden rounded-[22px] border border-white/[0.18] px-7 py-9 sm:px-11 sm:py-10"
        style={AUTH_GLASS_CARD_STYLE}
      >
        <div className="pointer-events-none absolute inset-x-7 top-0 h-px bg-white/45" aria-hidden="true" />
        <div className="pointer-events-none absolute -right-14 -top-16 h-36 w-36 rounded-full bg-white/[0.08] blur-3xl" aria-hidden="true" />
        <div className="mx-auto mb-5 w-fit rounded-full border border-orange-300/25 bg-orange-400/[0.1] px-3 py-0.5 text-center text-[9px] font-bold uppercase tracking-[0.18em] text-orange-300/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
          DEMO DATABASE
        </div>

        <div className="mx-auto mb-5 flex h-[52px] w-[52px] items-center justify-center rounded-full border border-orange-500/25 bg-orange-500/[0.15] p-[10px]">
          <img src={BRAND_ASSETS.icon} alt="Rajratan ERP" className="h-full w-full object-contain" />
        </div>

        <h2 className="text-center text-2xl font-bold tracking-tight text-white">Welcome back</h2>
        <p className="mt-3 mb-6 text-center text-[13px] leading-6 text-white/[0.55]">
          Sign in to access your factory dashboard.
        </p>

        <button onClick={onLogin}
          className="flex w-full items-center justify-center gap-3 rounded-xl bg-white px-5 py-3.5 text-[15px] font-semibold text-slate-900 shadow-[0_4px_20px_rgba(0,0,0,0.35)] transition hover:scale-[1.01] focus:outline-none focus:ring-4 focus:ring-orange-500/20">
            <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </button>

        <div className="mt-4 rounded-[10px] border border-white/[0.12] bg-white/[0.07] px-4 py-3">
          <div className="flex gap-3">
            <InfoCircleIcon className="mt-0.5 h-5 w-5 shrink-0 text-white/[0.45]" />
            <div>
              <p className="text-sm font-bold text-white/80">No password needed.</p>
              <p className="mt-1 text-xs leading-5 text-white/[0.45]">Use your authorized Google account.</p>
            </div>
          </div>
        </div>

        <p className="mt-5 flex items-center justify-center gap-2 text-center text-xs text-white/[0.35]">
          <TinyLockIcon className="h-3.5 w-3.5" />
          Only authorized users can access.
        </p>
        <p className="mt-3 text-center text-[13px] text-white/[0.45]">
          Need help? <span className="font-semibold text-orange-500">Contact Admin</span>
        </p>
      </div>
    </AuthShell>
  )
}

function AccessPendingScreen({ user, onLogout }) {
  return (
    <AuthShell pending>
      <div
        className="relative w-full max-w-[420px] overflow-hidden rounded-[22px] border border-white/[0.18] px-7 py-9 text-center sm:px-11 sm:py-10"
        style={AUTH_GLASS_CARD_STYLE}
      >
        <div className="pointer-events-none absolute inset-x-7 top-0 h-px bg-white/45" aria-hidden="true" />
        <div className="pointer-events-none absolute -right-14 -top-16 h-36 w-36 rounded-full bg-white/[0.08] blur-3xl" aria-hidden="true" />
        <div className="mx-auto mb-5 flex h-[52px] w-[52px] items-center justify-center rounded-full border border-orange-500/25 bg-orange-500/[0.15] p-[10px]">
          <img src={BRAND_ASSETS.icon} alt="Rajratan ERP" className="h-full w-full object-contain" />
        </div>
        <h1 className="text-[22px] font-bold tracking-tight text-white">Access Pending</h1>
        <p className="mt-3 text-sm leading-6 text-white/[0.55]">
          This email is not authorized for Rajratan ERP yet.
        </p>
        <p className="mt-1 text-sm leading-6 text-white/[0.45]">
          Please contact the owner/admin to enable access.
        </p>
        <div className="mt-6 rounded-full border border-orange-500/25 bg-orange-500/[0.12] px-4 py-2 text-sm font-semibold text-orange-400">
          <span className="block truncate">{user?.email || 'Unknown email'}</span>
        </div>
        <button onClick={onLogout}
          className="mt-7 min-h-[48px] w-full rounded-xl border border-white/20 bg-white/[0.04] px-5 py-3 text-sm font-semibold text-white transition hover:border-white/[0.35] hover:bg-white/[0.08] focus:outline-none focus:ring-4 focus:ring-orange-500/20">
          Sign Out
        </button>
        <p className="mt-6 flex items-center justify-center gap-2 text-xs font-medium text-white/[0.35]">
          <TinyLockIcon className="h-3.5 w-3.5" />
          Secure access for approved users only
        </p>
      </div>
    </AuthShell>
  )
}

function MoreMenu({ open, onClose, navItems }) {
  if (!open) return null
  const more = navItems.filter(n => !BOTTOM_NAV.some(b => b.to === n.to))
  const groupedMore = groupNavItems(more)

  return (
    <>
      <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40" onClick={onClose} />
      <div className="fixed bottom-20 left-3 right-3 bg-white rounded-3xl shadow-2xl z-50 p-4 safe-bottom">
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4" />
        <div className="max-h-[68vh] space-y-4 overflow-y-auto pr-1">
          {groupedMore.map(section => (
            <div key={section.group}>
              <p className="mb-2 px-1 text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">{section.group}</p>
              <div className="grid grid-cols-2 gap-2">
                {section.items.map(n => (
                  <NavLink key={n.to} to={n.to} onClick={onClose}
                    className={({ isActive }) =>
                      `flex items-center gap-2 rounded-2xl p-3 text-xs font-semibold transition-all
                      ${isActive ? 'bg-orange-50 text-orange-600' : 'text-gray-600 hover:bg-gray-50'}`}>
                    <ModuleMark value={n.icon} className="bg-slate-100 text-slate-700" />
                    <span className="text-left leading-tight">{n.label}</span>
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

function BottomNav({ access }) {
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const navItems = allowedNavItems(access)
  const bottomItems = BOTTOM_NAV.filter(n => canAccessModule(access, n.module))
  const moreItems = navItems.filter(n => !bottomItems.some(b => b.to === n.to))
  const isMoreActive = moreItems.some(n => location.pathname.startsWith(n.to))

  return (
    <>
      <MoreMenu open={open} onClose={() => setOpen(false)} navItems={navItems} />
      <nav className="fixed bottom-0 left-0 right-0 z-30 safe-bottom">
        <div className="mx-3 mb-3 bg-white rounded-3xl shadow-xl shadow-gray-200/80 border border-gray-100">
          <div className="flex items-center h-16 px-2">
            {bottomItems.map(n => (
              <NavLink key={n.to} to={n.to}
                className={({ isActive }) =>
                  `flex-1 flex flex-col items-center gap-0.5 py-2 rounded-2xl transition-all
                  ${isActive ? 'text-orange-500' : 'text-gray-400'}`}>
                {({ isActive }) => (
                  <>
                    <ModuleMark value={n.icon} active={isActive} className={`${isActive ? 'bg-orange-100 text-orange-600' : 'bg-slate-100 text-slate-500'} transition-transform ${isActive ? 'scale-110' : ''}`} />
                    <span className={`text-xs font-semibold ${isActive ? 'text-orange-500' : 'text-gray-400'}`}>{n.label}</span>
                    {isActive && <span className="absolute bottom-3.5 w-1 h-1 bg-orange-500 rounded-full" />}
                  </>
                )}
              </NavLink>
            ))}

            {moreItems.length > 0 && (
              <button onClick={() => setOpen(v => !v)}
                className={`flex-1 flex flex-col items-center gap-0.5 py-2 rounded-2xl transition-all
                  ${isMoreActive ? 'text-orange-500' : 'text-gray-400'}`}>
                <ModuleMark value="ME" active={isMoreActive} className={isMoreActive ? 'bg-orange-100 text-orange-600' : 'bg-slate-100 text-slate-500'} />
                <span className="text-xs font-semibold">More</span>
              </button>
            )}
          </div>
        </div>
      </nav>
    </>
  )
}

function DesktopSidebar({ access, user, config, onLogout }) {
  const navItems = allowedNavItems(access)
  const sheetLabel = getSheetEnvironmentLabel()
  const environmentLabel = databaseLabel(sheetLabel)
  const appName = config.APP_NAME || 'Rajratan ERP'
  const poweredBy = config.POWERED_BY_TEXT || 'Premium factory workspace'
  const groupedNav = groupNavItems(navItems)

  return (
    <aside className="fixed left-0 top-0 z-30 hidden h-screen w-72 flex-col bg-slate-950 text-white shadow-2xl shadow-slate-900/30 md:flex">
      <div className="border-b border-white/10 p-5">
        <div className="flex items-center gap-3">
          <img src={BRAND_ASSETS.icon} alt="" className="h-12 w-12 rounded-2xl bg-white object-contain p-1" />
          <div>
            <p className="text-lg font-black leading-tight">{appName}</p>
            <p className="text-xs text-slate-400">{poweredBy}</p>
          </div>
        </div>
        <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-3">
          <p className="truncate text-sm font-bold">{user?.name || 'Signed in user'}</p>
          <p className="truncate text-xs text-slate-400">{user?.email}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <span className="rounded-full bg-orange-500/15 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-orange-200">{access?.role}</span>
            <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-slate-300">{environmentLabel}</span>
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-4">
        {groupedNav.map(section => (
          <div key={section.group} className="pt-3">
            <p className="px-3 pb-2 text-[10px] font-black uppercase tracking-[0.24em] text-slate-500">{section.group}</p>
            <div className="space-y-1">
              {section.items.map(n => (
                <NavLink key={n.to} to={n.to}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-bold transition
                    ${isActive ? 'bg-orange-500 text-white shadow-lg shadow-orange-950/30' : 'text-slate-300 hover:bg-white/10 hover:text-white'}`}>
                  {({ isActive }) => (
                    <>
                      <ModuleMark value={n.icon} active={isActive} />
                      <span>{n.label}</span>
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-white/10 p-4">
        <button onClick={onLogout}
          className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-slate-200 transition hover:bg-white/10">
          Sign out
        </button>
      </div>
    </aside>
  )
}

function PageHeader({ user, access, config, onLogout }) {
  const location = useLocation()
  const navItems = allowedNavItems(access)
  const current = navItems.find(n => location.pathname.startsWith(n.to))
  const sheetLabel = getSheetEnvironmentLabel()
  const environmentLabel = databaseLabel(sheetLabel)
  const appName = config.APP_NAME || 'Rajratan ERP'
  const companyName = config.COMPANY_NAME || 'Rajratan ERP'

  return (
    <header className="fixed top-0 left-0 right-0 z-20 safe-top md:left-72">
      <div className="bg-white/80 backdrop-blur-md border-b border-gray-100">
        <div className="flex h-16 items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2 md:hidden">
            <img src={BRAND_ASSETS.icon} alt="" className="h-9 w-9 rounded-xl bg-white object-contain p-0.5 shadow-sm ring-1 ring-slate-200" />
            <div>
              <p className="text-sm font-bold text-gray-800 leading-tight">
                {current?.label || appName}
              </p>
              <p className="text-xs text-gray-400 leading-tight">{companyName}</p>
              <p className="text-[10px] text-amber-600 leading-tight font-semibold">{environmentLabel}</p>
            </div>
          </div>
          <div className="hidden md:block">
            <p className="text-sm font-black text-slate-900">{current?.label || 'Overview'}</p>
            <p className="text-xs font-semibold text-slate-400">{environmentLabel}</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden sm:block text-right max-w-[180px]">
              <p className="text-xs font-semibold text-gray-700 leading-tight truncate">{user?.name || user?.email}</p>
              <p className="text-[10px] text-gray-400 leading-tight truncate">{access?.role || 'Unknown'} - {user?.email}</p>
            </div>
            {user?.picture ? (
              <img src={user.picture} alt="" className="w-8 h-8 rounded-full border-2 border-orange-100" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center text-sm font-bold text-orange-600">
                {user?.name?.[0] || 'R'}
              </div>
            )}
            <button onClick={onLogout}
              className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 font-semibold px-3 py-1.5 rounded-xl transition-colors">
              Sign out
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}

function LoadingScreen() {
  return (
    <div
      className="flex min-h-dvh items-center justify-center overflow-hidden p-6 text-white"
      style={{ background: 'linear-gradient(135deg, #0a0f1e 0%, #0d1929 50%, #0f1f35 100%)' }}
    >
      <div className="text-center">
        <div className="mx-auto flex h-20 w-20 animate-pulse items-center justify-center rounded-full border border-orange-500/30 bg-orange-500/10 shadow-[0_0_70px_rgba(249,115,22,0.22)]">
          <img src={BRAND_ASSETS.icon} alt="Rajratan ERP" className="h-14 w-14 object-contain" />
        </div>
        <p className="mt-5 text-sm font-medium text-white/60">Preparing your ERP workspace...</p>
      </div>
    </div>
  )
}

function PermissionDenied() {
  return (
    <div className="p-4">
      <div className="bg-white border border-gray-100 rounded-2xl p-5 text-center">
        <h1 className="text-lg font-bold text-gray-900 mb-1">Permission required</h1>
        <p className="text-sm text-gray-500">You do not have permission for this module.</p>
      </div>
    </div>
  )
}

function ProtectedRoute({ access, moduleName, children }) {
  if (!canAccessModule(access, moduleName)) return <PermissionDenied />
  return children
}

export default function App() {
  const [accessToken, setAccessToken] = useState(() => sessionStorage.getItem('gToken'))
  const [user, setUser] = useState(() => {
    const stored = sessionStorage.getItem('gUser')
    return stored ? JSON.parse(stored) : null
  })
  const [profileLoaded, setProfileLoaded] = useState(() => !sessionStorage.getItem('gToken') || Boolean(sessionStorage.getItem('gUser')))
  const [config, setConfig] = useState(DEFAULT_CONFIG)
  const [configLoaded, setConfigLoaded] = useState(false)

  const access = getUserAccess(user)

  const login = useGoogleLogin({
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    onSuccess: async (res) => {
      setProfileLoaded(false)
      setAccessToken(res.access_token)
      setConfigLoaded(false)
      sessionStorage.setItem('gToken', res.access_token)
      const profile = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${res.access_token}` }
      }).then(r => r.json())
      setUser(profile)
      sessionStorage.setItem('gUser', JSON.stringify(profile))
      setProfileLoaded(true)
    },
    onError: e => alert('Login failed: ' + JSON.stringify(e))
  })

  const logout = () => {
    setAccessToken(null)
    setUser(null)
    setConfig(DEFAULT_CONFIG)
    setConfigLoaded(false)
    setProfileLoaded(true)
    sessionStorage.removeItem('gToken')
    sessionStorage.removeItem('gUser')
  }

  useEffect(() => {
    if (!accessToken || user || profileLoaded) return
    fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
      .then(r => {
        if (!r.ok) throw new Error('Profile load failed')
        return r.json()
      })
      .then(profile => {
        setUser(profile)
        sessionStorage.setItem('gUser', JSON.stringify(profile))
        setProfileLoaded(true)
      })
      .catch(() => logout())
  }, [accessToken, user, profileLoaded])

  useEffect(() => {
    if (!accessToken || !access.isAllowed || configLoaded) return
    loadConfig(accessToken)
      .then(cfg => {
        if (Object.keys(cfg).length > 0) setConfig(p => ({ ...p, ...cfg }))
        setConfigLoaded(true)
      })
      .catch(() => setConfigLoaded(true))
  }, [accessToken, access.isAllowed, configLoaded])

  if (!accessToken) return <LoginScreen onLogin={login} />
  if (!profileLoaded) return <LoadingScreen />
  if (!access.isAllowed) return <AccessPendingScreen user={user} onLogout={logout} />

  return (
    <AppContext.Provider value={{ accessToken, config, setConfig, user, access }}>
      <BrowserRouter>
        <DesktopSidebar user={user} access={access} config={config} onLogout={logout} />
        <PageHeader user={user} access={access} config={config} onLogout={logout} />
        <main className="min-h-screen pb-24 pt-16 md:ml-72 md:pb-8" style={{ background: '#f8f9fb' }}>
          <Routes>
            <Route path="/" element={<Navigate to={firstAllowedPath(access)} replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/production" element={<ProtectedRoute access={access} moduleName={MODULES.production}><Production /></ProtectedRoute>} />
            <Route path="/inventory" element={<ProtectedRoute access={access} moduleName={MODULES.inventory}><Inventory /></ProtectedRoute>} />
            <Route path="/material-stock" element={<ProtectedRoute access={access} moduleName={MODULES.materialStock}><MaterialStock /></ProtectedRoute>} />
            <Route path="/crm" element={<ProtectedRoute access={access} moduleName={MODULES.crm}><CRM /></ProtectedRoute>} />
            <Route path="/cashflow" element={<ProtectedRoute access={access} moduleName={MODULES.cashFlow}><CashFlow /></ProtectedRoute>} />
            <Route path="/qc" element={<ProtectedRoute access={access} moduleName={MODULES.qc}><QC /></ProtectedRoute>} />
            <Route path="/vendors" element={<ProtectedRoute access={access} moduleName={MODULES.vendors}><Vendors /></ProtectedRoute>} />
            <Route path="/payroll" element={<ProtectedRoute access={access} moduleName={MODULES.payroll}><Payroll /></ProtectedRoute>} />
            <Route path="/pl" element={<ProtectedRoute access={access} moduleName={MODULES.pl}><PL /></ProtectedRoute>} />
            <Route path="/reports" element={<ProtectedRoute access={access} moduleName={MODULES.pl}><Reports /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute access={access} moduleName={MODULES.settings}><Settings /></ProtectedRoute>} />
            <Route path="/setup" element={<ProtectedRoute access={access} moduleName={MODULES.setup}><Setup /></ProtectedRoute>} />
            <Route path="/bills" element={<ProtectedRoute access={access} moduleName={MODULES.bills}><BillGenerator /></ProtectedRoute>} />
            <Route path="/denied" element={<PermissionDenied />} />
            <Route path="*" element={<Navigate to={firstAllowedPath(access)} replace />} />
          </Routes>
        </main>
        <div className="md:hidden">
          <BottomNav access={access} />
        </div>
      </BrowserRouter>
    </AppContext.Provider>
  )
}
