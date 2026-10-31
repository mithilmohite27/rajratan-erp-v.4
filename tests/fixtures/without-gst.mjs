import { createBill, newId } from '../../src/lib/withoutGst.js'
export function line(qty = '10', rate = '4200', location = 'Bhavandaghadh', date = '2026-02-05') {
  return { id: newId(), date, product: 'Paver Blocks', specification: '60mm', location, qty: String(qty), unit: 'Brass', rate: String(rate) }
}
export function payment(amount, reference = '') {
  return { id: newId(), date: '2026-09-10', amount: String(amount), method: 'Bank transfer', reference, notes: '' }
}
export function freight(amount, deductible = false) {
  return { id: newId(), date: '2026-09-11', amount: String(amount), description: 'Delivery freight', paidBy: 'Customer', deductible }
}
export function fixture(name = 'Kalpesh Mohite') {
  const bill = { ...createBill('2026-09-12'), mode: 'consolidated', clientName: name, clientAddress: 'Peth, Maharashtra', state: 'Maharashtra' }
  bill.deliveries = [
    ['2026-02-05', 'Bhavandaghadh', 10, 4200], ['2026-02-08', 'Bhavandaghadh', 10, 4200], ['2026-02-09', 'Bhavandaghadh', 10, 4200], ['2026-02-23', 'Bhavandaghadh', 10, 4200],
    ['2026-03-09', 'Bhavandaghadh', 2, 3300], ['2026-03-10', 'Vani', 10, 4200], ['2026-04-09', 'Pimpri', 20, 4200], ['2026-06-24', 'Haste', 20, 4200],
    ['2026-07-11', 'Hanuman Temple, Peth', 30, 4200], ['2026-07-14', 'Peth', 15, 4200], ['2026-07-16', 'Karanjali', 10, 4200], ['2026-08-16', 'Tondavan', 33, 4200],
    ['2026-08-21', 'Mankhed', 12, 4200], ['2026-08-22', 'Tondavan', 33, 4200], ['2026-08-29', 'Vani', 10, 3900], ['2026-09-08', 'Tondavan', 15, 4200],
  ].map(([date, location, qty, rate]) => line(qty, rate, location, date))
  bill.payments = [payment(100000, 'TEST-KM-1'), payment(300000, 'TEST-KM-2')]
  bill.freight = [freight(165900, true)]
  return bill
}
