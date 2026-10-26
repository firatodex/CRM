import { useState } from 'react'
import { parseCallNote } from '../gemini'
import { daysFromToday } from '../utils'

export default function SmartNoteDumper({ client, contactLogs, onApply }) {
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
      dueDate = daysFromToday(result.suggested_due_date_days)
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
