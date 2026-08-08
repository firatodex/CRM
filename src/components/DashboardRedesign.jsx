import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ComposedChart, Bar, Scatter, BarChart, Cell
} from 'recharts'
import { useMemo } from 'react'
import { formatCurrency, todayStr } from '../utils'

// ════════════════════════════════════════════════════════════════════════════════════════
// HELPER: Format date for display
// ════════════════════════════════════════════════════════════════════════════════════════
function toLocalDateStr(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

// ════════════════════════════════════════════════════════════════════════════════════════
// SECTION: BUSINESS SCOREBOARD (8 METRICS)
// ════════════════════════════════════════════════════════════════════════════════════════
function MetricCard({ label, value, comparison, color = 'var(--text-dark)', trend = null }) {
  return (
    <div style={{
      background: 'var(--bg-white)',
      border: '1px solid var(--border-light)',
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
  const today = new Date()
  const currentMonth = today.getMonth()
  const currentYear = today.getFullYear()
  const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1
  const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear

  // ── Money Metrics ──────────────────────────────────────────────────────────
  const active = clients.filter(c => c.stage === 'active')
  const dead = clients.filter(c => c.stage === 'dead')
  const allClosed = [...active, ...dead]

  // Revenue this month (from deals won this month)
  const dealsThisMonth = deals.filter(d => {
    const dDate = new Date(d.created_at)
    return dDate.getMonth() === currentMonth && dDate.getFullYear() === currentYear
  })
  const revenueThisMonth = dealsThisMonth.reduce((s, d) => s + Number(d.deal_value || 0), 0)

  // Cash collected this month
  const paymentsThisMonth = payments.filter(p => {
    if (!p.paid_at || !p.paid) return false
    const pDate = new Date(p.paid_at)
    return pDate.getMonth() === currentMonth && pDate.getFullYear() === currentYear
  })
  const cashCollectedThisMonth = paymentsThisMonth.reduce((s, p) => s + Number(p.amount || 0), 0)

  // Pending collection (paid: false)
  const pendingPayments = payments.filter(p => !p.paid)
  const pendingCollection = pendingPayments.reduce((s, p) => s + Number(p.amount || 0), 0)

  // Deals won this month
  const dealsWonThisMonth = active.filter(c => {
    if (!c.won_at) return false
    const wDate = new Date(c.won_at)
    return wDate.getMonth() === currentMonth && wDate.getFullYear() === currentYear
  }).length

  // Average deal value
  const avgDealValue = dealsThisMonth.length > 0
    ? revenueThisMonth / dealsThisMonth.length
    : 0

  // Win rate (active / (active + dead))
  const closedCount = allClosed.length
  const winRatePercent = closedCount > 0 ? ((active.length / closedCount) * 100).toFixed(0) : '—'

  // Pipeline reserve (contacted + proposal, weighted)
  const contacted = clients.filter(c => c.stage === 'contacted').length
  const proposal = clients.filter(c => c.stage === 'proposal').length
  const proposalRecent = clients.filter(c => 
    c.stage === 'proposal' && c.proposal_sent_at && 
    new Date(c.proposal_sent_at) >= new Date(Date.now() - 30 * 86400000)
  ).length
  const reserve = (contacted * 1) + (proposalRecent * 7)

  // Active proposals
  const activeProposals = proposal

  // Comparisons with last month
  const dealsLastMonth = deals.filter(d => {
    const dDate = new Date(d.created_at)
    return dDate.getMonth() === lastMonth && dDate.getFullYear() === lastMonthYear
  })
  const revenueLastMonth = dealsLastMonth.reduce((s, d) => s + Number(d.deal_value || 0), 0)

  const dealsWonLastMonth = allClosed.filter(c => {
    if (!c.won_at) return false
    const wDate = new Date(c.won_at)
    return wDate.getMonth() === lastMonth && wDate.getFullYear() === lastMonthYear
  }).length

  return (
    <div className="dash-card">
      <div className="dash-card-title" style={{ marginBottom: 16 }}>Business Scoreboard</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
        {/* Revenue Section */}
        <MetricCard 
          label="Revenue This Month"
          value={formatCurrency(revenueThisMonth)}
          comparison={revenueLastMonth > 0 ? `${((revenueThisMonth - revenueLastMonth) / revenueLastMonth * 100).toFixed(0)}% vs last month` : 'First month'}
          trend={revenueThisMonth > revenueLastMonth ? 'up' : 'down'}
        />
        <MetricCard 
          label="Cash Collected"
          value={formatCurrency(cashCollectedThisMonth)}
          comparison={`${cashCollectedThisMonth > revenueThisMonth ? '+' : ''}${formatCurrency(cashCollectedThisMonth - revenueThisMonth)}`}
          color={cashCollectedThisMonth >= revenueThisMonth * 0.7 ? 'var(--success)' : 'var(--text-dark)'}
        />
        <MetricCard 
          label="Pending Collection"
          value={formatCurrency(pendingCollection)}
          comparison={pendingCollection > 0 ? `${(pendingCollection / revenueThisMonth * 100).toFixed(0)}% of revenue` : 'All paid'}
          color={pendingCollection > 0 ? 'var(--warning)' : 'var(--success)'}
        />

        {/* Sales Output Section */}
        <MetricCard 
          label="Deals Won This Month"
          value={dealsWonThisMonth}
          comparison={dealsWonLastMonth > 0 ? `${dealsWonThisMonth - dealsWonLastMonth > 0 ? '+' : ''}${dealsWonThisMonth - dealsWonLastMonth} vs last month` : 'First month'}
          trend={dealsWonThisMonth > dealsWonLastMonth ? 'up' : 'down'}
        />
        <MetricCard 
          label="Average Deal Value"
          value={formatCurrency(Math.round(avgDealValue))}
          comparison={dealsLastMonth.length > 0 ? `${((avgDealValue - dealsLastMonth.reduce((s, d) => s + Number(d.deal_value || 0), 0) / dealsLastMonth.length) / (dealsLastMonth.reduce((s, d) => s + Number(d.deal_value || 0), 0) / dealsLastMonth.length) * 100).toFixed(0)}% trend` : 'New'}
          color="var(--primary)"
        />
        <MetricCard 
          label="Win Rate"
          value={`${winRatePercent}%`}
          comparison={`${active.length} won, ${dead.length} lost`}
          color={winRatePercent > 30 ? 'var(--success)' : winRatePercent > 10 ? 'var(--primary)' : 'var(--error)'}
        />

        {/* Future Section */}
        <MetricCard 
          label="Pipeline Reserve"
          value={formatCurrency(reserve)}
          comparison={revenueThisMonth > 0 ? `${(reserve / revenueThisMonth).toFixed(1)}× monthly target` : 'No sales yet'}
          color="var(--primary)"
        />
        <MetricCard 
          label="Active Proposals"
          value={activeProposals}
          comparison={activeProposals > 0 ? `${formatCurrency(Math.round(reserve / activeProposals))}/proposal` : 'None'}
          color="var(--primary)"
        />
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════════════════
// SECTION: REVENUE REALIZATION (6-MONTH HISTORY)
// ════════════════════════════════════════════════════════════════════════════════════════
function RevenueRealization({ deals }) {
  const monthlyData = {}
  const now = new Date()

  // Generate last 6 months
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const monthKey = d.toLocaleDateString('en-IN', { year: '2-digit', month: 'short' })
    monthlyData[monthKey] = { revenue: 0, dealCount: 0, avgDeal: 0 }
  }

  // Populate with deal data
  deals.forEach(d => {
    const dDate = new Date(d.created_at)
    const monthKey = dDate.toLocaleDateString('en-IN', { year: '2-digit', month: 'short' })
    if (monthlyData[monthKey]) {
      monthlyData[monthKey].revenue += Number(d.deal_value || 0)
      monthlyData[monthKey].dealCount += 1
    }
  })

  // Calculate averages
  Object.keys(monthlyData).forEach(month => {
    if (monthlyData[month].dealCount > 0) {
      monthlyData[month].avgDeal = Math.round(monthlyData[month].revenue / monthlyData[month].dealCount)
    }
  })

  const data = Object.entries(monthlyData).map(([month, stats]) => ({
    month,
    revenue: stats.revenue,
    dealCount: stats.dealCount,
    avgDeal: stats.avgDeal,
  }))

  const totalRevenue = data.reduce((s, d) => s + d.revenue, 0)
  const avgMonthly = Math.round(totalRevenue / data.length)

  return (
    <div className="dash-card">
      <div className="dash-card-title">Revenue Realization — 6 Months</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
        Actual deals booked by month — is the business scaling?
      </div>

      {data.length === 0 ? (
        <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-muted)' }}>No deals yet</div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
              <YAxis yAxisId="left" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: '#5E8FC0' }} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid var(--border-light)' }}
                formatter={(v, name) => {
                  if (name === 'revenue') return [formatCurrency(v), 'Revenue']
                  if (name === 'dealCount') return [v, 'Deals']
                  return [v, name]
                }}
              />
              <Bar yAxisId="left" dataKey="revenue" fill="var(--primary)" radius={[8, 8, 0, 0]} />
              <Line yAxisId="right" type="monotone" dataKey="dealCount" stroke="#5E8FC0" strokeWidth={2} dot={{ fill: '#5E8FC0', r: 4 }} />
            </BarChart>
          </ResponsiveContainer>

          <div style={{ display: 'flex', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--primary)' }}>
                {formatCurrency(totalRevenue)}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>6-month total</div>
            </div>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#5E8FC0' }}>
                {formatCurrency(avgMonthly)}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>monthly average</div>
            </div>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: data[data.length - 1].revenue > avgMonthly ? 'var(--success)' : 'var(--text-dark)' }}>
                {formatCurrency(data[data.length - 1].revenue)}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>latest month</div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════════════════
// SECTION: CONTACT ACTIVITY (PRESERVED)
// ════════════════════════════════════════════════════════════════════════════════════════
function ContactActivityGraph({ contactLogs }) {
  const WINDOW = 90
  const logLocalDates = contactLogs.map(l =>
    l.contacted_at ? toLocalDateStr(new Date(l.contacted_at)) : null
  )

  const rawCounts = []
  for (let i = WINDOW - 1; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const localDate = toLocalDateStr(d)
    rawCounts.push({
      localDate,
      contacts: logLocalDates.filter(ld => ld === localDate).length,
      daysAgo: i,
      d,
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
        Daily contacts + 7-day average — are you maintaining consistent activity?
      </div>

      <ResponsiveContainer width="100%" height={200}>
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
          <Line type="stepAfter" dataKey="contacts" stroke="rgba(0,0,0,0.15)" strokeWidth={1} dot={false} name="contacts" />
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
          <div style={{ fontSize: 18, fontWeight: 800, color: monthTrend > 0 ? 'var(--success)' : 'var(--error)' }}>
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
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════════════════
// SECTION: SALES CYCLE / EFFICIENCY
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
      return Math.max(0, daysToClose)
    })
    .filter(v => v !== null)

  if (cycles.length === 0) {
    return (
      <div className="dash-card">
        <div className="dash-card-title">Sales Cycle</div>
        <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
          No won deals yet to analyze
        </div>
      </div>
    )
  }

  const avgCycle = Math.round(cycles.reduce((a, b) => a + b, 0) / cycles.length)
  const medianCycle = cycles.length > 0 ? cycles.sort((a, b) => a - b)[Math.floor(cycles.length / 2)] : 0
  const minCycle = Math.min(...cycles)
  const maxCycle = Math.max(...cycles)

  return (
    <div className="dash-card">
      <div className="dash-card-title">Sales Cycle — First Contact to Close</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
        Average vs median — is your typical deal getting faster?
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12 }}>
        <div style={{
          background: 'var(--bg-light)',
          borderRadius: 8,
          padding: '12px',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--primary)' }}>
            {avgCycle}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            Average days
          </div>
        </div>
        <div style={{
          background: 'var(--bg-light)',
          borderRadius: 8,
          padding: '12px',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#FF9500' }}>
            {medianCycle}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            Median days
          </div>
        </div>
        <div style={{
          background: 'var(--bg-light)',
          borderRadius: 8,
          padding: '12px',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-dark)' }}>
            {cycles.length}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            Deals (sample)
          </div>
        </div>
      </div>

      <div style={{ marginTop: 12, padding: '12px', background: 'var(--bg-light)', borderRadius: 8, fontSize: 12 }}>
        Range: {minCycle}–{maxCycle} days
        {cycles.length < 5 && (
          <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 4 }}>
            ⚠️ Small sample size ({cycles.length} deals) — trend may not be reliable
          </div>
        )}
      </div>
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
function BottleneckAnalysis({ clients, contactLogs }) {
  const stages = {
    lead: clients.filter(c => c.stage === 'lead').length,
    contacted: clients.filter(c => c.stage === 'contacted').length,
    proposal: clients.filter(c => c.stage === 'proposal').length,
    active: clients.filter(c => c.stage === 'active').length,
  }

  // Calculate conversion rates
  const leadToContact = stages.lead > 0 ? ((stages.contacted / stages.lead) * 100).toFixed(0) : '—'
  const contactToProposal = stages.contacted > 0 ? ((stages.proposal / stages.contacted) * 100).toFixed(0) : '—'
  const proposalToWon = stages.proposal > 0 ? ((stages.active / stages.proposal) * 100).toFixed(0) : '—'

  // Find bottleneck
  let bottleneck = null
  if (stages.contacted === 0 && stages.lead > 5) {
    bottleneck = '⚠️ Too many unworked leads — increase contact activity'
  } else if (stages.proposal > 0 && stages.active === 0 && stages.proposal > stages.contacted) {
    bottleneck = '⚠️ Proposals stuck — follow-up cadence weak or offer not compelling'
  } else if (stages.contacted > stages.proposal * 2 && stages.proposal > 0) {
    bottleneck = '⚠️ Leads not converting to proposals — discovery or demo gap'
  }

  // Overdue follow-ups
  const today = new Date().toISOString().slice(0, 10)
  const overdue = clients.filter(c => 
    !['active', 'dead'].includes(c.stage) && 
    c.next_action_due && 
    c.next_action_due < today
  ).length

  if (overdue > 5) {
    bottleneck = `⚠️ ${overdue} overdue follow-ups — execution issue`
  }

  const funnel = [
    { stage: 'Lead', count: stages.lead },
    { stage: 'Contacted', count: stages.contacted },
    { stage: 'Proposal', count: stages.proposal },
    { stage: 'Won', count: stages.active },
  ]

  return (
    <div className="dash-card">
      <div className="dash-card-title">Sales Funnel & Bottleneck Analysis</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
        Where is the pipeline leaking? Where are conversions stalling?
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        {/* Funnel */}
        <div>
          {funnel.map((item, idx) => {
            const maxCount = Math.max(...funnel.map(f => f.count))
            const width = maxCount > 0 ? (item.count / maxCount) * 100 : 0
            return (
              <div key={item.stage} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{item.stage}</div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--primary)' }}>{item.count}</div>
                </div>
                <div style={{
                  height: 24,
                  background: 'var(--bg-light)',
                  borderRadius: 6,
                  overflow: 'hidden',
                }}>
                  <div style={{
                    height: '100%',
                    width: `${width}%`,
                    background: idx === 3 ? 'var(--success)' : 'var(--primary)',
                    transition: 'width 0.3s',
                  }} />
                </div>
                {idx < 3 && (
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                    → {funnel[idx + 1].count} converted ({((funnel[idx + 1].count / item.count) * 100).toFixed(0)}%)
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Conversion Rates */}
        <div>
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{
              background: 'var(--bg-light)',
              borderRadius: 8,
              padding: '12px',
            }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Lead → Contacted</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--primary)', lineHeight: 1 }}>{leadToContact}%</div>
            </div>
            <div style={{
              background: 'var(--bg-light)',
              borderRadius: 8,
              padding: '12px',
            }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Contacted → Proposal</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--primary)', lineHeight: 1 }}>{contactToProposal}%</div>
            </div>
            <div style={{
              background: 'var(--bg-light)',
              borderRadius: 8,
              padding: '12px',
            }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Proposal → Won</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: proposalToWon > 20 ? 'var(--success)' : 'var(--primary)', lineHeight: 1 }}>{proposalToWon}%</div>
            </div>
          </div>
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
export default function DashboardRedesign({ clients = [], contactLogs = [], deals = [], payments = [] }) {
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

      {/* Section 2: Revenue Realization */}
      <RevenueRealization deals={deals} />

      {/* Section 3: Sales Engine - Contact Activity */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        <ContactActivityGraph contactLogs={contactLogs} />
        <BottleneckAnalysis clients={clients} contactLogs={contactLogs} />
      </div>

      {/* Section 4: Sales Cycle */}
      <SalesCycleAnalysis clients={clients} contactLogs={contactLogs} />

      {/* Section 5: Pipeline Age */}
      <PipelineAge clients={clients} />
    </div>
  )
}
