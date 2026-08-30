import { useState, useMemo } from 'react'
import { supabase } from '../supabase'
import { winLossAnalysisSchema } from '../schemas/salesProcessSchemas'

const WIN_REASONS = ['better_fit', 'price', 'relationship', 'timing', 'urgency', 'other']
const LOSS_REASONS = ['price', 'competitor', 'timeline', 'budget', 'authority', 'need', 'other']

// Suggests a primary reason from objections logged during the sales cycle
// (most frequent objection_type on this client's contact_log), but the
// rep can always override.
function suggestReason(outcome, contactLogs) {
  if (!contactLogs?.length) return outcome === 'won' ? 'better_fit' : 'other'
  const counts = {}
  for (const log of contactLogs) {
    if (log.objection_type) counts[log.objection_type] = (counts[log.objection_type] || 0) + 1
  }
  const topObjection = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0]
  if (outcome === 'lost' && topObjection && LOSS_REASONS.includes(topObjection)) return topObjection
  if (outcome === 'won') return 'better_fit'
  return 'other'
}

// Filled after a deal closes (won or lost). Auto-suggests a reason based
// on objections logged for the client during the sales cycle.
export default function WinLossAnalysisForm({ deal, contactLogs = [], onSaved, onCancel }) {
  const suggested = useMemo(() => suggestReason(deal?.outcome || 'won', contactLogs), [deal, contactLogs])
  const [form, setForm] = useState({
    outcome: deal?.outcome === 'lost' ? 'lost' : 'won',
    primary_reason: suggested,
    secondary_reasons: [],
    competitive_context: '',
    estimated_deal_value: deal?.deal_value || '',
    lessons_learned: '',
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const reasonOptions = form.outcome === 'won' ? WIN_REASONS : LOSS_REASONS

  function toggleSecondary(reason) {
    setForm(f => ({
      ...f,
      secondary_reasons: f.secondary_reasons.includes(reason)
        ? f.secondary_reasons.filter(r => r !== reason)
        : [...f.secondary_reasons, reason],
    }))
  }

  async function save() {
    setError('')
    const result = winLossAnalysisSchema.safeParse({
      deal_id: deal.id,
      outcome: form.outcome,
      primary_reason: form.primary_reason,
      secondary_reasons: form.secondary_reasons,
      competitive_context: form.competitive_context || null,
      estimated_deal_value: form.estimated_deal_value === '' ? null : Number(form.estimated_deal_value),
      lessons_learned: form.lessons_learned || null,
    })
    if (!result.success) {
      setError(result.error.issues[0]?.message || 'Invalid win/loss entry')
      return
    }

    setSaving(true)
    try {
      const { data, error: insertError } = await supabase.from('win_loss_analysis').insert(result.data).select().single()
      if (insertError) throw insertError

      const dealUpdate = form.outcome === 'won'
        ? { win_reason: form.primary_reason, forecast_status: 'closed_won' }
        : { loss_reason: form.primary_reason, forecast_status: 'closed_lost' }
      await supabase.from('deals').update(dealUpdate).eq('id', deal.id)

      onSaved?.(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ background: 'white', borderRadius: '8px', border: '1px solid #e5e7eb', padding: '20px' }}>
      <h3 style={{ margin: '0 0 16px 0', fontSize: '15px', fontWeight: '700' }}>Win / Loss Analysis</h3>

      <div style={{ marginBottom: '12px', display: 'flex', gap: '8px' }}>
        {['won', 'lost'].map(outcome => (
          <button
            key={outcome}
            onClick={() => setForm({ ...form, outcome, primary_reason: suggestReason(outcome, contactLogs), secondary_reasons: [] })}
            style={{
              flex: 1, padding: '10px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '700',
              background: form.outcome === outcome ? (outcome === 'won' ? '#10b981' : '#ef4444') : '#f3f4f6',
              color: form.outcome === outcome ? 'white' : '#333',
            }}
          >
            {outcome === 'won' ? '🏆 Won' : '❌ Lost'}
          </button>
        ))}
      </div>

      <div style={{ marginBottom: '12px' }}>
        <label style={labelStyle}>Primary reason (suggested: {suggested})</label>
        <select value={form.primary_reason} onChange={e => setForm({ ...form, primary_reason: e.target.value })} style={inputStyle}>
          {reasonOptions.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>

      <div style={{ marginBottom: '12px' }}>
        <label style={labelStyle}>Secondary reasons</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {reasonOptions.filter(r => r !== form.primary_reason).map(r => (
            <button
              key={r} type="button" onClick={() => toggleSecondary(r)}
              style={{
                padding: '6px 10px', borderRadius: '999px', fontSize: '12px', cursor: 'pointer',
                border: form.secondary_reasons.includes(r) ? 'none' : '1px solid #ddd',
                background: form.secondary_reasons.includes(r) ? '#e0e7ff' : 'white',
                color: form.secondary_reasons.includes(r) ? '#3730a3' : '#333',
              }}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: '12px' }}>
        <label style={labelStyle}>Competitive context</label>
        <input value={form.competitive_context} onChange={e => setForm({ ...form, competitive_context: e.target.value })} style={inputStyle} />
      </div>

      <div style={{ marginBottom: '12px' }}>
        <label style={labelStyle}>Estimated deal value</label>
        <input type="number" value={form.estimated_deal_value} onChange={e => setForm({ ...form, estimated_deal_value: e.target.value })} style={inputStyle} />
      </div>

      <div style={{ marginBottom: '16px' }}>
        <label style={labelStyle}>Lessons learned</label>
        <textarea value={form.lessons_learned} onChange={e => setForm({ ...form, lessons_learned: e.target.value })} style={{ ...inputStyle, minHeight: '70px' }} />
      </div>

      {error && <div style={{ color: '#ef4444', fontSize: '12px', marginBottom: '8px' }}>{error}</div>}

      <div style={{ display: 'flex', gap: '8px' }}>
        <button onClick={save} disabled={saving} style={{ padding: '10px 16px', border: 'none', background: '#007AFF', color: 'white', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' }}>
          {saving ? 'Saving...' : 'Save analysis'}
        </button>
        {onCancel && (
          <button onClick={onCancel} style={{ padding: '10px 16px', border: '1px solid #ddd', background: 'white', borderRadius: '6px', cursor: 'pointer' }}>
            Cancel
          </button>
        )}
      </div>
    </div>
  )
}

const labelStyle = { display: 'block', fontSize: '11px', color: '#666', fontWeight: '600', marginBottom: '4px', textTransform: 'uppercase' }
const inputStyle = { width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }
