import React, { useState, useEffect, useMemo } from 'react'
import { useApp } from '../App.jsx'
import { loadCRM } from '../lib/sheets.js'
import { brassToBlocks, formatINR, formatNum, today } from '../lib/formulas.js'
import { confirmDuplicateSave } from '../lib/safety.js'
import {
  filterCrmHistory,
  groupActivitiesByDate,
  normalizeCrmHistoryRows,
  relativeCrmDateLabel,
  summarizeCrmHistory,
} from '../lib/crmHistory.js'

const COLORS     = ['Red', 'Yellow', 'Black', 'White']
const EMOJI      = { Red: '', Yellow: '', Black: '', White: '' }
const COLOR_BG   = { Red: 'border-red-200 bg-red-50', Yellow: 'border-yellow-200 bg-yellow-50', Black: 'border-gray-300 bg-gray-100', White: 'border-blue-200 bg-blue-50' }
const COLOR_TEXT = { Red: 'text-red-600', Yellow: 'text-yellow-600', Black: 'text-gray-700', White: 'text-blue-600' }

async function saveCRMViaBackend(action, entries, accessToken, force = false) {
  const token = sessionStorage.getItem('gToken') || accessToken
  if (!token) throw new Error('Session expired. Please sign in again.')

  const res = await fetch('/api/crm', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action, entries, force }),
  })

  const payload = await res.json().catch(() => ({}))
  if (payload.duplicate) return { duplicate: true, message: payload.message }

  if (!res.ok || !payload.ok) {
    const message = payload.message || 'CRM save failed.'
    if (res.status === 401) throw new Error(`Session expired or invalid login. ${message}`)
    if (res.status === 403) throw new Error(`Access denied. ${message}`)
    if (payload.code === 'INVALID_CRM_ENTRY' || payload.code === 'INVALID_AMOUNT') {
      throw new Error(`Invalid CRM entry. ${message}`)
    }
    if (payload.code === 'CRM_SAVE_FAILED') {
      throw new Error(`Backend not configured or CRM save failed. ${message}`)
    }
    throw new Error(message)
  }

  return payload
}

const emptyColors = () => COLORS.reduce((a, c) => ({ ...a, [c]: '' }), {})

// ─────────────────────────────────────────────
//  BUILD CLIENT LEDGER from raw CRM rows
//  Handles both old schema (no Color) and new
// ─────────────────────────────────────────────
function buildClients(rows) {
  const acc = {}

  rows.forEach(r => {
    const name = (r.ClientName || '').trim()
    if (!name) return

    if (!acc[name]) {
      acc[name] = {
        name,
        location:       r.Location || '',
        rate:           0,
        // Per-color tracking (new schema)
        byColor:        COLORS.reduce((a, c) => ({ ...a, [c]: { ordered: 0, dispatched: 0 } }), {}),
        // Total tracking regardless of color (backward compat for old rows)
        totalOrdered:   0,
        totalDispatched:0,
        entries:        [],
      }
    }

    const cl = acc[name]
    if (r.Location)            cl.location = r.Location
    if (parseFloat(r.Rate) > 0) cl.rate    = parseFloat(r.Rate)

    const orderBrass    = parseFloat(r.OrderBrass)    || 0
    const dispatchBrass = parseFloat(r.DispatchBrass) || 0
    const color         = (r.Color || '').trim()
    const status        = (r.Status || '').trim()

    // ── ORDER ROW ─────────────────────────────
    if (orderBrass > 0) {
      cl.totalOrdered += orderBrass
      if (COLORS.includes(color)) {
        cl.byColor[color].ordered += orderBrass
      }
      // If no color tagged, distribute across all 4 equally for display
      // (legacy data compatibility — doesn't affect totals)
    }

    // ── DISPATCH ROW ──────────────────────────
    // A row is a dispatch if Status='Dispatched' OR (no Status AND dispatchBrass > 0)
    const isDispatch = status === 'Dispatched' || (!status && dispatchBrass > 0)
    if (isDispatch && dispatchBrass > 0) {
      cl.totalDispatched += dispatchBrass
      if (COLORS.includes(color)) {
        cl.byColor[color].dispatched += dispatchBrass
      }
    }

    cl.entries.push(r)
  })

  return acc
}

