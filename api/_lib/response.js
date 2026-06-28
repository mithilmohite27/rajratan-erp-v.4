const LOCAL_ORIGINS = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
])

function allowedOrigins() {
  return new Set([
    ...LOCAL_ORIGINS,
    ...(process.env.ALLOWED_ORIGINS || '')
      .split(',')
      .map(origin => origin.trim())
      .filter(Boolean),
  ])
}

export function setCors(req, res) {
  const origin = req.headers.origin
  const allowed = allowedOrigins()

  if (origin && allowed.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type')
}

export function handleOptions(req, res) {
  if (req.method === 'OPTIONS') {
    setCors(req, res)
    res.status(204).end()
    return true
  }
  return false
}

export function json(res, status, payload) {
  res.status(status).json(payload)
}

export function ok(res, payload = {}) {
  json(res, 200, { ok: true, ...payload })
}

export function fail(res, status, code, message, details) {
  json(res, status, {
    ok: false,
    code,
    message,
    ...(details ? { details } : {}),
  })
}

export function requireMethod(req, res, method) {
  if (req.method !== method) {
    fail(res, 405, 'METHOD_NOT_ALLOWED', `Use ${method} for this endpoint.`)
    return false
  }
  return true
}
