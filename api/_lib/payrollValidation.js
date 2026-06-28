function cleanText(value) {
  return String(value ?? '').trim()
}

function numberOrZero(value) {
  if (value === '' || value === null || value === undefined) return 0
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

export function validatePayrollPayload(payload) {
  const source = payload?.entry && typeof payload.entry === 'object'
    ? payload.entry
    : payload

  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_PAYROLL_ENTRY',
      message: 'Request body must include a payroll entry object.',
    }
  }

  const entry = {
    date: cleanText(source.date),
    workerName: cleanText(source.workerName),
    type: cleanText(source.type),
    blocks: numberOrZero(source.blocks),
    wageRate: numberOrZero(source.wageRate),
    amount: Number(source.amount),
    notes: cleanText(source.notes),
    source: cleanText(source.source || 'Factory'),
  }

  if (!entry.date) return { ok: false, status: 400, code: 'INVALID_PAYROLL_ENTRY', message: 'Date is required.' }
  if (!entry.workerName) return { ok: false, status: 400, code: 'INVALID_PAYROLL_ENTRY', message: 'WorkerName is required.' }
  if (!entry.type) return { ok: false, status: 400, code: 'INVALID_PAYROLL_ENTRY', message: 'Type is required.' }
  if (!Number.isFinite(entry.amount) || entry.amount <= 0) return { ok: false, status: 400, code: 'INVALID_AMOUNT', message: 'Amount must be a positive number.' }
  if (!Number.isFinite(entry.blocks) || entry.blocks < 0) return { ok: false, status: 400, code: 'INVALID_PAYROLL_ENTRY', message: 'Blocks must be zero or positive.' }
  if (!Number.isFinite(entry.wageRate) || entry.wageRate < 0) return { ok: false, status: 400, code: 'INVALID_PAYROLL_ENTRY', message: 'WageRate must be zero or positive.' }
  if (!['Factory', 'External'].includes(entry.source)) return { ok: false, status: 400, code: 'INVALID_PAYROLL_ENTRY', message: 'Source must be Factory or External.' }

  return {
    ok: true,
    entry,
    force: Boolean(source.force || payload?.force),
  }
}

export function findPayrollDuplicate(rows, entry) {
  return rows.find(row =>
    sameText(row.Date, entry.date) &&
    sameText(row.WorkerName, entry.workerName) &&
    sameText(row.Type, entry.type) &&
    sameNumber(row.Blocks, entry.blocks) &&
    sameNumber(row.WageRate, entry.wageRate) &&
    sameNumber(row.Amount, entry.amount)
  )
}

export function payrollCashEntry(entry) {
  return {
    date: entry.date,
    type: 'Out',
    source: entry.source || 'Factory',
    amount: entry.amount,
    description: `Labour Advance — ${entry.workerName}`,
    vendorName: '',
  }
}