// ─────────────────────────────────────────────
//  STATUS BADGE
// ─────────────────────────────────────────────
function StatusBadge({ status }) {
  const map = {
    Order:      'bg-blue-100 text-blue-600',
    Partial:    'bg-amber-100 text-amber-700',
    Dispatched: 'bg-green-100 text-green-600',
  }
  return (
    <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${map[status] || 'bg-gray-100 text-gray-500'}`}>
      {status}
    </span>
  )
}

function ColorDot({ color }) {
  const map = {
    Red: 'bg-red-500 border-red-500',
    Yellow: 'bg-yellow-400 border-yellow-400',
    Black: 'bg-gray-900 border-gray-900',
    White: 'bg-white border-gray-300',
  }
  return <span className={`inline-block h-2.5 w-2.5 rounded-full border ${map[color] || 'bg-gray-300 border-gray-300'}`} />
}

function HistorySummaryCard({ label, value, helper }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
      <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-1 text-lg font-extrabold text-gray-900">{value}</p>
      {helper && <p className="mt-0.5 text-[11px] text-gray-400">{helper}</p>}
    </div>
  )
}

function ActivityRow({ activity }) {
  const isDispatch = activity.type === 'dispatch'
  const detailParts = [
    activity.color,
    activity.brass > 0 ? `${formatNum(activity.brass, 2)} brass` : '',
    activity.blocks > 0 ? `${Math.round(activity.blocks).toLocaleString('en-IN')} blocks` : '',
    isDispatch ? activity.transportType : activity.location,
    !isDispatch && activity.ratePerBrass > 0 ? `${formatINR(activity.ratePerBrass)}/brass` : '',
    isDispatch && activity.loadingCharge > 0 ? `Loading ${formatINR(activity.loadingCharge)}` : '',
  ].filter(Boolean)

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-3">
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border text-sm font-black
              ${isDispatch ? 'border-green-200 bg-green-50 text-green-700' : 'border-blue-200 bg-blue-50 text-blue-700'}`}>
              {isDispatch ? 'D' : 'O'}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-sm font-extrabold text-gray-900">{activity.clientName || 'Unknown client'}</p>
                {activity.color && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] font-bold text-gray-600">
                    <ColorDot color={activity.color} />
                    {activity.color}
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-gray-500">{detailParts.join(' - ')}</p>
              {activity.notes && <p className="mt-1 text-xs italic text-gray-400">{activity.notes}</p>}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:justify-end">
          <StatusBadge status={isDispatch ? 'Dispatched' : 'Order'} />
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
//  CLIENT CARD
// ─────────────────────────────────────────────
function ClientCard({ client, onDispatch }) {
  // Use totalOrdered/totalDispatched as ground truth (works for old + new data)
  const totalOrdered    = client.totalOrdered
  const totalDispatched = client.totalDispatched
  const totalRemaining  = Math.max(0, totalOrdered - totalDispatched)
  const pct             = totalOrdered > 0 ? Math.min(100, (totalDispatched / totalOrdered) * 100) : 0

  // Only mark complete when there IS an order AND it's fully dispatched
  const isComplete = totalOrdered > 0 && totalRemaining <= 0
  const statusLabel = isComplete ? 'Dispatched' : totalDispatched > 0 ? 'Partial' : 'Order'

  // Which colors have data in new schema?
  const colorLines = COLORS.filter(c => client.byColor[c].ordered > 0)

  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden mb-3">
      <div className="p-4">
        {/* Name + status */}
        <div className="flex justify-between items-start mb-3">
          <div>
            <p className="font-bold text-gray-900 text-base">{client.name}</p>
            {client.location && <p className="text-xs text-gray-400 mt-0.5"> {client.location}</p>}
          </div>
          <StatusBadge status={statusLabel} />
        </div>

        {/* Progress bar */}
        <div className="bg-gray-100 rounded-full h-2 mb-2">
          <div className="bg-orange-500 h-2 rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>

        {/* Totals row */}
        <div className="grid grid-cols-3 gap-2 text-xs text-center mb-3">
          <div className="bg-gray-50 rounded-xl p-2">
            <p className="font-bold text-gray-800 text-sm">{formatNum(totalOrdered, 2)}</p>
            <p className="text-gray-400">Ordered</p>
          </div>
          <div className="bg-green-50 rounded-xl p-2">
            <p className="font-bold text-green-600 text-sm">{formatNum(totalDispatched, 2)}</p>
            <p className="text-gray-400">Dispatched</p>
          </div>
          <div className="bg-orange-50 rounded-xl p-2">
            <p className="font-bold text-orange-500 text-sm">{formatNum(totalRemaining, 2)}</p>
            <p className="text-gray-400">Remaining</p>
          </div>
        </div>

        {/* Per-color breakdown (only shown when color data exists) */}
        {colorLines.length > 0 && (
          <div className="space-y-1.5 mb-3">
            {colorLines.map(color => {
              const ord = client.byColor[color].ordered
              const dis = client.byColor[color].dispatched
              const rem = Math.max(0, ord - dis)
              return (
                <div key={color} className={`flex items-center gap-2 rounded-xl px-3 py-2 border ${COLOR_BG[color]}`}>
                  <span>{EMOJI[color]}</span>
                  <span className={`text-xs font-bold w-14 ${COLOR_TEXT[color]}`}>{color}</span>
                  <div className="flex-1 flex gap-3 text-xs text-gray-500">
                    <span>Ord: <strong>{formatNum(ord,2)}</strong></span>
                    <span>Done: <strong className="text-green-600">{formatNum(dis,2)}</strong></span>
                    <span>Left: <strong className={rem>0?'text-orange-500':'text-green-500'}>{formatNum(rem,2)}</strong></span>
                  </div>
                  <span className="text-xs text-gray-400">brass</span>
                </div>
              )
            })}
          </div>
        )}

        {client.rate > 0 && (
          <p className="text-xs text-gray-400">
            Rate: {formatINR(client.rate)}/brass · Value: {formatINR(totalOrdered * client.rate)}
          </p>
        )}
      </div>

      {/* Dispatch / Complete button */}
      {isComplete ? (
        <div className="text-center text-xs text-green-600 font-bold py-2.5 bg-green-50">
           Order Complete — Fully Dispatched
        </div>
      ) : (
        <button
          onClick={() => onDispatch(client)}
          className="w-full bg-green-500 active:bg-green-700 text-white text-sm font-bold py-3 transition-colors">
           Record Dispatch → Deduct Inventory ({formatNum(totalRemaining,2)} brass left)
        </button>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
//  COLOR BRASS INPUT ROW
// ─────────────────────────────────────────────
function ColorBrassRow({ color, value, onChange }) {
  const active = parseFloat(value) > 0
  return (
    <div className={`flex items-center gap-3 rounded-xl p-3 border transition-all
      ${active ? COLOR_BG[color] : 'bg-white border-gray-200'}`}>
      <span className="text-xl shrink-0">{EMOJI[color]}</span>
      <span className={`text-sm font-bold w-14 shrink-0 ${active ? COLOR_TEXT[color] : 'text-gray-400'}`}>{color}</span>
      <div className="flex-1">
        <input
          type="number" inputMode="decimal"
          value={value || ''} placeholder="0"
          onChange={e => onChange(color, e.target.value)}
          className={`w-full text-xl font-bold outline-none bg-transparent
            ${active ? COLOR_TEXT[color] : 'text-gray-300'}`}
        />
        {active && (
          <p className="text-xs text-gray-400 mt-0.5">
            = {brassToBlocks(value).toLocaleString('en-IN')} blocks
          </p>
        )}
      </div>
      <span className="text-xs text-gray-400 shrink-0">brass</span>
      {active && (
        <button onClick={() => onChange(color, '')} className="text-gray-300 text-lg leading-none shrink-0 ml-1">×</button>
      )}
    </div>
  )
}

// ═════════════════════════════════════════════
//  MAIN CRM PAGE
// ═════════════════════════════════════════════
export default function CRM() {
  const { accessToken } = useApp()

  const [tab,     setTab]     = useState('clients')
  const [rows,    setRows]    = useState([])
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [refresh, setRefresh] = useState(0)
  const [error,   setError]   = useState('')
  const [success, setSuccess] = useState('')
  const [historyFilters, setHistoryFilters] = useState({
    search: '',
    dateRange: 'all',
    startDate: '',
    endDate: '',
    type: 'all',
    color: 'all',
  })

  // New order form
  const [orderForm,  setOrderForm]  = useState({ date: today(), clientName: '', location: '', rate: '', notes: '' })
  const [colorBrass, setColorBrass] = useState(emptyColors())

  // Dispatch form
  const emptyDispatchColors = () => COLORS.reduce((a, c) => ({ ...a, [c]: '' }), {})
  const [dispatchForm, setDispatchForm] = useState({
    date: today(), clientName: '',
    transport: 'Self-Pickup', transporter: '', freightCharge: '', notes: ''
  })
  const [dispatchColors, setDispatchColors] = useState(emptyDispatchColors())

  const fetchData = async () => {
    setLoading(true)
    try { setRows(await loadCRM(accessToken)) }
    catch (e) { setError('Load failed: ' + e.message) }
    setLoading(false)
  }
  useEffect(() => { fetchData() }, [refresh])

  const flash = msg => { setSuccess(msg); setTimeout(() => setSuccess(''), 3500) }

  // Build ledger
  const clients    = buildClients(rows)
  const clientList = Object.values(clients)
  const historyActivities = useMemo(() => normalizeCrmHistoryRows(rows), [rows])
  const filteredHistory = useMemo(
    () => filterCrmHistory(historyActivities, historyFilters),
    [historyActivities, historyFilters]
  )
  const groupedHistory = useMemo(() => groupActivitiesByDate(filteredHistory), [filteredHistory])
  const historySummary = useMemo(() => summarizeCrmHistory(filteredHistory), [filteredHistory])
  const hasActiveHistoryFilters = historyFilters.search || historyFilters.dateRange !== 'all' || historyFilters.type !== 'all' || historyFilters.color !== 'all'

  const setHistoryFilter = (key, value) => setHistoryFilters(prev => ({ ...prev, [key]: value }))
  const clearHistoryFilters = () => setHistoryFilters({
    search: '',
    dateRange: 'all',
    startDate: '',
    endDate: '',
    type: 'all',
    color: 'all',
  })

  // Order form helpers
  const orderedColors    = COLORS.filter(c => parseFloat(colorBrass[c]) > 0)
  const totalOrderBrass  = orderedColors.reduce((s, c) => s + parseFloat(colorBrass[c]), 0)

  // ── Save new order — one row per color ─────
  const handleNewOrder = async () => {
    if (saving) return
    if (!orderForm.clientName.trim()) { setError('Client name is required.'); return }
    if (orderedColors.length === 0)   { setError('Enter brass qty for at least one color.'); return }
    setSaving(true); setError('')
    try {
      const entries = orderedColors.map(color => ({
        date:         orderForm.date,
        clientName:   orderForm.clientName.trim(),
        location:     orderForm.location,
        orderBrass:   parseFloat(colorBrass[color]),
        orderBlocks:  brassToBlocks(colorBrass[color]),
        rate:         parseFloat(orderForm.rate) || 0,
        color,
        status:       'Order',
        dispatchBrass: 0, dispatchBlocks: 0,
        transport: '', transporter: '', freightCharge: 0,
        notes: orderForm.notes,
      }))

      const result = await saveCRMViaBackend('create_order', entries, accessToken)
      if (result.duplicate) {
        if (!confirmDuplicateSave('CRM order', 1)) {
          setSaving(false)
          return
        }
        await saveCRMViaBackend('create_order', entries, accessToken, true)
      }
      flash(` Order saved — ${orderedColors.length} color${orderedColors.length > 1 ? 's' : ''} · ${formatNum(totalOrderBrass,2)} brass total`)
      setOrderForm({ date: today(), clientName: '', location: '', rate: '', notes: '' })
      setColorBrass(emptyColors())
      setRefresh(v => v + 1)
      setTab('clients')
    } catch (e) { setError('Save failed: ' + e.message) }
    setSaving(false)
  }

  // ── Dispatch — saves Status='Dispatched' which triggers inventory deduction
  const handleDispatch = async () => {
    if (saving) return
    if (!dispatchForm.clientName) { setError('Select a client.'); return }
    const toDispatch = COLORS.filter(c => parseFloat(dispatchColors[c]) > 0)
    if (toDispatch.length === 0) { setError('Enter brass qty for at least one color.'); return }
    setSaving(true); setError('')
    try {
      // Save one row per color — each deducts from inventory independently
      const entries = toDispatch.map(color => {
        const brass = parseFloat(dispatchColors[color])
        const blocks = brassToBlocks(brass)
        return {
          date:           dispatchForm.date,
          clientName:     dispatchForm.clientName,
          location:       '',
          orderBrass:     0, orderBlocks: 0, rate: 0,
          color,
          status:         'Dispatched',
          dispatchBrass:  brass,
          dispatchBlocks: blocks,
          transport:      dispatchForm.transport,
          transporter:    dispatchForm.transport === 'Company Transport' ? dispatchForm.transporter : '',
          freightCharge:  dispatchForm.transport === 'Company Transport' ? parseFloat(dispatchForm.freightCharge) || 0 : 0,
          notes:          dispatchForm.notes,
        }
      })

      const result = await saveCRMViaBackend('dispatch', entries, accessToken)
      if (result.duplicate) {
        if (!confirmDuplicateSave('CRM dispatch', 1)) {
          setSaving(false)
          return
        }
        await saveCRMViaBackend('dispatch', entries, accessToken, true)
      }
      const totalBrass = toDispatch.reduce((s, c) => s + parseFloat(dispatchColors[c]), 0)
      flash(` ${toDispatch.length} color${toDispatch.length>1?'s':''} dispatched (${formatNum(totalBrass,2)} brass) — inventory updated!`)
      setDispatchForm({ date: today(), clientName: '', transport: 'Self-Pickup', transporter: '', freightCharge: '', notes: '' })
      setDispatchColors(emptyDispatchColors())
      setRefresh(v => v + 1)
      setTab('clients')
    } catch (e) { setError('Save failed: ' + e.message) }
    setSaving(false)
  }

  // Pre-fill dispatch from client card button
  const prefillDispatch = (client) => {
    // Pre-fill dispatch colors with remaining balance per color
    const preColors = emptyDispatchColors()
    COLORS.forEach(c => {
      const rem = Math.max(0, client.byColor[c].ordered - client.byColor[c].dispatched)
      if (rem > 0) preColors[c] = formatNum(rem, 2)
    })
    setDispatchForm(p => ({ ...p, clientName: client.name }))
    setDispatchColors(preColors)
    setTab('dispatch')
    setError('')
  }

  return (
    <div className={`${tab === 'history' ? 'max-w-5xl' : 'max-w-lg'} mx-auto`}>
      {/* Header */}
      <div className="px-4 pt-4 pb-2">
        <h1 className="text-2xl font-bold text-gray-900">Client CRM</h1>
        <p className="text-sm text-gray-400 mt-0.5">Orders · Dispatch · Inventory auto-deduction</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 px-4 mb-4 overflow-x-auto pb-1">
        {[['clients',' Clients'],['newOrder','+ Order'],['dispatch',' Dispatch'],['history',' History']].map(([k,l]) => (
          <button key={k} onClick={() => { setTab(k); setError('') }}
            className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap shrink-0 transition-all
              ${tab===k ? 'bg-orange-500 text-white shadow-md shadow-orange-200' : 'bg-white border border-gray-200 text-gray-500'}`}>
            {l}
          </button>
        ))}
      </div>

      <div className="px-4 space-y-3 pb-6">
        {error   && <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-2xl p-3 flex gap-2"><span></span><span>{error}</span></div>}
        {success && <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-2xl p-3 font-semibold text-center">{success}</div>}

        {/* ══ CLIENTS LIST ══ */}
        {tab === 'clients' && (
          loading
            ? <div className="text-center py-16 text-gray-400"> Loading clients...</div>
            : clientList.length === 0
              ? <div className="text-center py-16 text-gray-400">
                  <div className="text-5xl mb-3"></div>
                  <p className="font-semibold text-gray-600 mb-4">No clients yet</p>
                  <button onClick={() => setTab('newOrder')}
                    className="bg-orange-500 text-white font-bold px-6 py-3 rounded-xl text-sm shadow-lg shadow-orange-200">
                    + Add First Order
                  </button>
                </div>
              : <>
                  <div className="bg-blue-50 border border-blue-200 rounded-2xl p-3 text-xs text-blue-700">
                     Tap <strong>Record Dispatch</strong> on a client → inventory deducts per color automatically.
                  </div>
                  {clientList.map((c, i) => (
                    <ClientCard key={i} client={c} onDispatch={prefillDispatch} />
                  ))}
                </>
        )}

        {/* ══ NEW ORDER ══ */}
        {tab === 'newOrder' && <>

          {/* Client info */}
          <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm space-y-3">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Client Details</p>

            {[
              { label: ' Date',           key: 'date',       type: 'date'   },
              { label: ' Client Name',    key: 'clientName', type: 'text',  ph: 'e.g. Ramesh Patel' },
              { label: ' Location',       key: 'location',   type: 'text',  ph: 'e.g. Vansda'       },
              { label: ' Rate (₹/brass)', key: 'rate',       type: 'number',ph: '0'                  },
            ].map(f => (
              <div key={f.key} className="border-b border-gray-50 pb-2">
                <label className="text-xs text-gray-400 block mb-1">{f.label}</label>
                <input
                  type={f.type}
                  inputMode={f.type==='number'?'decimal':undefined}
                  value={orderForm[f.key]}
                  placeholder={f.ph}
                  onChange={e => setOrderForm(p => ({ ...p, [f.key]: e.target.value }))}
                  className="w-full text-base font-bold text-gray-800 outline-none bg-transparent"
                />
              </div>
            ))}
          </div>

          {/* Multi-color qty entry */}
          <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Order Qty by Color</p>
            <p className="text-xs text-gray-400 mb-3">Enter brass for each color this client wants. Leave blank to skip.</p>
            <div className="space-y-2">
              {COLORS.map(color => (
                <ColorBrassRow key={color} color={color} value={colorBrass[color]}
                  onChange={(c, v) => setColorBrass(p => ({ ...p, [c]: v }))} />
              ))}
            </div>
          </div>

          {/* Summary preview */}
          {orderedColors.length > 0 && (
            <div className="bg-gray-900 rounded-2xl p-4 text-white">
              <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-3">
                Order Summary — {orderedColors.length} color{orderedColors.length > 1 ? 's' : ''}
              </p>
              {orderedColors.map(color => {
                const brass = parseFloat(colorBrass[color])
                const value = orderForm.rate ? brass * parseFloat(orderForm.rate) : 0
                return (
                  <div key={color} className="flex justify-between items-center py-1.5 border-b border-gray-800">
                    <span className="text-sm">{EMOJI[color]} {color}</span>
                    <div className="text-right">
                      <span className="font-bold text-sm">{formatNum(brass,2)} brass</span>
                      <span className="text-xs text-gray-400 ml-2">({brassToBlocks(brass).toLocaleString('en-IN')} blocks)</span>
                      {value > 0 && <span className="text-xs text-orange-400 ml-2">{formatINR(value)}</span>}
                    </div>
                  </div>
                )
              })}
              <div className="flex justify-between pt-2 mt-1">
                <span className="text-sm font-bold text-orange-400">Total</span>
                <div>
                  <span className="font-bold text-orange-400">{formatNum(totalOrderBrass,2)} brass</span>
                  {orderForm.rate > 0 && (
                    <span className="text-xs text-gray-400 ml-2">= {formatINR(totalOrderBrass * parseFloat(orderForm.rate))}</span>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="bg-white border border-gray-100 rounded-2xl p-3 shadow-sm">
            <input type="text" value={orderForm.notes} placeholder=" Notes (optional)"
              onChange={e => setOrderForm(p => ({ ...p, notes: e.target.value }))}
              className="w-full text-sm text-gray-600 outline-none bg-transparent" />
          </div>

          <button onClick={handleNewOrder} disabled={saving || orderedColors.length === 0}
            className={`w-full font-bold py-4 rounded-2xl text-base transition-all
              ${orderedColors.length > 0
                ? 'bg-orange-500 text-white shadow-lg shadow-orange-200 active:scale-95'
                : 'bg-gray-100 text-gray-400'}`}>
            {saving
              ? ' Saving Order...'
              : orderedColors.length > 0
                ? ` Save Order — ${formatNum(totalOrderBrass,2)} brass total`
                : 'Enter qty above to continue'}
          </button>
        </>}

        {/* HISTORY */}
        {tab === 'history' && (
          loading
            ? <div className="text-center py-8 text-gray-400">Loading history...</div>
            : historyActivities.length === 0
              ? (
                <div className="rounded-3xl border border-gray-100 bg-white px-6 py-16 text-center text-gray-400 shadow-sm">
                  <p className="font-bold text-gray-700">No CRM activity found</p>
                  <p className="mt-1 text-sm">Orders and dispatch activity will appear here.</p>
                </div>
              )
              : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <HistorySummaryCard label="Total Activities" value={historySummary.totalActivities} />
                    <HistorySummaryCard label="Orders" value={historySummary.orders} />
                    <HistorySummaryCard label="Dispatches" value={historySummary.dispatches} />
                    <HistorySummaryCard label="Total Brass" value={formatNum(historySummary.totalBrass, 2)} helper="Orders + dispatches" />
                  </div>

                  <div className="rounded-3xl border border-gray-100 bg-white p-3 shadow-sm">
                    <div className="grid gap-2 md:grid-cols-5">
                      <input
                        value={historyFilters.search}
                        onChange={e => setHistoryFilter('search', e.target.value)}
                        placeholder="Search client"
                        className="rounded-2xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm font-semibold text-gray-700 outline-none focus:border-orange-300 focus:bg-white md:col-span-2"
                      />
                      <select
                        value={historyFilters.dateRange}
                        onChange={e => setHistoryFilter('dateRange', e.target.value)}
                        className="rounded-2xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm font-semibold text-gray-700 outline-none focus:border-orange-300 focus:bg-white"
                      >
                        <option value="all">All Time</option>
                        <option value="today">Today</option>
                        <option value="last7">Last 7 Days</option>
                        <option value="month">This Month</option>
                        <option value="custom">Custom Range</option>
                      </select>
                      <select
                        value={historyFilters.type}
                        onChange={e => setHistoryFilter('type', e.target.value)}
                        className="rounded-2xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm font-semibold text-gray-700 outline-none focus:border-orange-300 focus:bg-white"
                      >
                        <option value="all">All Activities</option>
                        <option value="order">Orders</option>
                        <option value="dispatch">Dispatches</option>
                      </select>
                      <select
                        value={historyFilters.color}
                        onChange={e => setHistoryFilter('color', e.target.value)}
                        className="rounded-2xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm font-semibold text-gray-700 outline-none focus:border-orange-300 focus:bg-white"
                      >
                        <option value="all">All Colors</option>
                        {COLORS.map(color => <option key={color} value={color}>{color}</option>)}
                      </select>
                    </div>

                    {historyFilters.dateRange === 'custom' && (
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <input
                          type="date"
                          value={historyFilters.startDate}
                          onChange={e => setHistoryFilter('startDate', e.target.value)}
                          className="rounded-2xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm font-semibold text-gray-700 outline-none focus:border-orange-300 focus:bg-white"
                        />
                        <input
                          type="date"
                          value={historyFilters.endDate}
                          onChange={e => setHistoryFilter('endDate', e.target.value)}
                          className="rounded-2xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm font-semibold text-gray-700 outline-none focus:border-orange-300 focus:bg-white"
                        />
                      </div>
                    )}

                    {hasActiveHistoryFilters && (
                      <button
                        type="button"
                        onClick={clearHistoryFilters}
                        className="mt-3 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-bold text-orange-600"
                      >
                        Clear Filters
                      </button>
                    )}
                  </div>

                  {groupedHistory.length === 0 ? (
                    <div className="rounded-3xl border border-gray-100 bg-white px-6 py-16 text-center text-gray-400 shadow-sm">
                      <p className="font-bold text-gray-700">No activity matches the selected filters.</p>
                      <p className="mt-1 text-sm">Adjust the search, date, type, or color filter.</p>
                    </div>
                  ) : groupedHistory.map(group => {
                    const relativeLabel = relativeCrmDateLabel(group.dateKey)
                    return (
                      <section key={group.dateKey} className="overflow-hidden rounded-3xl border border-gray-100 bg-gray-50 shadow-sm">
                        <div className="sticky top-14 z-10 flex flex-col gap-1 border-b border-gray-100 bg-white/95 px-4 py-3 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <h2 className="text-base font-extrabold text-gray-900">{group.label}</h2>
                              {relativeLabel && (
                                <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[11px] font-bold text-orange-600">{relativeLabel}</span>
                              )}
                            </div>
                            <p className="mt-0.5 text-xs font-semibold text-gray-400">
                              {group.summary.totalActivities} Activities - {group.summary.orders} Orders - {group.summary.dispatches} Dispatches
                            </p>
                          </div>
                          <p className="text-xs font-bold text-gray-500">{formatNum(group.summary.totalBrass, 2)} brass</p>
                        </div>
                        <div className="space-y-2 p-3">
                          {group.activities.map(activity => <ActivityRow key={activity.id} activity={activity} />)}
                        </div>
                      </section>
                    )
                  })}
                </div>
              )
        )}

        {/* ══ DISPATCH ══ */}
        {tab === 'dispatch' && <>
          <div className="bg-green-50 border border-green-200 rounded-2xl p-3 text-xs text-green-700">
             <strong>Multi-color dispatch</strong> — enter brass for each color, saves all in one tap. Each color deducts from inventory separately.
          </div>

          {/* Date + Client */}
          <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm space-y-3">
            <div className="border-b border-gray-50 pb-2">
              <label className="text-xs text-gray-400 block mb-1"> Date</label>
              <input type="date" value={dispatchForm.date}
                onChange={e => setDispatchForm(p => ({ ...p, date: e.target.value }))}
                className="w-full text-base font-bold text-gray-800 outline-none bg-transparent" />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1"> Client</label>
              {clientList.length > 0 ? (
                <select value={dispatchForm.clientName}
                  onChange={e => {
                    const cl = clients[e.target.value]
                    const preColors = emptyDispatchColors()
                    if (cl) COLORS.forEach(c => {
                      const rem = Math.max(0, cl.byColor[c].ordered - cl.byColor[c].dispatched)
                      if (rem > 0) preColors[c] = formatNum(rem, 2)
                    })
                    setDispatchForm(p => ({ ...p, clientName: e.target.value }))
                    setDispatchColors(preColors)
                  }}
                  className="w-full text-base font-bold text-gray-800 outline-none bg-transparent">
                  <option value="">— Select Client —</option>
                  {clientList.map(c => {
                    const rem = Math.max(0, c.totalOrdered - c.totalDispatched)
                    return <option key={c.name} value={c.name}>{c.name} ({formatNum(rem,2)} brass left)</option>
                  })}
                </select>
              ) : (
                <input type="text" value={dispatchForm.clientName} placeholder="Client name"
                  onChange={e => setDispatchForm(p => ({ ...p, clientName: e.target.value }))}
                  className="w-full text-base font-bold text-gray-800 outline-none bg-transparent" />
              )}
            </div>
          </div>

          {/* Multi-color brass entry */}
          <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
            <label className="text-xs font-bold text-gray-400 uppercase tracking-wide block mb-1"> Dispatch Qty by Color (Brass)</label>
            <p className="text-xs text-gray-400 mb-3">Pre-filled with remaining balance. Edit as needed.</p>
            <div className="space-y-2">
              {COLORS.map(color => {
                const val    = dispatchColors[color]
                const active = parseFloat(val) > 0
                return (
                  <div key={color} className={`flex items-center gap-3 rounded-xl p-3 border transition-all
                    ${active ? COLOR_BG[color] : 'bg-white border-gray-200'}`}>
                    <span className="text-xl shrink-0">{EMOJI[color]}</span>
                    <span className={`text-sm font-bold w-14 shrink-0 ${active ? COLOR_TEXT[color] : 'text-gray-400'}`}>{color}</span>
                    <div className="flex-1">
                      <input type="number" inputMode="decimal" value={val || ''} placeholder="0"
                        onChange={e => setDispatchColors(p => ({ ...p, [color]: e.target.value }))}
                        className={`w-full text-xl font-bold outline-none bg-transparent ${active ? COLOR_TEXT[color] : 'text-gray-300'}`} />
                      {active && <p className="text-xs text-gray-400 mt-0.5">= {brassToBlocks(val).toLocaleString('en-IN')} blocks</p>}
                    </div>
                    <span className="text-xs text-gray-400 shrink-0">brass</span>
                    {active && <button onClick={() => setDispatchColors(p => ({ ...p, [color]: '' }))} className="text-gray-300 text-lg leading-none">×</button>}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Dispatch summary */}
          {COLORS.some(c => parseFloat(dispatchColors[c]) > 0) && (() => {
            const filled = COLORS.filter(c => parseFloat(dispatchColors[c]) > 0)
            const totalB = filled.reduce((s, c) => s + parseFloat(dispatchColors[c]), 0)
            return (
              <div className="bg-gray-900 rounded-2xl p-4 text-white">
                <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-2">Dispatch Summary</p>
                {filled.map(c => (
                  <div key={c} className="flex justify-between text-sm py-1 border-b border-gray-800">
                    <span>{EMOJI[c]} {c}</span>
                    <span className="font-bold">{formatNum(parseFloat(dispatchColors[c]),2)} brass
                      <span className="text-gray-400 text-xs font-normal ml-1">({brassToBlocks(dispatchColors[c]).toLocaleString('en-IN')} blocks)</span>
                    </span>
                  </div>
                ))}
                <div className="flex justify-between pt-2 font-bold text-orange-400">
                  <span>Total</span>
                  <span>{formatNum(totalB,2)} brass</span>
                </div>
              </div>
            )
          })()}

          {/* Transport */}
          <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
            <label className="text-xs font-bold text-gray-400 uppercase tracking-wide block mb-2"> Transport</label>
            <div className="grid grid-cols-2 gap-2 mb-3">
              {['Self-Pickup','Company Transport'].map(t => (
                <button key={t} onClick={() => setDispatchForm(p => ({ ...p, transport: t }))}
                  className={`py-3 rounded-xl text-xs font-bold transition-all
                    ${dispatchForm.transport===t ? 'bg-orange-500 text-white shadow-md shadow-orange-200' : 'bg-gray-50 border border-gray-200 text-gray-600'}`}>
                  {t === 'Self-Pickup' ? ' Self-Pickup' : ' Company'}
                </button>
              ))}
            </div>
            {dispatchForm.transport === 'Company Transport' && (
              <div className="space-y-2">
                <input type="text" value={dispatchForm.transporter} placeholder="Transporter / Vendor name"
                  onChange={e => setDispatchForm(p => ({ ...p, transporter: e.target.value }))}
                  className="w-full text-sm text-gray-800 outline-none bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5" />
                <input type="number" inputMode="decimal" value={dispatchForm.freightCharge} placeholder="Freight charge ₹"
                  onChange={e => setDispatchForm(p => ({ ...p, freightCharge: e.target.value }))}
                  className="w-full text-sm text-gray-800 outline-none bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5" />
              </div>
            )}
          </div>

          <div className="bg-white border border-gray-100 rounded-2xl p-3 shadow-sm">
            <input type="text" value={dispatchForm.notes} placeholder=" Notes (optional)"
              onChange={e => setDispatchForm(p => ({ ...p, notes: e.target.value }))}
              className="w-full text-sm text-gray-700 outline-none bg-transparent" />
          </div>

          <button onClick={handleDispatch} disabled={saving}
            className="w-full bg-green-500 disabled:bg-green-300 text-white font-bold py-4 rounded-2xl text-base shadow-lg shadow-green-200 active:scale-95 transition-all">
            {saving ? ' Saving...' : ` Confirm Dispatch — ${COLORS.filter(c=>dispatchColors[c]>0).length} Color${COLORS.filter(c=>dispatchColors[c]>0).length>1?'s':''}`}
          </button>
        </>}

                {/* ══ HISTORY ══ */}
        {tab === 'historyLegacy' && (
          loading
            ? <div className="text-center py-8 text-gray-400"> Loading...</div>
            : rows.length === 0
              ? <div className="text-center py-16 text-gray-400"><div className="text-5xl mb-2"></div><p>No entries yet.</p></div>
              : [...rows].reverse().map((r, i) => (
                <div key={i} className="bg-white border border-gray-100 rounded-2xl p-3 shadow-sm mb-2">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-bold text-gray-900">{r.ClientName}</span>
                    <div className="flex items-center gap-2">
                      {r.Color && <span className="text-sm">{EMOJI[r.Color] || ''} {r.Color}</span>}
                      <StatusBadge status={r.Status || 'Order'} />
                    </div>
                  </div>
                  <div className="text-xs text-gray-500 space-y-0.5">
                    <p>{r.Date}{r.Location ? ` ·  ${r.Location}` : ''}</p>
                    {parseFloat(r.OrderBrass)    > 0 && <p> Order: <strong>{r.OrderBrass} brass</strong> @ {formatINR(r.Rate)}/brass</p>}
                    {parseFloat(r.DispatchBrass) > 0 && <p> Dispatched: <strong>{r.DispatchBrass} brass</strong> · {r.Transport}</p>}
                    {parseFloat(r.FreightCharge) > 0 && <p>Freight: {formatINR(r.FreightCharge)} · {r.Transporter}</p>}
                    {r.Notes && <p className="italic text-gray-400">{r.Notes}</p>}
                  </div>
                </div>
              ))
        )}
      </div>
    </div>
  )
}
