import { supabase } from '../supabase'

export function listImplementations() {
  return supabase.from('implementations').select('*, deals(company, deal_value), clients(company)').order('created_at', { ascending: false })
}

export function insertImplementation(row) {
  return supabase.from('implementations').insert([row])
}

export function updateImplementation(id, updates) {
  return supabase.from('implementations').update(updates).eq('id', id)
}
