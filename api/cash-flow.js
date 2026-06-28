import { verifyGoogleToken } from './_lib/auth.js'
import { validateCashFlowPayload, findCashFlowDuplicate } from './_lib/cashFlowValidation.js'
import { appendCashFlowEntry, readCashFlowRows } from './_lib/googleSheets.js'
import { MODULES, requireRoleOrPermission } from './_lib/permissions.js'
import { fail, handleOptions, json, ok, requireMethod, setCors } from './_lib/response.js'

export default async function handler(req, res) {
  if (handleOptions(req, res)) return
  setCors(req, res)
  if (!requireMethod(req, res, 'POST')) return

  const auth = await verifyGoogleToken(req)
  if (!auth.ok) {
    fail(res, auth.status, auth.code, auth.message)
    return
  }

  const permission = requireRoleOrPermission(auth.user, MODULES.cashFlow)
  if (!permission.ok) {
    fail(res, permission.status, permission.code, permission.message)
    return
  }

  const validation = validateCashFlowPayload(req.body)
  if (!validation.ok) {
    fail(res, validation.status, validation.code, validation.message)
    return
  }

  try {
    const rows = await readCashFlowRows().catch(error => {
      if (error.code === 'SHEET_RANGE_NOT_FOUND') return []
      throw error
    })
    const duplicate = findCashFlowDuplicate(rows, validation.entry)

    if (duplicate && !validation.force) {
      json(res, 409, {
        ok: false,
        duplicate: true,
        code: 'DUPLICATE_CASH_ENTRY',
        message: 'Similar cash entry already exists. Please confirm before saving again.',
      })
      return
    }

    await appendCashFlowEntry(validation.entry)
    ok(res, {
      message: 'Cash flow entry saved successfully.',
      entry: validation.entry,
      access: permission.access,
      duplicateConfirmed: Boolean(duplicate && validation.force),
      schemaChanged: false,
    })
  } catch (error) {
    fail(
      res,
      500,
      'CASH_FLOW_SAVE_FAILED',
      'Cash entry save failed. Check backend environment and service account access.',
      { reason: error.message }
    )
  }
}
