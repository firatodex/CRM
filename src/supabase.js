import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
// Deployment uses the default public schema. Override only for non-public staging.
const supabaseSchema = import.meta.env.VITE_SUPABASE_SCHEMA || 'public'

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase env vars. Copy .env.example to .env.local and fill in your values.')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  db: { schema: supabaseSchema },
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
})
