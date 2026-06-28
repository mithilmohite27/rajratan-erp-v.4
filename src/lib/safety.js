const WRITE_WARNING =
  'You are about to write to the connected Google Sheet. Please confirm this is not the real production sheet unless you are sure.\n\nContinue?'

export function confirmSheetWrite(extra = '') {
  const message = extra ? `${WRITE_WARNING}\n\n${extra}` : WRITE_WARNING
  return window.confirm(message)
}

export function confirmDuplicateSave(label, count = 1) {
  return window.confirm(
    `A similar ${label} already exists (${count} possible match${count === 1 ? '' : 'es'}).\n\nPlease confirm before saving again.`
  )
}

export function countLikelyDuplicates(rows, predicate) {
  return rows.filter(predicate).length
}

export function cleanText(value) {
  return (value ?? '').toString().trim().toLowerCase()
}

export function sameText(a, b) {
  return cleanText(a) === cleanText(b)
}

export function sameDate(a, b) {
  return (a || '').toString().trim() === (b || '').toString().trim()
}

export function sameNumber(a, b, tolerance = 0.001) {
  const x = parseFloat(a) || 0
  const y = parseFloat(b) || 0
  return Math.abs(x - y) <= tolerance
}

export function getSheetEnvironmentLabel() {
  const env = (import.meta.env.VITE_SHEET_ENV || '').trim().toLowerCase()

  if (env === 'production' || env === 'prod' || env === 'live') return 'Connected Sheet: Production'
  if (env === 'demo' || env === 'test' || env === 'staging') {
    return `Connected Sheet: ${env.charAt(0).toUpperCase()}${env.slice(1)}`
  }

  return 'Connected Sheet: Active Google Sheet'
}
