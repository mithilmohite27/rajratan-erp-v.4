import React, { useState } from 'react'
import { useApp } from '../App.jsx'
import { today } from '../lib/formulas.js'
import { MATERIAL_LIST, unitLabel } from '../lib/materials.js'
import { confirmSheetWrite, confirmDuplicateSave } from '../lib/safety.js'

const COLORS = ['Red', 'Yellow', 'Black', 'White']
const EMOJI  = { Red: 'Red', Yellow: 'Yellow', Black: 'Black', White: 'White' }

async function runSetupAction(action, rows, accessToken, { force = false, confirmHighRisk = true, dryRun } = {}) {
  const token = sessionStorage.getItem('gToken') || accessToken
  if (!token) throw new Error('Session expired. Please sign in again.')
  const body = { action, rows, force, confirmHighRisk }
  if (dryRun !== undefined) body.dryRun = dryRun

  const res = await fetch('/api/setup', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const payload = await res.json().catch(() => ({}))
  if (payload.duplicate) return { duplicate: true, ...payload }

  if (!res.ok || !payload.ok) {
    const message = payload.message || 'Setup action failed.'
    if (res.status === 401) throw new Error(`Session expired or invalid login. ${message}`)
    if (res.status === 403) throw new Error(`Access denied. ${message}`)
    if (payload.code === 'MISSING_HIGH_RISK_CONFIRMATION') throw new Error(`Missing high-risk confirmation. ${message}`)
    if (payload.code === 'INVALID_SETUP_ACTION') throw new Error(`Invalid setup action. ${message}`)
    if (payload.code === 'INVALID_IMPORT_ROWS') {
      const details = payload.details || {}
      throw new Error(`Invalid import rows. ${details.invalidRows || 0} invalid out of ${details.totalRows || 0}. ${message}`)
    }
    if (payload.code === 'SETUP_ACTION_FAILED') throw new Error(`Backend not configured or setup action failed. ${message}`)
    throw new Error(message)
  }

  return payload
}

function parseCSV(text) {
  const lines   = text.trim().split('\n')
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g, ''))
  return lines.slice(1).map(line => {
    const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''))
    const obj  = {}
    headers.forEach((h, i) => { obj[h] = vals[i] || '' })
    return obj
  }).filter(row => Object.values(row).some(v => v !== ''))
}

