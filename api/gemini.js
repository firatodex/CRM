// api/gemini.js — Vercel Serverless Function
// 
// DESIGN DECISION: This function is a pure proxy — it makes ONE request to
// Google and immediately returns the result, including 429 rate limit errors.
// It does NOT retry. Retrying server-side on Vercel hobby plan (10s timeout)
// would cause the function to be killed mid-wait, returning a confusing 500.
// The frontend (src/gemini.js) handles retry with a visible countdown instead.

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'

const SYSTEM_PROMPT = `You are a sharp, direct sales intelligence assistant for OpsCraft — 
an operations consulting company selling to Indian B2B clients 
(solar EPCs, FMCG distributors, manufacturers, traders).

BUSINESS CONTEXT:
- Typical deal size: Rs 18K to Rs 2L
- Sales cycle: 2 to 8 weeks
- Common objections: budget timing, needs boss approval, already has a solution, will think about it
- Clients are often price-sensitive but respond to ROI framing
- WhatsApp is the primary communication channel
- Decision makers are often not the first point of contact

SALES FRAMEWORK:
- Use SPIN principles: Situation, Problem, Implication, Need-Payoff
- Flag stall patterns: 3+ logs with no stage movement = stalled deal
- Detect buying signals: delivery timelines, contract questions, price negotiation
- Always identify if contact is the actual decision maker
- Suggest pattern-break moves for stalled leads instead of more follow-ups
- Flag effort vs potential mismatch (many calls on small deal)

OUTPUT RULES:
- Be direct. One clear recommendation, not a list of options.
- Only draw conclusions from the contact history provided.
- Never invent details not in the logs.
- If inferring, say Based on the logs...
- Keep responses concise.`

function safeDaysSince(iso) {
  if (!iso) return null
  var d = new Date(iso)
  if (isNaN(d.getTime())) return null
  return Math.floor((Date.now() - d.getTime()) / 86400000)
}

function safeDate(iso) {
  if (!iso) return 'Never'
  var d = new Date(iso)
  if (isNaN(d.getTime())) return 'Unknown'
  return d.toLocaleDateString('en-IN')
}

function buildContext(client, logs) {
  var days = safeDaysSince(client.last_contacted_at)
  var profile = [
    'LEAD PROFILE:',
    '- Name: ' + client.name,
    '- Company: ' + (client.company || 'Unknown'),
    '- Business type: ' + (client.business_type || 'Unknown'),
    '- Stage: ' + client.stage,
    '- Temperature: ' + (client.temperature || 'Not set'),
    '- Source: ' + (client.source || 'Unknown'),
    '- Potential revenue: ' + (client.potential_revenue ? 'Rs ' + client.potential_revenue : 'Not set'),
    '- Pain point: ' + (client.pain_point || 'Not recorded'),
    '- In pipeline since: ' + safeDate(client.created_at),
    '- Last contacted: ' + safeDate(client.last_contacted_at),
    '- Days since last contact: ' + (days !== null ? days : 'Never contacted'),
    '- Current next action: ' + (client.next_action || 'None set'),
    '- Next action due: ' + (client.next_action_due || 'No date'),
  ].join('\n')

  if (!logs || logs.length === 0) {
    return profile + '\n\nCONTACT HISTORY: None yet.'
  }

  var history = 'CONTACT HISTORY (' + logs.length + ' interactions, oldest first):\n'
  var reversed = logs.slice().reverse()
  for (var i = 0; i < reversed.length; i++) {
    var log = reversed[i]
    var happened = log.note_what_happened || log.note || ''
    var next = log.note_what_next || ''
    history += '\n[' + (i + 1) + '] ' + safeDate(log.contacted_at) + ' via ' + log.method
    history += '\nWhat happened: ' + happened
    if (next) history += '\nWhat was planned next: ' + next
  }
  return profile + '\n\n' + history
}

