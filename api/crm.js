import { verifyGoogleToken } from './_lib/auth.js'
import { appendCRMEntries, readCRMRows } from './_lib/googleSheets.js'
import { MODULES, requireRoleOrPermission } from './_lib/permissions.js'
import { validateCRMPayload, findCRMDuplicate } from './_lib/crmValidation.js'
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

  const permission = requireRoleOrPermission(auth.user, MODULES.crm)
  if (!permission.ok) {
    fail(res, permission.status, permission.code, permission.message)
    return
  }

  const validation = validateCRMPayload(req.body)
  if (!validation.ok) {
    fail(res, validation.status, validation.code, validation.message)
    return
  }

  try {
    const rows = await readCRMRows().catch(error => {
      if (error.code === 'SHEET_RANGE_NOT_FOUND') return []
      throw error
    })
    const duplicate = findCRMDuplicate(rows, validation.action, validation.entries)

    if (duplicate && !validation.force) {
      json(res, 409, {
        ok: false,
        duplicate: true,
        code: validation.action === 'dispatch' ? 'DUPLICATE_CRM_DISPATCH' : 'DUPLICATE_CRM_ORDER',
        message: 'Similar CRM entry already exists. Please confirm before saving again.',
      })
      return
    }

    await appendCRMEntries(validation.entries)

    ok(res, {
      message: validation.action === 'dispatch' ? 'CRM dispatch saved successfully.' : 'CRM order saved successfully.',
      access: permission.access,
      action: validation.action,
      rowsSaved: validation.entries.length,
      duplicateConfirmed: Boolean(duplicate && validation.force),
      schemaChanged: false,
    })
  } catch (error) {
    fail(
      res,
      500,
      'CRM_SAVE_FAILED',
      'CRM entry save failed. Check backend environment and service account access.',
      { reason: error.message }
    )
  }
}
