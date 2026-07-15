import React, { useState } from 'react'
import { useApp } from '../App.jsx'
import { BILLING_CONFIG_KEYS, BUSINESS_PROFILE_KEYS, CONFIG_LABELS, PRODUCTION_CONFIG_KEYS } from '../lib/config.js'
import { confirmSheetWrite, getSheetEnvironmentLabel } from '../lib/safety.js'
import { ALLOWED_USERS } from '../lib/permissions.js'
import { ModuleShell, SectionCard, StatCard, FormGrid, StatusBadge } from '../components/ui.jsx'

const SECTIONS = [
  { key: 'profile', label: 'Business Profile' },
  { key: 'production', label: 'Production' },
  { key: 'payroll', label: 'Payroll' },
  { key: 'billing', label: 'Billing / GST' },
  { key: 'access', label: 'Users & Access' },
  { key: 'safety', label: 'Backup & Safety' },
  { key: 'advanced', label: 'Advanced / Legacy' },
]

const GROUPS = [
  {
    title: 'Mortar / Cement Calculation',
    subtitle: 'Used for production cost calculation.',
    keys: ['cementRate'],
  },
  {
    title: 'Grit / Greet / Powder Usage',
    subtitle: 'Used for raw material usage estimate and P&L costing.',
    keys: ['ghamela_g', 'weight_g', 'ghamela_p', 'weight_p', 'greetRate', 'powderRate'],
  },
  {
    title: 'Chemical Usage',
    subtitle: 'Used for raw material usage estimate.',
    keys: ['litre_m', 'ml_c', 'chemicalRate'],
  },
  {
    title: 'Color Pigment Usage',
    subtitle: 'Used for color cost and production material planning.',
    keys: ['yellowRatio', 'redRatio', 'blackRatio', 'whiteRatio', 'colorRate'],
  },
  {
    title: 'Plastic / Shiner / Reti / Misc',
    subtitle: 'Used for production costing and daily expense defaults.',
    keys: ['plastic_ml', 'plasticRate', 'reti_multiplier', 'retiRate', 'miscDefault'],
  },
]

function numberValue(value) {
  return value ?? ''
}

function SettingInput({ configKey, label, value, onChange, helper }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <label className="block text-xs font-black uppercase tracking-wide text-slate-500">{label}</label>
      {helper && <p className="mt-1 text-xs leading-5 text-slate-400">{helper}</p>}
      <input
        type="number"
        value={numberValue(value)}
        onChange={e => onChange(configKey, e.target.value === '' ? '' : parseFloat(e.target.value))}
        inputMode="decimal"
        className="mt-3 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-lg font-black text-slate-900 outline-none focus:border-orange-300 focus:bg-white"
      />
      <p className="mt-2 text-[11px] font-semibold text-slate-400">Config key: {configKey}</p>
    </div>
  )
}

function TextSettingInput({ configKey, label, value, onChange, helper, multiline = false }) {
  const Input = multiline ? 'textarea' : 'input'
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <label className="block text-xs font-black uppercase tracking-wide text-slate-500">{label}</label>
      {helper && <p className="mt-1 text-xs leading-5 text-slate-400">{helper}</p>}
      <Input
        type={multiline ? undefined : 'text'}
        rows={multiline ? 4 : undefined}
        value={value ?? ''}
        onChange={e => onChange(configKey, e.target.value)}
        className="mt-3 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-bold text-slate-900 outline-none focus:border-orange-300 focus:bg-white"
      />
      <p className="mt-2 text-[11px] font-semibold text-slate-400">Config key: {configKey}</p>
    </div>
  )
}

function ReadOnlyRow({ label, value, note }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-bold text-slate-900">{value || 'Not configured in current Config'}</p>
      {note && <p className="mt-1 text-xs leading-5 text-slate-500">{note}</p>}
    </div>
  )
}

function SectionMenu({ active, onChange }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
      {SECTIONS.map(section => (
        <button
          key={section.key}
          onClick={() => onChange(section.key)}
          className={`shrink-0 rounded-2xl px-4 py-3 text-left text-xs font-black transition lg:w-full ${
            active === section.key
              ? 'bg-orange-500 text-white shadow-lg shadow-orange-200'
              : 'border border-slate-200 bg-white text-slate-600 hover:border-orange-200 hover:bg-orange-50'
          }`}
        >
          {section.label}
        </button>
      ))}
    </div>
  )
}

