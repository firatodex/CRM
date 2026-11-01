import { supabase } from '../supabase'

export function listFinalStepClientIds() {
  return supabase.from('final_step_clients').select('client_id')
}

export function addFinalStepClient(clientId) {
  return supabase.from('final_step_clients').insert({ client_id: clientId })
}

export function removeFinalStepClient(clientId) {
  return supabase.from('final_step_clients').delete().eq('client_id', clientId)
}
