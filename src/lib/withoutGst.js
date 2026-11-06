// Shared by the browser and API. Money is integer paise; quantities have 4 decimals.
export const JOURNAL_TAB = 'Without_GST_Journal'
export const JOURNAL_RANGE = `${JOURNAL_TAB}!A:I`
export const JOURNAL_HEADERS = ['EventID', 'BillID', 'ExpectedVersion', 'Action', 'Actor', 'Timestamp', 'PartIndex', 'PartCount', 'PayloadChunk']
export const newId = () => globalThis.crypto.randomUUID()
export const billToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
export function decimal(value, places = 2) {
  const text = String(value ?? '').trim()
  if (!new RegExp(`^(?:\\d{1,10}(?:\\.\\d{1,${places}})?|\\.\\d{1,${places}})$`).test(text)) throw new Error(`Enter a non-negative number with up to ${places} decimal places.`)
  const [whole, fraction = ''] = text.split('.')
  const scaled = BigInt(whole) * 10n ** BigInt(places) + BigInt(fraction.padEnd(places, '0'))
  if (scaled > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Amount is too large.')
  return Number(scaled)
}
export function linePaise(line) {
  const result = (BigInt(decimal(line.qty, 4)) * BigInt(decimal(line.rate)) + 5000n) / 10000n
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Line amount is too large.')
  return Number(result)
}
export const money = paise => {
  if (!Number.isSafeInteger(paise)) throw new Error('Invalid monetary total.')
  const value = BigInt(paise), absolute = value < 0n ? -value : value
  return `${value < 0n ? '-' : ''}₹${(absolute / 100n).toLocaleString('en-IN')}.${String(absolute % 100n).padStart(2, '0')}`
}
export function totals(bill) {
  const quantities = new Map()
  let total = 0, payments = 0, freight = 0
  const safe = fn => { try { return fn() } catch { return 0 } }
  for (const row of bill.deliveries || []) {
    total += safe(() => linePaise(row))
    const unit = String(row.unit || '').trim().toLowerCase()
    if (unit) quantities.set(unit, (quantities.get(unit) || 0) + safe(() => decimal(row.qty, 4)))
  }
  for (const row of bill.payments || []) payments += safe(() => decimal(row.amount))
  for (const row of bill.freight || []) if (row.deductible === true) freight += safe(() => decimal(row.amount))
  if (![total, payments, freight, ...quantities.values()].every(Number.isSafeInteger)) throw new Error('Bill totals are too large.')
  const balance = total - payments - freight
  if (!Number.isSafeInteger(balance)) throw new Error('Balance is too large.')
  return { total, payments, freight, balance, outstanding: Math.max(0, balance), credit: Math.max(0, -balance), count: bill.deliveries?.length || 0, quantities: Object.fromEntries(quantities) }
}
export function paymentStatus(bill) {
  const t = totals(bill)
  return t.credit ? 'Credit' : t.balance === 0 ? 'Paid' : t.payments || t.freight ? 'Partial' : 'Unpaid'
}
// Display only. Keep this out of totals(), which drives bill balances and payment status.
export function broughtForwardTotals(bill, current = totals(bill)) {
  if (!bill.previousOutstanding) return null
  let previousPaise
  try { previousPaise = decimal(bill.previousOutstanding.amount) } catch {
    throw new Error('Enter a valid previous outstanding amount with up to two decimal places.')
  }
  if (previousPaise <= 0) throw new Error('Previous outstanding amount must be greater than zero.')
  const payablePaise = current.total + previousPaise
  if (!Number.isSafeInteger(payablePaise)) throw new Error('Total payable is too large.')
  return { previousPaise, payablePaise, remainingPaise: current.outstanding + previousPaise }
}
export function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || '') && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
}
const text = (value, max = 1000) => {
  if (typeof value !== 'string' || value.length > max) throw new Error(`Text must be no longer than ${max} characters.`)
  return value.trim()
}
export function normalizeBill(input, strict = false) {
  if (!input || typeof input !== 'object' || !['standard', 'consolidated'].includes(input.mode)) throw new Error('Choose a billing mode.')
  const bill = {
    mode: input.mode, date: text(input.date, 10), clientName: text(input.clientName, 200),
    clientAddress: text(input.clientAddress), state: text(input.state, 100), clientPhone: text(input.clientPhone, 40), notes: text(input.notes, 4000),
    deliveries: [], payments: [], freight: [],
  }
  if (!validDate(bill.date)) throw new Error('Enter a valid bill date.')
  if (strict && (!bill.clientName || !bill.clientAddress || !bill.state)) throw new Error('Client name, billing address, and state are required before issuing.')
  for (const key of ['deliveries', 'payments', 'freight']) {
    if (!Array.isArray(input[key])) throw new Error(`${key} must be a list.`)
    const ids = new Set()
    bill[key] = input[key].map((row, index) => {
      const id = text(row.id, 100)
      if (!/^[\w-]{8,100}$/.test(id) || ids.has(id)) throw new Error(`Duplicate or invalid ${key} record ID.`)
      ids.add(id)
      const date = text(row.date, 10)
      if (!validDate(date)) throw new Error(`${key} ${index + 1}: enter a valid date.`)
      if (key === 'deliveries') {
        const result = { id, date, product: text(row.product, 200), specification: text(row.specification, 200), location: text(row.location, 500), qty: text(String(row.qty), 30), unit: text(row.unit, 50), rate: text(String(row.rate), 30) }
        // Incomplete lines can be saved as drafts; supplied values are always validated.
        if (result.qty) { if (decimal(result.qty, 4) === 0) throw new Error(`Delivery ${index + 1}: quantity must be greater than zero.`) }
        if (result.rate) decimal(result.rate)
        if (strict && (!result.product || !result.location || !result.qty || !result.unit || !result.rate)) throw new Error(`Delivery ${index + 1}: product, location, quantity, unit, and rate are required.`)
        if (result.qty && result.rate) linePaise(result)
        return result
      }
      const amount = text(String(row.amount), 30)
      if (decimal(amount) <= 0) throw new Error(`${key} ${index + 1}: amount must be positive.`)
      if (key === 'payments') return { id, date, amount, method: text(row.method, 80), reference: text(row.reference, 150), notes: text(row.notes, 1000) }
      if (typeof row.deductible !== 'boolean') throw new Error('Freight deduction must be explicitly selected.')
      const description = text(row.description, 1000), paidBy = text(row.paidBy, 200)
      if (!description || !paidBy) throw new Error('Freight description and paid by are required.')
      return { id, date, amount, description, paidBy, deductible: row.deductible }
    })
  }
  if (strict && !bill.deliveries.length) throw new Error('Add at least one delivery.')
  for (const payment of bill.payments) if (!payment.method) throw new Error('Select a payment method.')
  const references = bill.payments.map(p => p.reference.toLowerCase()).filter(Boolean)
  if (new Set(references).size !== references.length) throw new Error('A payment reference is allocated more than once.')
  const signatures = bill.payments.map(p => `${p.date}|${decimal(p.amount)}|${p.method.toLowerCase()}|${p.reference.toLowerCase()}`)
  if (new Set(signatures).size !== signatures.length) throw new Error('Possible duplicate payment: same date, amount, method and reference. Add a distinct reference to identify separate payments.')
  const current = totals(bill)
  if (input.previousOutstanding != null) {
    const previous = input.previousOutstanding
    if (typeof previous !== 'object' || Array.isArray(previous)) throw new Error('Invalid previous outstanding details.')
    bill.previousOutstanding = {
      amount: text(previous.amount, 30),
      reference: text(previous.reference ?? '', 150),
      remarks: text(previous.remarks ?? '', 500),
    }
    broughtForwardTotals(bill, current)
  }
  return bill
}
export function createBill(date, legacy = {}) {
  return {
    mode: 'standard', date, clientName: legacy.clientName || '', clientAddress: legacy.clientAddress || '',
    state: legacy.state || 'Gujarat', clientPhone: legacy.clientPhone || '', notes: '', payments: [], freight: [],
    deliveries: [{ id: newId(), date, product: legacy.itemDesc || 'Paver Blocks', specification: '', location: legacy.clientAddress || '', qty: legacy.qty || '', unit: legacy.per || 'Brass', rate: legacy.rate || '' }],
  }
}
export const eventRequestKey = event => JSON.stringify([event.id, event.billId, event.expectedVersion, event.action, event.actor, event.reason || '', event.bill])

