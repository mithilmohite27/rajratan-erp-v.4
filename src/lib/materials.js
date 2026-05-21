// ─────────────────────────────────────────────
//  materials.js — Raw material stock definitions
//  Maps Production_Log columns → stock materials
// ─────────────────────────────────────────────

export const MATERIAL_LIST = [
  { id: 'Cement',   label: 'Cement',   unit: 'bags',    emoji: '🏗️', color: 'text-gray-700',  bg: 'bg-gray-50 border-gray-200' },
  { id: 'Greet',    label: 'Greet',    unit: 'kg',      emoji: '🪨', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200' },
  { id: 'Powder',   label: 'Powder',   unit: 'kg',      emoji: '⚪', color: 'text-slate-600', bg: 'bg-slate-50 border-slate-200' },
  { id: 'Chemical', label: 'Chemical', unit: 'L',       emoji: '🧪', color: 'text-purple-600',bg: 'bg-purple-50 border-purple-200' },
  { id: 'Color',    label: 'Color',    unit: 'kg',      emoji: '🎨', color: 'text-pink-600',  bg: 'bg-pink-50 border-pink-200' },
  { id: 'Reti',     label: 'Reti',     unit: 'ghamela', emoji: '🏖️', color: 'text-yellow-700',bg: 'bg-yellow-50 border-yellow-200' },
  { id: 'Plastic',  label: 'Plastic',  unit: 'ml',      emoji: '💧', color: 'text-blue-600',  bg: 'bg-blue-50 border-blue-200' },
]

export const MATERIAL_IDS = MATERIAL_LIST.map(m => m.id)

/** Vendor invoice material names → stock material id */
export function normalizeVendorMaterial(name) {
  const n = (name || '').trim()
  if (MATERIAL_IDS.includes(n)) return n
  if (n.toLowerCase() === 'cement') return 'Cement'
  return n === 'Other' ? null : null
}

/** Consumption qty from one Production_Log row */
export function consumptionFromProductionRow(row) {
  const n = (v) => parseFloat(v) || 0
  const cement = n(row.TotalCement) || (n(row.MortarCement) + n(row.ColorCement))
  const colorKg = (n(row.YellowFinal) + n(row.RedFinal)) || (n(row.YellowKG) + n(row.RedKG))
  return {
    Cement:   round3(cement),
    Greet:    round3(n(row.Greet_kg)),
    Powder:   round3(n(row.Powder_kg)),
    Chemical: round3(n(row.Chemical_L)),
    Color:    round3(colorKg),
    Reti:     round3(n(row.Reti)),
    Plastic:  round3(n(row.Plastic_ml)),
  }
}

function round3(n) {
  return Math.round(n * 1000) / 1000
}

export function formatMaterialQty(n, unit) {
  const v = parseFloat(n) || 0
  const decimals = unit === 'bags' || unit === 'ghamela' ? 1 : unit === 'ml' ? 0 : 2
  return v.toLocaleString('en-IN', { maximumFractionDigits: decimals, minimumFractionDigits: 0 })
}
