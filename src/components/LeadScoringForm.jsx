import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../supabase'
import { calculateLeadScore, calculateICPMatch } from '../utils/salesMetrics'
import { leadScoreOverrideSchema } from '../schemas/salesProcessSchemas'

// Shown on the lead detail page: computed ICP match + lead score, a
// breakdown of which scoring rules matched, and a manual override.
export default function LeadScoringForm({ client, onSaved }) {
  const [rules, setRules] = useState([])
  const [icp, setIcp] = useState(null)
  const [loading, setLoading] = useState(true)
  const [overriding, setOverriding] = useState(false)
  const [overrideScore, setOverrideScore] = useState(client?.lead_score || 0)
  const [overrideReason, setOverrideReason] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadScoringData()
  }, [])

  async function loadScoringData() {
    setLoading(true)
    try {
      const [{ data: ruleRows, error: rulesError }, { data: icpRows, error: icpError }] = await Promise.all([
        supabase.from('lead_scoring_rules').select('*').eq('active', true).order('order_sequence'),
        supabase.from('ideal_customer_profile').select('*').limit(1),
      ])
      if (rulesError) throw rulesError
      if (icpError) throw icpError
      setRules(ruleRows || [])
      setIcp((icpRows && icpRows[0]) || null)
    } catch (err) {
      console.error('Error loading scoring data:', err)
    } finally {
      setLoading(false)
    }
  }

  const computedLeadScore = useMemo(() => calculateLeadScore(client, rules), [client, rules])
  const computedICPScore = useMemo(() => (icp ? calculateICPMatch(client, icp) : 0), [client, icp])

  const matchedRules = useMemo(() => {
    return rules.map(rule => {
      const { field, operator, value } = rule.rule_criteria || {}
      const actual = field ? field.split('.').reduce((o, k) => (o == null ? undefined : o[k]), client) : undefined
      let matched = false
      if (actual !== undefined) {
        switch (operator) {
          case '>=': matched = actual >= value; break
          case '<=': matched = actual <= value; break
          case '>': matched = actual > value; break
          case '<': matched = actual < value; break
          case '==': matched = actual == value; break // eslint-disable-line eqeqeq
          case '!=': matched = actual != value; break // eslint-disable-line eqeqeq
          default: matched = false
        }
      }
      return { ...rule, matched, actual }
    })
  }, [rules, client])

  async function saveOverride() {
    setError('')
    const result = leadScoreOverrideSchema.safeParse({
      lead_score: Number(overrideScore),
      qualification_status: client?.qualification_status || 'needs_review',
      override_reason: overrideReason,
    })
    if (!result.success) {
      setError(result.error.issues[0]?.message || 'Invalid override')
      return
    }

    setSaving(true)
    try {
      const { error: updateError } = await supabase
        .from('clients')
        .update({ lead_score: result.data.lead_score, icp_match_score: computedICPScore })
        .eq('id', client.id)
      if (updateError) throw updateError
      setOverriding(false)
      onSaved?.({ ...client, lead_score: result.data.lead_score, icp_match_score: computedICPScore })
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  function scoreColor(score) {
    if (score >= 70) return '#10b981'
    if (score >= 40) return '#f59e0b'
    return '#ef4444'
  }

  if (loading) {
    return <div style={{ padding: '16px', color: '#666' }}>Loading lead score...</div>
  }

  return (
    <div style={{ background: 'white', borderRadius: '8px', border: '1px solid #e5e7eb', padding: '20px' }}>
      <h3 style={{ margin: '0 0 16px 0', fontSize: '15px', fontWeight: '700' }}>Lead Scoring</h3>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
        <div style={{ textAlign: 'center', padding: '16px', background: '#f9fafb', borderRadius: '8px' }}>
          <div style={{ fontSize: '32px', fontWeight: '700', color: scoreColor(computedICPScore) }}>{computedICPScore}</div>
          <div style={{ fontSize: '12px', color: '#666', fontWeight: '600', textTransform: 'uppercase' }}>ICP Match</div>
        </div>
        <div style={{ textAlign: 'center', padding: '16px', background: '#f9fafb', borderRadius: '8px' }}>
          <div style={{ fontSize: '32px', fontWeight: '700', color: scoreColor(computedLeadScore) }}>{computedLeadScore}</div>
          <div style={{ fontSize: '12px', color: '#666', fontWeight: '600', textTransform: 'uppercase' }}>Lead Score</div>
        </div>
      </div>

      <div style={{ marginBottom: '16px' }}>
        <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', fontWeight: '600', color: '#666' }}>Scoring breakdown</h4>
        {matchedRules.length === 0 ? (
          <div style={{ fontSize: '13px', color: '#999' }}>No active scoring rules configured yet.</div>
        ) : (
          <div style={{ display: 'grid', gap: '6px' }}>
            {matchedRules.map(rule => (
              <div key={rule.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px', padding: '8px 10px', background: rule.matched ? '#ecfdf5' : '#f9fafb', borderRadius: '6px' }}>
                <span>{rule.matched ? '✓' : '—'} {rule.rule_name}</span>
                <span style={{ fontWeight: '600', color: rule.matched ? '#10b981' : '#999' }}>
                  {rule.matched ? `+${rule.points_awarded}` : '0'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {!overriding ? (
        <button
          onClick={() => { setOverriding(true); setOverrideScore(computedLeadScore) }}
          style={{ padding: '8px 14px', border: '1px solid #ddd', background: 'white', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}
        >
          Manually override score
        </button>
      ) : (
        <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '12px' }}>
          <label style={{ fontSize: '12px', color: '#666', fontWeight: '600' }}>Override score (0-100)</label>
          <input
            type="number" min="0" max="100" value={overrideScore}
            onChange={e => setOverrideScore(e.target.value)}
            style={{ width: '100%', padding: '8px', margin: '4px 0 8px', border: '1px solid #ddd', borderRadius: '6px' }}
          />
          <label style={{ fontSize: '12px', color: '#666', fontWeight: '600' }}>Reason for override</label>
          <textarea
            value={overrideReason} onChange={e => setOverrideReason(e.target.value)}
            style={{ width: '100%', padding: '8px', margin: '4px 0 8px', border: '1px solid #ddd', borderRadius: '6px', minHeight: '60px' }}
          />
          {error && <div style={{ color: '#ef4444', fontSize: '12px', marginBottom: '8px' }}>{error}</div>}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={saveOverride} disabled={saving} style={{ padding: '8px 14px', border: 'none', background: '#007AFF', color: 'white', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' }}>
              {saving ? 'Saving...' : 'Save override'}
            </button>
            <button onClick={() => setOverriding(false)} style={{ padding: '8px 14px', border: '1px solid #ddd', background: 'white', borderRadius: '6px', cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
