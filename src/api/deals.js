import { supabase } from '../supabase'

export function listDeals() {
  return supabase.from('deals').select('*').order('created_at', { ascending: false })
}

export function listDealsForClient(clientId) {
  return supabase.from('deals').select('*').eq('client_id', clientId).order('created_at', { ascending: false })
}

export function listActiveDealsForDelivery() {
  return supabase.from('deals').select('id, company, stage, client_id').eq('stage', 'active').order('created_at', { ascending: false })
}

export function insertDeal(row) {
  return supabase.from('deals').insert(row).select().single()
}

/** Update a deal and return the saved row. */
export function updateDeal(id, updates) {
  return supabase.from('deals').update(updates).eq('id', id).select().single()
}

/** Update without reading the row back. */
export function patchDeal(id, updates) {
  return supabase.from('deals').update(updates).eq('id', id)
}
