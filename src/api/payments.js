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
