import { supabase } from '../supabase'
import { fetchAllPages } from './paged'

export function listClients(isCancelled) {
  return fetchAllPages(
    () => supabase.from('clients').select('*').order('created_at', { ascending: false }),
    { batchSize: 1000, isCancelled }
  )
}

export function insertClient(payload) {
  return supabase.from('clients').insert(payload).select().single()
}

/** Update a client and return the saved row. */
export function updateClient(id, updates) {
  return supabase.from('clients').update(updates).eq('id', id).select().single()
}

/** Update without reading the row back. */
export function patchClient(id, updates) {
  return supabase.from('clients').update(updates).eq('id', id)
}

export function deleteClient(id) {
  return supabase.from('clients').delete().eq('id', id)
}
