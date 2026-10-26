import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ComposedChart, Bar, Scatter, BarChart
} from 'recharts'
import { useMemo } from 'react'
import { formatCurrency, todayStr, toDateStr, datePart, addDays } from '../utils'
import { addMonths } from '../utils/paymentMath'

// Last n months, oldest first, as { key: 'YYYY-MM', label: 'Oct 26' }
function lastMonths(n) {
  const thisMonthStart = todayStr().slice(0, 7) + '-01'
  return Array.from({ length: n }, (_, i) => {
    const key = addMonths(thisMonthStart, i - (n - 1)).slice(0, 7)
    const [y, m] = key.split('-').map(Number)
    return { key, label: new Date(y, m - 1, 1).toLocaleDateString('en-IN', { year: '2-digit', month: 'short' }) }
  })
}
const monthOf = timestamp => (datePart(timestamp) || '').slice(0, 7)

// ════════════════════════════════════════════════════════════════════════════════════════
function MetricCard({ label, value, comparison, color = 'var(--text-dark)', trend = null, borderColor = 'var(--primary)' }) {
  return (
    <div style={{
      background: 'var(--bg-white)',
      border: '1px solid var(--border-light)',
      borderTop: `3px solid ${borderColor}`,
      borderRadius: 12,
      padding: '16px',
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      minWidth: 140,
    }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, color, lineHeight: 1.2 }}>
        {value}
      </div>
      {comparison && (
        <div style={{ fontSize: 12, color: trend === 'up' ? 'var(--success)' : trend === 'down' ? 'var(--error)' : 'var(--text-muted)' }}>
          {trend === 'up' && '↑ '}{trend === 'down' && '↓ '}{comparison}
        </div>
      )}
    </div>
  )
}

