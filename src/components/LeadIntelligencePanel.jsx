import { useState } from 'react'
import { getLeadIntelligence, parseCallNote } from '../gemini'

// ─── Urgency badge ────────────────────────────────────────────────
function UrgencyBadge({ level }) {
  const map = {
    high:   { color: '#FF3B30', bg: '#FFF0EF', label: '🔴 High urgency' },
    medium: { color: '#FF9500', bg: '#FFF4E5', label: '🟡 Medium urgency' },
    low:    { color: '#34C759', bg: '#E8F9EE', label: '🟢 Low urgency' },
  }
  const s = map[level?.toLowerCase()] || map.medium
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: '3px 10px',
      borderRadius: 20, background: s.bg, color: s.color,
      display: 'inline-block'
    }}>
      {s.label}
    </span>
  )
}

// ─── Parse the plain-text Gemini response into sections ──────────
function parseIntelligence(text) {
  const sections = {}
  const keys = [
    'SITUATION SUMMARY',
    'PSYCHOLOGICAL READING',
    'RED FLAGS',
    'BUYING SIGNALS',
    'RECOMMENDED NEXT ACTION',
    'SUGGESTED MESSAGE',
    'URGENCY LEVEL',
    'REASONING',
  ]
  keys.forEach((key, i) => {
    const nextKey = keys[i + 1]
    const start = text.indexOf(key)
    if (start === -1) return
    const end = nextKey ? text.indexOf(nextKey) : text.length
    sections[key] = text.slice(start + key.length, end).replace(/^[\s:]+/, '').trim()
  })
  return sections
}

// ─── One section block ────────────────────────────────────────────
function Section({ icon, title, content, accent, mono }) {
  if (!content || content.toLowerCase().includes('none detected') === false && !content) return null
  const isNone = content.toLowerCase().startsWith('none detected')
  return (
    <div style={{
      marginBottom: 12,
      padding: '10px 12px',
      borderRadius: 8,
      background: isNone ? 'var(--bg-lighter)' : (accent || 'var(--bg-white)'),
      border: `1px solid ${isNone ? 'var(--border-light)' : 'var(--border-light)'}`,
      borderLeft: isNone ? undefined : `3px solid ${accent ? 'transparent' : 'var(--border)'}`,
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 5 }}>
        {icon} {title}
      </div>
      <div style={{
        fontSize: 13,
        color: isNone ? 'var(--text-muted)' : 'var(--text-body)',
        lineHeight: 1.6,
        fontFamily: mono ? 'monospace' : 'inherit',
        whiteSpace: mono ? 'pre-wrap' : 'normal',
      }}>
        {content}
      </div>
    </div>
  )
}

