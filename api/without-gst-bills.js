import { verifyGoogleToken } from './_lib/auth.js'
import { MODULES, requireRoleOrPermission } from './_lib/permissions.js'
import { fail, handleOptions, ok, setCors } from './_lib/response.js'
import { readConfig, readSheetRange } from './_lib/googleSheets.js'
import { appendJournalEvent, loadBillingStorage } from './_lib/withoutGstSchema.js'
import { eventRequestKey, JOURNAL_RANGE, normalizeBill, replayJournal } from '../src/lib/withoutGst.js'

const COMPANY_KEYS = ['COMPANY_NAME', 'BUSINESS_ADDRESS', 'BUSINESS_PHONE', 'BUSINESS_EMAIL', 'BANK_NAME', 'BANK_ACCOUNT_NAME', 'BANK_ACCOUNT_NUMBER', 'IFSC_CODE', 'PAYMENT_TERMS', 'INVOICE_FOOTER_NOTE']

export function createHandler(deps = {}) {
  const verify = deps.verify || verifyGoogleToken
  const permission = deps.permission || requireRoleOrPermission
  const append = deps.appendEvent || appendJournalEvent
  const config = deps.config || readConfig
  return async function handler(req, res) {
    if (handleOptions(req, res)) return
    setCors(req, res)
    if (!['GET', 'POST'].includes(req.method)) return fail(res, 405, 'METHOD_NOT_ALLOWED', 'Use GET or POST.')
    const auth = await verify(req)
    if (!auth.ok) return fail(res, auth.status, auth.code, auth.message)
    const access = permission(auth.user, MODULES.bills)
    if (!access.ok) return fail(res, access.status, access.code, access.message)
    let writeStarted = false
    const requestId = req.body?.id
    try {
      const { state, sheetId, startNumber, sequence, target } = await loadBillingStorage({ read: deps.read, metadata: deps.metadata, startNumber: deps.startNumber })
      if (req.method === 'GET') return ok(res, { schemaReady: true, sequence, target, bills: [...state.bills.values()], rejectedAttempts: [...state.attempts.values()].filter(a => !a.result.accepted).length })
      const body = req.body
      if (!body || typeof body !== 'object') return fail(res, 400, 'INVALID_BILL', 'A bill request is required.')
      const { id, billId, action, expectedVersion = '', reason = '' } = body
      if (!/^[\w-]{8,100}$/.test(id || '') || !/^[\w-]{8,100}$/.test(billId || '') || typeof expectedVersion !== 'string' || typeof reason !== 'string' || reason.length > 2000 || !['SAVE', 'FINALIZE', 'REVISE', 'SETTLE'].includes(action)) return fail(res, 400, 'INVALID_BILL', 'Invalid request ID, bill ID, action, reason or version.')
      let bill
      try { bill = normalizeBill(body.bill, action === 'FINALIZE' || action === 'SETTLE') }
      catch (error) { return fail(res, 400, 'INVALID_BILL', error.message, { requestId: id, requestState: 'unknown' }) }
      const identity = { id, billId, action, expectedVersion, reason, bill, actor: auth.user.email }
      const respondToAttempt = (stored, currentState) => {
        if (eventRequestKey(stored.event) !== eventRequestKey(identity)) return fail(res, 409, 'REQUEST_ID_REUSED', 'This ID belongs to different data. Keep the pending request and reconcile it with the owner.', { requestId: id, requestState: 'unknown' })
        if (!stored.result.accepted) return fail(res, 409, 'BILL_CONFLICT', stored.result.message, { requestId: id, requestState: 'rejected', authoritative: true })
        return ok(res, { requestId: id, requestState: 'committed', authoritative: true, record: currentState.bills.get(billId), replayed: true })
      }
      const previous = state.attempts.get(id)
      if (previous) return respondToAttempt(previous, state)
      if (body.reconcile === true) return ok(res, { schemaReady: true, requestId: id, requestState: 'not_found', message: 'No committed event was found in the current journal. Keep this ID and retry the same request; absence alone does not resolve an in-flight save.' })
      const companyConfig = action === 'FINALIZE' ? await config() : null
      const event = {
        ...identity, timestamp: new Date().toISOString(), sequenceStart: startNumber,
        company: companyConfig ? Object.fromEntries(COMPANY_KEYS.filter(key => companyConfig[key] !== undefined).map(key => [key, companyConfig[key]])) : null,
      }
      // Valid intents, including stale conflicts, are durably arbitrated in journal
      // order. A rejected stored event is an authoritative non-commit result.
      writeStarted = true
      let appendError
      try { await append(event, sheetId) } catch (error) { appendError = error }
      const persisted = replayJournal(await (deps.read || readSheetRange)(JOURNAL_RANGE), startNumber)
      const stored = persisted.attempts.get(id)
      if (!stored) throw new Error(`Save could not be confirmed. Keep request ${id}. Check/retry that same ID after the owner checks journal access and request markers; do not delete markers or create a replacement bill.${appendError ? ` ${appendError.message}` : ''}`)
      return respondToAttempt(stored, persisted)
    } catch (error) {
      fail(res, 503, writeStarted ? 'BILL_SAVE_UNCERTAIN' : 'BILL_STORAGE_SETUP_REQUIRED', writeStarted ? error.message : `Without GST storage is not ready: ${error.message}`, { requestId, requestState: 'unknown', schemaReady: false, ...(error.sequenceDiagnostic ? { sequence: error.sequenceDiagnostic } : {}) })
    }
  }
}
export default createHandler()
