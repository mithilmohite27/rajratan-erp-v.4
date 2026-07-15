import assert from 'node:assert/strict'
import {
  filterCrmHistory,
  groupActivitiesByDate,
  normalizeCrmHistoryRows,
  sortCrmHistory,
  summarizeCrmHistory,
} from '../src/lib/crmHistory.js'

const rows = [
  {
    Date: '2026-06-26',
    ClientName: 'Devidashbhai',
    Location: 'Bare, Maharashtra',
    OrderBrass: '7',
    OrderBlocks: '1995',
    Rate: '2800',
    DispatchBrass: '0',
    DispatchBlocks: '0',
    Color: 'Red',
    Status: 'Order',
  },
  {
    Date: '2026-06-26',
    ClientName: 'Devidashbhai',
    OrderBrass: '0',
    DispatchBrass: '7',
    DispatchBlocks: '1995',
    Color: 'Red',
    Status: 'Dispatched',
    Transport: 'Self-Pickup',
    FreightCharge: '440',
  },
  {
    Date: '28/06/2026',
    ClientName: 'Dhirenbhai',
    Location: 'Valsad',
    OrderBrass: '3',
    DispatchBrass: '3',
    Color: 'White',
    Status: 'Dispatched',
  },
  {
    Date: '2026-06-27',
    ClientName: 'Maheshbhai',
    Location: 'Factory Gate',
    OrderBrass: '5',
    DispatchBrass: '0',
    Color: 'Black',
    Status: 'Order',
  },
  {
    Date: '',
    ClientName: 'Invalid Date Client',
    OrderBrass: '2',
    DispatchBrass: '0',
    Color: 'Yellow',
    Status: 'Order',
  },
]

const activities = normalizeCrmHistoryRows(rows)
assert.equal(activities.length, 6)
assert.equal(activities.filter(activity => activity.type === 'order').length, 4)
assert.equal(activities.filter(activity => activity.type === 'dispatch').length, 2)

const grouped = groupActivitiesByDate(activities)
assert.equal(grouped[0].dateKey, '2026-06-28')
assert.equal(grouped[1].dateKey, '2026-06-27')
assert.equal(grouped[2].dateKey, '2026-06-26')
assert.equal(grouped[2].activities.length, 2)

const whiteActivities = filterCrmHistory(activities, { color: 'White' })
assert.equal(whiteActivities.length, 2)
assert.ok(whiteActivities.every(activity => activity.color === 'White'))

const blackActivities = filterCrmHistory(activities, { color: 'Black' })
assert.equal(blackActivities.length, 1)

const dispatches = filterCrmHistory(activities, { type: 'dispatch' })
assert.equal(dispatches.length, 2)
assert.ok(dispatches.every(activity => activity.type === 'dispatch'))

const searchResult = filterCrmHistory(activities, { search: 'devidash' })
assert.equal(searchResult.length, 2)

const last7 = filterCrmHistory(
  activities,
  { dateRange: 'last7' },
  '2026-06-30'
)
assert.equal(last7.length, 5)

const custom = filterCrmHistory(
  activities,
  { dateRange: 'custom', startDate: '2026-06-27', endDate: '2026-06-28' },
  '2026-06-30'
)
assert.equal(custom.length, 3)

const invalidDate = activities.find(activity => activity.clientName === 'Invalid Date Client')
assert.equal(invalidDate.dateKey, 'unknown')

const summary = summarizeCrmHistory(activities)
assert.equal(summary.totalActivities, 6)
assert.equal(summary.orders, 4)
assert.equal(summary.dispatches, 2)
assert.equal(summary.totalBrass, 27)

const stable = sortCrmHistory([
  { id: 'b', dateValue: 1, timestamp: 0, sourceIndex: 2 },
  { id: 'a', dateValue: 1, timestamp: 0, sourceIndex: 1 },
])
assert.deepEqual(stable.map(activity => activity.id), ['a', 'b'])

const emptyFiltered = filterCrmHistory(activities, { search: 'no match' })
assert.equal(emptyFiltered.length, 0)

console.log('crm history tests passed')
