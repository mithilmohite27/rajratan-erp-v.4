import { verifyGoogleToken } from './_lib/auth.js'
import { readConfig } from './_lib/googleSheets.js'
import { MODULES, requireRoleOrPermission } from './_lib/permissions.js'
import { fail, handleOptions, ok, requireMethod, setCors } from './_lib/response.js'

export default async function handler(req, res) {
  if (handleOptions(req, res)) return
  setCors(req, res)
  if (!requireMethod(req, res, 'GET')) return

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

  try {
    const config = await readConfig()
    ok(res, {
      config,
      access: permission.access,
      source: 'Config',
      readOnly: true,
    })
  } catch (error) {
    fail(
      res,
      error.code === 'SHEET_RANGE_NOT_FOUND' ? 404 : 500,
      error.code || 'CONFIG_READ_FAILED',
      'Could not read Config sheet using backend service account.',
      { reason: error.message }
    )
  }
}
