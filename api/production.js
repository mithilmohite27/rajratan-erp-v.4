import { verifyGoogleToken } from './_lib/auth.js'
import {
  appendProductionEntry,
  appendProductionVariants,
  readProductionRows,
  readProductionVariantRows,
} from './_lib/googleSheets.js'
import { MODULES, requireRoleOrPermission } from './_lib/permissions.js'
import { validateProductionPayload, findProductionDuplicate } from './_lib/productionValidation.js'
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

  const permission = requireRoleOrPermission(auth.user, MODULES.production)
  if (!permission.ok) {
    fail(res, permission.status, permission.code, permission.message)
    return
  }

  const validation = validateProductionPayload(req.body)
  if (!validation.ok) {
    fail(res, validation.status, validation.code, validation.message)
    return
  }

  try {
    const [productionRows, variantRows] = await Promise.all([
      readProductionRows().catch(error => {
        if (error.code === 'SHEET_RANGE_NOT_FOUND') return []
        throw error
      }),
      readProductionVariantRows().catch(error => {
        if (error.code === 'SHEET_RANGE_NOT_FOUND') return []
        throw error
      }),
    ])
    const duplicate = findProductionDuplicate({ productionRows, variantRows }, validation.entry, validation.variants)

    if (duplicate && !validation.force) {
      json(res, 409, {
        ok: false,
        duplicate: true,
        code: 'DUPLICATE_PRODUCTION_ENTRY',
        message: 'Similar production entry already exists. Please confirm before saving again.',
      })
      return
    }

    await appendProductionEntry(validation.entry)
    await appendProductionVariants(validation.variants)

    ok(res, {
      message: 'Production entry saved successfully.',
      access: permission.access,
      duplicateConfirmed: Boolean(duplicate && validation.force),
      variantsSaved: validation.variants.length,
      schemaChanged: false,
    })
  } catch (error) {
    fail(
      res,
      500,
      'PRODUCTION_SAVE_FAILED',
      'Production entry save failed. Check backend environment and service account access.',
      { reason: error.message }
    )
  }
}
