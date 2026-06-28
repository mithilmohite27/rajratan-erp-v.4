const TYPES = ['In', 'Out']
const SOURCES = ['Factory', 'External']

function cleanText(value) {
  return String(value ?? '').trim()
}

function sameText(a, b) {
  return cleanText(a).toLowerCase() === cleanText(b).toLowerCase()
}

function sameAmount(a, b) {
  return Math.abs((Number(a) || 0) - (Number(b) || 0)) < 0.01
}

export function validateCashFlowPayload(payload) {
  const source = payload?.entry && typeof payload.entry === 'object'
    ? payload.entry
    : payload

  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_CASH_ENTRY',
      message: 'Request body must include a cash entry object.',
    }
  }

  const entry = {
    date: cleanText(source.date),
    type: cleanText(source.type),
    source: cleanText(source.source),
    amount: Number(source.amount),
    description: cleanText(source.description),
    vendorName: cleanText(source.vendorName),
  }

  if (!entry.date) {
    return { ok: false, status: 400, code: 'INVALID_CASH_ENTRY', message: 'Date is required.' }
  }

  if (!TYPES.includes(entry.type)) {
    return { ok: false, status: 400, code: 'INVALID_CASH_ENTRY', message: 'Type must be In or Out.' }
  }

  if (!SOURCES.includes(entry.source)) {
    return { ok: false, status: 400, code: 'INVALID_CASH_ENTRY', message: 'Source must be Factory or External.' }
  }

  if (!Number.isFinite(entry.amount) || entry.amount <= 0) {
    return { ok: false, status: 400, code: 'INVALID_AMOUNT', message: 'Amount must be a positive number.' }
  }

  return {
    ok: true,
    entry,
    force: Boolean(source.force || payload?.force),
  }
}

export function findCashFlowDuplicate(rows, entry) {
  return rows.find(row =>
    sameText(row.Date, entry.date) &&
    sameText(row.Type, entry.type) &&
    sameText(row.Source, entry.source) &&
    sameAmount(row.Amount, entry.amount) &&
    sameText(row.Description, entry.description) &&
    sameText(row.VendorName, entry.vendorName)
  )
}
