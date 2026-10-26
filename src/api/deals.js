import { supabase } from '../supabase'

export function listDeals() {
  return supabase.from('deals').select('*').order('created_at', { ascending: false })
}

export function listDealsForClient(clientId) {
  return supabase.from('deals').select('*').eq('client_id', clientId).order('created_at', { ascending: false })
}