module.exports = async function handler(req, res) {
  // CORS headers — allow requests from any origin (it's your own frontend)
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  var key = process.env.GEMINI_API_KEY
  if (!key) return res.status(500).json({ error: 'GEMINI_API_KEY not configured in Vercel environment variables' })

  // Safely parse body — Vercel usually auto-parses JSON but guard against edge cases
  var body = req.body
  if (typeof body === 'string') {
    try { body = JSON.parse(body) } catch (e) {
      return res.status(400).json({ error: 'Invalid JSON body' })
    }
  }
  if (!body) return res.status(400).json({ error: 'Empty request body' })

  var feature = body.feature
  var client = body.client
  var logs = body.contactLogs || []
  var rawNote = body.rawNote

  if (!feature) return res.status(400).json({ error: 'Missing feature field' })
  if (!client) return res.status(400).json({ error: 'Missing client field' })

  var context = buildContext(client, logs)
  var userPrompt = ''
  var genConfig = { temperature: 0.3, maxOutputTokens: 800 }

  if (feature === 'intelligence') {
    userPrompt = context + '\n\nYOUR TASK:\nAnalyze this lead and give me a structured intelligence report.\nRespond in this EXACT format:\n\nSITUATION SUMMARY\n[2-3 sentences on where things stand.]\n\nPSYCHOLOGICAL READING\n[Lead mental state, patterns across logs.]\n\nRED FLAGS\n[Warning signs or "None detected".]\n\nBUYING SIGNALS\n[Positive signals or "None detected".]\n\nRECOMMENDED NEXT ACTION\n[One specific action and why.]\n\nSUGGESTED MESSAGE\n[WhatsApp draft. Natural, not corporate. Indian B2B style.]\n\nURGENCY LEVEL: [High / Medium / Low]\nREASONING: [One sentence why.]'

  } else if (feature === 'parse') {
    userPrompt = context + '\n\nNEW RAW NOTE:\n"' + rawNote + '"\n\nExtract structured info. Use null for uncertain fields.\nsuggested_stage: one of lead/contacted/proposal/active/dead or null.\nsuggested_temperature: one of hot/warm/cold or null.\nsuggested_due_date_days: integer or null.'
    genConfig.responseMimeType = 'application/json'
    genConfig.responseSchema = {
      type: 'object',
      properties: {
        what_happened:            { type: 'string' },
        what_next:                { type: 'string',  nullable: true },
        suggested_due_date_days:  { type: 'integer', nullable: true },
        suggested_stage:          { type: 'string',  nullable: true },
        suggested_temperature:    { type: 'string',  nullable: true },
        new_pain_point:           { type: 'string',  nullable: true },
        decision_maker_mentioned: { type: 'string',  nullable: true },
        buying_signal_detected:   { type: 'boolean' },
        stall_detected:           { type: 'boolean' },
        key_insight:              { type: 'string',  nullable: true },
      },
      required: ['what_happened', 'buying_signal_detected', 'stall_detected']
    }
  } else {
    return res.status(400).json({ error: 'Unknown feature. Use "intelligence" or "parse".' })
  }

  try {
    var googleRes = await fetch(GEMINI_URL + '?key=' + key, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ parts: [{ text: userPrompt }] }],
        generationConfig: genConfig
      })
    })

    // Pass 429 straight back to frontend with Retry-After header
    // Frontend handles the wait + retry with a visible countdown
    if (googleRes.status === 429) {
      var retryAfter = googleRes.headers.get('Retry-After')
      if (retryAfter) res.setHeader('Retry-After', retryAfter)
      return res.status(429).json({ error: 'Rate limit. Wait and retry.' })
    }

    var googleData = await googleRes.json()

    if (!googleRes.ok) {
      var msg = (googleData.error && googleData.error.message) || ('Gemini error ' + googleRes.status)
      return res.status(googleRes.status).json({ error: msg })
    }

    var text = googleData.candidates &&
      googleData.candidates[0] &&
      googleData.candidates[0].content &&
      googleData.candidates[0].content.parts &&
      googleData.candidates[0].content.parts[0]
      ? googleData.candidates[0].content.parts[0].text
      : ''

    if (feature === 'parse') {
      try {
        return res.status(200).json({ result: JSON.parse(text) })
      } catch (e) {
        return res.status(200).json({ result: { what_happened: rawNote, parse_error: true } })
      }
    }

    return res.status(200).json({ result: text })

  } catch (err) {
    return res.status(500).json({ error: err.message || 'Internal server error' })
  }
}
