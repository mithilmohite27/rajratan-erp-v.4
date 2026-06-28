function cleanText(value) {
  return String(value ?? '').trim()
}

function numberValue(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : NaN
}

function sameText(a, b) {
  return cleanText(a).toLowerCase() === cleanText(b).toLowerCase()
}

function sameNumber(a, b, tolerance = 0.001) {
  const left = Number(a) || 0
  const right = Number(b) || 0
  return Math.abs(left - right) <= tolerance
}

export function validateMaterialUsagePayload(payload = {}) {
  const source = payload.entry && typeof payload.entry === 'object' ? payload.entry : payload
  const entry = {
    date: cleanText(source.date),
    material: cleanText(source.material),
    quantity: numberValue(source.quantity),
    unit: cleanText(source.unit),
    reason: cleanText(source.reason),
    notes: cleanText(source.notes),
  }

  if (!entry.date) return { ok: false, status: 400, code: 'INVALID_MATERIAL_USAGE', message: 'Date is required.' }
  if (!entry.material) return { ok: false, status: 400, code: 'INVALID_MATERIAL_USAGE', message: 'Material is required.' }
  if (!Number.isFinite(entry.quantity) || entry.quantity <= 0) {
    return { ok: false, status: 400, code: 'INVALID_AMOUNT', message: 'Quantity must be a positive number.' }
  }
  if (!entry.unit) return { ok: false, status: 400, code: 'INVALID_MATERIAL_USAGE', message: 'Unit is required.' }
  if (!entry.reason) return { ok: false, status: 400, code: 'INVALID_MATERIAL_USAGE', message: 'Reason is required.' }

  return { ok: true, entry, force: Boolean(source.force || payload.force) }
}

export function findMaterialUsageDuplicate(rows = [], entry) {
  return rows.find(row =>
    cleanText(row.Date) === entry.date &&
    sameText(row.Material, entry.material) &&
    sameNumber(row.Quantity, entry.quantity) &&
    sameText(row.Unit, entry.unit) &&
    sameText(row.Reason, entry.reason)
  )
}
