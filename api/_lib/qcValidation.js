const COLORS = new Set(['Red', 'Yellow', 'Black', 'White', 'All Colors', 'All'])

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

function sameNumber(a, b, tolerance = 0.001) {
  return Math.abs(numberValue(a) - numberValue(b)) <= tolerance
}

function sameText(a, b) {
  return cleanKey(a) === cleanKey(b)
}

function fail(message, code = 'INVALID_QC_ENTRY') {
  return { ok: false, status: 400, code, message }
}

export function validateQCPayload(payload = {}) {
  const raw = payload.entry || {}
  const entry = {
    date: cleanText(raw.date),
    color: cleanText(raw.color) || 'All Colors',
    brokenBlocks: Math.trunc(numberValue(raw.brokenBlocks)),
    costPerBlock: numberValue(raw.costPerBlock),
    totalLoss: numberValue(raw.totalLoss),
    notes: cleanText(raw.notes),
  }

  if (!entry.date) return fail('QC date is required.')
  if (!COLORS.has(entry.color)) return fail('QC color is invalid.')
  if (entry.brokenBlocks <= 0) return fail('Broken blocks must be greater than zero.', 'INVALID_AMOUNT')
  if (entry.costPerBlock < 0 || entry.totalLoss < 0) return fail('QC cost values cannot be negative.', 'INVALID_AMOUNT')

  return { ok: true, entry, force: Boolean(payload.force || raw.force) }
}

export function findQCDuplicate(rows = [], entry) {
  return rows.some(row =>
    cleanText(row.Date) === entry.date &&
    sameText(row.Color, entry.color) &&
    sameNumber(row.BrokenBlocks, entry.brokenBlocks) &&
    sameNumber(row.CostPerBlock, entry.costPerBlock) &&
    sameNumber(row.TotalLoss, entry.totalLoss)
  )
}
