// api/gemini.js — Vercel Serverless Function
// Uses CommonJS exports (module.exports) instead of ES module export default
// because package.json has "type": "module" which causes conflicts with
// Vercel's Node.js serverless runtime when using export default syntax.

const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`

const SYSTEM_PROMPT = `
You are a sharp, direct sales intelligence assistant for OpsCraft — 
an operations consulting company selling to Indian B2B clients 
(solar EPCs, FMCG distributors, manufacturers, traders).

BUSINESS CONTEXT:
- Typical deal size: ₹18K to ₹2L
- Sales cycle: 2 to 8 weeks
- Common objections: budget timing, needs boss approval, 
  already has a solution, "will think about it"
- Clients are often price-sensitive but respond to ROI framing
- WhatsApp is the primary communication channel
- Decision makers are often not the first point of contact

SALES FRAMEWORK YOU FOLLOW:
- Use SPIN principles: uncover Situation, Problem, Implication, Need-Payoff
- Flag stall patterns: 3+ logs with no stage movement = stalled deal
- Detect buying signals: delivery timelines, contract questions, 
  price negotiation, introducing new stakeholders
- Always identify if contact is the actual decision maker
- Suggest pattern-break moves for stalled leads instead of more follow-ups
- Flag effort vs potential mismatch (many calls on small deal)

OUTPUT RULES:
- Be direct. One clear recommendation, not a list of options.
- Only draw conclusions from the contact history provided.
- Never invent details not in the logs.
- If inferring, say "Based on the logs..."
- If uncertain, say so explicitly.
- Keep responses concise — a busy salesperson reads this between calls.
- Always show your reasoning so the user can verify it.
`

function safeDaysSince(isoString) {
  if (!isoString) return null
  const d = new Date(isoString)
  if (isNaN(d.getTime())) return null
  return Math.floor((Date.now() - d.getTime()) / 86400000)
}

function safeLocalDate(isoString) {
  if (!isoString) return 'Never'
  const d = new Date(isoString)
  if (isNaN(d.getTime())) return 'Unknown'
  return d.toLocaleDateString('en-IN')
}

function buildLeadContext(client, contactLogs) {
  const daysSince = safeDaysSince(client.last_contacted_at)
  const profile = `
LEAD PROFILE:
- Name: ${client.name}
- Company: ${client.company || 'Unknown'}
- Business type: ${client.business_type || 'Unknown'}
- Stage: ${client.stage}
- Temperature: ${client.temperature || 'Not set'}
- Source: ${client.source || 'Unknown'}
- Potential revenue: ${client.potential_revenue ? '₹' + client.potential_revenue : 'Not set'}
- Pain point: ${client.pain_point || 'Not recorded'}
- In pipeline since: ${safeLocalDate(client.created_at)}
- Last contacted: ${safeLocalDate(client.last_contacted_at)}
- Days since last contact: ${daysSince !== null ? daysSince : 'Never contacted'}
- Current next action: ${client.next_action || 'None set'}
- Next action due: ${client.next_action_due || 'No date'}
`
  const history = contactLogs.length === 0
    ? 'CONTACT HISTORY: No contact history yet.'
    : `CONTACT HISTORY (${contactLogs.length} interactions, oldest first):
${[...contactLogs].reverse().map((log, i) => {
  const happened = log.note_what_happened || log.note || ''
  const next = log.note_what_next || ''
  return `
[${i + 1}] ${safeLocalDate(log.contacted_at)} via ${log.method}
What happened: ${happened}
${next ? `What was planned next: ${next}` : ''}`
}).join('\n')}`

  return `${profile}\n${history}`
}

async function callGemini(userPrompt, genConfigOverride, retryCount) {
  retryCount = retryCount || 0
  genConfigOverride = genConfigOverride || {}

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ parts: [{ text: userPrompt }] }],
      generationConfig: Object.assign({ temperature: 0.3, maxOutputTokens: 800 }, genConfigOverride)
    })
  })

  if (response.status === 429) {
    if (retryCount >= 3) throw new Error('Rate limit reached. Wait 30 seconds and try again.')
    const retryAfterHeader = response.headers.get('Retry-After')
    const retryAfterMs = retryAfterHeader
      ? parseInt(retryAfterHeader, 10) * 1000
      : (retryCount + 1) * 10000
    await new Promise(function(r) { setTimeout(r, retryAfterMs) })
    return callGemini(userPrompt, genConfigOverride, retryCount + 1)
  }

  if (!response.ok) {
    const err = await response.json().catch(function() { return {} })
    throw new Error(err && err.error && err.error.message ? err.error.message : 'Gemini API error ' + response.status)
  }

  const data = await response.json()
  return data.candidates && data.candidates[0] && data.candidates[0].content &&
    data.candidates[0].content.parts && data.candidates[0].content.parts[0]
    ? data.candidates[0].content.parts[0].text
    : ''
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: 'GEMINI_API_KEY not set in Vercel environment variables' })
  }

  const feature = req.body.feature
  const client = req.body.client
  const contactLogs = req.body.contactLogs || []
  const rawNote = req.body.rawNote

  try {
    if (feature === 'intelligence') {
      const context = buildLeadContext(client, contactLogs)
      const prompt = context + `

YOUR TASK:
Analyze this lead and give me a structured intelligence report.
Respond in this EXACT format (keep the headers, fill in the content):

SITUATION SUMMARY
[2-3 sentences on where things stand. What has happened, what was the last meaningful development.]

PSYCHOLOGICAL READING
[What is the lead's actual mental state? Are they genuinely interested, stalling, not the decision maker, price shopping? What pattern do you see across the logs?]

RED FLAGS
[Any warning signs — stalls, objections repeating, long silences, signs they're talking to competitors. Write "None detected" if clean.]

BUYING SIGNALS
[Any positive signals — questions about delivery, pricing details, introduced a new stakeholder, shorter response times. Write "None detected" if absent.]

RECOMMENDED NEXT ACTION
[One specific action. Not "follow up" — what exactly to say or do and why.]

SUGGESTED MESSAGE
[A WhatsApp message draft for the next contact. Natural, not corporate. In line with how an Indian B2B salesperson would write.]

URGENCY LEVEL: [High / Medium / Low — one word only]
REASONING: [One sentence explaining the urgency level]
`
      const result = await callGemini(prompt)
      return res.status(200).json({ result: result })

    } else if (feature === 'parse') {
      const context = buildLeadContext(client, contactLogs)
      const prompt = context + `

NEW RAW NOTE FROM TODAY'S CALL:
"${rawNote}"

YOUR TASK:
Extract structured information from this raw note.
Use null for any field you cannot confidently extract.
Only suggest stage or temperature changes if the note clearly justifies it.
decision_maker_mentioned: person's name if a new decision maker was mentioned, else null.
suggested_due_date_days: integer number of days from today, or null.
suggested_stage must be one of: lead, contacted, proposal, active, dead — or null.
suggested_temperature must be one of: hot, warm, cold — or null.
`
      const jsonConfig = {
        responseMimeType: 'application/json',
        responseSchema: {
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
      }
      const raw = await callGemini(prompt, jsonConfig)
      const parsed = JSON.parse(raw)
      return res.status(200).json({ result: parsed })

    } else {
      return res.status(400).json({ error: 'Unknown feature. Use "intelligence" or "parse".' })
    }

  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
