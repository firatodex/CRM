import { supabase } from '../supabase'

export function signOut() {
  return supabase.auth.signOut()
}
