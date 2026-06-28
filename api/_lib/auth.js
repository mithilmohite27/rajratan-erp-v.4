function bearerToken(req) {
  const header = req.headers.authorization || ''
  const match = header.match(/^Bearer\s+(.+)$/i)
  return match ? match[1].trim() : ''
}

async function fetchTokenInfo(token) {
  const accessUrl = `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(token)}`
  let res = await fetch(accessUrl)

  if (!res.ok) {
    const idUrl = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token)}`
    res = await fetch(idUrl)
  }

  if (!res.ok) {
    throw new Error('Token verification failed.')
  }

  return res.json()
}

export async function verifyGoogleToken(req) {
  const token = bearerToken(req)
  if (!token) {
    return { ok: false, status: 401, code: 'MISSING_TOKEN', message: 'Authorization bearer token is required.' }
  }

  try {
    const info = await fetchTokenInfo(token)
    const expectedAudience = process.env.GOOGLE_CLIENT_ID

    if (expectedAudience && info.aud && info.aud !== expectedAudience) {
      return { ok: false, status: 401, code: 'INVALID_AUDIENCE', message: 'Google token audience does not match this API.' }
    }

    if (!info.email) {
      return { ok: false, status: 401, code: 'EMAIL_NOT_AVAILABLE', message: 'Verified Google token did not include an email.' }
    }

    return {
      ok: true,
      user: {
        email: info.email,
        name: info.name || info.given_name || '',
        picture: info.picture || '',
      },
      tokenInfo: info,
    }
  } catch (error) {
    return { ok: false, status: 401, code: 'INVALID_TOKEN', message: error.message || 'Invalid Google token.' }
  }
}
