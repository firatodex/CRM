/** Linked pricing + discount helpers for Payment Record (Phase 1). */

export const CADENCE_OPTIONS = [
  { key: '1m', label: 'Monthly', months: 1 },
  { key: '3m', label: 'Quarterly (3m)', months: 3 },
  { key: '6m', label: 'Half-yearly (6m)', months: 6 },
  { key: '12m', label: 'Yearly (12m)', months: 12 },
  { key: 'custom', label: 'Custom', months: null },
]

export function monthsForCadence(cadence, customMonths = 1) {
  if (cadence === 'custom') {
    const n = Number(customMonths)
    return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1
  }
  const hit = CADENCE_OPTIONS.find(c => c.key === cadence)
  return hit?.months ?? 1
}

export function cadenceLabel(cadence, customMonths) {
  if (cadence === 'custom') return `Every ${monthsForCadence('custom', customMonths)} month(s)`
  return CADENCE_OPTIONS.find(c => c.key === cadence)?.label || cadence || '—'
}

/** Keep monthly ↔ plan total in sync for a billing period. */
export function syncMonthlyAndTotal({ monthly, total, months, edited }) {
  const m = Math.max(1, Number(months) || 1)
  if (edited === 'monthly') {
    const mon = clampMoney(monthly)
    return { monthly: mon, total: roundMoney(mon * m) }
  }
  const tot = clampMoney(total)
  return { monthly: roundMoney(tot / m), total: tot }
}

/**
 * Linked discount % ↔ ₹ against a base amount.
 * @param {{ base: number, percent?: number, amount?: number, edited: 'percent'|'amount' }}
 */
export function applyDiscount({ base, percent, amount, edited }) {
  const b = clampMoney(base)
  if (b <= 0) return { percent: 0, amount: 0, net: 0 }

  if (edited === 'percent') {
    const pct = clampPercent(percent)
    const amt = roundMoney((b * pct) / 100)
    return { percent: pct, amount: amt, net: roundMoney(Math.max(0, b - amt)) }
  }

  const amt = Math.min(b, clampMoney(amount))
  const pct = roundPercent((amt / b) * 100)
  return { percent: pct, amount: amt, net: roundMoney(Math.max(0, b - amt)) }
}

export function roundMoney(n) {
  const x = Number(n)
  if (!Number.isFinite(x)) return 0
  return Math.round(x)
}

export function roundPercent(n) {
  const x = Number(n)
  if (!Number.isFinite(x)) return 0
  return Math.round(x * 100) / 100
}

export function clampMoney(n) {
  const x = Number(n)
  if (!Number.isFinite(x) || x < 0) return 0
  return x
}

export function clampPercent(n) {
  const x = Number(n)
  if (!Number.isFinite(x) || x < 0) return 0
  if (x > 100) return 100
  return x
}

/** YYYY-MM-DD + N calendar months (local). */
export function addMonths(dateStr, months) {
  const [y, m, d] = String(dateStr).split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setMonth(dt.getMonth() + Number(months))
  const yy = dt.getFullYear()
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  const dd = String(dt.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

/**
 * First reminder date:
 * - if start is in the future → start
 * - else → start + interval months
 */
export function computeNextReminder(billingStartDate, cadence, customMonths, today = null) {
  if (!billingStartDate) return null
  const todayStr = today || localToday()
  const interval = monthsForCadence(cadence, customMonths)
  if (billingStartDate > todayStr) return billingStartDate
  return addMonths(billingStartDate, interval)
}

/**
 * When a first-month extra is collected at billing start, the regular
 * cadence reminder is the next period after that first month.
 */
export function computeNextReminderAfterFirstMonth(billingStartDate, cadence, customMonths, today = null) {
  if (!billingStartDate) return null
  const interval = monthsForCadence(cadence, customMonths)
  const afterFirst = addMonths(billingStartDate, interval)
  return recomputeNextReminderFromSchedule(afterFirst, cadence, customMonths, today)
}

/**
 * Mid-stream cadence / start edits: find the next period boundary on or after today,
 * walking forward from billing_start_date in cadence steps.
 */
export function recomputeNextReminderFromSchedule(billingStartDate, cadence, customMonths, today = null) {
  if (!billingStartDate) return null
  const todayStr = today || localToday()
  const interval = monthsForCadence(cadence, customMonths)
  if (billingStartDate > todayStr) return billingStartDate

  let cursor = billingStartDate
  let guard = 0
  // Next collection date is the first boundary strictly after start that is >= today.
  // Using start itself if somehow start === today and we want first period due today.
  while (cursor < todayStr && guard < 120) {
    cursor = addMonths(cursor, interval)
    guard += 1
  }
  return cursor
}

export function periodEnd(startDate, cadence, customMonths) {
  if (!startDate) return null
  const months = monthsForCadence(cadence, customMonths)
  // Inclusive period: start .. day before next period
  const next = addMonths(startDate, months)
  const [y, m, d] = next.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() - 1)
  const yy = dt.getFullYear()
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  const dd = String(dt.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

function localToday() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Map to legacy subscription_type / payment_type columns. */
export function legacySubscriptionType(pricingModel, cadence) {
  if (pricingModel !== 'recurring') return 'one_time'
  if (cadence === '12m') return 'annual'
  return 'monthly'
}

export function legacyPaymentType(pricingModel) {
  return pricingModel === 'recurring' ? 'monthly' : 'lump_sum'
}