function Step({ number, title, done, active }) {
  return (
    <div className={`flex items-center gap-3 p-3 rounded-xl border ${active ? 'bg-orange-50 border-orange-200' : done ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'}`}>
      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0
        ${active ? 'bg-orange-500 text-white' : done ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500'}`}>
        {done ? 'Done' : number}
      </div>
      <span className={`text-sm font-medium ${active ? 'text-orange-700' : done ? 'text-green-700' : 'text-gray-500'}`}>{title}</span>
    </div>
  )
}

export default function Setup() {
  const { accessToken } = useApp()
  const [activeStep, setActiveStep] = useState(1)

  // Step 1: Seed
  const [seeding,   setSeeding]   = useState(false)
  const [seeded,    setSeeded]    = useState(false)
  const [repairing, setRepairing] = useState(false)
  const [repairResult, setRepairResult] = useState(null)

  // Step 2: Opening stock
  const [stockDate,    setStockDate]    = useState(today())
  const [stockEntries, setStockEntries] = useState(COLORS.reduce((a, c) => ({ ...a, [c]: '' }), {}))
  const [stockSaving,  setStockSaving]  = useState(false)
  const [stockSaved,   setStockSaved]   = useState(false)
  const [matEntries,   setMatEntries]   = useState(MATERIAL_LIST.reduce((a, m) => ({ ...a, [m.id]: '' }), {}))
  const [matSaving,    setMatSaving]    = useState(false)
  const [matSaved,     setMatSaved]     = useState(false)

  // Step 3 — Bulk import
  const [importType,    setImportType]    = useState('production') // 'production' | 'crm'
  const [csvText,       setCsvText]       = useState('')
  const [csvFile,       setCsvFile]       = useState(null)
  const [parsed,        setParsed]        = useState(null)
  const [importing,     setImporting]     = useState(false)
  const [importResult,  setImportResult]  = useState(null)

  const [error,   setError]   = useState('')
  const [success, setSuccess] = useState('')

  const flash = msg => { setSuccess(msg); setTimeout(() => setSuccess(''), 4000) }

  // Step 1: Seed
  const handleSeed = async () => {
    if (!confirmSheetWrite('This may create headers and default Config values in the connected Google Sheet. Use only on a backed-up or demo sheet.')) return

    setSeeding(true); setError('')
    try {
      await runSetupAction('seed_headers', [], accessToken)
      setSeeded(true)
      flash('Database seeded. All tab headers created in Google Sheets.')
      setActiveStep(2)
    } catch (e) { setError('Seed failed: ' + e.message) }
    setSeeding(false)
  }

  const handleBlackWhiteRepair = async (dryRun = true) => {
    if (!dryRun && !confirmSheetWrite('This will append missing Black/White production headers and Config keys if they are absent. Use only after backup.')) return

    setRepairing(true); setError('')
    try {
      const result = await runSetupAction('repair_black_white_parity', [], accessToken, { dryRun })
      setRepairResult(result)
      flash(dryRun ? 'Black/White parity check completed.' : 'Black/White parity repair completed.')
    } catch (e) { setError('Black/White parity check failed: ' + e.message) }
    setRepairing(false)
  }

  // Step 2: Opening stock
  const handleOpeningStock = async () => {
    const toSave = COLORS.filter(c => parseFloat(stockEntries[c]) > 0)
    if (toSave.length === 0) { setError('Enter opening stock for at least one color.'); return }
    if (!confirmSheetWrite('This will append opening finished stock rows. Do this only after confirming the physical count and backup.')) return

    setStockSaving(true); setError('')
    try {
      const rows = toSave.map(color => ({
        color,
        blocks:    parseInt(stockEntries[color]),
        setupDate: stockDate,
        notes:     'Opening balance - cold start',
      }))
      const result = await runSetupAction('opening_stock', rows, accessToken)
      if (result.duplicate) {
        if (!confirmDuplicateSave('opening stock row', result.duplicateRows || 1)) {
          setStockSaving(false)
          return
        }
        await runSetupAction('opening_stock', rows, accessToken, { force: true })
      }
      setStockSaved(true)
      flash(`Opening stock saved for ${toSave.length} color${toSave.length > 1 ? 's' : ''}!`)
      setActiveStep(3)
    } catch (e) { setError('Save failed: ' + e.message) }
    setStockSaving(false)
  }

  const handleOpeningMaterial = async () => {
    const toSave = MATERIAL_LIST.filter(m => parseFloat(matEntries[m.id]) > 0).map(m => ({
      material: m.id,
      quantity: parseFloat(matEntries[m.id]),
      unit: m.unit,
      setupDate: stockDate,
      notes: 'Opening balance - cold start',
    }))
    if (!toSave.length) { setError('Enter opening qty for at least one material (or skip).'); return }
    if (!confirmSheetWrite('This will append opening raw material stock rows. Do this only after confirming the physical count and backup.')) return

    setMatSaving(true); setError('')
    try {
      const result = await runSetupAction('opening_material_stock', toSave, accessToken)
      if (result.duplicate) {
        if (!confirmDuplicateSave('opening material stock row', result.duplicateRows || 1)) {
          setMatSaving(false)
          return
        }
        await runSetupAction('opening_material_stock', toSave, accessToken, { force: true })
      }
      setMatSaved(true)
      flash(`Material opening stock saved for ${toSave.length} material(s)!`)
    } catch (e) { setError('Material save failed: ' + e.message) }
    setMatSaving(false)
  }

  const handleFileChange = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setCsvFile(file)
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text  = ev.target.result
      setCsvText(text)
      const rows  = parseCSV(text)
      setParsed(rows)
      setImportResult(null)
    }
    reader.readAsText(file)
  }

  const handlePasteCSV = (text) => {
    setCsvText(text)
    if (text.trim()) {
      const rows = parseCSV(text)
      setParsed(rows)
      setImportResult(null)
    }
  }

  const handleImport = async () => {
    if (importing) return
    if (!parsed || parsed.length === 0) { setError('No valid rows to import.'); return }
    if (!confirmSheetWrite(`This will append ${parsed.length} imported row(s) to the connected Google Sheet. Imports can create duplicates if repeated.`)) return

    setImporting(true); setError('')
    try {
      let count = 0
      if (importType === 'production') {
        const mapped = parsed.map(r => ({
          date:   r.date || r['date'] || today(),
          color:  r.color || r['color'] || 'Red',
          blocks: r.blocks || r['blocks'] || 0,
          notes:  r.notes || 'Bulk Import',
        }))
        const result = await runSetupAction('production_csv_import', mapped, accessToken)
        if (result.duplicate) {
          if (!confirmDuplicateSave('CSV production import row', result.duplicateRows || 1)) {
            setImporting(false)
            return
          }
          const confirmed = await runSetupAction('production_csv_import', mapped, accessToken, { force: true })
          count = confirmed.rowsSaved || confirmed.validRows || 0
        } else {
          count = result.rowsSaved || result.validRows || 0
        }
      } else {
        const mapped = parsed.map(r => ({
          date:        r.date        || today(),
          clientName:  r.clientname  || r.client || '',
          location:    r.location    || '',
          orderBrass:  r.orderbrass  || r.brass  || 0,
          rate:        r.rate        || 0,
          color:       r.color       || 'Red',
          notes:       r.notes       || 'Bulk Import',
        }))
        const result = await runSetupAction('crm_csv_import', mapped, accessToken)
        if (result.duplicate) {
          if (!confirmDuplicateSave('CSV CRM import row', result.duplicateRows || 1)) {
            setImporting(false)
            return
          }
          const confirmed = await runSetupAction('crm_csv_import', mapped, accessToken, { force: true })
          count = confirmed.rowsSaved || confirmed.validRows || 0
        } else {
          count = result.rowsSaved || result.validRows || 0
        }
      }
      setImportResult({ count, type: importType })
      flash(`Imported ${count} rows into ${importType === 'production' ? 'Production Variants' : 'CRM'}!`)
      setParsed(null); setCsvText(''); setCsvFile(null)
    } catch (e) { setError('Import failed: ' + e.message) }
    setImporting(false)
  }

  const totalOpeningStock = COLORS.reduce((s, c) => s + (parseFloat(stockEntries[c]) || 0), 0)

  return (
    <div className="max-w-lg mx-auto">
      <div className="bg-white px-4 py-3 border-b border-gray-100 sticky top-12 z-10">
        <h1 className="text-lg font-bold text-gray-800">System Setup</h1>
        <p className="text-xs text-gray-400">Cold start - seed database, set opening stock, import legacy data</p>
      </div>

      <div className="p-4 space-y-3">
        {error   && <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl p-3">{error}</div>}
        {success && <div className="bg-green-50 border border-green-200 text-green-600 text-sm rounded-xl p-3 font-semibold text-center">{success}</div>}

        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-sm text-red-700">
          <p className="font-bold mb-1">High-risk setup area</p>
          <p className="text-xs leading-relaxed">
            This page writes to the connected Google Sheet and can affect real business data. Use it only after creating a backup. Do not use seed, opening stock, or import tools casually on the live sheet.
          </p>
        </div>

        {/* Step tracker */}
        <div className="space-y-2">
          <Step number={1} title="Seed Database (create all tab headers)"     done={seeded}     active={activeStep===1} />
          <Step number={2} title="Set Opening Stock (physical count baseline)" done={stockSaved} active={activeStep===2} />
          <Step number={3} title="Bulk Import Legacy Data (CSV/Excel)"        done={importResult !== null} active={activeStep===3} />
        </div>

        <div className="h-px bg-gray-100" />

        <details className="space-y-3">
          <summary className="cursor-pointer bg-gray-900 text-white rounded-xl px-4 py-3 text-sm font-bold">
            Advanced Setup Tools
          </summary>

        {/* STEP 1: SEED */}
        {activeStep === 1 && (
          <div className="space-y-3">
            <div className="bg-white border border-gray-200 rounded-2xl p-4">
              <p className="font-bold text-gray-800 mb-1">Step 1 - Seed the Database</p>
              <p className="text-sm text-gray-500 mb-3">
                This creates all required tab headers in your Google Sheet and pre-fills the Config tab with default rates. Run this once on a fresh system.
              </p>
              <div className="bg-gray-50 rounded-xl p-3 font-mono text-xs text-gray-600 space-y-1 mb-4">
                <p>OK Config - default rates &amp; multipliers</p>
                <p>OK Opening_Stock + Opening_Material_Stock</p>
                <p>OK Production_Log + Production_Variants</p>
                <p>OK CRM_Log, QC_Log, CashFlow_Log</p>
                <p>OK Vendor_Ledger, Payroll_Log</p>
              </div>
              {seeded ? (
                <div className="text-center text-green-600 font-bold py-2">Already seeded.</div>
              ) : (
                <button onClick={handleSeed} disabled={seeding}
                  className="w-full bg-orange-500 disabled:bg-orange-300 text-white font-bold py-4 rounded-xl text-base">
                  {seeding ? 'Seeding Google Sheets...' : 'Seed Database Now'}
                </button>
              )}

              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
                <p className="text-sm font-bold text-amber-900">Black/White parity repair</p>
                <p className="mt-1 text-xs leading-relaxed text-amber-700">
                  Use dry-run first to check whether Production_Log is missing trailing Black/White columns or Config is missing Black/White ratios.
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => handleBlackWhiteRepair(true)}
                    disabled={repairing}
                    className="rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs font-bold text-amber-700 disabled:opacity-60"
                  >
                    {repairing ? 'Checking...' : 'Dry-run Check'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBlackWhiteRepair(false)}
                    disabled={repairing}
                    className="rounded-xl bg-gray-900 px-3 py-2 text-xs font-bold text-white disabled:opacity-60"
                  >
                    Repair Missing Items
                  </button>
                </div>
                {repairResult && (
                  <div className="mt-3 rounded-lg border border-amber-200 bg-white p-3 text-xs text-gray-600">
                    <p className="font-bold text-gray-800">
                      {repairResult.alreadyOk ? 'All Black/White parity checks passed.' : `${repairResult.changes?.length || 0} missing item(s) found.`}
                    </p>
                    {!repairResult.alreadyOk && (
                      <ul className="mt-2 list-disc space-y-1 pl-4">
                        {(repairResult.changes || []).map(change => (
                          <li key={`${change.type}-${change.name}`}>
                            {change.type === 'production_header' ? 'Production_Log header' : 'Config key'}: {change.name}
                          </li>
                        ))}
                      </ul>
                    )}
                    <p className="mt-2 text-gray-500">
                      Mode: {repairResult.dryRun ? 'dry-run only, no write' : 'confirmed repair'}
                    </p>
                  </div>
                )}
              </div>
            </div>
            {seeded && (
              <button onClick={() => setActiveStep(2)} className="w-full border border-orange-300 text-orange-500 font-bold py-3 rounded-xl">
                Next - Set Opening Stock
              </button>
            )}
          </div>
        )}

        {/* STEP 2: OPENING STOCK */}
        {activeStep === 2 && (
          <div className="space-y-3">
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-3">
              <p className="text-xs font-bold text-orange-600 mb-0.5">Step 2 - Opening Stock</p>
              <p className="text-xs text-gray-500">
                Enter your current physical block count by color. This becomes the baseline for all future inventory calculations: <strong>Opening + Production - Sales = Stock</strong>
              </p>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-3">
              <label className="text-xs text-gray-400 block mb-1">Setup Date</label>
              <input type="date" value={stockDate} onChange={e => setStockDate(e.target.value)}
                className="w-full text-lg font-bold text-gray-800 outline-none bg-transparent" />
            </div>

            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-1">
              Current Physical Count Per Color
            </div>
            <div className="space-y-2">
              {COLORS.map(color => (
                <div key={color} className={`flex items-center gap-3 rounded-xl p-3 border transition-all
                  ${stockEntries[color] > 0 ? 'bg-orange-50 border-orange-200' : 'bg-white border-gray-200'}`}>
                  <span className="text-xl">{EMOJI[color]}</span>
                  <div className="w-16 shrink-0">
                    <p className={`text-sm font-bold ${stockEntries[color] > 0 ? 'text-orange-600' : 'text-gray-500'}`}>{color}</p>
                  </div>
                  <div className="flex-1">
                    <input type="number" inputMode="numeric"
                      value={stockEntries[color] || ''} placeholder="0"
                      onChange={e => setStockEntries(p => ({ ...p, [color]: e.target.value }))}
                      className={`w-full text-xl font-bold outline-none bg-transparent
                        ${stockEntries[color] > 0 ? 'text-orange-600' : 'text-gray-400'}`} />
                    {stockEntries[color] > 0 && (
                      <p className="text-xs text-gray-400">{parseFloat((stockEntries[color]/285).toFixed(2))} brass</p>
                    )}
                  </div>
                  <span className="text-xs text-gray-400 shrink-0">blocks</span>
                </div>
              ))}
            </div>

            {totalOpeningStock > 0 && (
              <div className="bg-gray-800 rounded-2xl p-4 text-white text-center">
                <p className="text-xs text-gray-400 mb-1">Total Opening Stock</p>
                <p className="text-3xl font-bold">{totalOpeningStock.toLocaleString('en-IN')}</p>
                <p className="text-sm text-gray-400">{parseFloat((totalOpeningStock/285).toFixed(2))} brass</p>
              </div>
            )}

            <button onClick={handleOpeningStock} disabled={stockSaving}
              className="w-full bg-orange-500 disabled:bg-orange-300 text-white font-bold py-4 rounded-xl text-base">
              {stockSaving ? 'Saving to Google Sheets...' : 'Save Opening Stock'}
            </button>

            <div className="h-px bg-gray-100" />

            <div className="bg-teal-50 border border-teal-200 rounded-xl p-3">
              <p className="text-xs font-bold text-teal-700 mb-0.5">Raw Material Opening Stock (optional)</p>
              <p className="text-xs text-gray-500">
                Current on-hand qty per material. Future stock = <strong>Opening + Vendor purchases - Production use</strong>
              </p>
            </div>
            <div className="space-y-2">
              {MATERIAL_LIST.map(meta => (
                <div key={meta.id} className={`flex items-center gap-3 rounded-xl p-3 border
                  ${matEntries[meta.id] > 0 ? meta.bg : 'bg-white border-gray-200'}`}>
                  <span>{meta.emoji}</span>
                  <span className={`text-sm font-bold w-20 ${matEntries[meta.id] > 0 ? meta.color : 'text-gray-500'}`}>{meta.label}</span>
                  <input type="number" inputMode="decimal" value={matEntries[meta.id] || ''} placeholder="0"
                    onChange={e => setMatEntries(p => ({ ...p, [meta.id]: e.target.value }))}
                    className="flex-1 text-lg font-bold outline-none bg-transparent text-gray-800" />
                  <span className="text-xs text-gray-400 shrink-0">{unitLabel(meta.unit)}</span>
                </div>
              ))}
            </div>
            <button onClick={handleOpeningMaterial} disabled={matSaving}
              className="w-full bg-teal-600 disabled:bg-teal-300 text-white font-bold py-3 rounded-xl text-sm">
              {matSaving ? 'Saving...' : 'Save Material Opening Stock'}
            </button>
            {matSaved && <p className="text-xs text-center text-teal-600 font-semibold">Material baseline saved</p>}

            {(stockSaved || matSaved) && (
              <button onClick={() => setActiveStep(3)} className="w-full border border-orange-300 text-orange-500 font-bold py-3 rounded-xl">
                Next - Bulk Import (optional)
              </button>
            )}
            <button onClick={() => setActiveStep(1)} className="w-full border border-gray-200 text-gray-400 text-sm py-2 rounded-xl">
              Back
            </button>
          </div>
        )}

        {/* STEP 3: BULK IMPORT */}
        {activeStep === 3 && (
          <div className="space-y-3">
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
              <p className="text-xs font-bold text-blue-600 mb-0.5">Step 3 - Bulk Import (Optional)</p>
              <p className="text-xs text-gray-500">Upload a CSV file or paste CSV data to migrate legacy production or CRM records.</p>
            </div>

            {/* Import type toggle */}
            <div className="bg-white border border-gray-200 rounded-xl p-3">
              <label className="text-xs text-gray-400 block mb-2">What are you importing?</label>
              <div className="grid grid-cols-2 gap-2">
                {[['production','Production Variants'],['crm','CRM Orders']].map(([k,l]) => (
                  <button key={k} onClick={() => { setImportType(k); setParsed(null); setCsvText('') }}
                    className={`py-3 rounded-xl text-xs font-bold ${importType===k?'bg-orange-500 text-white':'bg-gray-100 text-gray-600'}`}>
                    {l}
                  </button>
                ))}
              </div>
            </div>

            {/* CSV format guide */}
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
              <p className="text-xs font-bold text-gray-600 mb-1">Expected CSV columns:</p>
              {importType === 'production' ? (
                <p className="font-mono text-xs text-gray-500">date, color, blocks, notes</p>
              ) : (
                <p className="font-mono text-xs text-gray-500">date, clientname, location, orderbrass, rate, color, notes</p>
              )}
              <p className="text-xs text-gray-400 mt-1">First row must be headers. Date format: 2024-01-15. Color can be blank for past data.</p>
              {importType === 'crm' && (
                <div className="mt-2 bg-green-50 border border-green-200 rounded-xl p-2">
                  <p className="text-xs text-green-700 font-semibold">Historical data import</p>
                  <p className="text-xs text-green-600 mt-0.5">All rows saved as <strong>Dispatched</strong> - no dispatch button shown, inventory not deducted. Safe for past orders.</p>
                </div>
              )}
            </div>

            {/* File upload */}
            <div className="bg-white border-2 border-dashed border-gray-300 rounded-xl p-4 text-center">
              <input type="file" accept=".csv,.txt" onChange={handleFileChange} className="hidden" id="csvUpload" />
              <label htmlFor="csvUpload" className="cursor-pointer">
                <div className="text-sm font-bold mb-2">CSV</div>
                <p className="text-sm font-semibold text-gray-600">
                  {csvFile ? csvFile.name : 'Tap to upload CSV file'}
                </p>
                <p className="text-xs text-gray-400 mt-1">or paste CSV data below</p>
              </label>
            </div>

            {/* Paste area */}
            <div className="bg-white border border-gray-200 rounded-xl p-3">
              <label className="text-xs text-gray-400 block mb-1">Paste CSV data directly:</label>
              <textarea
                value={csvText}
                onChange={e => handlePasteCSV(e.target.value)}
                placeholder={importType === 'production'
                  ? 'date,color,blocks\n2024-01-15,Red,5000\n2024-01-15,Yellow,3000'
                  : 'date,clientname,location,orderbrass,rate,color\n2024-01-15,Ramesh Patel,Vansda,10,850,Red'}
                rows={5}
                className="w-full text-xs font-mono text-gray-700 outline-none bg-gray-50 rounded-lg p-2 resize-none"
              />
            </div>

            {/* Parse preview */}
            {parsed && parsed.length > 0 && (
              <div className="bg-white border border-gray-100 rounded-xl p-3">
                <p className="text-xs font-bold text-gray-600 mb-2">Preview - {parsed.length} rows found:</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-gray-400 border-b">
                        {Object.keys(parsed[0]).map(h => <th key={h} className="text-left py-1 pr-3">{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {parsed.slice(0, 5).map((row, i) => (
                        <tr key={i} className="border-b border-gray-50">
                          {Object.values(row).map((v, j) => <td key={j} className="py-1 pr-3 text-gray-700">{v}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {parsed.length > 5 && <p className="text-xs text-gray-400 mt-1">...and {parsed.length - 5} more rows</p>}
                </div>
              </div>
            )}

            {importResult && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center text-green-700 text-sm font-semibold">
                Imported {importResult.count} rows into {importResult.type === 'production' ? 'Production Variants' : 'CRM'}
              </div>
            )}

            <button onClick={handleImport} disabled={importing || !parsed || parsed.length === 0}
              className={`w-full font-bold py-4 rounded-xl text-base transition-all
                ${parsed && parsed.length > 0 ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-400'}`}>
              {importing ? 'Importing...' : `Import ${parsed ? parsed.length : 0} Rows to ${importType === 'production' ? 'Production' : 'CRM'}`}
            </button>

            <button onClick={() => setActiveStep(2)} className="w-full border border-gray-200 text-gray-400 text-sm py-2 rounded-xl">
              Back to Opening Stock
            </button>

            <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
              <p className="text-sm font-bold mb-1">Ready</p>
              <p className="font-bold text-green-700">System Ready!</p>
              <p className="text-xs text-gray-500 mt-1">
                Opening stock is set, data is seeded. Head to <strong>Production</strong> to start daily operations.
              </p>
            </div>
          </div>
        )}
        </details>
      </div>
    </div>
  )
}
