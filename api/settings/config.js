import { verifyGoogleToken } from '../_lib/auth.js'
import { validateConfigPayload } from '../_lib/configValidation.js'
import { saveConfigMerge } from '../_lib/googleSheets.js'
import { MODULES, requireRoleOrPermission } from '../_lib/permissions.js'
import { fail, handleOptions, ok, requireMethod, setCors } from '../_lib/response.js'

export default async function handler(req, res) {
  if (handleOptions(req, res)) return
  setCors(req, res)
  if (!requireMethod(req, res, 'POST')) return

  const auth = await verifyGoogleToken(req)
  if (!auth.ok) {
    fail(res, auth.status, auth.code, auth.message)
    return
  }

  const permission = requireRoleOrPermission(auth.user, MODULES.settings)
  if (!permission.ok) {
    fail(res, permission.status, permission.code, permission.message)
    return
  }

  const validation = validateConfigPayload(req.body)
  if (!validation.ok) {
    fail(res, validation.status, validation.code, validation.message)
    return
  }

  try {
    const config = await saveConfigMerge(validation.config)
    ok(res, {
      message: 'Config saved successfully.',
      config,
      access: permission.access,
      writtenKeys: Object.keys(validation.config),
      schemaChanged: false,
    })
  } catch (error) {
    fail(
      res,
      500,
      'CONFIG_SAVE_FAILED',
      'Config save failed. Check backend environment and service account access.',
      { reason: error.message }
    )
  }
}
