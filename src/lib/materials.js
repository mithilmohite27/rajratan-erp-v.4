// ─────────────────────────────────────────────
//  materials.js  —  Material metadata + helpers
//  Used by: MaterialStock.jsx, sheets.js
// ─────────────────────────────────────────────

/** Canonical material IDs — must match computeMaterialInventory keys in sheets.js */
export const MATERIAL_IDS = [
  'Cement', 'Greet', 'Powder', 'Chemical', 'Yellow', 'Red', 'Reti', 'Plastic'
]

/** Full metadata list used by MaterialStock.jsx UI */
export const MATERIAL_LIST = [
  {
    id:    'Cement',
    label: 'Cement',
    emoji: '🏗️',
    unit:  'bags',
    color: 'text-gray-700',
    bg:    'bg-gray-50 border-gray-200',
  },
  {
    id:    'Greet',
    label: 'Greet',
    emoji: '🪨',
    unit:  'ton',
    color: 'text-stone-600',
    bg:    'bg-stone-50 border-stone-200',
  },
  {
    id:    'Powder',
    label: 'Powder',
    emoji: '⚪',
    unit:  'ton',
    color: 'text-slate-600',
    bg:    'bg-slate-50 border-slate-200',
  },
  {
    id:    'Chemical',
    label: 'Chemical',
    emoji: '🧪',
    unit:  'L',
    color: 'text-blue-600',
    bg:    'bg-blue-50 border-blue-200',
  },
  {
    id:    'Yellow',
    label: 'Yellow Color',
    emoji: '🟡',
    unit:  'kg',
    color: 'text-yellow-600',
    bg:    'bg-yellow-50 border-yellow-200',
  },
  {
    id:    'Red',
    label: 'Red Color',
    emoji: '🔴',
    unit:  'kg',
    color: 'text-red-600',
    bg:    'bg-red-50 border-red-200',
  },
  {
    id:    'Reti',
    label: 'Reti',
    emoji: '🟫',
    unit:  'ghamela',
    color: 'text-orange-700',
    bg:    'bg-orange-50 border-orange-200',
  },
  {
    id:    'Plastic',
    label: 'Plastic',
    emoji: '🧴',
    unit:  'ml',
    color: 'text-teal-600',
    bg:    'bg-teal-50 border-teal-200',
  },
]

/** Human-readable unit labels */
export function unitLabel(unit) {
  const labels = {
    bags:    'bags',
    ton:     'ton',
    L:       'L',
    kg:      'kg',
    ghamela: 'ghamela',
    ml:      'ml',
  }
  return labels[unit] ?? unit ?? ''
}

/** Format a quantity value based on its unit — smart decimal places */
export function formatMaterialQty(value, unit) {
  const n = parseFloat(value) || 0
  switch (unit) {
    case 'bags':    return n % 1 === 0 ? n.toLocaleString('en-IN') : n.toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
    case 'ton':     return n.toLocaleString('en-IN', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
    case 'L':       return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    case 'kg':      return n.toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
    case 'ghamela': return Math.round(n).toLocaleString('en-IN')
    case 'ml':      return Math.round(n).toLocaleString('en-IN')
    default:        return n.toLocaleString('en-IN', { maximumFractionDigits: 2 })
  }
}

/** Normalize vendor material name string → canonical MATERIAL_IDS key */
export function normalizeVendorMaterial(raw) {
  if (!raw) return null
  const s = raw.toString().trim().toLowerCase()
  if (s.includes('cement'))   return 'Cement'
  if (s.includes('greet'))    return 'Greet'
  if (s.includes('powder'))   return 'Powder'
  if (s.includes('chemical')) return 'Chemical'
  if (s.includes('yellow'))   return 'Yellow'
  if (s.includes('red'))      return 'Red'
  if (s.includes('reti'))     return 'Reti'
  if (s.includes('plastic'))  return 'Plastic'
  return null
}

/** Normalize a purchase quantity to the stock unit (e.g. vendor enters kg, stock is in ton) */
export function normalizeToStockUnit(qty, unit, material) {
  const q = parseFloat(qty) || 0
  if ((material === 'Greet' || material === 'Powder') && unit && unit.toLowerCase() === 'kg') {
    return q / 1000
  }
  return q
}

/** Compute per-material consumption from one Production_Log row */
export function consumptionFromProductionRow(row) {
  return {
    Cement:   (parseFloat(row.MortarCement) || 0) + (parseFloat(row.ColorCement) || 0),
    Greet:    parseFloat(row.Greet_kg)   || 0,
    Powder:   parseFloat(row.Powder_kg)  || 0,
    Chemical: parseFloat(row.Chemical_L) || 0,
    Yellow:   parseFloat(row.YellowKG)   || 0,
    Red:      parseFloat(row.RedKG)      || 0,
    Reti:     parseFloat(row.Reti)       || 0,
    Plastic:  parseFloat(row.Plastic_ml) || 0,
  }
}

/** Unit metadata for reference */
export const MATERIAL_UNITS = {
  Cement:   'bags',
  Greet:    'ton',
  Powder:   'ton',
  Chemical: 'L',
  Yellow:   'kg',
  Red:      'kg',
  Reti:     'ghamela',
  Plastic:  'ml',
}