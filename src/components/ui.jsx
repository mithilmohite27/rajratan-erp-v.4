import React from 'react'

export function ModuleShell({ eyebrow, title, subtitle, actions, children }) {
  return (
    <div className="mx-auto w-full max-w-6xl px-3 py-4 sm:px-5 lg:px-6">
      {(title || actions) && (
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            {eyebrow && <p className="text-xs font-bold uppercase tracking-[0.22em] text-orange-500">{eyebrow}</p>}
            {title && <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">{title}</h1>}
            {subtitle && <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </div>
  )
}

export function SectionCard({ title, subtitle, action, tone = 'white', children, className = '' }) {
  const tones = {
    white: 'border-slate-200 bg-white',
    dark: 'border-slate-800 bg-slate-950 text-white',
    orange: 'border-orange-200 bg-orange-50',
    warning: 'border-amber-200 bg-amber-50',
  }

  return (
    <section className={`rounded-3xl border shadow-sm shadow-slate-200/60 ${tones[tone] || tones.white} ${className}`}>
      {(title || subtitle || action) && (
        <div className="flex items-start justify-between gap-3 border-b border-black/5 px-4 py-3 sm:px-5">
          <div>
            {title && <h2 className={`text-sm font-black ${tone === 'dark' ? 'text-white' : 'text-slate-900'}`}>{title}</h2>}
            {subtitle && <p className={`mt-0.5 text-xs leading-5 ${tone === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  )
}

export function StatCard({ label, value, helper, accent = 'orange', icon, className = '' }) {
  const accents = {
    orange: 'from-orange-500 to-amber-500 text-white',
    slate: 'from-slate-900 to-slate-700 text-white',
    green: 'from-emerald-500 to-teal-500 text-white',
    blue: 'from-blue-500 to-indigo-500 text-white',
    white: 'from-white to-white text-slate-900 border border-slate-200',
  }

  return (
    <div className={`rounded-3xl bg-gradient-to-br p-4 shadow-sm shadow-slate-200/70 ${accents[accent] || accents.orange} ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={`text-xs font-bold uppercase tracking-wide ${accent === 'white' ? 'text-slate-400' : 'text-white/75'}`}>{label}</p>
          <p className="mt-2 text-2xl font-black tracking-tight">{value}</p>
        </div>
        {icon && <span className={`rounded-2xl px-2.5 py-1.5 text-lg ${accent === 'white' ? 'bg-slate-100' : 'bg-white/15'}`}>{icon}</span>}
      </div>
      {helper && <p className={`mt-2 text-xs leading-5 ${accent === 'white' ? 'text-slate-500' : 'text-white/75'}`}>{helper}</p>}
    </div>
  )
}

export function EmptyState({ title, message, action }) {
  return (
    <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center">
      <p className="text-sm font-black text-slate-900">{title}</p>
      {message && <p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-slate-500">{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function StatusBadge({ children, tone = 'slate' }) {
  const tones = {
    slate: 'bg-slate-100 text-slate-700',
    orange: 'bg-orange-100 text-orange-700',
    green: 'bg-emerald-100 text-emerald-700',
    red: 'bg-red-100 text-red-700',
    amber: 'bg-amber-100 text-amber-700',
    blue: 'bg-blue-100 text-blue-700',
  }

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-black uppercase tracking-wide ${tones[tone] || tones.slate}`}>
      {children}
    </span>
  )
}

export function FormGrid({ children, className = '' }) {
  return <div className={`grid gap-3 sm:grid-cols-2 ${className}`}>{children}</div>
}

export function ResponsiveTable({ children, className = '' }) {
  return (
    <div className={`overflow-x-auto rounded-2xl border border-slate-200 bg-white ${className}`}>
      <table className="w-full min-w-[560px] text-sm">{children}</table>
    </div>
  )
}
