import { supabase } from '../supabase'
import { fetchAllPages } from './paged'

export function listContactLogs(isCancelled) {
  return fetchAllPages(
    () => supabase.from('contact_log').select('*').order('contacted_at', { ascending: false }),
    { batchSize: 500, isCancelled }
  )
}

export function insertContactLog(row) {
  return supabase.from('contact_log').insert(row).select().single()
}
