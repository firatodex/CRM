// src/gemini.js — Frontend client
//
// Calls /api/gemini (our Vercel serverless function).
// Handles 429 rate limits here with retry + countdown.
// No API key, no direct Google calls — key lives server-side only.

async function callBackend(body, retryCount) {
  retryCount = retryCount || 0

  var response = await fetch('/api/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  // Rate limited — read Retry-After from our own server (no CORS issue)
  // and wait before retrying. Max 3 retries.
  if (response.status === 429) {
    if (retryCount >= 3) {
      throw new Error('Rate limit reached. Wait 30 seconds and try again.')
    }
    var retryAfter = response.headers.get('Retry-After')
    var waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : (retryCount + 1) * 12000
    await new Promise(function(r) { setTimeout(r, waitMs) })
    return callBackend(body, retryCount + 1)
  }

  var data = await response.json().catch(function() { return {} })

  if (!response.ok) {
    throw new Error(data.error || ('Request failed (' + response.status + ')'))
  }

  return data.result
}

export async function getLeadIntelligence(client, contactLogs) {
  return callBackend({ feature: 'intelligence', client: client, contactLogs: contactLogs })
}

export async function parseCallNote(rawNote, client, contactLogs) {
  try {
    return await callBackend({ feature: 'parse', client: client, contactLogs: contactLogs, rawNote: rawNote })
  } catch (e) {
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
