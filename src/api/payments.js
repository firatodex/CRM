import { supabase } from '../supabase'

export function listPayments() {
  return supabase.from('payments').select('*').order('created_at', { ascending: false })
}

export function listPaymentsForDeals(dealIds) {
  return supabase.from('payments').select('*').in('deal_id', dealIds)
}

export function listPaymentsForDeal(dealId) {
  return supabase.from('payments').select('*').eq('deal_id', dealId).order('created_at', { ascending: false })
}

export function markPaymentUnpaid(paymentId) {
  return supabase.from('payments').update({ paid: false, paid_at: null }).eq('id', paymentId)
}

export function listPaymentsForDealsByCreated(dealIds) {
  return supabase.from('payments').select('*').in('deal_id', dealIds).order('created_at')
}

export function insertPayment(row) {
  return supabase.from('payments').insert(row)
}

export function insertPaymentReturning(row) {
  return supabase.from('payments').insert(row).select().single()
}

export function patchPayment(id, updates) {
  return supabase.from('payments').update(updates).eq('id', id)
}

export function updatePaymentReturning(id, updates) {
  return supabase.from('payments').update(updates).eq('id', id).select().single()
}

export function deletePayment(id) {
  return supabase.from('payments').delete().eq('id', id)
}

export function markPaymentPaid(paymentId, paidAt) {
  return supabase.from('payments').update({ paid: true, paid_at: paidAt }).eq('id', paymentId)
}

export function findFirstMonthPayment(dealId) {
  return supabase.from('payments').select('id, paid').eq('deal_id', dealId).eq('kind', 'first_month').maybeSingle()
}

/** Any payment on the deal other than the first-month extra (limit 1). */
export function findRegularPayment(dealId) {
  return supabase.from('payments').select('id').eq('deal_id', dealId).neq('kind', 'first_month').limit(1)
}

export function findRecurringPeriodPayment(dealId, periodStart) {
  return supabase.from('payments').select('id').eq('deal_id', dealId).eq('period_start', periodStart).eq('kind', 'recurring_period').maybeSingle()
}
