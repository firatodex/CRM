import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { toDateStr, datePart } from '../../utils'

// ════════════════════════════════════════════════════════════════════════════════════════
export default function ContactActivityGraph({ contactLogs }) {
  const WINDOW = 90
  
  // Database stores: "2026-08-12T18:34:15.287+05:30" (already IST with offset)
  // Just extract the date part - no timezone conversion needed!
  const contactsByISTDate = {}
  contactLogs.forEach(l => {
    if (!l.contacted_at) return
    const istDateStr = datePart(l.contacted_at)
    if (!istDateStr) return
    contactsByISTDate[istDateStr] = (contactsByISTDate[istDateStr] || 0) + 1
  })

  const rawCounts = []
  
  // Generate dates for the last 90 days in IST
  const now = new Date()
  for (let i = WINDOW - 1; i >= 0; i--) {
    // Go back i days from today
    const dateObj = new Date(now)
    dateObj.setDate(dateObj.getDate() - i)
    
    // Create IST date string (YYYY-MM-DD)
    const istDateStr = toDateStr(dateObj)
    
    rawCounts.push({
      localDate: istDateStr,
      contacts: contactsByISTDate[istDateStr] || 0,
      daysAgo: i,
      d: dateObj,
    })
  }

  const activityData = rawCounts.map((entry, idx) => {
    const window7 = rawCounts.slice(Math.max(0, idx - 6), idx + 1)
    const avg7 = Math.round((window7.reduce((s, e) => s + e.contacts, 0) / window7.length) * 10) / 10
    const { daysAgo, d, contacts } = entry

    return {
      idx,
      daysAgo,
      fullDate: d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
      showLabel: daysAgo === 0 || d.getDate() === 1 || daysAgo % 14 === 0,
      shortLabel: daysAgo === 0 ? 'Today' : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
      contacts,
      avg7,
    }
  })

  const total30 = activityData.slice(-30).reduce((s, d) => s + d.contacts, 0)
  const prev30 = activityData.slice(-60, -30).reduce((s, d) => s + d.contacts, 0)
  const monthTrend = prev30 > 0 ? Math.round(((total30 - prev30) / prev30) * 100) : 0
  const avg7Today = activityData[activityData.length - 1]?.avg7 || 0

  return (
    <div className="dash-card">
      <div className="dash-card-title">Contact Activity — Feeding the Engine</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
        Daily contacts (blue) vs 7-day average (orange) — are you maintaining consistent activity?
      </div>

      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={activityData} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
          <XAxis 
            dataKey="shortLabel"
            tick={({ x, y, payload }) => {
              const entry = activityData[payload.value]
              if (!entry?.showLabel) return null
              return (
                <text x={x} y={y + 12} textAnchor="middle" fontSize={10} fill="var(--text-muted)">
                  {entry.shortLabel}
                </text>
              )
            }}
          />
          <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid var(--border-light)' }}
            formatter={(v, name) => {
              if (name === 'contacts') return [v, 'Contacts today']
              if (name === 'avg7') return [v, '7-day average']
              return [v, name]
            }}
            labelFormatter={(label, payload) => {
              if (payload?.[0]?.payload?.fullDate) {
                return payload[0].payload.fullDate
              }
              return label
            }}
          />
          {/* Daily contacts — blue line, subtle, smooth curve */}
          <Line type="monotone" dataKey="contacts" stroke="#5E8FC0" strokeWidth={1.5} dot={false} name="contacts" opacity={0.6} />
          {/* 7-day average — orange line, bold, smooth curve */}
          <Line type="monotone" dataKey="avg7" stroke="var(--primary)" strokeWidth={2.5} dot={false} name="avg7" />
        </LineChart>
      </ResponsiveContainer>

      <div style={{ display: 'flex', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
        <div style={{ textAlign: 'left' }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--primary)' }}>
            {Math.round(avg7Today)}/day
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>7-day average</div>
        </div>
        <div style={{ textAlign: 'left' }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: monthTrend > 0 ? 'var(--success)' : monthTrend < 0 ? 'var(--error)' : 'var(--text-dark)' }}>
            {monthTrend > 0 ? '+' : ''}{monthTrend}%
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>30-day trend</div>
        </div>
        <div style={{ textAlign: 'left' }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-dark)' }}>
            {total30}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>last 30 days</div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-muted)' }}>
          <div style={{ width: 16, height: 1.5, background: '#5E8FC0', borderRadius: 1 }} />
          Daily contacts
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-muted)' }}>
          <div style={{ width: 16, height: 2, background: 'var(--primary)', borderRadius: 1 }} />
          7-day moving average
        </div>
      </div>
    </div>
  )
}
