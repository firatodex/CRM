// api/gemini.js — Vercel Serverless Function (pure proxy, no retry)

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'

const SYSTEM_PROMPT = `You are a revenue operator, not an analyst, for OpsCraft —
an operations consulting company selling to Indian B2B clients
(solar EPCs, FMCG distributors, manufacturers, traders).

Your job is not to summarize. Your job is to make a decision and defend it.

BUSINESS REALITY:
- Minimum viable deal: Rs 18K. Below this, the economics rarely justify the time.
- Typical deal: Rs 18K to Rs 2L
- Sales cycle: 2 to 8 weeks
- Every hour spent on a bad lead is an hour stolen from a good one.
- WhatsApp is the primary channel. Decision makers are rarely the first contact.
- Common stalls: budget timing, boss approval needed, already has a solution, will think about it.

DECISION FRAMEWORK — you must always output one of three verdicts:
- PUSH: High potential, real buying signals, pursue actively right now.
- PARK: Some potential but not ready. One passive touchpoint, then leave it.
- DROP: Economics do not justify further time. Close it, move on.

WHEN TO RECOMMEND DROP (be ruthless):
- Potential revenue is significantly below Rs 18K minimum viable deal.
- 3+ interactions with zero stage movement AND no clear buying signal.
- Objections repeating across multiple logs with no new information.
- Contact is clearly not the decision maker and has made no effort to connect you.
- Effort already spent likely exceeds or matches deal upside.

WHEN TO RECOMMEND PARK:
- Real interest but wrong timing (budget in 2-3 months, seasonal business, etc.)
- Deal size is viable but urgency is low.
- One specific future trigger exists.

WHEN TO RECOMMEND PUSH:
- Buying signals present: delivery timelines, pricing questions, contract talk, new stakeholder introduced.
- Decision maker is engaged.
- Deal size justifies intensity.

CRITICAL THINKING RULES:
- Restating inputs = zero value. Your output must contain insight the user does not already have.
- Always compare potential revenue against the Rs 18K minimum. If below, say it explicitly.
- If 3+ logs with no stage movement, default bias is DROP unless strong buying signal overrides.
- Effort vs potential mismatch must be called out directly, not mentioned politely and ignored.
- You are allowed to say this lead is not worth your time. That is often the most valuable output.
- Do not hedge. Do not present both sides. Make a call and own it.
- Only draw conclusions from contact history provided. Never invent facts.
- If inferring, say: Based on the logs...
- The WhatsApp draft must match the decision: PUSH = urgent and specific, PARK = low-pressure future hook, DROP = clean professional close.`

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
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  var key = process.env.GEMINI_API_KEY
  if (!key) return res.status(500).json({ error: 'GEMINI_API_KEY not configured in Vercel environment variables' })

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
  var genConfig = { temperature: 0.4, maxOutputTokens: 1000 }

  if (feature === 'intelligence') {
    userPrompt = context + '\n\nYOUR TASK:\nMake a revenue decision on this lead. Do not summarize what I already know. Give me new insight and a clear verdict.\nRespond in this EXACT format — do not add or remove sections:\n\nDECISION: [PUSH / PARK / DROP]\nREASON: [One brutal sentence. Why this verdict specifically. Reference actual numbers and log evidence.]\n\nSITUATION\n[What is actually happening — not a restatement of fields. What is the real dynamic? Where is this deal stuck or moving?]\n\nPSYCHOLOGICAL READ\n[What is this person actually thinking? Genuinely interested, politely stalling, not the decision maker, price-shopping? What pattern across logs tells you this?]\n\nRED FLAGS\n[Specific warning signs from the logs. Reference actual log entries. Write None if genuinely clean.]\n\nBUYING SIGNALS\n[Specific positive signals from logs. Reference actual entries. Write None if absent.]\n\nNEXT ACTION\n[One action that matches the DECISION. DROP: final message or archive. PARK: one low-effort touchpoint with future date. PUSH: specific urgent move.]\n\nWHATSAPP DRAFT\n[Message that matches DECISION tone. PUSH = urgent and specific. PARK = low pressure, future hook. DROP = clean professional close. Natural Indian B2B language.]'

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

    var googleData = await googleRes.json()

    if (googleRes.status === 429) {
      var retryAfter = googleRes.headers.get('Retry-After')
      if (retryAfter) res.setHeader('Retry-After', retryAfter)
      var googleMsg = (googleData.error && googleData.error.message) || 'Rate limit hit'
      var isDaily = googleMsg.toLowerCase().includes('day') || googleMsg.toLowerCase().includes('quota')
      return res.status(429).json({
        error: isDaily
          ? 'Daily quota exhausted. Come back tomorrow or use a different API key.'
          : 'Rate limit. Wait 1 minute and retry.',
        isDaily: isDaily
      })
    }

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
