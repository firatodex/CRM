import { supabase } from '../supabase'

export function listActiveClientsForHealth() {
  return supabase.from('clients').select('id, company, phone, last_contacted_at').eq('stage', 'active').order('company')
}

export function listCustomerHealth() {
  return supabase.from('customer_health').select('*')
}
