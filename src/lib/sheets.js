// ─────────────────────────────────────────────
//  sheets.js  —  Complete Google Sheets data layer
//  New tabs: Production_Variants, Opening_Stock
//  Updated: CRM_Log (Color + Status), QC_Log (Color)
// ─────────────────────────────────────────────

const SHEET_ID = import.meta.env.VITE_SHEET_ID

// ── Core primitives ───────────────────────────

export async function readSheet(accessToken, range) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
  // 400 = tab doesn't exist yet — return empty instead of crashing
  if (res.status === 400) return []
  if (!res.ok) throw new Error(`Sheets read error: ${res.statusText}`)
  return (await res.json()).values || []
}

export async function appendRow(accessToken, range, values) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [values] })
  })
  if (!res.ok) throw new Error(`Sheets append error: ${res.statusText}`)
  return res.json()
}

export async function appendRows(accessToken, range, rows) {
  if (!rows.length) return
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: rows })
  })
  if (!res.ok) throw new Error(`Sheets bulk append error: ${res.statusText}`)
  return res.json()
}

export async function updateRange(accessToken, range, values) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`
  const res = await fetch(url, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values })
  })
  if (!res.ok) throw new Error(`Sheets update error: ${res.statusText}`)
  return res.json()
}

// ── Header guard — writes headers once if tab is empty ──
async function ensureHeaders(accessToken, tab, headers) {
  const existing = await readSheet(accessToken, `${tab}!A1:A1`)
  if (!existing.length) {
    await appendRow(accessToken, `${tab}!A:A`, headers)
  }
}

// ── Generic tab loader → array of {header: value} objects ──
async function loadTab(accessToken, tab) {
  const rows = await readSheet(accessToken, `${tab}!A:Z`)
  if (rows.length < 2) return []
  const [headers, ...data] = rows
  return data.map(row => {
    const obj = {}
    headers.forEach((h, i) => { obj[h] = row[i] ?? '' })
    return obj
  })
}

// ─────────────────────────────────────────────
//  CONFIG
// ─────────────────────────────────────────────

export async function loadConfig(accessToken) {
  const values = await readSheet(accessToken, 'Config!A:B')
  const config = {}
  values.forEach(([key, value]) => {
    if (key) config[key] = isNaN(value) ? value : parseFloat(value)
  })
  return config
}

export async function saveConfig(accessToken, configObj) {
  const values = Object.entries(configObj).map(([k, v]) => [k, v])
  await updateRange(accessToken, 'Config!A1', values)
}

// ─────────────────────────────────────────────
//  OPENING STOCK  (cold-start baseline)
//  Tab: Opening_Stock
//  Schema: Color | Blocks | SetupDate | Notes
// ─────────────────────────────────────────────

export async function loadOpeningStock(accessToken) {
  return loadTab(accessToken, 'Opening_Stock')
}

export async function saveOpeningStock(accessToken, entries) {
  // entries = [{ color, blocks, setupDate, notes }]
  // Schema: Date | Type | Color | Blocks | Brass | Notes
  await ensureHeaders(accessToken, 'Opening_Stock', ['Date', 'Type', 'Color', 'Blocks', 'Brass', 'Notes'])
  const rows = entries.map(e => {
    const blocks = parseInt(e.blocks) || 0
    const brass  = parseFloat((blocks / 285).toFixed(2))
    return [e.setupDate, 'Opening', e.color, blocks, brass, e.notes || 'Opening balance']
  })
  await appendRows(accessToken, 'Opening_Stock!A:A', rows)
}

const VALID_COLORS = ['Red', 'Yellow', 'Black', 'White']

// Returns a color→blocks map — reads by column INDEX so it works
// even when header row is missing (common cold-start issue)
export async function getOpeningStockMap(accessToken) {
  // Read raw values across all 6 columns: Date,Type,Color,Blocks,Brass,Notes
  const raw = await readSheet(accessToken, 'Opening_Stock!A:F')
  if (!raw || raw.length === 0) return {}

  const map = {}

  raw.forEach(row => {
    // Skip header row
    if (!row || row[0] === 'Date' || row[0] === 'Color') return

    // Scan every cell in the row to find a valid color and a number near it
    // This handles any column order automatically
    let foundColor  = null
    let foundBlocks = null

    row.forEach((cell, idx) => {
      const val = (cell || '').toString().trim()
      if (VALID_COLORS.includes(val)) {
        foundColor = val
        // Look at next cell for blocks, or previous cell
        const next = (row[idx + 1] || '').toString().trim()
        const prev = (row[idx - 1] || '').toString().trim()
        if (!isNaN(next) && parseFloat(next) > 0) foundBlocks = parseFloat(next)
        else if (!isNaN(prev) && parseFloat(prev) > 0) foundBlocks = parseFloat(prev)
      }
    })

    // Fallback: find color in col C (index 2), blocks in col D (index 3)
    // Schema: Date | Type | Color | Blocks | Brass | Notes
    if (!foundColor) {
      const colC = (row[2] || '').toString().trim()
      const colD = (row[3] || '').toString().trim()
      if (VALID_COLORS.includes(colC) && !isNaN(colD)) {
        foundColor  = colC
        foundBlocks = parseFloat(colD) || 0
      }
    }

    if (foundColor && foundBlocks > 0) {
      map[foundColor] = (map[foundColor] || 0) + foundBlocks
    }
  })

  return map  // { Red: 46958, Yellow: 46958, ... }
}

// ─────────────────────────────────────────────
//  PRODUCTION (main daily totals log)
//  Tab: Production_Log
//  Schema: Date | Blocks | MortarCement | ColorCement | TotalCement |
//          Greet_Ton | Powder_Ton | Chemical_L | YellowKG | RedKG |
//          YellowFinal | RedFinal | Reti | Plastic_ml | MiscExpenses |
//          CementCost | GreetCost | PowderCost | ChemicalCost |
//          ColorCost | PlasticCost | RetiCost | LabourCost | TotalDailyCost
// ─────────────────────────────────────────────

/** Explicit column-matching loader — reads all 24 columns including costs.
 *  Tolerant of header spelling variants (Greet_Ton vs Greet_kg, etc.) */
export async function loadProduction(accessToken) {
  const raw = await readSheet(accessToken, 'Production_Log!A:Z')
  if (!raw || raw.length < 2) return []

  const headers = raw[0].map(h => (h || '').toString().trim())
  const lower   = headers.map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ''))

  // col() finds a column index by predicate, falling back to a positional default
  const col = (pred, fallback = -1) => {
    const i = lower.findIndex(pred)
    return i >= 0 ? i : fallback
  }

  const idx = {
    // ── Input / material columns ───────────────
    date:           col(h => h === 'date',                                          0),
    blocks:         col(h => h === 'blocks',                                        1),
    mortarCement:   col(h => h.includes('mortar') && h.includes('cement'),          2),
    colorCement:    col(h => h.includes('color')  && h.includes('cement')
                              && !h.includes('total') && !h.includes('cost'),       3),
    totalCement:    col(h => h.includes('total')  && h.includes('cement')
                              && !h.includes('cost'),                               4),
    // Handles both Greet_Ton (current) and Greet_kg (old) — matches anything with 'greet' but not 'cost'
    greet:          col(h => h.includes('greet')  && !h.includes('cost'),           5),
    // Handles both Powder_Ton (current) and Powder_kg (old)
    powder:         col(h => h.includes('powder') && !h.includes('cost'),           6),
    chemical:       col(h => h.includes('chemical') && !h.includes('cost'),         7),
    yellowKG:       col(h => h.includes('yellow') && !h.includes('final')
                              && !h.includes('cost'),                               8),
    redKG:          col(h => h.includes('red')    && !h.includes('final')
                              && !h.includes('cost'),                               9),
    yellowFinal:    col(h => h.includes('yellow') && h.includes('final'),          10),
    redFinal:       col(h => h.includes('red')    && h.includes('final'),          11),
    reti:           col(h => h === 'reti',                                         12),
    plastic:        col(h => h.includes('plastic') && !h.includes('cost'),         13),
    miscExpenses:   col(h => h.includes('misc'),                                   14),
    // ── Cost columns ──────────────────────────
    cementCost:     col(h => h === 'cementcost',                                   15),
    greetCost:      col(h => h === 'greetcost',                                    16),
    powderCost:     col(h => h === 'powdercost',                                   17),
    chemicalCost:   col(h => h === 'chemicalcost',                                 18),
    colorCost:      col(h => h === 'colorcost',                                    19),
    plasticCost:    col(h => h === 'plasticcost',                                  20),
    retiCost:       col(h => h === 'reticost',                                     21),
    labourCost:     col(h => h === 'labourcost',                                   22),
    totalDailyCost: col(h => h === 'totaldailycost',                               23),
  }

  const cell = (row, i) => (i >= 0 && row[i] != null ? row[i] : '')

  return raw.slice(1)
    .filter(row => row.some(c => (c || '').toString().trim() !== ''))
    .map(row => ({
      // ── Input / material fields ────────────────
      Date:           cell(row, idx.date),
      Blocks:         cell(row, idx.blocks),
      MortarCement:   cell(row, idx.mortarCement),
      ColorCement:    cell(row, idx.colorCement),
      TotalCement:    cell(row, idx.totalCement),
      Greet_kg:       cell(row, idx.greet),      // kept as Greet_kg for internal compat
      Powder_kg:      cell(row, idx.powder),     // kept as Powder_kg for internal compat
      Chemical_L:     cell(row, idx.chemical),
      YellowKG:       cell(row, idx.yellowKG),
      RedKG:          cell(row, idx.redKG),
      YellowFinal:    cell(row, idx.yellowFinal),
      RedFinal:       cell(row, idx.redFinal),
      Reti:           cell(row, idx.reti),
      Plastic_ml:     cell(row, idx.plastic),
      MiscExpenses:   cell(row, idx.miscExpenses),
      // ── Cost fields ───────────────────────────
      CementCost:     cell(row, idx.cementCost),
      GreetCost:      cell(row, idx.greetCost),
      PowderCost:     cell(row, idx.powderCost),
      ChemicalCost:   cell(row, idx.chemicalCost),
      ColorCost:      cell(row, idx.colorCost),
      PlasticCost:    cell(row, idx.plasticCost),
      RetiCost:       cell(row, idx.retiCost),
      LabourCost:     cell(row, idx.labourCost),
      TotalDailyCost: cell(row, idx.totalDailyCost),
    }))
}

export async function saveProductionEntry(accessToken, entry) {
  await ensureHeaders(accessToken, 'Production_Log', [
    'Date', 'Blocks', 'MortarCement', 'ColorCement', 'TotalCement',
    'Greet_Ton', 'Powder_Ton', 'Chemical_L', 'YellowKG', 'RedKG',
    'YellowFinal', 'RedFinal', 'Reti', 'Plastic_ml', 'MiscExpenses',
    'CementCost', 'GreetCost', 'PowderCost', 'ChemicalCost',
    'ColorCost', 'PlasticCost', 'RetiCost', 'LabourCost', 'TotalDailyCost'
  ])
  await appendRow(accessToken, 'Production_Log!A:A', [
    entry.date,        entry.blocks,      entry.mortarCement, entry.colorCement,
    entry.totalCement, entry.greet,       entry.powder,       entry.chemical,
    entry.yellowKG,    entry.redKG,       entry.yellowFinal,  entry.redFinal,
    entry.reti,        entry.plastic,     entry.misc,
    entry.cementCost,  entry.greetCost,   entry.powderCost,   entry.chemicalCost,
    entry.colorCost,   entry.plasticCost, entry.retiCost,     entry.labourCost,
    entry.totalDailyCost,
  ])
}

// ─────────────────────────────────────────────
//  PRODUCTION VARIANTS  (per-color daily inflows)
//  Tab: Production_Variants  ← NEW
//  Schema: Date | Color | Blocks | Brass | BatchID | Notes
//
//  Written atomically alongside Production_Log save.
//  This is the authoritative source for inventory inflow.
// ─────────────────────────────────────────────

export async function loadProductionVariants(accessToken) {
  return loadTab(accessToken, 'Production_Variants')
}

export async function saveProductionVariants(accessToken, variants) {
  // variants = [{ date, color, blocks, brass, batchId, notes }]
  await ensureHeaders(accessToken, 'Production_Variants', [
    'Date', 'Color', 'Blocks', 'Brass', 'BatchID', 'Notes'
  ])
  const rows = variants.map(v => [
    v.date, v.color, parseInt(v.blocks) || 0,
    parseFloat(v.brass) || 0, v.batchId || v.date, v.notes || ''
  ])
  await appendRows(accessToken, 'Production_Variants!A:A', rows)
}

// ─────────────────────────────────────────────
//  CRM
//  Tab: CRM_Log
//  Schema: Date | ClientName | Location | OrderBrass | OrderBlocks |
//          Rate | DispatchBrass | DispatchBlocks | Color | Status |
//          Transport | Transporter | FreightCharge | Notes
//
//  KEY CHANGE: Color + Status columns added.
//  Status: 'Order' | 'Dispatched'
//  Only 'Dispatched' rows drive inventory deduction.
// ─────────────────────────────────────────────

export async function loadCRM(accessToken) {
  return loadTab(accessToken, 'CRM_Log')
}

export async function saveCRMEntry(accessToken, entry) {
  await ensureHeaders(accessToken, 'CRM_Log', [
    'Date', 'ClientName', 'Location', 'OrderBrass', 'OrderBlocks',
    'Rate', 'DispatchBrass', 'DispatchBlocks', 'Color', 'Status',
    'Transport', 'Transporter', 'FreightCharge', 'Notes'
  ])
  await appendRow(accessToken, 'CRM_Log!A:A', [
    entry.date,
    entry.clientName,
    entry.location    || '',
    entry.orderBrass  || 0,
    entry.orderBlocks || 0,
    entry.rate        || 0,
    entry.dispatchBrass   || 0,
    entry.dispatchBlocks  || 0,
    entry.color       || '',
    entry.status      || 'Order',
    entry.transport   || '',
    entry.transporter || '',
    entry.freightCharge || 0,
    entry.notes       || '',
  ])
}

// Returns only dispatched rows — used by inventory engine
// Backward compatible: if Status column missing (old schema), use DispatchBrass > 0
export async function loadCRMDispatches(accessToken) {
  const all = await loadCRM(accessToken)
  return all.filter(r => {
    // New schema: Status column exists
    if (r.Status) return r.Status === 'Dispatched'
    // Old schema fallback: any row with DispatchBrass > 0 counts as dispatched
    return parseFloat(r.DispatchBrass) > 0
  })
}

// ─────────────────────────────────────────────
//  QC / WASTAGE
//  Tab: QC_Log
//  Schema: Date | Color | BrokenBlocks | CostPerBlock | TotalLoss | Notes
//  KEY CHANGE: Color column added for per-color deduction.
// ─────────────────────────────────────────────

export async function loadQC(accessToken) {
  // Read raw to handle any column order
  const raw = await readSheet(accessToken, 'QC_Log!A:F')
  if (!raw || raw.length < 2) return []
  const headers = raw[0].map(h => (h || '').toString().trim())

  // Find column indexes dynamically
  const idx = {
    date:         headers.findIndex(h => h.toLowerCase().includes('date')),
    color:        headers.findIndex(h => h.toLowerCase().includes('color')),
    brokenBlocks: headers.findIndex(h => h.toLowerCase().includes('broken')),
    costPerBlock: headers.findIndex(h => h.toLowerCase().includes('cost')),
    totalLoss:    headers.findIndex(h => h.toLowerCase().includes('loss')),
    notes:        headers.findIndex(h => h.toLowerCase().includes('notes')),
  }

  return raw.slice(1).map(row => ({
    Date:         row[idx.date]         || '',
    Color:        row[idx.color]        || '',
    BrokenBlocks: row[idx.brokenBlocks] || '0',
    CostPerBlock: row[idx.costPerBlock] || '0',
    TotalLoss:    row[idx.totalLoss]    || '0',
    Notes:        row[idx.notes]        || '',
  })).filter(r => r.Date || r.BrokenBlocks)
}

export async function saveQCEntry(accessToken, entry) {
  // Always enforce correct header order before saving
  const existing = await readSheet(accessToken, 'QC_Log!A1:F1')
  const firstRow = (existing[0] || []).map(h => (h||'').trim())
  // If Color column missing, overwrite header row with correct schema
  if (!firstRow.includes('Color')) {
    await updateRange(accessToken, 'QC_Log!A1', [['Date','Color','BrokenBlocks','CostPerBlock','TotalLoss','Notes']])
  }
  await appendRow(accessToken, 'QC_Log!A:A', [
    entry.date,
    entry.color        || 'All',
    entry.brokenBlocks,
    entry.costPerBlock,
    entry.totalLoss,
    entry.notes        || '',
  ])
}

// ─────────────────────────────────────────────
//  CASH FLOW
// ─────────────────────────────────────────────

export async function loadCashFlow(accessToken) { return loadTab(accessToken, 'CashFlow_Log') }

export async function saveCashFlowEntry(accessToken, entry) {
  await ensureHeaders(accessToken, 'CashFlow_Log', ['Date', 'Type', 'Source', 'Amount', 'Description', 'VendorName'])
  await appendRow(accessToken, 'CashFlow_Log!A:A', [
    entry.date, entry.type, entry.source, entry.amount, entry.description, entry.vendorName || ''
  ])
}

// ─────────────────────────────────────────────
//  VENDOR LEDGER
// ─────────────────────────────────────────────

export async function loadVendors(accessToken) { return loadTab(accessToken, 'Vendor_Ledger') }

export async function saveVendorEntry(accessToken, entry) {
  await ensureHeaders(accessToken, 'Vendor_Ledger', ['Date', 'VendorName', 'Material', 'Type', 'Amount', 'Notes'])
  await appendRow(accessToken, 'Vendor_Ledger!A:A', [
    entry.date, entry.vendorName, entry.material, entry.type, entry.amount, entry.notes || ''
  ])
}

// ─────────────────────────────────────────────
//  PAYROLL
// ─────────────────────────────────────────────

export async function loadPayroll(accessToken) { return loadTab(accessToken, 'Payroll_Log') }

export async function savePayrollEntry(accessToken, entry) {
  await ensureHeaders(accessToken, 'Payroll_Log', ['Date', 'WorkerName', 'Type', 'Blocks', 'WageRate', 'Amount', 'Notes'])
  await appendRow(accessToken, 'Payroll_Log!A:A', [
    entry.date, entry.workerName, entry.type,
    entry.blocks || 0, entry.wageRate || 0, entry.amount, entry.notes || ''
  ])
}

// ─────────────────────────────────────────────
//  INVENTORY ENGINE  (computed — never stored)
//
//  Formula:  Current Stock =
//    Opening Stock
//    + SUM(Production_Variants.Blocks where Color=X)
//    - SUM(CRM_Log.DispatchBlocks where Color=X AND Status='Dispatched')
//    - SUM(QC_Log.BrokenBlocks where Color=X)
//
//  This function loads all source tabs in parallel
//  and returns a complete per-color stock map.
// ─────────────────────────────────────────────

export async function computeInventory(accessToken) {
  const COLORS = ['Red', 'Yellow', 'Black', 'White']

  // Each source is fault-tolerant — missing tab = empty array, never crashes
  const [opening, variants, dispatches, qc] = await Promise.all([
    getOpeningStockMap(accessToken).catch(() => ({})),
    loadProductionVariants(accessToken).catch(() => []),
    loadCRMDispatches(accessToken).catch(() => []),
    loadQC(accessToken).catch(() => []),
  ])

  const result = {}
  COLORS.forEach(color => {
    const openingQty = opening[color] || 0

    const produced = variants
      .filter(r => r.Color === color)
      .reduce((s, r) => s + (parseFloat(r.Blocks) || 0), 0)

    // Only deduct dispatches that have a specific color tagged.
    // Rows with blank Color (historical bulk imports) are excluded from
    // inventory deduction — they exist for records/P&L only, not stock tracking.
    const sold = dispatches
      .filter(r => r.Color === color)
      .reduce((s, r) => s + (parseFloat(r.DispatchBlocks) || 0), 0)

    // Match exact color OR any "all colors" variant ('All', 'All Colors', blank)
    const isAllColors = r => {
      const c = (r.Color || '').trim()
      return c === 'All' || c === 'All Colors' || c === '' || c === 'all'
    }
    const broken = qc
      .filter(r => r.Color === color || isAllColors(r))
      .reduce((s, r) => {
        if (isAllColors(r)) return s + (parseFloat(r.BrokenBlocks) || 0) / COLORS.length
        return s + (parseFloat(r.BrokenBlocks) || 0)
      }, 0)

    result[color] = {
      opening:  openingQty,
      produced: Math.round(produced),
      sold:     Math.round(sold),
      broken:   Math.round(broken),
      stock:    Math.max(0, openingQty + produced - sold - Math.round(broken)),
    }
  })

  return result
}

// ─────────────────────────────────────────────
//  BULK IMPORT — CSV ingestion pipeline
//  Supports: Production_Variants, CRM_Log
// ─────────────────────────────────────────────

export async function bulkImportProductionVariants(accessToken, rows) {
  // rows = [{ date, color, blocks }]
  await ensureHeaders(accessToken, 'Production_Variants', [
    'Date', 'Color', 'Blocks', 'Brass', 'BatchID', 'Notes'
  ])
  const formatted = rows.map(r => {
    const blocks = parseInt(r.blocks) || 0
    return [r.date, r.color, blocks, parseFloat((blocks / 285).toFixed(2)), r.date, r.notes || 'Bulk Import']
  })
  await appendRows(accessToken, 'Production_Variants!A:A', formatted)
  return formatted.length
}

export async function bulkImportCRM(accessToken, rows) {
  // rows = [{ date, clientName, location, orderBrass, rate, color, notes }]
  // Bulk imports are always saved as Status='Dispatched' with DispatchBrass=OrderBrass
  // Reason: historical data — already delivered, should not show as pending dispatch
  // Color is intentionally left blank for past data — no inventory deduction without color
  await ensureHeaders(accessToken, 'CRM_Log', [
    'Date', 'ClientName', 'Location', 'OrderBrass', 'OrderBlocks',
    'Rate', 'DispatchBrass', 'DispatchBlocks', 'Color', 'Status',
    'Transport', 'Transporter', 'FreightCharge', 'Notes'
  ])
  const formatted = rows.map(r => {
    const brass  = parseFloat(r.orderBrass) || 0
    const blocks = Math.round(brass * 285)
    return [
      r.date,
      r.clientName,
      r.location  || '',
      brass,          // OrderBrass
      blocks,         // OrderBlocks
      r.rate      || 0,
      brass,          // DispatchBrass = OrderBrass (already delivered)
      blocks,         // DispatchBlocks = OrderBlocks
      r.color     || '',  // blank for past data — no inventory deduction
      'Dispatched',   // ← KEY: marks as already done, no dispatch button shown
      'Bulk Import',  // Transport
      '',             // Transporter
      0,              // FreightCharge
      r.notes     || ''
    ]
  })
  await appendRows(accessToken, 'CRM_Log!A:A', formatted)
  return formatted.length
}

// ─────────────────────────────────────────────
//  SEED — populate static data on cold start
// ─────────────────────────────────────────────

export async function seedStaticData(accessToken, today) {
  // Seed Config defaults if empty
  const existingConfig = await readSheet(accessToken, 'Config!A1:A1')
  if (!existingConfig.length) {
    const defaults = [
      ['ghamela_g', 17], ['weight_g', 17],
      ['ghamela_p', 12], ['weight_p', 18],
      ['litre_m', 1], ['ml_c', 0.5],
      ['yellowRatio', 0.5], ['redRatio', 0.5],
      ['reti_multiplier', 3], ['plastic_ml', 180],
      ['cementRate', 340], ['greetRate', 600],
      ['powderRate', 450], ['chemicalRate', 25],
      ['colorRate', 135], ['plasticRate', 100],
      ['retiRate', 30], ['labourRate', 1.80],
      ['miscDefault', 1000],
    ]
    await updateRange(accessToken, 'Config!A1', defaults)
  }

  // Ensure all tab headers exist
  await ensureHeaders(accessToken, 'Opening_Stock',        ['Color', 'Blocks', 'SetupDate', 'Notes'])
  await ensureHeaders(accessToken, 'Production_Log',       ['Date', 'Blocks', 'MortarCement', 'ColorCement', 'TotalCement', 'Greet_Ton', 'Powder_Ton', 'Chemical_L', 'YellowKG', 'RedKG', 'YellowFinal', 'RedFinal', 'Reti', 'Plastic_ml', 'MiscExpenses', 'CementCost', 'GreetCost', 'PowderCost', 'ChemicalCost', 'ColorCost', 'PlasticCost', 'RetiCost', 'LabourCost', 'TotalDailyCost'])
  await ensureHeaders(accessToken, 'Production_Variants',  ['Date', 'Color', 'Blocks', 'Brass', 'BatchID', 'Notes'])
  await ensureHeaders(accessToken, 'CRM_Log',              ['Date', 'ClientName', 'Location', 'OrderBrass', 'OrderBlocks', 'Rate', 'DispatchBrass', 'DispatchBlocks', 'Color', 'Status', 'Transport', 'Transporter', 'FreightCharge', 'Notes'])
  await ensureHeaders(accessToken, 'QC_Log',               ['Date', 'Color', 'BrokenBlocks', 'CostPerBlock', 'TotalLoss', 'Notes'])
  await ensureHeaders(accessToken, 'CashFlow_Log',         ['Date', 'Type', 'Source', 'Amount', 'Description', 'VendorName'])
  await ensureHeaders(accessToken, 'Vendor_Ledger',        ['Date', 'VendorName', 'Material', 'Type', 'Amount', 'Notes'])
  await ensureHeaders(accessToken, 'Payroll_Log',          ['Date', 'WorkerName', 'Type', 'Blocks', 'WageRate', 'Amount', 'Notes'])

  return true
}

// ─────────────────────────────────────────────
//  DEBUG — returns raw source counts for diagnosis
// ─────────────────────────────────────────────
export async function computeInventoryDebug(accessToken) {
  // Read opening stock RAW (by index) so debug always shows truth
  const [openingRaw, variants, allCRM, qc, openingMap] = await Promise.all([
    readSheet(accessToken, 'Opening_Stock!A:D').catch(() => []),
    loadProductionVariants(accessToken).catch(() => []),
    loadCRM(accessToken).catch(() => []),
    loadQC(accessToken).catch(() => []),
    getOpeningStockMap(accessToken).catch(() => ({})),
  ])

  const dispatched = allCRM.filter(r => r.Status === 'Dispatched' || (!r.Status && parseFloat(r.DispatchBrass) > 0))

  return {
    openingRaw,           // raw rows from sheet for diagnosis
    openingMap,           // parsed color→blocks map
    variantRows:  variants,
    dispatchedRows: dispatched,
    qcRows: qc,
    summary: {
      openingRawCount:  openingRaw.length,
      openingMapColors: Object.keys(openingMap),
      variantsCount:    variants.length,
      dispatchCount:    dispatched.length,
      qcCount:          qc.length,
    }
  }
}

// ─────────────────────────────────────────────
//  OPENING MATERIAL STOCK
//  Tab: Opening_Material_Stock
//  Schema: Date | Type | Material | Quantity | Unit | Notes
// ─────────────────────────────────────────────

import {
  MATERIAL_IDS,
  MATERIAL_UNITS,
  normalizeVendorMaterial,
  normalizeToStockUnit,
  consumptionFromProductionRow,
} from './materials.js'

export async function saveOpeningMaterialStock(accessToken, entries) {
  await ensureHeaders(accessToken, 'Opening_Material_Stock', [
    'Date', 'Type', 'Material', 'Quantity', 'Unit', 'Notes'
  ])
  const rows = entries.map(e => [
    e.setupDate,
    'Opening',
    e.material,
    parseFloat(e.quantity) || 0,
    e.unit || (MATERIAL_UNITS[e.material] ?? ''),
    e.notes || 'Opening balance',
  ])
  await appendRows(accessToken, 'Opening_Material_Stock!A:A', rows)
}

export async function getOpeningMaterialMap(accessToken) {
  const raw = await readSheet(accessToken, 'Opening_Material_Stock!A:F')
  if (!raw?.length) return {}

  const map = {}
  raw.forEach(row => {
    if (!row || row[0] === 'Date' || row[0] === 'Material') return
    let material = null
    let qty = null
    row.forEach((cell, idx) => {
      const val = (cell || '').toString().trim()
      if (MATERIAL_IDS.includes(val)) {
        material = val
        const next = parseFloat(row[idx + 1])
        const prev = parseFloat(row[idx - 1])
        if (!isNaN(next) && next > 0) qty = next
        else if (!isNaN(prev) && prev > 0) qty = prev
      }
    })
    if (!material) {
      const colC = (row[2] || '').toString().trim()
      const colD = parseFloat(row[3])
      if (MATERIAL_IDS.includes(colC) && colD > 0) {
        material = colC
        qty = colD
      }
    }
    const unit = (row[4] || '').toString().trim()
    if (material && qty > 0) {
      const stockQty = normalizeToStockUnit(qty, unit, material)
      map[material] = (map[material] || 0) + stockQty
    }
  })
  return map
}

export async function loadMaterialPurchases(accessToken) {
  const rows = await loadVendors(accessToken)
  return rows.filter(r => {
    if (r.Type !== 'Invoice') return false
    const qty = parseFloat(r.Quantity)
    if (!qty || qty <= 0) return false
    const mat = normalizeVendorMaterial(r.Material)
    return mat && MATERIAL_IDS.includes(mat)
  })
}

export function aggregateProductionConsumption(productionRows) {
  const totals = MATERIAL_IDS.reduce((a, id) => ({ ...a, [id]: 0 }), {})
  productionRows.forEach(row => {
    const c = consumptionFromProductionRow(row)
    MATERIAL_IDS.forEach(id => {
      totals[id] += c[id] || 0
    })
  })
  MATERIAL_IDS.forEach(id => {
    totals[id] = Math.round(totals[id] * 1000) / 1000
  })
  return totals
}

// ─────────────────────────────────────────────
//  MATERIAL INVENTORY ENGINE  (computed — never stored)
//
//  Formula:  Current Stock =
//    Opening_Material_Stock
//    + SUM(Vendor_Ledger.Quantity where Type=Invoice)
//    - SUM(Production_Log consumption per material)
// ─────────────────────────────────────────────

export async function computeMaterialInventory(accessToken) {
  const [opening, purchases, production] = await Promise.all([
    getOpeningMaterialMap(accessToken).catch(() => ({})),
    loadMaterialPurchases(accessToken).catch(() => []),
    loadProduction(accessToken).catch(() => []),
  ])

  const consumed = aggregateProductionConsumption(production)
  const result = {}

  MATERIAL_IDS.forEach(material => {
    const openingQty = opening[material] || 0
    const purchased = purchases
      .filter(r => normalizeVendorMaterial(r.Material) === material)
      .reduce(
        (s, r) => s + normalizeToStockUnit(r.Quantity, r.Unit, material),
        0
      )
    const used = consumed[material] || 0
    const stock = Math.max(0, openingQty + purchased - used)

    result[material] = {
      opening:   roundMat(openingQty),
      purchased: roundMat(purchased),
      consumed:  roundMat(used),
      stock:     roundMat(stock),
    }
  })

  return result
}

function roundMat(n) {
  return Math.round(n * 1000) / 1000
}

export async function computeMaterialInventoryDebug(accessToken) {
  const [openingRaw, openingMap, purchases, production] = await Promise.all([
    readSheet(accessToken, 'Opening_Material_Stock!A:F').catch(() => []),
    getOpeningMaterialMap(accessToken).catch(() => ({})),
    loadMaterialPurchases(accessToken).catch(() => []),
    loadProduction(accessToken).catch(() => []),
  ])

  const consumed = aggregateProductionConsumption(production)

  return {
    openingRaw,
    openingMap,
    purchaseRows: purchases,
    productionRows: production.slice(-10),
    consumedMap: consumed,
    summary: {
      openingRawCount:      openingRaw.length,
      openingMapMaterials:  Object.keys(openingMap),
      purchaseCount:        purchases.length,
      productionCount:      production.length,
      greetKgReadable:      production.some(r => parseFloat(r.Greet_kg) > 0),
      powderKgReadable:     production.some(r => parseFloat(r.Powder_kg) > 0),
    },
  }
}