// ─────────────────────────────────────────────
//  materials.js — Raw material stock definitions
//  Maps Production_Log columns → stock materials
// ─────────────────────────────────────────────

/** Canonical stock units — single source of truth for the whole app */
export const MATERIAL_UNITS = {
  Cement: 'bags',
  Greet: 'ton',
  Powder: 'ton',
  Chemical: 'L',
  Color: 'kg',
  Plastic: 'L',
  Reti: 'ghamela',
}

export const MATERIAL_LIST = [
  { id: 'Cement',   label: 'Cement',   unit: MATERIAL_UNITS.Cement,   emoji: '🏗️', color: 'text-gray-700',  bg: 'bg-gray-50 border-gray-200' },
  { id: 'Greet',    label: 'Greet',    unit: MATERIAL_UNITS.Greet,    emoji: '🪨', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200' },
  { id: 'Powder',   label: 'Powder',   unit: MATERIAL_UNITS.Powder,   emoji: '⚪', color: 'text-slate-600', bg: 'bg-slate-50 border-slate-200' },
  { id: 'Chemical', label: 'Chemical', unit: MATERIAL_UNITS.Chemical, emoji: '🧪', color: 'text-purple-600',bg: 'bg-purple-50 border-purple-200' },
  { id: 'Color',    label: 'Color',    unit: MATERIAL_UNITS.Color,    emoji: '🎨', color: 'text-pink-600',  bg: 'bg-pink-50 border-pink-200' },
  { id: 'Reti',     label: 'Reti',     unit: MATERIAL_UNITS.Reti,     emoji: '🏖️', color: 'text-yellow-700',bg: 'bg-yellow-50 border-yellow-200' },
  { id: 'Plastic',  label: 'Plastic',  unit: MATERIAL_UNITS.Plastic,  emoji: '💧', color: 'text-blue-600',  bg: 'bg-blue-50 border-blue-200' },
]

export const MATERIAL_IDS = MATERIAL_LIST.map(m => m.id)

export function getMaterialMeta(materialId) {
  return MATERIAL_LIST.find(m => m.id === materialId) || null
}

/** Human-readable unit for UI (Stock, Vendors, Production) */
export function unitLabel(unit) {
  const labels = {
    bags: 'bags',
    ton: 'ton',
    kg: 'kg',
    L: 'litres',
    ghamela: 'ghamela',
    litres: 'litres',
    liter: 'litres',
    litre: 'litres',
  }
  return labels[unit] || unit || ''
}

/** Vendor invoice material names → stock material id */
export function normalizeVendorMaterial(name) {
  const n = (name || '').trim()
  if (MATERIAL_IDS.includes(n)) return n
  if (n.toLowerCase() === 'cement') return 'Cement'
  return n === 'Other' ? null : null
}

/** Read first matching field from a production row (handles header renames in Sheet) */
function pick(row, keys) {
  for (const k of keys) {
    if (row[k] != null && row[k] !== '') return row[k]
  }
  return 0
}

/** Production_Log stores greet/powder in kg (large numbers). Values under 200 are already tonnes. */
function bulkKgToTon(v) {
  const n = parseFloat(v) || 0
  if (n <= 0) return 0
  return n > 200 ? n / 1000 : n
}

/** Plastic: column is usually ml; small values may already be litres */
function plasticToLitres(v) {
  const n = parseFloat(v) || 0
  if (n <= 0) return 0
  return n > 500 ? n / 1000 : n
}

/** Consumption qty from one Production_Log row (stock units: ton, bags, L, kg) */
export function consumptionFromProductionRow(row) {
  const mortar = parseFloat(pick(row, ['MortarCement', 'Mortar Cement'])) || 0
  const colorCement = parseFloat(pick(row, ['ColorCement', 'Color Cement'])) || 0
  const cement = parseFloat(pick(row, ['TotalCement', 'Total Cement'])) || mortar + colorCement
  const colorKg =
    (parseFloat(pick(row, ['YellowFinal', 'Yellow Final'])) || 0) +
    (parseFloat(pick(row, ['RedFinal', 'Red Final'])) || 0) ||
    (parseFloat(pick(row, ['YellowKG', 'Yellow KG', 'YellowKg'])) || 0) +
    (parseFloat(pick(row, ['RedKG', 'Red KG', 'RedKg'])) || 0)

  return {
    Cement:   round3(cement),
    Greet:    round3(bulkKgToTon(pick(row, ['Greet_kg', 'Greet kg', 'Greet', 'GreetKG']))),
    Powder:   round3(bulkKgToTon(pick(row, ['Powder_kg', 'Powder kg', 'Powder', 'PowderKG']))),
    Chemical: round3(parseFloat(pick(row, ['Chemical_L', 'Chemical L', 'Chemical'])) || 0),
    Color:    round3(colorKg),
    Reti:     round3(parseFloat(pick(row, ['Reti'])) || 0),
    Plastic:  round3(plasticToLitres(pick(row, ['Plastic_ml', 'Plastic ml', 'Plastic']))),
  }
}

function round3(n) {
  return Math.round(n * 1000) / 1000
}

const TON_MATERIALS = ['Greet', 'Powder']
const LITER_MATERIALS = ['Chemical', 'Plastic']

/** Convert vendor/opening qty to stock unit */
export function normalizeToStockUnit(qty, unit, materialId) {
  const q = parseFloat(qty) || 0
  const u = (unit || '').toLowerCase().trim()

  if (TON_MATERIALS.includes(materialId)) {
    const uTon = u || MATERIAL_UNITS[materialId] || 'ton'
    if (uTon === 'kg' || uTon === 'kgs' || uTon === 'kilogram') return q / 1000
    return q
  }

  if (LITER_MATERIALS.includes(materialId)) {
    const uL = u || 'l' // stock unit L
    if (uL === 'ml' || uL === 'millilitre' || uL === 'milliliter') return q / 1000
    return q // L, litre, liter, l
  }

  return q
}

export function formatMaterialQty(n, unit) {
  const v = parseFloat(n) || 0
  const decimals =
    unit === 'bags' || unit === 'ghamela' ? 1 : unit === 'ton' ? 2 : unit === 'L' ? 1 : 2
  return v.toLocaleString('en-IN', { maximumFractionDigits: decimals, minimumFractionDigits: 0 })
}
