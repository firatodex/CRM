// src/decisionEngine.js
//
// Local, instant decision logic — no API call, no latency.
// Runs on every card render. AI Intel (Gemini) handles nuanced cases;
// this handles the obvious ones that don't need intelligence.
//
// MINIMUM VIABLE DEAL: Rs 15,000
// Below this the effort rarely justifies the return.

const MIN_DEAL = 15000

// ─── Core decision ────────────────────────────────────────────────
// Returns: 'PUSH' | 'PARK' | 'DROP' | null (null = not enough data)
export function getDecision(client, logCount = 0) {
  const rev = Number(client.potential_revenue) || 0
  const stage = client.stage
  const temp = client.temperature
  const daysSince = getDaysSinceContact(client.last_contacted_at)

  // Hard DROP rules — no exceptions
  if (rev > 0 && rev < MIN_DEAL) return 'DROP'
  if (logCount >= 5 && stage === 'lead') return 'DROP'      // 5+ touches, never moved
  if (logCount >= 4 && stage === 'contacted') return 'DROP' // 4+ touches, stuck at contacted
  if (daysSince !== null && daysSince > 30) return 'DROP'   // Month of silence

  // PUSH rules
  if (temp === 'hot') return 'PUSH'
  if (stage === 'proposal') return 'PUSH'   // Proposal stage = active pursuit
  if (rev >= 100000) return 'PUSH'          // Big deal always worth pushing

  // PARK rules
  if (rev >= MIN_DEAL && logCount <= 2) return 'PARK'  // Early stage, viable deal
  if (temp === 'warm' && daysSince !== null && daysSince <= 14) return 'PARK'

  // Not enough data to decide
  if (!rev && !temp) return null

  return 'PARK'
}

// ─── Effort vs value score ────────────────────────────────────────
// Higher = better ROI on your time. Lower = you're over-investing.
// Returns a number 0-100, or null if no revenue set.
export function getEffortScore(client, logCount = 0) {
  const rev = Number(client.potential_revenue) || 0
  if (!rev) return null
  // revenue / (interactions + 1) normalized to 0-100
  // Rs 2L with 1 interaction = 100k → great
  // Rs 2.5K with 6 interactions = 357 → terrible
  const raw = rev / (logCount + 1)
  if (raw >= 50000) return 100
  if (raw >= 20000) return 80
  if (raw >= 10000) return 60
  if (raw >= 5000)  return 40
  if (raw >= 1000)  return 20
  return 5
}

// ─── Staleness ───────────────────────────────────────────────────
// Returns: 'fresh' | 'cooling' | 'stale' | 'dead' | null
export function getStaleness(lastContactedAt) {
  const days = getDaysSinceContact(lastContactedAt)
  if (days === null) return null
  if (days <= 3)  return 'fresh'
  if (days <= 7)  return 'cooling'
  if (days <= 21) return 'stale'
  return 'dead'
}

// ─── Staleness color ─────────────────────────────────────────────
export function getStalenessColor(staleness) {
  switch (staleness) {
    case 'fresh':   return null                // no tint — all good
    case 'cooling': return 'rgba(255,149,0,0.06)'  // amber wash
    case 'stale':   return 'rgba(255,59,48,0.07)'  // red wash
    case 'dead':    return 'rgba(255,59,48,0.14)'  // deep red wash
    default:        return null
  }
}

// ─── Decision badge colors ────────────────────────────────────────
export function getDecisionStyle(decision) {
  switch (decision) {
    case 'PUSH': return { color: '#1A7A3F', bg: '#E8F9EE', border: '#B8EDD0' }
    case 'PARK': return { color: '#854F0B', bg: '#FFF4E5', border: '#FFD699' }
    case 'DROP': return { color: '#A32D2D', bg: '#FFF0EF', border: '#FFBAB5' }
    default:     return null
  }
}

// ─── Effort score color ──────────────────────────────────────────
export function getEffortColor(score) {
  if (score === null) return 'var(--text-muted)'
  if (score >= 80) return 'var(--success)'
  if (score >= 50) return 'var(--warning)'
  return 'var(--error)'
}

// ─── Helper ──────────────────────────────────────────────────────
export function getDaysSinceContact(isoString) {
  if (!isoString) return null
  const d = new Date(isoString)
  if (isNaN(d.getTime())) return null
  return Math.floor((Date.now() - d.getTime()) / 86400000)
}
