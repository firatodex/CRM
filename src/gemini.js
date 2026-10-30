// src/gemini.js — Frontend client
//
// No API key here. No direct calls to Google.
// All requests go to /api/gemini — your own Vercel serverless function —
// which holds the key securely in server-side environment variables.

import { supabase } from './supabase'

async function callBackend(body) {
  // The endpoint only answers signed-in users, so send the current session token.
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData?.session?.access_token
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`

  const response = await fetch('/api/gemini', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.error || `Request failed (${response.status})`)
  }

  const data = await response.json()
  return data.result
}

// Feature 1: Full lead intelligence report
export async function getLeadIntelligence(client, contactLogs) {
  return await callBackend({ feature: 'intelligence', client, contactLogs })
}

// Feature 2: Parse raw call notes into structured fields
export async function parseCallNote(rawNote, client, contactLogs) {
  try {
    return await callBackend({ feature: 'parse', client, contactLogs, rawNote })
  } catch {
    // Safe fallback — UI never crashes even if the backend call fails
    return {
      what_happened: rawNote,
      what_next: null,
      suggested_due_date_days: null,
      suggested_stage: null,
      suggested_temperature: null,
      new_pain_point: null,
      decision_maker_mentioned: null,
      buying_signal_detected: false,
      stall_detected: false,
      key_insight: null,
      parse_error: true,
    }
  }
}
