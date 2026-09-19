import { supabase } from '../supabase'
import {
  addMonths,
  cadenceLabel,
  monthsForCadence,
  periodEnd,
} from './paymentMath'
import { todayStr } from '../utils'

/**
 * Mark a recurring payment reminder done:
 * - optionally insert the period payment row (net plan total)
 * - roll deals.next_reminder_at forward by one cadence interval
 *
 * @param {object} deal
 * @param {{ createPaymentRow?: boolean, markPaid?: boolean }} [opts]
 * @returns {Promise<{ deal: object, payment: object|null }>}
 */
export async function completePaymentReminder(deal, opts = {}) {
  const { createPaymentRow = true, markPaid = false } = opts
  if (!deal?.id) throw new Error('Deal is required')
  if (deal.pricing_model && deal.pricing_model !== 'recurring') {
    throw new Error('Only recurring plans have collection reminders')
  }

  const today = todayStr()
  const cadence = deal.billing_cadence || '1m'
  const customMonths = deal.custom_interval_months || 1
  const interval = monthsForCadence(cadence, customMonths)

  const periodStart = deal.next_reminder_at || deal.billing_start_date || today
  const periodEndDate = periodEnd(periodStart, cadence, customMonths)
  let nextReminder = addMonths(periodStart, interval)
  // If still overdue after one step, advance until >= today (max 36 steps)
  let guard = 0
  while (nextReminder < today && guard < 36) {
    nextReminder = addMonths(nextReminder, interval)
    guard += 1
  }

  const amount = Number(deal.net_price ?? deal.deal_value) || 0
  let payment = null

  if (createPaymentRow && amount >= 0) {
    // Avoid duplicate period rows for the same start date
    const { data: existing } = await supabase
      .from('payments')
      .select('id')
      .eq('deal_id', deal.id)
      .eq('period_start', periodStart)
      .eq('kind', 'recurring_period')
      .maybeSingle()

    if (existing?.id) {
      if (markPaid) {
        const { data: updated, error: upErr } = await supabase
          .from('payments')
          .update({ paid: true, paid_at: today })
          .eq('id', existing.id)
          .select()
          .single()
        if (upErr) throw upErr
        payment = updated
      } else {
        payment = existing
      }
    } else {
      const row = {
        deal_id: deal.id,
        label: `${cadenceLabel(cadence, customMonths)} fee`,
        amount,
        due_date: periodStart,
        paid: !!markPaid,
        paid_at: markPaid ? today : null,
        kind: 'recurring_period',
        period_start: periodStart,
        period_end: periodEndDate,
      }
      const { data: inserted, error: inErr } = await supabase
        .from('payments')
        .insert(row)
        .select()
        .single()
      if (inErr) throw inErr
      payment = inserted
    }
  }

  const { data: updatedDeal, error: dealErr } = await supabase
    .from('deals')
    .update({
      next_reminder_at: nextReminder,
      reminder_enabled: true,
    })
    .eq('id', deal.id)
    .select()
    .single()
  if (dealErr) throw dealErr

  return { deal: updatedDeal, payment }
}

/** Derive badge for an active client from their deal + payment rows. */
export function paymentStatusForClient(clientId, deals, payments, today = todayStr()) {
  const deal = (deals || []).find(d => d.client_id === clientId)
  if (!deal) return { key: 'no_plan', label: 'No plan', tone: 'muted' }

  const rows = (payments || []).filter(p => p.deal_id === deal.id)
  const unpaid = rows.filter(p => !p.paid)
  const unpaidBal = unpaid.reduce((s, p) => s + (Number(p.amount) || 0), 0)
  const hasOverduePay = unpaid.some(p => p.due_date && p.due_date < today)
  const reminderOverdue = deal.reminder_enabled && deal.next_reminder_at && deal.next_reminder_at < today

  if (hasOverduePay || reminderOverdue) {
    return { key: 'overdue', label: 'Overdue', tone: 'danger', deal, unpaidBal }
  }
  if (unpaidBal > 0) {
    return { key: 'unpaid', label: 'Unpaid', tone: 'warn', deal, unpaidBal }
  }
  if (rows.length === 0 && !(deal.net_price || deal.deal_value)) {
    return { key: 'no_plan', label: 'No plan', tone: 'muted', deal }
  }
  if (rows.some(p => p.paid) && unpaidBal === 0) {
    return { key: 'paid', label: deal.pricing_model === 'recurring' ? 'Current' : 'Paid', tone: 'ok', deal }
  }
  return { key: 'partial', label: 'Partial', tone: 'warn', deal, unpaidBal }
}

/** Recurring deals with a reminder due today or overdue. */
export function duePaymentReminders(deals, clients, today = todayStr()) {
  const byId = Object.fromEntries((clients || []).map(c => [c.id, c]))
  return (deals || [])
    .filter(d => d.reminder_enabled !== false)
    .filter(d => (d.pricing_model === 'recurring' || d.subscription_type === 'monthly' || d.subscription_type === 'annual'))
    .filter(d => d.next_reminder_at && d.next_reminder_at <= today)
    .map(d => ({
      deal: d,
      client: byId[d.client_id] || null,
      overdue: d.next_reminder_at < today,
      due: d.next_reminder_at,
    }))
    .filter(r => r.client)
    .sort((a, b) => String(a.due).localeCompare(String(b.due)))
}