function BusinessScoreboard({ clients, deals, payments }) {
  // Month keys as 'YYYY-MM' (local), compared against the date part of stored timestamps
  const thisMonth = todayStr().slice(0, 7)
  const lastMonth = addMonths(thisMonth + '-01', -1).slice(0, 7)
  const inMonth = (timestamp, month) => (datePart(timestamp) || '').startsWith(month)
  const sumBy = (rows, field) => rows.reduce((s, r) => s + Number(r[field] || 0), 0)
  const pctChange = (now, before) => Math.round(((now - before) / before) * 100)

  const active = clients.filter(c => c.stage === 'active')
  const dead = clients.filter(c => c.stage === 'dead')

  // Revenue = deals closed in the month (deals.created_at is the close date)
  const dealsThisMonth = deals.filter(d => inMonth(d.created_at, thisMonth))
  const dealsLastMonth = deals.filter(d => inMonth(d.created_at, lastMonth))
  const revenueThisMonth = sumBy(dealsThisMonth, 'deal_value')
  const revenueLastMonth = sumBy(dealsLastMonth, 'deal_value')

  const cashCollectedThisMonth = sumBy(payments.filter(p => p.paid && inMonth(p.paid_at, thisMonth)), 'amount')

  const pendingPayments = payments.filter(p => !p.paid)
  const pendingCollection = sumBy(pendingPayments, 'amount')

  const dealsWonThisMonth = active.filter(c => inMonth(c.won_at, thisMonth)).length
  const dealsWonLastMonth = active.filter(c => inMonth(c.won_at, lastMonth)).length

  const avgDealValue = dealsThisMonth.length ? revenueThisMonth / dealsThisMonth.length : 0
  const avgDealLastMonth = dealsLastMonth.length ? revenueLastMonth / dealsLastMonth.length : 0

  const closedCount = active.length + dead.length
  const winRate = closedCount > 0 ? Math.round((active.length / closedCount) * 100) : null

  // Reserve is a points score (not rupees): 1 per contacted lead, 7 per proposal sent in the last 30 days
  const contacted = clients.filter(c => c.stage === 'contacted').length
  const proposals = clients.filter(c => c.stage === 'proposal')
  const freshProposalCutoff = addDays(todayStr(), -30)
  const freshProposals = proposals.filter(c => c.proposal_sent_at && datePart(c.proposal_sent_at) >= freshProposalCutoff).length
  const reservePoints = contacted + freshProposals * 7
  const proposalValue = sumBy(proposals, 'potential_revenue')

  return (
    <div className="dash-card">
      <div className="dash-card-title" style={{ marginBottom: 16 }}>Business Scoreboard</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
        {/* Revenue Section */}
        <MetricCard 
          label="Revenue This Month"
          value={formatCurrency(revenueThisMonth)}
          comparison={revenueLastMonth > 0 ? `${pctChange(revenueThisMonth, revenueLastMonth)}% vs last month` : 'Nothing last month'}
          trend={revenueThisMonth > revenueLastMonth ? 'up' : 'down'}
          borderColor="var(--primary)"
        />
        <MetricCard 
          label="Cash Collected"
          value={formatCurrency(cashCollectedThisMonth)}
          comparison="paid this month"
          color="var(--success)"
          borderColor="var(--success)"
        />
        <MetricCard 
          label="Pending Collection"
          value={formatCurrency(pendingCollection)}
          comparison={pendingPayments.length > 0 ? `${pendingPayments.length} unpaid payment${pendingPayments.length === 1 ? '' : 's'}` : 'All paid'}
          color={pendingCollection > 0 ? 'var(--warning)' : 'var(--success)'}
          borderColor="var(--warning)"
        />

        {/* Sales Output Section */}
        <MetricCard 
          label="Deals Won This Month"
          value={dealsWonThisMonth}
          comparison={`${dealsWonThisMonth - dealsWonLastMonth > 0 ? '+' : ''}${dealsWonThisMonth - dealsWonLastMonth} vs last month`}
          trend={dealsWonThisMonth > dealsWonLastMonth ? 'up' : 'down'}
          borderColor="var(--primary)"
        />
        <MetricCard 
          label="Average Deal Value"
          value={formatCurrency(Math.round(avgDealValue))}
          comparison={avgDealLastMonth > 0 ? `${pctChange(avgDealValue, avgDealLastMonth)}% vs last month` : 'Nothing last month'}
          color="var(--primary)"
          borderColor="var(--primary)"
        />
        <MetricCard 
          label="Win Rate"
          value={winRate === null ? '—' : `${winRate}%`}
          comparison={`${active.length} won, ${dead.length} lost`}
          color={winRate > 30 ? 'var(--success)' : winRate > 10 ? 'var(--primary)' : 'var(--error)'}
          borderColor="#5E8FC0"
        />

        {/* Future Section */}
        <MetricCard 
          label="Pipeline Reserve"
          value={`${reservePoints} pts`}
          comparison={`${contacted} contacted + ${freshProposals} fresh proposals × 7`}
          color="var(--primary)"
          borderColor="var(--primary)"
        />
        <MetricCard 
          label="Active Proposals"
          value={proposals.length}
          comparison={proposalValue > 0 ? `${formatCurrency(proposalValue)} potential` : 'No value entered'}
          color="var(--primary)"
          borderColor="#5E8FC0"
        />
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════════════════
// SECTION: REVENUE REALIZATION (6-MONTH HISTORY)
// ════════════════════════════════════════════════════════════════════════════════════════
function RevenueRealization({ deals }) {
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
    <div className="dash-card">
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

// ════════════════════════════════════════════════════════════════════════════════════════
// SECTION: PIPELINE RESERVE GRAPH (CORE GRAPH — PRESERVED)
// ════════════════════════════════════════════════════════════════════════════════════════
function PipelineReserveGraph({ clients, pipelineSnapshots }) {
  const today = todayStr()
  
  const PROPOSAL_EXPIRY_DAYS = 30
  const WIN_DEDUCTION = 24

  const pipelinePointsData = useMemo(() => {
    // Build map of won_at dates
    const wonByDate = {}
    clients.forEach(c => {
      if (c.won_at && c.stage === 'active') {
        const d = c.won_at.slice(0, 10)
        if (d !== today) wonByDate[d] = (wonByDate[d] || 0) + 1
      }
    })

    // Historical snapshots
    const frozen = pipelineSnapshots
      .filter(s => s.snapshot_date !== today)
      .sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date))
      .map(s => {
        const snapshotWins = s.wins_today || 0
        const clientWins = wonByDate[s.snapshot_date] || 0
        const wins = Math.max(snapshotWins, clientWins)
        return {
          date: s.snapshot_date,
          label: new Date(s.snapshot_date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
          reserve: s.points,
          proposals: s.proposal_count,
          wins: wins > 0 ? wins : null,
          pointsRemoved: s.win_points_removed > 0 ? s.win_points_removed : null,
        }
      })

    // Today: live calculation
    const liveContactedCount = clients.filter(c => c.stage === 'contacted').length
    const liveProposalCount = clients.filter(c => {
      if (c.stage !== 'proposal') return false
      const sentAt = c.proposal_sent_at || c.updated_at
      if (!sentAt) return true
      const daysSinceSent = (Date.now() - new Date(sentAt).getTime()) / (1000 * 60 * 60 * 24)
      return daysSinceSent <= PROPOSAL_EXPIRY_DAYS
    }).length
    const wonTodayList = clients.filter(c => c.won_at && c.won_at.slice(0, 10) === today)
    const wonTodayPoints = wonTodayList.length * WIN_DEDUCTION

    const todayPoint = {
      date: today,
      label: new Date(today + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
      reserve: Math.max(0, liveContactedCount * 1 + liveProposalCount * 7 - wonTodayPoints),
      proposals: liveProposalCount,
      wins: wonTodayList.length > 0 ? wonTodayList.length : null,
      pointsRemoved: wonTodayPoints > 0 ? wonTodayPoints : null,
    }

    return [...frozen, todayPoint]
  }, [pipelineSnapshots, clients, today])

  const currentPoints = pipelinePointsData.length > 0
    ? pipelinePointsData[pipelinePointsData.length - 1].reserve
    : null
  const currentProposals = pipelinePointsData.length > 0
    ? pipelinePointsData[pipelinePointsData.length - 1].proposals
    : null

  return (
    <div className="dash-card">
      <div className="dash-card-title">Pipeline Reserve — Deal Machine Health</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
        Reserve points: 1 per contacted lead + 7 per proposal sent in the last 30 days. Green dots = deals won = reserve released.
      </div>

      {pipelinePointsData.length === 0 ? (
        <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
          No pipeline data yet
        </div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={pipelinePointsData} margin={{ top: 20, right: 8, left: -24, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
              <XAxis 
                dataKey="label" 
                tick={{ fontSize: 10, fill: 'var(--text-muted)' }} 
                interval={Math.max(0, Math.floor(pipelinePointsData.length / 8) - 1)}
              />
              <YAxis yAxisId="reserve" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} allowDecimals={false} />
              <YAxis yAxisId="proposals" orientation="right" tick={{ fontSize: 10, fill: '#5E8FC0' }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid var(--border-light)' }}
                formatter={(v, name) => {
                  if (name === 'reserve') return [v, 'Reserve points']
                  if (name === 'proposals') return [v, 'Active proposals']
                  if (name === 'wins') return [v, 'Deal won']
                  if (name === 'pointsRemoved') return [`-${v}`, 'Points removed by win']
                  return [v, name]
                }}
              />
              <Line yAxisId="reserve" type="monotone" dataKey="reserve" stroke="var(--primary)" strokeWidth={2.5} dot={false} name="reserve" />
              <Line yAxisId="proposals" type="monotone" dataKey="proposals" stroke="#5E8FC0" strokeWidth={1.5} dot={false} strokeDasharray="4 2" name="proposals" />
              <Scatter
                yAxisId="reserve"
                dataKey="wins"
                fill="#34C759"
                name="wins"
                shape={(props) => {
                  const { cx, cy, payload } = props
                  if (!payload?.wins) return null
                  return (
                    <g>
                      <circle cx={cx} cy={cy} r={5} fill="#34C759" />
                      {payload.pointsRemoved && (
                        <text 
                          x={cx} 
                          y={cy - 14} 
                          textAnchor="middle" 
                          fontSize={10} 
                          fontWeight={700} 
                          fill="#34C759"
                          pointerEvents="none"
                        >
                          -{payload.pointsRemoved}
                        </text>
                      )}
                    </g>
                  )
                }}
              />
            </ComposedChart>
          </ResponsiveContainer>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-muted)' }}>
              <div style={{ width: 16, height: 2.5, background: 'var(--primary)', borderRadius: 1 }} />
              Reserve (contacted + recent proposals)
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-muted)' }}>
              <div style={{ width: 16, height: 1.5, background: '#5E8FC0', borderRadius: 1 }} />
              Active proposals (right axis)
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-muted)' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#34C759' }} />
              Deal won
            </div>

            <div style={{ marginLeft: 'auto', display: 'flex', gap: 16 }}>
              {currentPoints !== null && (
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--primary)', lineHeight: 1 }}>{currentPoints}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>reserve pts</div>
                </div>
              )}
              {currentProposals !== null && (
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#5E8FC0', lineHeight: 1 }}>{currentProposals}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>proposals</div>
                </div>
              )}
            </div>
          </div>

        </>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════════════════
function ContactActivityGraph({ contactLogs }) {
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

// ════════════════════════════════════════════════════════════════════════════════════════
// SECTION: SALES CYCLE / EFFICIENCY (MONTHLY TREND)
// ════════════════════════════════════════════════════════════════════════════════════════
function SalesCycleAnalysis({ clients, contactLogs }) {
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
              <div style={{ fontSize: 18, fontWeight: 800, color: '#FF9500' }}>
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

// ════════════════════════════════════════════════════════════════════════════════════════
// SECTION: PIPELINE AGE
// ════════════════════════════════════════════════════════════════════════════════════════
function PipelineAge({ clients }) {
  const today = new Date()
  const pipeline = clients.filter(c => !['active', 'dead'].includes(c.stage))

  const ageGroups = {
    '0-7d': 0,
    '8-14d': 0,
    '15-30d': 0,
    '31-60d': 0,
    '60+d': 0,
  }

  const proposalAgeGroups = {
    '0-7d': 0,
    '8-14d': 0,
    '15-30d': 0,
    '30+d': 0,
  }

  pipeline.forEach(c => {
    if (!c.last_contacted_at) {
      ageGroups['60+d']++
      return
    }

    const daysOld = Math.floor((today - new Date(c.last_contacted_at)) / 86400000)
    if (daysOld <= 7) ageGroups['0-7d']++
    else if (daysOld <= 14) ageGroups['8-14d']++
    else if (daysOld <= 30) ageGroups['15-30d']++
    else if (daysOld <= 60) ageGroups['31-60d']++
    else ageGroups['60+d']++
  })

  const proposals = clients.filter(c => c.stage === 'proposal' && c.proposal_sent_at)
  proposals.forEach(p => {
    const daysOld = Math.floor((today - new Date(p.proposal_sent_at)) / 86400000)
    if (daysOld <= 7) proposalAgeGroups['0-7d']++
    else if (daysOld <= 14) proposalAgeGroups['8-14d']++
    else if (daysOld <= 30) proposalAgeGroups['15-30d']++
    else proposalAgeGroups['30+d']++
  })

  const ageData = Object.entries(ageGroups).map(([age, count]) => ({ age, count }))
  const proposalAgeData = Object.entries(proposalAgeGroups).map(([age, count]) => ({ age, count }))

  return (
    <div className="dash-card">
      <div className="dash-card-title">Pipeline Age — Proposal Stalling Risk</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
        How long have opportunities been sitting? Older proposals need urgency.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 12 }}>All Pipeline</div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={ageData} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
              <XAxis dataKey="age" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
              <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} />
              <Bar dataKey="count" fill="var(--primary)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 12 }}>Proposals Only (Risk)</div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={proposalAgeData} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
              <XAxis dataKey="age" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
              <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} />
              <Bar dataKey="count" fill={proposalAgeGroups['30+d'] > 0 ? 'var(--error)' : 'var(--primary)'} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {proposalAgeGroups['30+d'] > 0 && (
        <div style={{ marginTop: 16, padding: '12px', background: '#fff3cd', borderRadius: 8, fontSize: 12, color: '#856404' }}>
          ⚠️ {proposalAgeGroups['30+d']} proposals older than 30 days — follow up or close
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════════════════
// SECTION: BOTTLENECK ANALYSIS
// ════════════════════════════════════════════════════════════════════════════════════════
function BottleneckAnalysis({ clients }) {
  const count = stage => clients.filter(c => c.stage === stage).length
  const stages = { lead: count('lead'), contacted: count('contacted'), proposal: count('proposal'), active: count('active') }

  // A lead that is now at "proposal" has also passed "contacted", so each step counts
  // everyone who reached it or went further. Dead leads are left out: we don't record
  // how far they got before dying.
  const funnel = [
    { stage: 'Lead', reached: stages.lead + stages.contacted + stages.proposal + stages.active },
    { stage: 'Contacted', reached: stages.contacted + stages.proposal + stages.active },
    { stage: 'Proposal', reached: stages.proposal + stages.active },
    { stage: 'Won', reached: stages.active },
  ]
  const rate = (to, from) => (from > 0 ? Math.round((to / from) * 100) : null)
  const steps = funnel.slice(1).map((step, i) => ({
    label: `${funnel[i].stage} → ${step.stage}`,
    pct: rate(step.reached, funnel[i].reached),
  }))
  const maxReached = Math.max(...funnel.map(f => f.reached), 1)

  let bottleneck = null
  if (stages.contacted === 0 && stages.lead > 5) {
    bottleneck = '⚠️ Too many unworked leads — increase contact activity'
  } else if (stages.proposal > 0 && stages.active === 0 && stages.proposal > stages.contacted) {
    bottleneck = '⚠️ Proposals stuck — follow-up cadence weak or offer not compelling'
  } else if (stages.contacted > stages.proposal * 2 && stages.proposal > 0) {
    bottleneck = '⚠️ Leads not converting to proposals — discovery or demo gap'
  }

  const today = todayStr()
  const overdue = clients.filter(c =>
    !['active', 'dead'].includes(c.stage) && c.next_action_due && c.next_action_due < today
  ).length
  if (overdue > 5) bottleneck = `⚠️ ${overdue} overdue follow-ups — execution issue`

  return (
    <div className="dash-card">
      <div className="dash-card-title">Sales Funnel & Bottleneck Analysis</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
        How many leads reached each stage (dead leads excluded).
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        <div>
          {funnel.map((item, idx) => (
            <div key={item.stage} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <div style={{ fontSize: 12, fontWeight: 600 }}>{item.stage}</div>
                <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--primary)' }}>{item.reached}</div>
              </div>
              <div style={{ height: 24, background: 'var(--bg-light)', borderRadius: 6, overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${(item.reached / maxReached) * 100}%`,
                  background: idx === funnel.length - 1 ? 'var(--success)' : 'var(--primary)',
                  transition: 'width 0.3s',
                }} />
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
          {steps.map(step => (
            <div key={step.label} style={{ background: 'var(--bg-light)', borderRadius: 8, padding: '12px' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{step.label}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--primary)', lineHeight: 1 }}>
                {step.pct === null ? '—' : `${step.pct}%`}
              </div>
            </div>
          ))}
        </div>
      </div>

      {bottleneck && (
        <div style={{ marginTop: 16, padding: '12px', background: '#fff3cd', borderRadius: 8, fontSize: 12, color: '#856404' }}>
          {bottleneck}
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════════════════
// MAIN DASHBOARD COMPONENT
// ════════════════════════════════════════════════════════════════════════════════════════
export default function DashboardRedesign({ clients = [], contactLogs = [], deals = [], payments = [], pipelineSnapshots = [] }) {
  const isLoading = clients.length === 0 && contactLogs.length === 0

  if (isLoading) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
        Loading dashboard…
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: '24px' }}>
      {/* Section 1: Business Scoreboard */}
      <BusinessScoreboard clients={clients} deals={deals} payments={payments} />

      {/* Section 2: THE THREE CORE GRAPHS */}
      {/* Graph 1: Contact Activity */}
      <ContactActivityGraph contactLogs={contactLogs} />

      {/* Section 3: Revenue Realization */}
      <RevenueRealization deals={deals} />

      {/* Graph 2: Pipeline Reserve (THE MOST IMPORTANT) */}
      <PipelineReserveGraph clients={clients} pipelineSnapshots={pipelineSnapshots} />

      {/* Graph 3: Sales Cycle */}
      <SalesCycleAnalysis clients={clients} contactLogs={contactLogs} />

      {/* Section 4: Sales Funnel & Bottleneck Analysis */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        <BottleneckAnalysis clients={clients} />
        <PipelineAge clients={clients} />
      </div>
    </div>
  )
}
