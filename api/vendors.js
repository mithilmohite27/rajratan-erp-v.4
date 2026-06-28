import { verifyGoogleToken } from './_lib/auth.js'
import { appendCashFlowEntry, appendVendorEntry, readVendorRows } from './_lib/googleSheets.js'
import { MODULES, requireRoleOrPermission } from './_lib/permissions.js'
import { validateVendorPayload, findVendorDuplicate, vendorPaymentCashEntry } from './_lib/vendorValidation.js'
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

  const permission = requireRoleOrPermission(auth.user, MODULES.vendors)
  if (!permission.ok) {
    fail(res, permission.status, permission.code, permission.message)
    return
  }

  const validation = validateVendorPayload(req.body)
  if (!validation.ok) {
    fail(res, validation.status, validation.code, validation.message)
    return
  }

  try {
    const rows = await readVendorRows().catch(error => {
      if (error.code === 'SHEET_RANGE_NOT_FOUND') return []
      throw error
    })
    const duplicate = findVendorDuplicate(rows, validation.entry)

    if (duplicate && !validation.force) {
      json(res, 409, {
        ok: false,
        duplicate: true,
        code: 'DUPLICATE_VENDOR_ENTRY',
        message: 'Similar vendor entry already exists. Please confirm before saving again.',
      })
      return
    }

    await appendVendorEntry(validation.entry)
    let pairedCashWrite = false

    const skipCashFlow = Boolean(req.body?.skipCashFlow || req.body?.entry?.skipCashFlow)

    if (validation.entry.type === 'Payment' && !skipCashFlow) {
      await appendCashFlowEntry(vendorPaymentCashEntry(validation.entry))
      pairedCashWrite = true
    }

    ok(res, {
      message: 'Vendor entry saved successfully.',
      entry: validation.entry,
      access: permission.access,
      duplicateConfirmed: Boolean(duplicate && validation.force),
      pairedCashWrite,
      skippedCashFlowPair: Boolean(validation.entry.type === 'Payment' && skipCashFlow),
      schemaChanged: false,
    })
  } catch (error) {
    fail(
      res,
      500,
      'VENDOR_SAVE_FAILED',
      'Vendor entry save failed. Check backend environment and service account access.',
      { reason: error.message }
    )
  }
}
