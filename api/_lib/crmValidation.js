const COLORS = new Set(['Red', 'Yellow', 'Black', 'White'])
const ACTIONS = new Set(['create_order', 'dispatch'])

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

function fail(message, code = 'INVALID_CRM_ENTRY') {
  return { ok: false, status: 400, code, message }
}

function normalizeOrder(entry) {
  return {
    date: cleanText(entry.date),
    clientName: cleanText(entry.clientName),
    location: cleanText(entry.location),
    orderBrass: numberValue(entry.orderBrass),
    orderBlocks: Math.trunc(numberValue(entry.orderBlocks)),
    rate: numberValue(entry.rate),
    dispatchBrass: 0,
    dispatchBlocks: 0,
    color: cleanText(entry.color),
    status: 'Order',
    transport: '',
    transporter: '',
    freightCharge: 0,
    notes: cleanText(entry.notes),
  }
}

function normalizeDispatch(entry) {
  return {
    date: cleanText(entry.date),
    clientName: cleanText(entry.clientName),
    location: '',
    orderBrass: 0,
    orderBlocks: 0,
    rate: 0,
    dispatchBrass: numberValue(entry.dispatchBrass),
    dispatchBlocks: Math.trunc(numberValue(entry.dispatchBlocks)),
    color: cleanText(entry.color),
    status: 'Dispatched',
    transport: cleanText(entry.transport),
    transporter: cleanText(entry.transporter),
    freightCharge: numberValue(entry.freightCharge),
    notes: cleanText(entry.notes),
  }
}

export function validateCRMPayload(payload = {}) {
  const action = cleanText(payload.action)
  const rawEntries = Array.isArray(payload.entries) ? payload.entries : payload.entry ? [payload.entry] : []

  if (!ACTIONS.has(action)) return fail('CRM action is invalid.')
  if (rawEntries.length === 0) return fail('At least one CRM entry is required.')

  const entries = rawEntries.map(entry => action === 'create_order' ? normalizeOrder(entry) : normalizeDispatch(entry))

  for (const entry of entries) {
    if (!entry.date) return fail('CRM date is required.')
    if (!entry.clientName) return fail('CRM client name is required.')
    if (!COLORS.has(entry.color)) return fail('CRM color is invalid.')

    if (action === 'create_order') {
      if (entry.orderBrass <= 0 || entry.orderBlocks <= 0) {
        return fail('CRM order quantity must be greater than zero.', 'INVALID_AMOUNT')
      }
      if (entry.rate < 0) return fail('CRM rate cannot be negative.', 'INVALID_AMOUNT')
    }

    if (action === 'dispatch' && (entry.dispatchBrass <= 0 || entry.dispatchBlocks <= 0)) {
      return fail('CRM dispatch quantity must be greater than zero.', 'INVALID_AMOUNT')
    }
  }

  return { ok: true, action, entries, force: Boolean(payload.force) }
}

export function findCRMDuplicate(rows = [], action, entries) {
  if (action === 'create_order') {
    return entries.some(candidate =>
      rows.some(row =>
        cleanText(row.Date) === candidate.date &&
        sameText(row.ClientName, candidate.clientName) &&
        sameText(row.Location, candidate.location) &&
        sameText(row.Color, candidate.color) &&
        sameNumber(row.OrderBrass, candidate.orderBrass) &&
        sameNumber(row.OrderBlocks, candidate.orderBlocks) &&
        sameNumber(row.Rate, candidate.rate) &&
        sameText(cleanText(row.Status) || 'Order', 'Order')
      )
    )
  }

  return entries.some(candidate =>
    rows.some(row =>
      cleanText(row.Date) === candidate.date &&
      sameText(row.ClientName, candidate.clientName) &&
      sameText(row.Color, candidate.color) &&
      sameText(cleanText(row.Status) || '', 'Dispatched') &&
      sameNumber(row.DispatchBrass, candidate.dispatchBrass) &&
      sameNumber(row.DispatchBlocks, candidate.dispatchBlocks)
    )
  )
}
