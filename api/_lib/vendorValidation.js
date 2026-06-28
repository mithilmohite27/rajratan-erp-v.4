function cleanText(value) {
  return String(value ?? '').trim()
}

function optionalNumber(value) {
  if (value === '' || value === null || value === undefined) return ''
  const number = Number(value)
  return Number.isFinite(number) ? number : NaN
}

function sameText(a, b) {
  return cleanText(a).toLowerCase() === cleanText(b).toLowerCase()
}

function sameNumber(a, b) {
  const left = Number(a) || 0
  const right = Number(b) || 0
  return Math.abs(left - right) < 0.01
}

export function validateVendorPayload(payload) {
  const source = payload?.entry && typeof payload.entry === 'object'
    ? payload.entry
    : payload

  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_VENDOR_ENTRY',
      message: 'Request body must include a vendor entry object.',
    }
  }

  const entry = {
    date: cleanText(source.date),
    vendorName: cleanText(source.vendorName),
    material: cleanText(source.material),
    type: cleanText(source.type),
    quantity: optionalNumber(source.quantity),
    unit: cleanText(source.unit),
    amount: Number(source.amount),
    notes: cleanText(source.notes),
    source: cleanText(source.source || 'Factory'),
  }

  if (!entry.date) return { ok: false, status: 400, code: 'INVALID_VENDOR_ENTRY', message: 'Date is required.' }
  if (!entry.vendorName) return { ok: false, status: 400, code: 'INVALID_VENDOR_ENTRY', message: 'VendorName is required.' }
  if (!['Invoice', 'Payment'].includes(entry.type)) return { ok: false, status: 400, code: 'INVALID_VENDOR_ENTRY', message: 'Type must be Invoice or Payment.' }
  if (!Number.isFinite(entry.amount) || entry.amount <= 0) return { ok: false, status: 400, code: 'INVALID_AMOUNT', message: 'Amount must be a positive number.' }

  if (entry.type === 'Invoice') {
    if (!entry.material) return { ok: false, status: 400, code: 'INVALID_VENDOR_ENTRY', message: 'Material is required for vendor invoice.' }
    if (entry.quantity !== '' && (!Number.isFinite(entry.quantity) || entry.quantity <= 0)) {
      return { ok: false, status: 400, code: 'INVALID_VENDOR_ENTRY', message: 'Quantity must be positive when provided.' }
    }
    if (entry.quantity !== '' && !entry.unit) return { ok: false, status: 400, code: 'INVALID_VENDOR_ENTRY', message: 'Unit is required when quantity is provided.' }
  }

  if (entry.type === 'Payment') {
    entry.material = ''
    entry.quantity = ''
    entry.unit = ''
    if (!['Factory', 'External'].includes(entry.source)) {
      return { ok: false, status: 400, code: 'INVALID_VENDOR_ENTRY', message: 'Payment source must be Factory or External.' }
    }
  }

  return {
    ok: true,
    entry,
    force: Boolean(source.force || payload?.force),
  }
}

export function findVendorDuplicate(rows, entry) {
  return rows.find(row =>
    sameText(row.Date, entry.date) &&
    sameText(row.VendorName, entry.vendorName) &&
    sameText(row.Material, entry.material) &&
    sameText(row.Type, entry.type) &&
    sameNumber(row.Quantity, entry.quantity) &&
    sameNumber(row.Amount, entry.amount)
  )
}

export function vendorPaymentCashEntry(entry) {
  return {
    date: entry.date,
    type: 'Out',
    source: entry.source || 'Factory',
    amount: entry.amount,
    description: `Vendor Payment — ${entry.vendorName}`,
    vendorName: entry.vendorName,
  }
}
