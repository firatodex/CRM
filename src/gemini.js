const API_KEY = import.meta.env.VITE_GEMINI_API_KEY
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`

// ─── System prompt — your business DNA ───────────────────────────
// This travels with EVERY Gemini call. Edit this to match your business.
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

// ─── Build the full context for a lead ───────────────────────────
function buildLeadContext(client, contactLogs) {
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
- In pipeline since: ${new Date(client.created_at).toLocaleDateString('en-IN')}
- Last contacted: ${client.last_contacted_at 
    ? new Date(client.last_contacted_at).toLocaleDateString('en-IN') 
    : 'Never'}
- Days since last contact: ${client.last_contacted_at 
    ? Math.floor((Date.now() - new Date(client.last_contacted_at)) / 86400000)
    : 'Never contacted'}
- Current next action: ${client.next_action || 'None set'}
- Next action due: ${client.next_action_due || 'No date'}
`

  const history = contactLogs.length === 0
    ? 'CONTACT HISTORY: No contact history yet.'
    : `CONTACT HISTORY (${contactLogs.length} interactions, oldest first):
${[...contactLogs].reverse().map((log, i) => {
  const date = new Date(log.contacted_at).toLocaleDateString('en-IN')
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
async function callGemini(prompt) {
  if (!API_KEY) throw new Error('Gemini API key not set. Add VITE_GEMINI_API_KEY to .env.local')
  
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 800,
      }
    })
  })

  if (!response.ok) {
    const err = await response.json()
    throw new Error(err.error?.message || 'Gemini API error')
  }

  const data = await response.json()
  return data.candidates?.[0]?.content?.parts?.[0]?.text || ''
}

// ─── Feature 1: Lead Summary + Next Action + Psychological flags ──
export async function getLeadIntelligence(client, contactLogs) {
  const context = buildLeadContext(client, contactLogs)
  
  const prompt = `
${SYSTEM_PROMPT}

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

// ─── Feature 2: Parse raw call notes into structured fields ───────
export async function parseCallNote(rawNote, client, contactLogs) {
  const context = buildLeadContext(client, contactLogs)

  const prompt = `
${SYSTEM_PROMPT}

${context}

NEW RAW NOTE FROM TODAY'S CALL:
"${rawNote}"

YOUR TASK:
Extract structured information from this raw note.
Respond ONLY with valid JSON, no explanation, no markdown, no backticks.
Use null for any field you cannot confidently extract.

{
  "what_happened": "clean summary of what occurred in this interaction",
  "what_next": "specific next action extracted or inferred",
  "suggested_due_date_days": null,
  "suggested_stage": null,
  "suggested_temperature": null,
  "new_pain_point": null,
  "decision_maker_mentioned": null,
  "buying_signal_detected": false,
  "stall_detected": false,
  "key_insight": "one sentence — the most important thing to know from this call"
}

Rules:
- suggested_stage must be one of: lead, contacted, proposal, active, dead — or null
- suggested_temperature must be one of: hot, warm, cold — or null  
- suggested_due_date_days is an integer (e.g. 3 for "in 3 days") or null
- Only suggest stage/temperature changes if the note clearly justifies it
- decision_maker_mentioned: name if a new decision maker was mentioned, else null
`

  const raw = await callGemini(prompt)
  
  // Strip any accidental markdown formatting before parsing
  const cleaned = raw.replace(/```json|```/g, '').trim()
  
  try {
    return JSON.parse(cleaned)
  } catch {
    // If JSON parse fails, return a safe fallback
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
      parse_error: true
    }
  }
}
