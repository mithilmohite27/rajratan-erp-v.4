import { verifyGoogleToken } from './_lib/auth.js'
import { appendCashFlowEntry, appendPayrollEntry, readPayrollRows } from './_lib/googleSheets.js'
import { MODULES, requireRoleOrPermission } from './_lib/permissions.js'
import { validatePayrollPayload, findPayrollDuplicate, payrollCashEntry } from './_lib/payrollValidation.js'
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

  const permission = requireRoleOrPermission(auth.user, MODULES.payroll)
  if (!permission.ok) {
    fail(res, permission.status, permission.code, permission.message)
    return
  }

  const validation = validatePayrollPayload(req.body)
  if (!validation.ok) {
    fail(res, validation.status, validation.code, validation.message)
    return
  }

  try {
    const rows = await readPayrollRows().catch(error => {
      if (error.code === 'SHEET_RANGE_NOT_FOUND') return []
      throw error
    })
    const duplicate = findPayrollDuplicate(rows, validation.entry)

    if (duplicate && !validation.force) {
      json(res, 409, {
        ok: false,
        duplicate: true,
        code: 'DUPLICATE_PAYROLL_ENTRY',
        message: 'Similar payroll entry already exists. Please confirm before saving again.',
      })
      return
    }

    await appendPayrollEntry(validation.entry)
    let pairedCashWrite = false

    if (validation.entry.type === 'Advance') {
      await appendCashFlowEntry(payrollCashEntry(validation.entry))
      pairedCashWrite = true
    }

    ok(res, {
      message: 'Payroll entry saved successfully.',
      entry: validation.entry,
      access: permission.access,
      duplicateConfirmed: Boolean(duplicate && validation.force),
      pairedCashWrite,
      schemaChanged: false,
    })
  } catch (error) {
    fail(
      res,
      500,
      'PAYROLL_SAVE_FAILED',
      'Payroll entry save failed. Check backend environment and service account access.',
      { reason: error.message }
    )
  }
}
