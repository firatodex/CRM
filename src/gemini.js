const API_KEY = import.meta.env.VITE_GEMINI_API_KEY

// Fix 5: Updated to gemini-2.0-flash on v1beta which supports systemInstruction,
// JSON mode, and responseSchema — all features used below.
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`

// ─── System prompt — your business DNA ───────────────────────────
// Fix 1: This is now passed via the native `systemInstruction` field in the
// request body instead of being prepended to the user prompt string.
// Benefits: cacheable (cheaper), higher attention priority, injection-resistant.
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

// ─── Safe ISO date math ───────────────────────────────────────────
// Fix 4: Always parse from raw ISO string. Guard against Invalid Date
// in case the value was pre-formatted somewhere upstream.
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

// ─── Build the full context for a lead ───────────────────────────
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
  const date = safeLocalDate(log.contacted_at)
  const happened = log.note_what_happened || log.note || ''
  const next = log.note_what_next || ''
  return `
[${i + 1}] ${date} via ${log.method}
What happened: ${happened}
${next ? `What was planned next: ${next}` : ''}`
}).join('\n')}`

  return `${profile}\n${history}`
}

// ─── Core API call ────────────────────────────────────────────────
// Fix 1: systemInstruction at root level — not concatenated into contents.
// Fix 2: accepts genConfigOverride so callers can pass responseMimeType/responseSchema.
// Fix 3: reads Retry-After header instead of regexing the error message body.
async function callGemini(userPrompt, genConfigOverride = {}, retryCount = 0) {
  if (!API_KEY) {
    throw new Error('Gemini API key not configured. Add VITE_GEMINI_API_KEY in Vercel environment variables.')
  }

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ parts: [{ text: userPrompt }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 800,
        ...genConfigOverride,
      }
    })
  })

  // Fix 3: use standard HTTP Retry-After header, not error message regex
  if (response.status === 429) {
    if (retryCount >= 3) {
      throw new Error('Rate limit reached. You have made too many AI requests in the last minute. Wait 30 seconds and try again.')
    }
    const retryAfterHeader = response.headers.get('Retry-After')
    const retryAfterMs = retryAfterHeader
      ? parseInt(retryAfterHeader, 10) * 1000
      : (retryCount + 1) * 10000
    await new Promise(r => setTimeout(r, retryAfterMs))
    return callGemini(userPrompt, genConfigOverride, retryCount + 1)
  }

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    const msg = err?.error?.message || `API error ${response.status}`
    if (msg.includes('API_KEY_INVALID') || msg.includes('API key not valid')) {
      throw new Error('Invalid API key. Check VITE_GEMINI_API_KEY in your Vercel environment variables.')
    }
    throw new Error(msg)
  }

  const data = await response.json()
  return data.candidates?.[0]?.content?.parts?.[0]?.text || ''
}

// ─── Feature 1: Lead intelligence — plain text structured output ──
export async function getLeadIntelligence(client, contactLogs) {
  const context = buildLeadContext(client, contactLogs)

  const prompt = `
${context}

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

  return await callGemini(prompt)
}

// ─── Feature 2: Parse raw call notes into structured JSON ─────────
// Fix 2: native JSON mode via responseMimeType + responseSchema.
// The API guarantees clean JSON — no regex stripping, no backtick cleaning needed.
export async function parseCallNote(rawNote, client, contactLogs) {
  const context = buildLeadContext(client, contactLogs)

  const prompt = `
${context}

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

  try {
    const raw = await callGemini(prompt, jsonConfig)
    return JSON.parse(raw)
  } catch {
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
