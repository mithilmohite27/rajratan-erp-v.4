import { verifyGoogleToken } from './_lib/auth.js'
import { appendExternalMaterialUsageEntry, readExternalMaterialUsageRows } from './_lib/googleSheets.js'
import { MODULES, requireRoleOrPermission } from './_lib/permissions.js'
import { validateMaterialUsagePayload, findMaterialUsageDuplicate } from './_lib/materialUsageValidation.js'
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

  const permission = requireRoleOrPermission(auth.user, MODULES.materialStock)
  if (!permission.ok) {
    fail(res, permission.status, permission.code, permission.message)
    return
  }

  const validation = validateMaterialUsagePayload(req.body)
  if (!validation.ok) {
    fail(res, validation.status, validation.code, validation.message)
    return
  }

  try {
    const rows = await readExternalMaterialUsageRows().catch(error => {
      if (error.code === 'SHEET_RANGE_NOT_FOUND') return []
      throw error
    })
    const duplicate = findMaterialUsageDuplicate(rows, validation.entry)

    if (duplicate && !validation.force) {
      json(res, 409, {
        ok: false,
        duplicate: true,
        code: 'DUPLICATE_MATERIAL_USAGE',
        message: 'Similar external material usage already exists. Please confirm before saving again.',
      })
      return
    }

    await appendExternalMaterialUsageEntry(validation.entry)

    ok(res, {
      message: 'External material usage saved successfully.',
      access: permission.access,
      duplicateConfirmed: Boolean(duplicate && validation.force),
      schemaChanged: false,
    })
  } catch (error) {
    fail(
      res,
      500,
      'MATERIAL_USAGE_SAVE_FAILED',
      'External material usage save failed. Check backend environment and service account access.',
      { reason: error.message }
    )
  }
}
