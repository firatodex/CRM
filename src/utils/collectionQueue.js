import { cadenceLabel } from './paymentMath'
import { todayStr } from '../utils'

/** Add calendar days to YYYY-MM-DD. */
export function addDaysIso(iso, n) {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

export function daysUntil(iso, today) {
  if (!iso) return null
  return Math.round(
    (new Date(iso + 'T00:00:00') - new Date(today + 'T00:00:00')) / 86400000
  )
}

/**
 * Plain-language due status for a queue row.
 * @returns {{ key: 'overdue'|'today'|'soon'|'upcoming'|'open', label: string, days: number|null }}
 */
export function dueStatus(dueDate, today = todayStr()) {
  if (!dueDate) return { key: 'open', label: 'Open', days: null }
  const days = daysUntil(dueDate, today)
  if (days < 0) return { key: 'overdue', label: 'Overdue', days }
  if (days === 0) return { key: 'today', label: 'Due today', days }
  if (days <= 7) return { key: 'soon', label: 'Due soon', days }
  return { key: 'upcoming', label: 'Upcoming', days }
}

function dealPricingModel(deal) {
  return deal.pricing_model
    || (deal.subscription_type === 'one_time' ? 'one_time' : deal.subscription_type ? 'recurring' : null)
}

/**
 * Unified “money to collect” queue — unpaid payment rows + due renewals.
 * Used by Payments inbox and Today so both never disagree.
 *
 * @param {{ payments?: object[], deals?: object[], clients?: object[], today?: string, horizonDays?: number }} opts
 * @param horizonDays  Include items due on or before today+N (default 7). Use 0 for Today (overdue + due today only).
 */
export function buildCollectionQueue({
  payments = [],
  deals = [],
  clients = [],
  today = todayStr(),
  horizonDays = 7,
} = {}) {
  const clientById = Object.fromEntries((clients || []).map(c => [c.id, c]))
  const horizonEnd = addDaysIso(today, Math.max(0, horizonDays))
  const items = []

  ;(payments || []).forEach(p => {
    if (p.paid) return
    const deal = (deals || []).find(d => d.id === p.deal_id)
    const client = deal ? clientById[deal.client_id] : null
    if (!client) return
    const due = p.due_date || today
    if (p.due_date && p.due_date > horizonEnd) return
    items.push({
      key: `pay-${p.id}`,
      kind: 'invoice',
      payment: p,
      deal,
      client,
      amount: p.amount,
      label: p.label || 'Payment',
      dueDate: p.due_date,
      sortDate: due,
    })
  })

  ;(deals || []).forEach(deal => {
    const model = dealPricingModel(deal)
    if (model !== 'recurring') return
    if (!deal.next_reminder_at) return
    if (deal.next_reminder_at > horizonEnd) return
    const client = clientById[deal.client_id]
    if (!client) return
    items.push({
      key: `renew-${deal.id}`,
      kind: 'renewal',
      deal,
      client,
      amount: deal.net_price ?? deal.deal_value,
      label: `${cadenceLabel(deal.billing_cadence, deal.custom_interval_months)} renewal`,
      dueDate: deal.next_reminder_at,
      sortDate: deal.next_reminder_at,
    })
  })

  return items.sort((a, b) => {
    const da = a.dueDate || '9999'
    const db = b.dueDate || '9999'
    return String(da).localeCompare(String(db))
  })
}

/**
 * Filter queue by aging chip.
 * @param {'all'|'overdue'|'today'|'week'|'actionable'} aging
 *   actionable = overdue + today (Today view)
 */
export function filterCollectionQueue(items, { aging = 'all', search = '', today = todayStr() } = {}) {
  const q = search.trim().toLowerCase()
  return (items || []).filter(item => {
    const st = dueStatus(item.dueDate, today)
    if (aging === 'overdue' && st.key !== 'overdue') return false
    if (aging === 'today' && st.key !== 'today' && st.key !== 'open') return false
    if (aging === 'week' && !(st.key === 'soon' || st.key === 'today' || st.key === 'open')) return false
    if (aging === 'actionable' && !(st.key === 'overdue' || st.key === 'today' || st.key === 'open')) return false
    if (q) {
      const hay = `${item.client?.name || ''} ${item.client?.company || ''} ${item.label || ''}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
}

export function summarizeCollectionQueue(items, today = todayStr()) {
  const overdueItems = (items || []).filter(i => dueStatus(i.dueDate, today).key === 'overdue')
  return {
    count: items.length,
    amount: items.reduce((s, i) => s + (Number(i.amount) || 0), 0),
    overdueCount: overdueItems.length,
    overdueAmount: overdueItems.reduce((s, i) => s + (Number(i.amount) || 0), 0),
  }
}

/** Build confirm-sheet payload from a queue item. */
export function confirmPayloadFromItem(item) {
  if (!item) return null
  return {
    type: item.kind === 'renewal' ? 'renewal' : 'invoice',
    payment: item.payment || null,
    deal: item.deal || null,
    client: item.client || null,
    amount: item.amount,
    label: item.label,
    dueDate: item.dueDate,
  }
}
