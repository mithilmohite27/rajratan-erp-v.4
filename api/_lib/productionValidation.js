const COLORS = new Set(['Red', 'Yellow', 'Black', 'White'])

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

function fail(message, code = 'INVALID_PRODUCTION_ENTRY') {
  return { ok: false, status: 400, code, message }
}

export function validateProductionPayload(payload = {}) {
  const entryPayload = payload.entry || {}
  const variantPayload = Array.isArray(payload.variants) ? payload.variants : []
  const date = cleanText(entryPayload.date)

  if (!date) return fail('Production date is required.')
  if (numberValue(entryPayload.blocks) <= 0) return fail('Production blocks must be greater than zero.', 'INVALID_AMOUNT')
  if (variantPayload.length === 0) return fail('At least one production color variant is required.')

  const numericFields = [
    'blocks',
    'mortarCement',
    'colorCement',
    'totalCement',
    'greet',
    'powder',
    'chemical',
    'yellowKG',
    'redKG',
    'blackKG',
    'whiteKG',
    'yellowFinal',
    'redFinal',
    'blackFinal',
    'whiteFinal',
    'reti',
    'plastic',
    'misc',
    'cementCost',
    'greetCost',
    'powderCost',
    'chemicalCost',
    'colorCost',
    'plasticCost',
    'retiCost',
    'labourCost',
    'totalDailyCost',
  ]

  const entry = { date }
  numericFields.forEach(field => {
    entry[field] = numberValue(entryPayload[field])
  })

  if (numericFields.some(field => entry[field] < 0)) {
    return fail('Production numeric values cannot be negative.', 'INVALID_AMOUNT')
  }

  const variants = variantPayload.map(variant => ({
    date: cleanText(variant.date) || date,
    color: cleanText(variant.color),
    blocks: Math.trunc(numberValue(variant.blocks)),
    brass: numberValue(variant.brass),
    batchId: cleanText(variant.batchId) || date,
    notes: cleanText(variant.notes),
  }))

  for (const variant of variants) {
    if (variant.date !== date) return fail('Production variant date must match production date.')
    if (!COLORS.has(variant.color)) return fail('Production variant color is invalid.')
    if (variant.blocks <= 0) return fail('Production variant blocks must be greater than zero.', 'INVALID_AMOUNT')
    if (variant.brass <= 0) return fail('Production variant brass must be greater than zero.', 'INVALID_AMOUNT')
  }

  return { ok: true, entry, variants, force: Boolean(payload.force || entryPayload.force) }
}

export function findProductionDuplicate({ productionRows = [], variantRows = [] }, entry, variants) {
  const productionDuplicate = productionRows.some(row =>
    cleanText(row.Date) === entry.date &&
    sameNumber(row.Blocks, entry.blocks) &&
    sameNumber(row.MortarCement, entry.mortarCement) &&
    sameNumber(row.ColorCement, entry.colorCement)
  )

  const variantDuplicate = variants.some(candidate =>
    variantRows.some(row =>
      cleanText(row.Date) === candidate.date &&
      sameText(row.Color, candidate.color) &&
      (sameNumber(row.Blocks, candidate.blocks) || sameNumber(row.Brass, candidate.brass)) &&
      (!cleanText(row.BatchID) || sameText(row.BatchID, candidate.batchId))
    )
  )

  return productionDuplicate || variantDuplicate
}
