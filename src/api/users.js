import { supabase } from '../supabase'

export function listUsers() {
  return supabase.from('users').select('*').order('created_at', { ascending: false })
}

export function listActiveUserNames() {
  return supabase.from('users').select('id, name').eq('is_active', true).order('name')
}

export function insertUser(row) {
  return supabase.from('users').insert([row])
}

export function updateUser(id, updates) {
  return supabase.from('users').update(updates).eq('id', id)
}
