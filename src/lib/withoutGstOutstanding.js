import { totals } from './withoutGst.js'

export const isBillingId = value => typeof value === 'string' && /^[\w-]{8,100}$/.test(value)

// Customer IDs identify independently registered people or businesses. Names and
// contact details are display data and must never establish a financial link.
export function validateLegacyCustomerLink({ customers, bills, customerLinks }, { customerId, billId, expectedVersion, reason }, access) {
  if (access?.role !== 'Owner') throw new Error('Only the owner can approve a legacy bill link.')
  if (!isBillingId(customerId) || !customers.has(customerId)) throw new Error('Select a registered customer ID.')
  const bill = isBillingId(billId) && bills.get(billId)
  if (!bill) throw new Error('Select an existing bill ID.')
  if (bill.version !== expectedVersion) throw new Error('The bill changed. Review the latest version before linking.')
  if (typeof reason !== 'string' || !reason.trim() || reason.length > 2000) throw new Error('Enter a reason for the verified link (up to 2,000 characters).')
  if (customerLinks.has(billId)) throw new Error('This bill already has a verified customer link.')
  return { customerId, billId, expectedVersion, reason: reason.trim() }
}

function sumPaise(amounts) {
  let total = 0
  for (const amount of amounts) {
    if (!Number.isSafeInteger(amount) || amount < 0 || !Number.isSafeInteger(total + amount)) {
      throw new Error('Invalid outstanding amount or total exceeds the supported limit.')
    }
    total += amount
  }
  return total
}

export function selectPreviousOutstanding({ customers, bills, customerLinks }, customerId, currentBillId) {
  if (!isBillingId(customerId) || !customers.has(customerId)) return null

  const sources = []
  for (const [billId, link] of customerLinks) {
    if (link.customerId !== customerId || billId === currentBillId) continue
    const record = bills.get(billId)
    if (!record) throw new Error('A verified customer link points to a missing bill.')
    // An open correction draft does not erase the last issued receivable.
    const issued = record.status === 'finalized' ? record : record.status === 'draft'
      ? record.history?.findLast(entry => entry.status === 'finalized')
      : null
    if (!issued) continue
    const amounts = totals(issued.bill)
    if (!amounts.outstanding) continue
    sources.push({
      billId, number: record.number, date: issued.bill.date,
      version: record.version, issuedVersion: issued.version,
      revisionInProgress: record.status === 'draft',
      originalPaise: amounts.total, paidPaise: amounts.payments,
      deductiblePaise: amounts.freight, outstandingPaise: amounts.outstanding,
    })
  }
  return { customerId, sources, previousOutstandingPaise: sumPaise(sources.map(source => source.outstandingPaise)) }
}

export function calculateBillPayable(bill, available, selectedBillIds = []) {
  const sources = new Map(available.sources.map(source => [source.billId, source]))
  const selected = new Set(selectedBillIds)
  if (selected.size !== selectedBillIds.length) throw new Error('A previous bill can only be selected once.')
  const previousDuePaise = sumPaise([...selected].map(id => {
    if (!sources.has(id)) throw new Error('A selected previous bill is no longer eligible. Refresh outstanding balances.')
    return sources.get(id).outstandingPaise
  }))
  const current = totals(bill)
  return {
    currentSalePaise: current.total,
    currentPaidPaise: current.payments,
    currentAdjustmentsPaise: current.freight,
    currentDuePaise: current.outstanding,
    currentCreditPaise: current.credit,
    previousDuePaise,
    totalPayablePaise: sumPaise([current.outstanding, previousDuePaise]),
  }
}
