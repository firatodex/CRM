import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { lastMonths, monthOf } from './dateBuckets'

// ════════════════════════════════════════════════════════════════════════════════════════
// SECTION: SALES CYCLE / EFFICIENCY (MONTHLY TREND)
// ════════════════════════════════════════════════════════════════════════════════════════
export default function SalesCycleAnalysis({ clients, contactLogs }) {
  const active = clients.filter(c => c.stage === 'active' && c.won_at)

  const cycles = active
    .map(c => {
      const clientLogs = contactLogs.filter(l => l.client_id === c.id)
      if (clientLogs.length === 0) return null
      const firstContact = clientLogs.reduce((min, l) =>
        new Date(l.contacted_at) < new Date(min.contacted_at) ? l : min
      )
      const daysToClose = Math.round(
        (new Date(c.won_at) - new Date(firstContact.contacted_at)) / 86400000
      )
      return {
        daysToClose: Math.max(0, daysToClose),
        wonDate: c.won_at,
      }
    })
    .filter(v => v !== null)

  const trendData = lastMonths(6).map(({ key, label }) => {
    const days = cycles.filter(c => monthOf(c.wonDate) === key).map(c => c.daysToClose)
    return {
      month: label,
      avgDays: days.length > 0 ? Math.round(days.reduce((a, b) => a + b, 0) / days.length) : 0,
      count: days.length,
    }
  })

  const allCycles = cycles.length
  const currentAvg = cycles.length > 0 
    ? Math.round(cycles.reduce((a, b) => a + b.daysToClose, 0) / cycles.length)
    : 0
  const currentMedian = cycles.length > 0
    ? [...cycles].sort((a, b) => a.daysToClose - b.daysToClose)[Math.floor(cycles.length / 2)].daysToClose
    : 0

  return (
    <div className="dash-card">
      <div className="dash-card-title">Sales Cycle — First Contact to Close</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
        Historical trend: is your sales cycle improving? Lower = faster closing.
      </div>

      {trendData.filter(d => d.count > 0).length === 0 ? (
        <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
          No won deals yet to analyze
        </div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={trendData} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid var(--border-light)' }}
                formatter={(v, name) => {
                  if (name === 'avgDays') return [v + ' days', 'Average']
                  if (name === 'count') return [v, 'Deals won']
                  return [v, name]
                }}
              />
              <Line 
                type="monotone" 
                dataKey="avgDays" 
                stroke="var(--primary)" 
                strokeWidth={2.5} 
                dot={{ fill: 'var(--primary)', r: 5 }}
                activeDot={{ r: 7 }}
                name="avgDays"
              />
            </LineChart>
          </ResponsiveContainer>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginTop: 16 }}>
            <div style={{
              background: 'var(--bg-light)',
              borderRadius: 8,
              padding: '12px',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--primary)' }}>
                {currentAvg}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                Average days (all-time)
              </div>
            </div>
            <div style={{
              background: 'var(--bg-light)',
              borderRadius: 8,
              padding: '12px',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--warning)' }}>
                {currentMedian}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                Median days (typical deal)
              </div>
            </div>
            <div style={{
              background: 'var(--bg-light)',
              borderRadius: 8,
              padding: '12px',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-dark)' }}>
                {allCycles}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                Deals analyzed
              </div>
            </div>
          </div>

          {allCycles < 5 && (
            <div style={{ marginTop: 12, padding: '12px', background: '#fff3cd', borderRadius: 8, fontSize: 12, color: '#856404' }}>
              ⚠️ Small sample size ({allCycles} deals) — trend may not be reliable
            </div>
          )}
        </>
      )}
    </div>
  )
}