// ─── Smart note dumper — paste raw notes, get structured fields ──
export function SmartNoteDumper({ client, contactLogs, onApply }) {
  const [raw, setRaw] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  async function handleParse() {
    if (!raw.trim()) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const parsed = await parseCallNote(raw, client, contactLogs)
      setResult(parsed)
    } catch (e) {
      setError(e.message)
    }
    setLoading(false)
  }

  function handleApply() {
    if (!result) return
    // Build due date from suggested_due_date_days
    let dueDate = null
    if (result.suggested_due_date_days) {
      const d = new Date()
      d.setDate(d.getDate() + result.suggested_due_date_days)
      dueDate = d.toISOString().split('T')[0]
    }
    onApply({
      whatHappened: result.what_happened || raw,
      whatNext: result.what_next || '',
      dueDate,
      stage: result.suggested_stage,
      temperature: result.suggested_temperature,
      painPoint: result.new_pain_point,
    })
    setRaw('')
    setResult(null)
  }

  return (
    <div style={{
      border: '1.5px dashed var(--primary)',
      borderRadius: 10,
      padding: 12,
      marginBottom: 12,
      background: 'var(--primary-light)',
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--primary)', marginBottom: 6, letterSpacing: '0.5px' }}>
        ✦ AI NOTE PARSER — dump your raw notes
      </div>

      {!result ? (
        <>
          <textarea
            value={raw}
            onChange={e => setRaw(e.target.value)}
            placeholder={`Just type freely — e.g.\n"spoke to Rahul, he's interested but boss needs to approve, budget frees up July, wants demo next week, seemed warm"`}
            rows={4}
            style={{
              width: '100%', fontSize: 13, fontFamily: 'inherit',
              padding: '8px 10px', borderRadius: 6,
              border: '1px solid var(--border)', resize: 'vertical',
              background: 'var(--bg-white)',
            }}
            autoFocus
          />
          <button
            onClick={handleParse}
            disabled={loading || !raw.trim()}
            style={{
              marginTop: 8, width: '100%', padding: '8px 0',
              background: loading ? 'var(--text-muted)' : 'var(--primary)',
              color: '#fff', border: 'none', borderRadius: 6,
              fontSize: 13, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? '✦ Analysing...' : '✦ Parse with AI'}
          </button>
          {error && (
            <div style={{ marginTop: 8, fontSize: 12, color: 'var(--error)', padding: '6px 10px', background: 'var(--error-bg)', borderRadius: 6 }}>
              {error}
            </div>
          )}
        </>
      ) : (
        <div>
          {/* Parsed result preview */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
            {result.key_insight && (
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--primary)', padding: '6px 10px', background: 'var(--bg-white)', borderRadius: 6 }}>
                💡 {result.key_insight}
              </div>
            )}

            <div style={{ fontSize: 12, color: 'var(--text-body)', padding: '6px 10px', background: 'var(--bg-white)', borderRadius: 6 }}>
              <span style={{ fontWeight: 700 }}>What happened: </span>{result.what_happened}
            </div>

            {result.what_next && (
              <div style={{ fontSize: 12, color: 'var(--text-body)', padding: '6px 10px', background: 'var(--bg-white)', borderRadius: 6 }}>
                <span style={{ fontWeight: 700 }}>Next: </span>{result.what_next}
                {result.suggested_due_date_days && (
                  <span style={{ color: 'var(--text-muted)' }}> · in {result.suggested_due_date_days} days</span>
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {result.suggested_stage && (
                <span style={{ fontSize: 11, padding: '2px 8px', background: '#E8F2FF', color: 'var(--primary)', borderRadius: 20, fontWeight: 600 }}>
                  Stage → {result.suggested_stage}
                </span>
              )}
              {result.suggested_temperature && (
                <span style={{ fontSize: 11, padding: '2px 8px', background: '#FFF4E5', color: 'var(--warning)', borderRadius: 20, fontWeight: 600 }}>
                  Temp → {result.suggested_temperature}
                </span>
              )}
              {result.buying_signal_detected && (
                <span style={{ fontSize: 11, padding: '2px 8px', background: '#E8F9EE', color: 'var(--success)', borderRadius: 20, fontWeight: 600 }}>
                  🎯 Buying signal
                </span>
              )}
              {result.stall_detected && (
                <span style={{ fontSize: 11, padding: '2px 8px', background: '#FFF0EF', color: 'var(--error)', borderRadius: 20, fontWeight: 600 }}>
                  ⚠️ Stall detected
                </span>
              )}
              {result.decision_maker_mentioned && (
                <span style={{ fontSize: 11, padding: '2px 8px', background: '#F5F5F7', color: 'var(--text-body)', borderRadius: 20, fontWeight: 600 }}>
                  👤 {result.decision_maker_mentioned}
                </span>
              )}
              {result.parse_error && (
                <span style={{ fontSize: 11, padding: '2px 8px', background: '#FFF4E5', color: 'var(--warning)', borderRadius: 20 }}>
                  Could not fully parse — raw note preserved
                </span>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => { setResult(null); setRaw('') }}
              style={{
                flex: 1, padding: '7px 0', background: 'transparent',
                border: '1px solid var(--border)', borderRadius: 6,
                fontSize: 12, fontWeight: 600, cursor: 'pointer', color: 'var(--text-light)',
              }}
            >
              Redo
            </button>
            <button
              onClick={handleApply}
              style={{
                flex: 2, padding: '7px 0', background: 'var(--primary)',
                color: '#fff', border: 'none', borderRadius: 6,
                fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}
            >
              ✓ Apply to log form
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main intelligence panel ──────────────────────────────────────
export default function LeadIntelligencePanel({ client, contactLogs }) {
  const [loading, setLoading] = useState(false)
  const [intel, setIntel] = useState(null)
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(false)

  async function handleAnalyse() {
    setLoading(true)
    setError(null)
    try {
      const result = await getLeadIntelligence(client, contactLogs)
      setIntel(parseIntelligence(result))
    } catch (e) {
      setError(e.message)
    }
    setLoading(false)
  }

  function copyMessage() {
    if (!intel?.['SUGGESTED MESSAGE']) return
    navigator.clipboard.writeText(intel['SUGGESTED MESSAGE'])
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Not yet triggered
  if (!intel && !loading && !error) {
    return (
      <div style={{
        border: '1px solid var(--border-light)',
        borderRadius: 10,
        padding: 14,
        marginBottom: 12,
        background: 'var(--bg-lighter)',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 13, color: 'var(--text-light)', marginBottom: 10 }}>
          AI reads the full contact history and gives you a situational read, psychological assessment, and exact next move.
        </div>
        <button
          onClick={handleAnalyse}
          style={{
            padding: '8px 20px',
            background: 'linear-gradient(135deg, #0071E3, #5856D6)',
            color: '#fff', border: 'none', borderRadius: 20,
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(0,113,227,0.3)',
          }}
        >
          ✦ Analyse this lead
        </button>
        {contactLogs.length === 0 && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
            No contact history yet — analysis will be limited
          </div>
        )}
      </div>
    )
  }

  // Loading
  if (loading) {
    return (
      <div style={{
        border: '1px solid var(--border-light)', borderRadius: 10,
        padding: 20, marginBottom: 12, textAlign: 'center',
        background: 'var(--bg-lighter)',
      }}>
        <div style={{ fontSize: 13, color: 'var(--primary)', fontWeight: 600, marginBottom: 6 }}>
          ✦ Reading {contactLogs.length} interactions...
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          Analysing patterns, objections, buying signals
        </div>
        <div style={{
          marginTop: 12, height: 3, background: 'var(--border-light)',
          borderRadius: 3, overflow: 'hidden',
        }}>
          <div style={{
            height: '100%', width: '60%',
            background: 'linear-gradient(90deg, #0071E3, #5856D6)',
            borderRadius: 3,
            animation: 'shimmer 1.5s ease-in-out infinite',
          }} />
        </div>
      </div>
    )
  }

  // Error
  if (error) {
    return (
      <div style={{
        border: '1px solid var(--border-light)', borderRadius: 10,
        padding: 12, marginBottom: 12,
        background: 'var(--error-bg)',
      }}>
        <div style={{ fontSize: 12, color: 'var(--error)', marginBottom: 8 }}>
          ⚠ {error}
        </div>
        <button onClick={handleAnalyse} style={{
          fontSize: 12, padding: '5px 12px', borderRadius: 6,
          background: 'var(--error)', color: '#fff', border: 'none', cursor: 'pointer',
        }}>
          Retry
        </button>
      </div>
    )
  }

  // Results
  const urgency = intel['URGENCY LEVEL']?.split('\n')[0]?.trim()
  const reasoning = intel['REASONING']?.trim()

  return (
    <div style={{ marginBottom: 12 }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            ✦ AI Intelligence
          </span>
          {urgency && <UrgencyBadge level={urgency} />}
        </div>
        <button
          onClick={handleAnalyse}
          style={{
            fontSize: 11, padding: '3px 10px', borderRadius: 20,
            background: 'transparent', border: '1px solid var(--border)',
            color: 'var(--text-light)', cursor: 'pointer',
          }}
        >
          ↻ Refresh
        </button>
      </div>

      {reasoning && (
        <div style={{ fontSize: 12, color: 'var(--text-light)', marginBottom: 10, fontStyle: 'italic' }}>
          {reasoning}
        </div>
      )}

      <Section
        icon="📍"
        title="Situation"
        content={intel['SITUATION SUMMARY']}
      />

      <Section
        icon="🧠"
        title="Psychological reading"
        content={intel['PSYCHOLOGICAL READING']}
        accent="var(--bg-lighter)"
      />

      <Section
        icon="🚩"
        title="Red flags"
        content={intel['RED FLAGS']}
        accent={intel['RED FLAGS']?.toLowerCase().startsWith('none') ? undefined : '#FFF0EF'}
      />

      <Section
        icon="🎯"
        title="Buying signals"
        content={intel['BUYING SIGNALS']}
        accent={intel['BUYING SIGNALS']?.toLowerCase().startsWith('none') ? undefined : '#E8F9EE'}
      />

      <Section
        icon="⚡"
        title="Recommended next action"
        content={intel['RECOMMENDED NEXT ACTION']}
        accent="#E8F2FF"
      />

      {/* Suggested WhatsApp message — with copy button */}
      {intel['SUGGESTED MESSAGE'] && (
        <div style={{
          marginBottom: 12, padding: '10px 12px',
          borderRadius: 8, background: '#E8F9EE',
          border: '1px solid #B8EDD0',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#1A7A3F', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
              💬 Suggested WhatsApp message
            </div>
            <button
              onClick={copyMessage}
              style={{
                fontSize: 11, padding: '2px 10px', borderRadius: 20,
                background: copied ? '#34C759' : 'transparent',
                border: `1px solid ${copied ? '#34C759' : '#B8EDD0'}`,
                color: copied ? '#fff' : '#1A7A3F',
                cursor: 'pointer', fontWeight: 600, transition: 'all 0.2s',
              }}
            >
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-body)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
            {intel['SUGGESTED MESSAGE']}
          </div>
        </div>
      )}

      <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'right' }}>
        Based on {contactLogs.length} logged interaction{contactLogs.length !== 1 ? 's' : ''}
      </div>
    </div>
  )
}