// Replay an append-only journal in physical row order. First matching version wins.
// Rejected/stale attempts remain auditable and never replace an accepted snapshot.
export function applyEvent(state, event, number) {
  if (!/^[\w-]{8,100}$/.test(event.id || '') || !/^[\w-]{8,100}$/.test(event.billId || '')) throw new Error('Invalid event or bill ID.')
  const previousAttempt = state.attempts.get(event.id)
  if (previousAttempt) {
    if (eventRequestKey(previousAttempt.event) !== eventRequestKey(event)) return { accepted: false, message: 'Request ID already used for different data.' }
    return previousAttempt.result
  }
  const current = state.bills.get(event.billId)
  let result
  try {
    if ((current?.version || '') !== event.expectedVersion) throw new Error('This bill changed. Reload the saved version before saving again.')
    if (current && current.status === 'finalized' && !['REVISE', 'SETTLE'].includes(event.action)) throw new Error('Issued bills require an explicit revision or settlement update.')
    if (event.action === 'REVISE' && (!current || current.status !== 'finalized' || !event.reason?.trim())) throw new Error('A correction reason and an issued bill are required.')
    if (event.action === 'SETTLE' && (!current || current.status !== 'finalized' || !event.reason?.trim())) throw new Error('A settlement reason and an issued bill are required.')
    if (!['SAVE', 'FINALIZE', 'REVISE', 'SETTLE'].includes(event.action)) throw new Error('Invalid bill action.')
    const candidate = event.action === 'SETTLE' ? { ...current.bill, payments: event.bill.payments, freight: event.bill.freight } : event.bill
    const bill = normalizeBill(candidate, event.action === 'FINALIZE' || event.action === 'SETTLE')
    // Stable payment IDs and references cannot be allocated to two different bills.
    for (const other of state.bills.values()) if (other.id !== event.billId) {
      for (const p of bill.payments) if (other.bill.payments.some(q => q.id === p.id || (p.reference && q.reference.toLowerCase() === p.reference.toLowerCase()))) throw new Error('Payment ID or reference is already allocated to another bill.')
    }
    const status = event.action === 'FINALIZE' || event.action === 'SETTLE' ? 'finalized' : 'draft'
    const record = {
      id: event.billId, number: current?.number || `NGST${number}`, version: event.id, status,
      revision: (current?.revision || 0) + (event.action === 'FINALIZE' ? 1 : 0),
      bill, company: event.action === 'FINALIZE' ? event.company : current?.company,
      actor: event.actor, timestamp: event.timestamp, reason: event.reason || '', action: event.action,
      history: [...(current?.history || []), { version: event.id, status, revision: (current?.revision || 0) + (event.action === 'FINALIZE' ? 1 : 0), bill, company: event.action === 'FINALIZE' ? event.company : current?.company, actor: event.actor, timestamp: event.timestamp, reason: event.reason || '', action: event.action }],
    }
    state.bills.set(event.billId, record)
    result = { accepted: true, record }
  } catch (error) { result = { accepted: false, message: error.message } }
  state.attempts.set(event.id, { event, result })
  return result
}
export function encodeEvent(event) {
  const payload = JSON.stringify({ bill: event.bill, reason: event.reason || '', company: event.company || null, sequenceStart: event.sequenceStart })
  const chunks = payload.match(/[\s\S]{1,30000}/g) || ['']
  return chunks.map((chunk, i) => [event.id, event.billId, event.expectedVersion, event.action, event.actor, event.timestamp, i, chunks.length, chunk])
}
export function replayJournal(rows, startNumber) {
  if (!Number.isSafeInteger(startNumber) || startNumber < 1) throw new Error('Set NGST_START_NUMBER to the next unused NGST number before saving bills.')
  if (JSON.stringify(rows[0]) !== JSON.stringify(JOURNAL_HEADERS)) throw new Error('Without_GST_Journal is missing or has unexpected headers. Follow the setup notes.')
  // Legacy events do not establish customer identities or verify customer links.
  const state = { bills: new Map(), attempts: new Map(), customers: new Map(), customerLinks: new Map() }
  for (let i = 1; i < rows.length;) {
    const row = rows[i], count = Number(row[7])
    if (!Number.isSafeInteger(count) || count < 1 || Number(row[6]) !== 0 || i + count > rows.length) throw new Error(`Incomplete journal event at row ${i + 1}. Reconciliation required.`)
    let payload = ''
    for (let p = 0; p < count; p++) {
      const part = rows[i + p]
      if (part.slice(0, 6).join('|') !== row.slice(0, 6).join('|') || Number(part[6]) !== p || Number(part[7]) !== count) throw new Error(`Invalid journal chunks at row ${i + p + 1}.`)
      payload += part[8] || ''
    }
    const event = { id: row[0], billId: row[1], expectedVersion: row[2] || '', action: row[3], actor: row[4], timestamp: row[5], ...JSON.parse(payload) }
    if (event.sequenceStart !== startNumber) throw new Error('NGST sequence configuration changed. Restore the original NGST_START_NUMBER; do not renumber the journal.')
    applyEvent(state, event, startNumber + state.bills.size)
    i += count
  }
  return state
}
