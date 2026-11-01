import { supabase } from '../supabase'

export function listLeadContacts(clientId) {
  return supabase.from('lead_contacts').select('*').eq('client_id', clientId).order('created_at')
}

export function insertLeadContact(row) {
  return supabase.from('lead_contacts').insert(row).select().single()
}

export function updateLeadContact(id, updates) {
  return supabase.from('lead_contacts').update(updates).eq('id', id)
}

export function deleteLeadContact(id) {
  return supabase.from('lead_contacts').delete().eq('id', id)
}
