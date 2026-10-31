export async function billRequest(token, body) {
  const res = await fetch('/api/without-gst-bills', {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const result = await res.json().catch(() => ({}))
  if (!res.ok || !result.ok) {
    const error = new Error(result.message || `Bill request failed (${res.status}).`)
    error.status = res.status
    error.code = result.code
    error.details = result.details
    throw error
  }
  return result
}
