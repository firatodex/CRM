import { supabase } from '../supabase'

export function listPipelineSnapshots() {
  return supabase.from('pipeline_snapshots').select('*').order('snapshot_date', { ascending: true })
}

export function findPipelineSnapshot(date) {
  return supabase.from('pipeline_snapshots').select('snapshot_date').eq('snapshot_date', date).maybeSingle()
}

export function insertPipelineSnapshot(row) {
  return supabase.from('pipeline_snapshots').insert(row).select().single()
}
