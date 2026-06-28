const SETUP_ACTIONS = new Set([
  'seed_headers',
  'opening_stock',
  'opening_material_stock',
  'production_csv_import',
  'crm_csv_import',
])

const COLORS = new Set(['Red', 'Yellow', 'Black', 'White'])
const MATERIAL_UNITS = {
  Cement: 'bags',
  Greet: 'ton',
  Powder: 'ton',
  Chemical: 'L',
  Yellow: 'kg',
  Red: 'kg',
  Black: 'kg',
  Reti: 'ghamela',
  Plastic: 'ml',
}

function cleanText(value) {
  return (value ?? '').toString().trim()
}

function cleanKey(value) {
  return cleanText(value).toLowerCase()
}

function numberValue(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function sameText(a, b) {
  return cleanKey(a) === cleanKey(b)
}

function sameNumber(a, b, tolerance = 0.001) {
  return Math.abs(numberValue(a) - numberValue(b)) <= tolerance
}

function fail(message, code = 'INVALID_SETUP_ACTION', status = 400, details) {
  return { ok: false, status, code, message, details }
}

function requireHighRisk(payload) {
  if (!payload.confirmHighRisk) {
    return fail('High-risk setup confirmation is required.', 'MISSING_HIGH_RISK_CONFIRMATION')
  }
  return null
}

function normalizeOpeningStockRow(row) {
  const blocks = Math.trunc(numberValue(row.blocks))
  const brass = row.brass !== undefined && row.brass !== '' ? numberValue(row.brass) : Number((blocks / 285).toFixed(2))

  return {
    date: cleanText(row.date || row.setupDate),
    type: cleanText(row.type) || 'Opening',
    color: cleanText(row.color),
    blocks,
    brass,
    notes: cleanText(row.notes) || 'Opening balance',
  }
}

function normalizeOpeningMaterialRow(row) {
  const material = cleanText(row.material)

  return {
    date: cleanText(row.date || row.setupDate),
    type: cleanText(row.type) || 'Opening',
    material,
    quantity: numberValue(row.quantity),
    unit: cleanText(row.unit) || MATERIAL_UNITS[material] || '',
    notes: cleanText(row.notes) || 'Opening balance',
  }
}

function normalizeProductionImportRow(row) {
  const date = cleanText(row.date)
  const color = cleanText(row.color) || 'Red'
  const blocks = Math.trunc(numberValue(row.blocks))

  return {
    date,
    color,
    blocks,
    brass: Number((blocks / 285).toFixed(2)),
    batchId: date,
    notes: cleanText(row.notes) || 'Bulk Import',
  }
}

function normalizeCRMImportRow(row) {
  const orderBrass = numberValue(row.orderBrass)
  const orderBlocks = Math.round(orderBrass * 285)

  return {
    date: cleanText(row.date),
    clientName: cleanText(row.clientName || row.clientname || row.client),
    location: cleanText(row.location),
    orderBrass,
    orderBlocks,
    rate: numberValue(row.rate),
    dispatchBrass: orderBrass,
    dispatchBlocks: orderBlocks,
    color: cleanText(row.color),
    status: 'Dispatched',
    transport: '',
    transporter: '',
    freightCharge: 0,
    notes: cleanText(row.notes) || 'Bulk Import',
  }
}

export function validateSetupPayload(payload = {}) {
  const action = cleanText(payload.action)
  if (!SETUP_ACTIONS.has(action)) return fail('Invalid setup action.')

  const highRiskError = requireHighRisk(payload)
  if (highRiskError) return highRiskError

  if (action === 'seed_headers') {
    return { ok: true, action, force: Boolean(payload.force), confirmHighRisk: true }
  }

  const rows = Array.isArray(payload.rows)
    ? payload.rows
    : Array.isArray(payload.entries)
      ? payload.entries
      : payload.entry
        ? [payload.entry]
        : []

  if (!rows.length) return fail('At least one setup row is required.', 'INVALID_SETUP_ROW')

  if (action === 'opening_stock') {
    const entries = rows.map(normalizeOpeningStockRow)
    for (const entry of entries) {
      if (!entry.date) return fail('Opening stock date is required.', 'INVALID_OPENING_STOCK_ROW')
      if (!entry.type) return fail('Opening stock type is required.', 'INVALID_OPENING_STOCK_ROW')
      if (!COLORS.has(entry.color)) return fail('Opening stock color is invalid.', 'INVALID_OPENING_STOCK_ROW')
      if (entry.blocks <= 0 && entry.brass <= 0) return fail('Opening stock blocks or brass must be positive.', 'INVALID_AMOUNT')
    }
    return { ok: true, action, entries, force: Boolean(payload.force), confirmHighRisk: true }
  }

  if (action === 'opening_material_stock') {
    const entries = rows.map(normalizeOpeningMaterialRow)
    for (const entry of entries) {
      if (!entry.date) return fail('Opening material date is required.', 'INVALID_OPENING_MATERIAL_ROW')
      if (!entry.type) return fail('Opening material type is required.', 'INVALID_OPENING_MATERIAL_ROW')
      if (!entry.material) return fail('Opening material name is required.', 'INVALID_OPENING_MATERIAL_ROW')
      if (entry.quantity <= 0) return fail('Opening material quantity must be positive.', 'INVALID_AMOUNT')
      if (!entry.unit) return fail('Opening material unit is required.', 'INVALID_OPENING_MATERIAL_ROW')
    }
    return { ok: true, action, entries, force: Boolean(payload.force), confirmHighRisk: true }
  }

  if (action === 'production_csv_import') {
    const mapped = rows.map(normalizeProductionImportRow)
    const validRows = []
    const invalidRows = []

    mapped.forEach((entry, index) => {
      if (!entry.date || !COLORS.has(entry.color) || entry.blocks <= 0) {
        invalidRows.push({ index: index + 1, row: rows[index], reason: 'Date, valid color, and positive blocks are required.' })
      } else {
        validRows.push(entry)
      }
    })

    return { ok: true, action, entries: validRows, invalidRows, force: Boolean(payload.force), totalRows: rows.length, confirmHighRisk: true }
  }

  const mapped = rows.map(normalizeCRMImportRow)
  const validRows = []
  const invalidRows = []

  mapped.forEach((entry, index) => {
    if (!entry.date || !entry.clientName || entry.orderBrass <= 0 || !COLORS.has(entry.color)) {
      invalidRows.push({ index: index + 1, row: rows[index], reason: 'Date, client name, positive order brass, and valid color are required.' })
    } else {
      validRows.push(entry)
    }
  })

  return { ok: true, action, entries: validRows, invalidRows, force: Boolean(payload.force), totalRows: rows.length, confirmHighRisk: true }
}

export function countOpeningStockDuplicates(rows = [], entries = []) {
  return entries.reduce((sum, candidate) => (
    sum + rows.filter(row =>
      cleanText(row.Date) === candidate.date &&
      sameText(row.Type, candidate.type) &&
      sameText(row.Color, candidate.color) &&
      sameNumber(row.Blocks, candidate.blocks) &&
      sameNumber(row.Brass, candidate.brass)
    ).length
  ), 0)
}

export function countOpeningMaterialDuplicates(rows = [], entries = []) {
  return entries.reduce((sum, candidate) => (
    sum + rows.filter(row =>
      cleanText(row.Date) === candidate.date &&
      sameText(row.Type, candidate.type) &&
      sameText(row.Material, candidate.material) &&
      sameNumber(row.Quantity, candidate.quantity) &&
      sameText(row.Unit, candidate.unit)
    ).length
  ), 0)
}

export function countProductionImportDuplicates(rows = [], entries = []) {
  return entries.reduce((sum, candidate) => (
    sum + rows.filter(row =>
      cleanText(row.Date) === candidate.date &&
      sameText(row.Color, candidate.color) &&
      sameNumber(row.Blocks, candidate.blocks)
    ).length
  ), 0)
}

export function countCRMImportDuplicates(rows = [], entries = []) {
  return entries.reduce((sum, candidate) => (
    sum + rows.filter(row =>
      cleanText(row.Date) === candidate.date &&
      sameText(row.ClientName, candidate.clientName) &&
      sameText(row.Location, candidate.location) &&
      sameNumber(row.OrderBrass, candidate.orderBrass) &&
      sameNumber(row.Rate, candidate.rate) &&
      sameText(row.Color, candidate.color)
    ).length
  ), 0)
}
