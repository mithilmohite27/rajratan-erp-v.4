import { verifyGoogleToken } from './_lib/auth.js'
import { MODULES, requireRoleOrPermission } from './_lib/permissions.js'
import { fail, handleOptions, ok, setCors } from './_lib/response.js'
import { appendSheetRows, readConfig, readSheetRange } from './_lib/googleSheets.js'
import { applyEvent, encodeEvent, eventRequestKey, normalizeBill, replayJournal } from '../src/lib/withoutGst.js'

const COMPANY_KEYS = ['COMPANY_NAME', 'BUSINESS_ADDRESS', 'BUSINESS_PHONE', 'BUSINESS_EMAIL', 'BANK_NAME', 'BANK_ACCOUNT_NAME', 'BANK_ACCOUNT_NUMBER', 'IFSC_CODE', 'PAYMENT_TERMS', 'INVOICE_FOOTER_NOTE']

// Injectable dependencies keep all persistence/auth tests isolated from production Sheets.
export function createHandler(deps = {}) {
  const verify = deps.verify || verifyGoogleToken
  const permission = deps.permission || requireRoleOrPermission
  const read = deps.read || readSheetRange
  const append = deps.append || appendSheetRows
  const config = deps.config || readConfig
  const start = () => Number(deps.startNumber ?? process.env.NGST_START_NUMBER)
  return async function handler(req, res) {
    if (handleOptions(req, res)) return
    setCors(req, res)
    if (!['GET', 'POST'].includes(req.method)) return fail(res, 405, 'METHOD_NOT_ALLOWED', 'Use GET or POST.')
    const auth = await verify(req)
    if (!auth.ok) return fail(res, auth.status, auth.code, auth.message)
    const access = permission(auth.user, MODULES.bills)
    if (!access.ok) return fail(res, access.status, access.code, access.message)
    try {
      const rows = await read('Without_GST_Journal!A:I')
      const state = replayJournal(rows, start())
      if (req.method === 'GET') return ok(res, { bills: [...state.bills.values()], rejectedAttempts: [...state.attempts.values()].filter(a => !a.result.accepted).length })
      const body = req.body
      if (!body || typeof body !== 'object') return fail(res, 400, 'INVALID_BILL', 'A bill request is required.')
      const { id, billId, action, expectedVersion = '', reason = '' } = body
      if (typeof reason !== 'string' || reason.length > 2000 || typeof expectedVersion !== 'string') return fail(res, 400, 'INVALID_BILL', 'Invalid reason or version.')
      const previous = state.attempts.get(id)
      if (previous) {
        const old = previous.event
        if (old.actor !== auth.user.email || old.billId !== billId || old.action !== action || old.expectedVersion !== expectedVersion || old.reason !== reason || JSON.stringify(old.bill) !== JSON.stringify(normalizeBill(body.bill, action === 'FINALIZE' || action === 'SETTLE'))) return fail(res, 409, 'REQUEST_ID_REUSED', 'Request ID already used for different data.')
        return previous.result.accepted ? ok(res, { record: state.bills.get(billId), replayed: true }) : fail(res, 409, 'BILL_CONFLICT', previous.result.message)
      }
      const companyConfig = action === 'FINALIZE' ? await config() : null
      const event = {
        id, billId, action, expectedVersion, reason, bill: normalizeBill(body.bill, action === 'FINALIZE' || action === 'SETTLE'),
        actor: auth.user.email, timestamp: new Date().toISOString(), company: companyConfig ? Object.fromEntries(COMPANY_KEYS.filter(key => companyConfig[key] !== undefined).map(key => [key, companyConfig[key]])) : null,
        sequenceStart: start(),
      }
      const candidate = applyEvent(state, event, start() + state.bills.size)
      if (!candidate.accepted) return fail(res, 409, 'BILL_CONFLICT', candidate.message)
      // One append request writes the complete event, including any JSON chunks.
      // No retry here: an uncertain response is retried with the SAME request ID.
      await append('Without_GST_Journal!A:I', encodeEvent(event), { raw: true })
      const persisted = replayJournal(await read('Without_GST_Journal!A:I'), start())
      const result = persisted.attempts.get(id)?.result
      if (!result) throw new Error('Save result is uncertain. Retry the same request before editing.')
      if (eventRequestKey(persisted.attempts.get(id).event) !== eventRequestKey(event)) return fail(res, 409, 'REQUEST_ID_REUSED', 'Request ID already used for different data.')
      if (!result.accepted) return fail(res, 409, 'BILL_CONFLICT', result.message)
      return ok(res, { record: persisted.bills.get(billId) })
    } catch (error) {
      const setup = error.code === 'SHEET_RANGE_NOT_FOUND' || /NGST_START_NUMBER|headers|sequence/.test(error.message)
      fail(res, setup ? 503 : 400, setup ? 'BILL_STORAGE_SETUP_REQUIRED' : 'BILL_SAVE_FAILED', error.message)
    }
  }
}
export default createHandler()