async function saveConfigViaBackend(config, accessToken) {
  const token = sessionStorage.getItem('gToken') || accessToken
  if (!token) throw new Error('Session expired. Please sign in again.')

  const res = await fetch('/api/settings/config', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ config }),
  })

  const payload = await res.json().catch(() => ({}))
  if (!res.ok || !payload.ok) {
    const message = payload.message || 'Config save failed.'
    if (res.status === 401) throw new Error(`Session expired or invalid login. ${message}`)
    if (res.status === 403) throw new Error(`Access denied. ${message}`)
    if (payload.code === 'INVALID_SETTING_VALUE' || payload.code === 'UNKNOWN_CONFIG_KEYS') {
      throw new Error(`Invalid setting value. ${message}`)
    }
    if (payload.code === 'CONFIG_SAVE_FAILED') {
      throw new Error(`Backend not configured or Config save failed. ${message}`)
    }
    throw new Error(message)
  }

  return payload.config || config
}

export default function Settings() {
  const { accessToken, config, setConfig, user, access } = useApp()
  const [active, setActive] = useState('production')
  const [local, setLocal] = useState({ ...config })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  const handleChange = (key, val) => {
    setLocal(prev => ({ ...prev, [key]: val }))
  }

  const handleSave = async () => {
    const zeroKeys = Object.entries(local)
      .filter(([key]) => PRODUCTION_CONFIG_KEYS.includes(key))
      .filter(([, value]) => value === 0)
      .map(([key]) => key)

    if (zeroKeys.length) {
      setError(`These settings are 0 and may fall back to defaults in current calculations: ${zeroKeys.join(', ')}. Use a non-zero value for now.`)
      return
    }

    if ((parseFloat(local.DEFAULT_GST_RATE) || 0) <= 0) {
      setError('DEFAULT_GST_RATE must be a positive number.')
      return
    }

    if (!confirmSheetWrite('This will overwrite values in the Config sheet and affect production costing, stock valuation, payroll rate, and reports.')) return

    setSaving(true)
    setError('')
    try {
      const savedConfig = await saveConfigViaBackend(local, accessToken)
      setConfig(savedConfig)
      setLocal(savedConfig)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e) {
      setError('Save failed: ' + e.message)
    }
    setSaving(false)
  }

  return (
    <ModuleShell
      eyebrow="Control Center"
      title="Settings"
      subtitle="Owner-friendly controls for costing, payroll rates, safety, and future business profile settings."
      actions={<StatusBadge tone="amber">{getSheetEnvironmentLabel()}</StatusBadge>}
    >
      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <StatCard label="Config Keys" value={Object.keys(CONFIG_LABELS).length} helper="Existing keys preserved" accent="white" />
        <StatCard label="Access Role" value={access?.role || 'Unknown'} helper={user?.email || 'Signed in user'} accent="slate" />
        <StatCard label="Save Mode" value="Manual" helper="No auto-save. Confirmation required." accent="orange" />
      </div>

      {error && <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-600">{error}</div>}
      {saved && <div className="mb-4 rounded-2xl border border-green-200 bg-green-50 p-3 text-center text-sm font-semibold text-green-700">Settings saved to Google Sheets.</div>}

      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        <SectionMenu active={active} onChange={setActive} />

        <div className="space-y-4">
          {active === 'profile' && (
            <SectionCard
              title="Business Profile"
              subtitle="Editable display settings saved as key/value rows in the existing Config sheet."
            >
              <FormGrid>
                {BUSINESS_PROFILE_KEYS.map(key => (
                  <TextSettingInput
                    key={key}
                    configKey={key}
                    label={CONFIG_LABELS[key]}
                    value={local[key]}
                    onChange={handleChange}
                    multiline={key === 'BUSINESS_ADDRESS'}
                  />
                ))}
              </FormGrid>
            </SectionCard>
          )}

          {active === 'production' && (
            <>
              <SectionCard title="Production Calculation Settings" subtitle="Existing Config keys remain unchanged and continue feeding current formulas.">
                <div className="space-y-5">
                  {GROUPS.map(group => (
                    <div key={group.title}>
                      <div className="mb-3">
                        <h3 className="text-sm font-black text-slate-900">{group.title}</h3>
                        <p className="text-xs leading-5 text-slate-500">{group.subtitle}</p>
                      </div>
                      <FormGrid>
                        {group.keys.map(key => (
                          <SettingInput
                            key={key}
                            configKey={key}
                            label={CONFIG_LABELS[key]}
                            value={local[key]}
                            onChange={handleChange}
                          />
                        ))}
                      </FormGrid>
                    </div>
                  ))}
                </div>
              </SectionCard>
            </>
          )}

          {active === 'payroll' && (
            <SectionCard title="Payroll Rate Settings" subtitle="Used in production costing and payroll visibility. Formula behavior is unchanged.">
              <FormGrid>
                <SettingInput
                  configKey="labourRate"
                  label={CONFIG_LABELS.labourRate}
                  value={local.labourRate}
                  onChange={handleChange}
                  helper="Used for labour cost per produced block."
                />
              </FormGrid>
              <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
                Payroll currently reads production labour cost and advance payments. This section only controls the existing labour rate key.
              </div>
            </SectionCard>
          )}

          {active === 'billing' && (
            <SectionCard title="Billing / GST Settings" subtitle="Editable billing display settings. Existing bill calculation behavior is preserved.">
              <FormGrid>
                {BILLING_CONFIG_KEYS.map(key => (
                  key === 'DEFAULT_GST_RATE' ? (
                    <SettingInput
                      key={key}
                      configKey={key}
                      label={CONFIG_LABELS[key]}
                      value={local[key]}
                      onChange={handleChange}
                      helper="Must be positive. Existing GST math remains compatible."
                    />
                  ) : (
                    <TextSettingInput
                      key={key}
                      configKey={key}
                      label={CONFIG_LABELS[key]}
                      value={local[key]}
                      onChange={handleChange}
                      multiline={key === 'PAYMENT_TERMS' || key === 'INVOICE_FOOTER_NOTE'}
                    />
                  )
                ))}
              </FormGrid>
            </SectionCard>
          )}

          {active === 'access' && (
            <SectionCard title="User Access & Permissions" subtitle="Phase 3 permission foundation is visible here for owner clarity. No users are written to Google Sheets.">
              <FormGrid>
                <ReadOnlyRow label="Current user" value={user?.email} note={`Role: ${access?.role || 'Unknown'}`} />
                <ReadOnlyRow label="Owner email" value={import.meta.env.VITE_OWNER_EMAIL || 'Set VITE_OWNER_EMAIL in environment'} />
                <ReadOnlyRow label="Allowed users" value={`${ALLOWED_USERS.length} code-configured user(s)`} note="User access is currently managed by developer configuration." />
                <ReadOnlyRow label="Users sheet" value="Not created" note="No permission data is written to Google Sheets in this phase." />
              </FormGrid>
            </SectionCard>
          )}

          {active === 'safety' && (
            <SectionCard title="Backup & Safety" subtitle="Use this before changing setup, imports, or costing values.">
              <div className="space-y-3">
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                  Saving settings overwrites the live Config sheet. Create a Google Sheet backup before major changes.
                </div>
                <FormGrid>
                  <ReadOnlyRow label="Connected sheet" value={getSheetEnvironmentLabel()} />
                  <ReadOnlyRow label="Backup checklist" value="SAFETY_BACKUP_CHECKLIST.md" note="Manual backup checklist exists in the project root." />
                  <ReadOnlyRow label="Setup page" value="High-risk tools remain collapsed" />
                  <ReadOnlyRow label="Settings save" value="Manual confirmation required" note="Zero-value guard remains active." />
                </FormGrid>
              </div>
            </SectionCard>
          )}

          {active === 'advanced' && (
            <SectionCard title="Advanced / Legacy Settings" subtitle="Technical Config key reference. Collapsed-style section for developer/owner audit; keys are not renamed or removed.">
              <details className="rounded-2xl border border-slate-200 bg-slate-50 p-4" open={false}>
                <summary className="cursor-pointer text-sm font-black text-slate-900">Show raw Config key reference</summary>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {Object.entries(CONFIG_LABELS).map(([key, label]) => (
                    <div key={key} className="rounded-xl bg-white p-3 text-xs">
                      <p className="font-black text-slate-900">{key}</p>
                      <p className="mt-1 text-slate-500">{label}</p>
                      <p className="mt-1 font-bold text-orange-600">Current: {String(local[key] ?? '')}</p>
                    </div>
                  ))}
                </div>
              </details>
            </SectionCard>
          )}

          <SectionCard tone="warning" title="Save Settings" subtitle="No auto-save. Changes apply only after confirmation.">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm leading-6 text-amber-800">
                Zero values are blocked for numeric production settings only because current formulas may treat 0 as “use default”. Text fields are not blocked.
              </p>
              <button
                onClick={handleSave}
                disabled={saving}
                className="rounded-2xl bg-orange-500 px-6 py-4 text-sm font-black text-white shadow-lg shadow-orange-200 disabled:bg-orange-300"
              >
                {saving ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </SectionCard>
        </div>
      </div>
    </ModuleShell>
  )
}
