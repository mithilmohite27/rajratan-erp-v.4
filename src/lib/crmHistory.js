export const CRM_HISTORY_COLORS = ['Red', 'Yellow', 'Black', 'White']
export const CRM_HISTORY_TYPES = ['order', 'dispatch']

function text(value) {
  return String(value ?? '').trim()
}

function num(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function pad2(value) {
  return String(value).padStart(2, '0')
}

function startOfUtcDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

export function normalizeCrmDate(value) {
  if (!value) return null
  if (value instanceof Date && !Number.isNaN(value.getTime())) return startOfUtcDay(value)

  const raw = text(value)
  if (!raw) return null

  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (iso) {
    const date = new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])))
    return Number.isNaN(date.getTime()) ? null : date
  }

  const indian = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/)
  if (indian) {
    const date = new Date(Date.UTC(Number(indian[3]), Number(indian[2]) - 1, Number(indian[1])))
    return Number.isNaN(date.getTime()) ? null : date
  }

  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? null : startOfUtcDay(parsed)
}

export function dateKeyFromDate(date) {
  if (!date) return 'unknown'
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`
}

export function formatCrmHistoryDate(key) {
  if (key === 'unknown') return 'Date not available'
  const date = normalizeCrmDate(key)
  if (!date) return 'Date not available'
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date)
}

export function relativeCrmDateLabel(key, todayValue = new Date()) {
  if (key === 'unknown') return ''
  const date = normalizeCrmDate(key)
  const today = normalizeCrmDate(todayValue)
  if (!date || !today) return ''
  const diffDays = Math.round((today.getTime() - date.getTime()) / 86400000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  return ''
}

function timestampValue(row) {
  const raw = row.Timestamp || row.CreatedAt || row.UpdatedAt || row.Time || ''
  if (!raw) return 0
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime()
}

function makeActivity(row, sourceIndex, type) {
  const isDispatch = type === 'dispatch'
  const date = normalizeCrmDate(row.Date || row.date)
  const brass = isDispatch ? num(row.DispatchBrass) : num(row.OrderBrass)
  const blocks = isDispatch ? num(row.DispatchBlocks) : num(row.OrderBlocks)
  const status = isDispatch ? 'Dispatched' : text(row.Status) || 'Order'

  return {
    id: `${sourceIndex}-${type}`,
    type,
    date: row.Date || row.date || '',
    dateKey: dateKeyFromDate(date),
    dateValue: date ? date.getTime() : 0,
    timestamp: timestampValue(row),
    sourceIndex,
    clientName: text(row.ClientName || row.clientName),
    color: CRM_HISTORY_COLORS.includes(text(row.Color)) ? text(row.Color) : text(row.Color),
    brass,
    blocks,
    location: text(row.Location),
    transportType: text(row.Transport),
    transporter: text(row.Transporter),
    ratePerBrass: num(row.Rate),
    loadingCharge: num(row.FreightCharge),
    paymentMode: text(row.PaymentMode),
    notes: text(row.Notes),
    status,
  }
}

export function normalizeCrmHistoryRecord(row = {}, sourceIndex = 0) {
  const activities = []
  if (num(row.OrderBrass) > 0) activities.push(makeActivity(row, sourceIndex, 'order'))
  if (num(row.DispatchBrass) > 0) activities.push(makeActivity(row, sourceIndex, 'dispatch'))
  return activities
}

export function normalizeCrmHistoryRows(rows = []) {
  return rows.flatMap((row, index) => normalizeCrmHistoryRecord(row, index))
}

export function sortCrmHistory(activities = []) {
  return [...activities].sort((a, b) => {
    if (b.dateValue !== a.dateValue) return b.dateValue - a.dateValue
    if (a.timestamp && b.timestamp && b.timestamp !== a.timestamp) return b.timestamp - a.timestamp
    if (a.timestamp && !b.timestamp) return -1
    if (!a.timestamp && b.timestamp) return 1
    return a.sourceIndex - b.sourceIndex
  })
}

function rangeStartFor(range, todayValue) {
  const today = normalizeCrmDate(todayValue) || startOfUtcDay(new Date())
  if (range === 'today') return today
  if (range === 'last7') return new Date(today.getTime() - 6 * 86400000)
  if (range === 'month') return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))
  return null
}

export function filterCrmHistory(activities = [], filters = {}, todayValue = new Date()) {
  const search = text(filters.search).toLowerCase()
  const type = filters.type || 'all'
  const color = filters.color || 'all'
  const dateRange = filters.dateRange || 'all'
  const startDate = dateRange === 'custom'
    ? normalizeCrmDate(filters.startDate)
    : rangeStartFor(dateRange, todayValue)
  const endDate = dateRange === 'custom'
    ? normalizeCrmDate(filters.endDate)
    : normalizeCrmDate(todayValue)

  return activities.filter(activity => {
    if (search && !activity.clientName.toLowerCase().includes(search)) return false
    if (type !== 'all' && activity.type !== type) return false
    if (color !== 'all' && activity.color !== color) return false
    if (startDate && (!activity.dateValue || activity.dateValue < startDate.getTime())) return false
    if (endDate && activity.dateValue && activity.dateValue > endDate.getTime()) return false
    return true
  })
}

export function summarizeCrmHistory(activities = []) {
  return activities.reduce((summary, activity) => {
    summary.totalActivities += 1
    if (activity.type === 'order') summary.orders += 1
    if (activity.type === 'dispatch') summary.dispatches += 1
    summary.totalBrass += activity.brass
    return summary
  }, {
    totalActivities: 0,
    orders: 0,
    dispatches: 0,
    totalBrass: 0,
  })
}

export function groupActivitiesByDate(activities = []) {
  const sorted = sortCrmHistory(activities)
  const groups = []
  const groupMap = new Map()

  sorted.forEach(activity => {
    if (!groupMap.has(activity.dateKey)) {
      const group = {
        dateKey: activity.dateKey,
        dateValue: activity.dateValue,
        label: formatCrmHistoryDate(activity.dateKey),
        activities: [],
        summary: summarizeCrmHistory([]),
      }
      groupMap.set(activity.dateKey, group)
      groups.push(group)
    }

    const group = groupMap.get(activity.dateKey)
    group.activities.push(activity)
    group.summary = summarizeCrmHistory(group.activities)
  })

  return groups
}
