import { JOURNAL_HEADERS } from '../../src/lib/withoutGst.js'

const cleanKey = value => String(value ?? '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim().toUpperCase()
function parseBase(value) {
  if (value === undefined || value === null || (typeof value === 'string' && !value.trim())) return { status: 'missing', value: null }
  const validText = typeof value === 'string' && /^\d+(?:\.0+)?$/.test(value.trim())
  const number = typeof value === 'number' ? value : validText ? Number(value.trim()) : NaN
  return Number.isSafeInteger(number) && number > 0 ? { status: 'valid', value: number } : { status: 'invalid', value: null }
}

// Read the first complete immutable event only to discover its base. replayJournal
// still validates every event/chunk against this base before any financial write.
function recordedBase(rows) {
  if (rows.length <= 1 || JSON.stringify(rows[0]) !== JSON.stringify(JOURNAL_HEADERS)) return { status: 'empty', value: null }
  const first = rows[1], count = Number(first[7])
  if (!Number.isSafeInteger(count) || count < 1 || Number(first[6]) !== 0 || count >= rows.length) throw new Error('Cannot read the existing journal base: incomplete first event. Preserve the journal and reconcile it; do not reset NGST numbering.')
  const parts = rows.slice(1, count + 1)
  if (parts.some((part, i) => part.slice(0, 6).join('|') !== first.slice(0, 6).join('|') || Number(part[6]) !== i || Number(part[7]) !== count)) throw new Error('Cannot read the existing journal base: mismatched first-event chunks. Do not reset the journal.')
  let payload
  try { payload = JSON.parse(parts.map(row => row[8] || '').join('')) }
  catch { throw new Error('Cannot read the existing journal base: invalid first-event JSON. Preserve the journal for reconciliation.') }
  const base = parseBase(payload.sequenceStart)
  if (typeof payload.sequenceStart !== 'number' || base.status !== 'valid') throw new Error('The existing journal has an invalid sequenceStart. Reconcile the original base without changing issued numbers.')
  return base
}

export function resolveNgstSequence({ configRows = [], journalRows = [], environmentValue = process.env.NGST_START_NUMBER, explicitValue } = {}) {
  const matching = configRows.map((row, index) => ({ row, index })).filter(({ row }) => cleanKey(row[0]) === 'NGST_START_NUMBER')
  const config = { ...parseBase(matching[0]?.row[1]), rows: matching.map(({ index }) => index + 1), range: 'Config!A:B' }
  const environment = parseBase(environmentValue)
  const explicit = explicitValue === undefined ? null : parseBase(explicitValue)
  const issues = []
  if (matching.length > 1) issues.push(`Duplicate NGST_START_NUMBER keys at Config rows ${config.rows.join(', ')}. Reconcile the duplicate entries; no value was chosen silently.`)
  if (matching.length && config.status !== 'valid') issues.push(`Config!B${config.rows[0]} for NGST_START_NUMBER must be a positive safe integer.`)
  if (environment.status === 'invalid') issues.push('The legacy server NGST_START_NUMBER is invalid. Reconcile it with the Config value and existing journal base.')
  if (explicit && explicit.status !== 'valid') issues.push('The explicit NGST_START_NUMBER override must be a positive safe integer.')
  let journal = { status: 'empty', value: null }
  try { journal = recordedBase(journalRows) } catch (error) { issues.push(error.message); journal = { status: 'invalid', value: null } }
  const candidates = [
    ['journal', journal], ['Config', config], ['environment', environment], ['override', explicit],
  ].filter(([, candidate]) => candidate?.status === 'valid')
  const [source, selected] = candidates[0] || [null, null]
  if (!selected && !issues.length) issues.push('Set NGST_START_NUMBER in Config column A with its positive integer value in column B (or retain the legacy server setting). For a new journal use the reconciled first unused number; for existing events retain their original base.')
  for (const [candidateSource, candidate] of candidates.slice(1)) if (candidate.value !== selected.value) issues.push(`NGST_START_NUMBER conflict: ${candidateSource}=${candidate.value}, ${source} base=${selected.value}. Preserve the original fixed sequence base; this setting is not the next-number counter.`)
  return {
    startNumber: selected?.value,
    issues,
    diagnostic: { source, base: selected?.value ?? null, config, environment, journal, ...(explicit ? { override: explicit } : {}), meaning: 'Fixed sequence base; next number = base + accepted new bills. Do not increment this setting after saving.' },
  }
}
