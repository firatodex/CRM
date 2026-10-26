import { supabase } from '../supabase'

export function signOut() {
  return supabase.auth.signOut()
}

export function signIn(email, password) {
  return supabase.auth.signInWithPassword({ email, password })
}

export function getSession() {
  return supabase.auth.getSession()
}

export function onAuthChange(callback) {
  return supabase.auth.onAuthStateChange(callback)
}
