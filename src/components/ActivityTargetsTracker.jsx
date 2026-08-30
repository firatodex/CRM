import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../supabase'
import { generateWeeklyActivitySummary } from '../utils/salesMetrics'

const METRIC_LABELS = {
  cold_calls: 'Cold calls',
  followups: 'Follow-ups',
  in_person_meetings: 'In-person meetings',
  discoveries: 'Discoveries',
  proposals: 'Proposals sent',
  closes: 'Closes',
}

const METHOD_LABELS = { call: 'Phone', whatsapp: 'WhatsApp', in_person: 'In-person', email: 'Email', proposal: 'Proposal' }

function startOfWeek(date) {
  const d = new Date(date)
  const day = d.getDay()
  const diff = (day === 0 ? -6 : 1) - day // Monday as week start
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function barColor(pct) {
  if (pct > 100) return '#10b981'
  if (pct >= 80) return '#f59e0b'
  return '#ef4444'
}

// Weekly target vs. actual view, with a breakdown by contact method.
export default function ActivityTargetsTracker({ userId }) {
  const [target, setTarget] = useState(null)
  const [contactLogs, setContactLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const weekStart = useMemo(() => startOfWeek(new Date()), [])

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const weekEnd = new Date(weekStart.getTime() + 7 * 86400000)

      const { data: targets, error: targetsError } = await supabase
        .from('sales_activity_targets')
        .select('*')
        .eq('period', 'weekly')
        .order('effective_from', { ascending: false })
        .limit(1)
      if (targetsError) throw targetsError

      const { data: logs, error: logsError } = await supabase
        .from('contact_log')
        .select('*')
        .gte('contacted_at', weekStart.toISOString())
        .lt('contacted_at', weekEnd.toISOString())
      if (logsError) throw logsError

      setTarget((targets && targets[0]) || null)
      setContactLogs(logs || [])
    } catch (err) {
      console.error('Error loading activity targets:', err)
    } finally {
      setLoading(false)
    }
  }

  const summary = useMemo(
    () => generateWeeklyActivitySummary(userId, weekStart, contactLogs, target),
    [userId, weekStart, contactLogs, target]
  )

  const methodBreakdown = useMemo(() => {
    const counts = {}
    for (const log of contactLogs) {
      const key = log.method || 'other'
      counts[key] = (counts[key] || 0) + 1
    }
    return counts
  }, [contactLogs])

  if (loading) return <div style={{ padding: '24px', color: '#666' }}>Loading activity targets...</div>

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: '700', margin: 0 }}>Activity Targets</h1>
        <p style={{ color: '#666', margin: '8px 0 0 0' }}>
          Week of {weekStart.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
        </p>
      </div>

      {!target && (
        <div style={{ marginBottom: '16px', padding: '12px 16px', background: '#fffbeb', borderRadius: '8px', fontSize: '13px', color: '#92400e' }}>
          No weekly targets configured yet — add a row to sales_activity_targets to see % progress.
        </div>
      )}

      <div style={{ background: 'white', borderRadius: '8px', border: '1px solid #e5e7eb', padding: '20px', marginBottom: '20px' }}>
        {Object.entries(summary.metrics).map(([key, m]) => (
          <div key={key} style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '13px' }}>
              <span style={{ fontWeight: '600' }}>{METRIC_LABELS[key]}</span>
              <span style={{ color: barColor(m.pct), fontWeight: '700' }}>{m.actual} / {m.target} ({m.pct}%)</span>
            </div>
            <div style={{ height: '10px', background: '#e5e7eb', borderRadius: '5px', overflow: 'hidden' }}>
              <div style={{ width: `${Math.min(100, m.pct)}%`, height: '100%', background: barColor(m.pct) }} />
            </div>
          </div>
        ))}
      </div>

      <div style={{ background: 'white', borderRadius: '8px', border: '1px solid #e5e7eb', padding: '20px' }}>
        <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '700' }}>Breakdown by method</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: '10px' }}>
          {Object.entries(METHOD_LABELS).map(([key, label]) => (
            <div key={key} style={{ textAlign: 'center', padding: '12px', background: '#f9fafb', borderRadius: '8px' }}>
              <div style={{ fontSize: '22px', fontWeight: '700' }}>{methodBreakdown[key] || 0}</div>
              <div style={{ fontSize: '11px', color: '#666', fontWeight: '600' }}>{label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
