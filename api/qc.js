import { verifyGoogleToken } from './_lib/auth.js'
import { appendQCEntry, readQCRows } from './_lib/googleSheets.js'
import { MODULES, requireRoleOrPermission } from './_lib/permissions.js'
import { validateQCPayload, findQCDuplicate } from './_lib/qcValidation.js'
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

  const permission = requireRoleOrPermission(auth.user, MODULES.qc)
  if (!permission.ok) {
    fail(res, permission.status, permission.code, permission.message)
    return
  }

  const validation = validateQCPayload(req.body)
  if (!validation.ok) {
    fail(res, validation.status, validation.code, validation.message)
    return
  }

  try {
    const rows = await readQCRows().catch(error => {
      if (error.code === 'SHEET_RANGE_NOT_FOUND') return []
      throw error
    })
    const duplicate = findQCDuplicate(rows, validation.entry)

    if (duplicate && !validation.force) {
      json(res, 409, {
        ok: false,
        duplicate: true,
        code: 'DUPLICATE_QC_ENTRY',
        message: 'Similar QC entry already exists. Please confirm before saving again.',
      })
      return
    }

    await appendQCEntry(validation.entry)

    ok(res, {
      message: 'QC entry saved successfully.',
      access: permission.access,
      duplicateConfirmed: Boolean(duplicate && validation.force),
      schemaChanged: false,
    })
  } catch (error) {
    fail(
      res,
      500,
      'QC_SAVE_FAILED',
      'QC entry save failed. Check backend environment and service account access.',
      { reason: error.message }
    )
  }
}
