import { handleOptions, ok, requireMethod, setCors } from './_lib/response.js'

export default async function handler(req, res) {
  if (handleOptions(req, res)) return
  setCors(req, res)
  if (!requireMethod(req, res, 'GET')) return

  ok(res, {
    service: 'Rajratan ERP API',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
  })
}
