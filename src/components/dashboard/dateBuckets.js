import { todayStr, datePart } from '../../utils'
import { addMonths } from '../../utils/paymentMath'

// Last n months, oldest first, as { key: 'YYYY-MM', label: 'Oct 26' }
export function lastMonths(n) {
  const thisMonthStart = todayStr().slice(0, 7) + '-01'
  return Array.from({ length: n }, (_, i) => {
    const key = addMonths(thisMonthStart, i - (n - 1)).slice(0, 7)
    const [y, m] = key.split('-').map(Number)
    return { key, label: new Date(y, m - 1, 1).toLocaleDateString('en-IN', { year: '2-digit', month: 'short' }) }
  })
}

export const monthOf = timestamp => (datePart(timestamp) || '').slice(0, 7)
