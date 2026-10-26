import {
  Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ComposedChart,
} from 'recharts'
import { formatCurrency } from '../../utils'
import { lastMonths, monthOf } from './dateBuckets'

// ════════════════════════════════════════════════════════════════════════════════════════
// SECTION: REVENUE REALIZATION (6-MONTH HISTORY)
// ════════════════════════════════════════════════════════════════════════════════════════
export default function RevenueRealization({ deals }) {
  const months = lastMonths(6)
  const monthly = months.map(({ key, label }) => {
    const inMonth = deals.filter(d => monthOf(d.created_at) === key)
    const revenue = inMonth.reduce((s, d) => s + Number(d.deal_value || 0), 0)
    return { label, revenue, dealCount: inMonth.length }
  })

  const data = monthly.map(m => ({
    month: m.label,
    revenue: Math.round(m.revenue / 1000), // in thousands for readability
    dealCount: m.dealCount,
    avgDeal: m.dealCount > 0 ? Math.round(m.revenue / m.dealCount) : 0,
  }))

  const totalRevenue = monthly.reduce((s, m) => s + m.revenue, 0)
  const avgMonthly = Math.round(totalRevenue / data.length)
  const latestMonth = data[data.length - 1]
  const prevMonth = data[data.length - 2]
  const monthOverMonthChange = prevMonth && prevMonth.revenue > 0 
    ? Math.round(((latestMonth.revenue - prevMonth.revenue) / prevMonth.revenue) * 100)
    : 0

  return (
    <div className="dash-card revenue-card">
      <div className="dash-card-title">Revenue Realization — Business Scaling</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
        6-month revenue trend (orange) vs deal volume (blue) — is the business actually growing?
      </div>

      {data.length === 0 ? (
        <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-muted)' }}>No deals yet</div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={data} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
              <YAxis yAxisId="revenue" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} label={{ value: '₹K', angle: -90, position: 'insideLeft', offset: 5 }} />
              <YAxis yAxisId="deals" orientation="right" tick={{ fontSize: 10, fill: '#5E8FC0' }} label={{ value: 'Deals', angle: 90, position: 'insideRight', offset: -5 }} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid var(--border-light)' }}
                formatter={(v, name) => {
                  if (name === 'revenue') return [formatCurrency(v * 1000), 'Revenue']
                  if (name === 'dealCount') return [v, 'Deals won']
                  if (name === 'avgDeal') return [formatCurrency(v), 'Avg deal size']
                  return [v, name]
                }}
              />
              {/* Revenue line — orange, left axis */}
              <Line 
                yAxisId="revenue"
                type="monotone" 
                dataKey="revenue" 
                stroke="var(--primary)" 
                strokeWidth={2.5} 
                dot={{ fill: 'var(--primary)', r: 5 }}
                name="revenue"
              />
              {/* Deal count line — blue, right axis */}
              <Line 
                yAxisId="deals"
                type="monotone" 
                dataKey="dealCount" 
                stroke="#5E8FC0" 
                strokeWidth={2.5} 
                dot={{ fill: '#5E8FC0', r: 5 }}
                name="dealCount"
                strokeDasharray="4 2"
              />
            </ComposedChart>
          </ResponsiveContainer>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginTop: 16 }}>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--primary)', lineHeight: 1 }}>
                {formatCurrency(totalRevenue)}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>6-month total</div>
            </div>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#5E8FC0', lineHeight: 1 }}>
                {formatCurrency(avgMonthly)}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>monthly average</div>
            </div>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: latestMonth.revenue > (prevMonth?.revenue || 0) ? 'var(--success)' : 'var(--error)', lineHeight: 1 }}>
                {latestMonth.revenue > 0 ? formatCurrency(latestMonth.revenue * 1000) : '—'}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>latest month</div>
            </div>
            {prevMonth && (
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: monthOverMonthChange > 0 ? 'var(--success)' : monthOverMonthChange < 0 ? 'var(--error)' : 'var(--text-dark)', lineHeight: 1 }}>
                  {monthOverMonthChange > 0 ? '+' : ''}{monthOverMonthChange}%
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>month-over-month</div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-muted)' }}>
              <div style={{ width: 16, height: 2, background: 'var(--primary)', borderRadius: 1 }} />
              Monthly revenue booked
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-muted)' }}>
              <div style={{ width: 16, height: 2, background: '#5E8FC0', borderRadius: 1, opacity: 0.6 }} />
              Deal count (right axis)
            </div>
          </div>
        </>
      )}
    </div>
  )
}
