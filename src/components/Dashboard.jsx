import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
  ResponsiveContainer, BarChart, Bar, Cell, ComposedChart, Scatter
} from 'recharts'
import { useMemo } from 'react'
import { PIPELINE_STAGES } from '../stages'
import { formatCurrency, todayStr } from '../utils'

function StatCard({ label, value, sub, color }) {
  return (
    <div className="dash-metric-card hero-card">
      <div className="dash-metric-label">{label}</div>
      <div className="dash-metric-value large" style={color ? { color } : {}}>{value}</div>
      {sub && <div className="dash-metric-sub">{sub}</div>}
    </div>
  )
}

const STAGE_COLORS = {
  lead: '#8E8E93',
  contacted: '#007AFF',
  proposal: '#FF9500',
  active: '#34C759',
  dead: '#FF3B30',
}

function toLocalDateStr(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

// Custom tooltip for the activity chart
function ActivityTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  // Both lines share the same data array — use payload[0].payload
  // which gives us the full data object for that day regardless of
  // which line the cursor is closest to
  const d = payload[0].payload
  return (
    <div style={{
      background: 'var(--bg-white)', border: '1px solid var(--border-light)',
      borderRadius: 8, padding: '8px 12px', fontSize: 12, boxShadow: 'var(--shadow-sm)'
    }}>
      <div style={{ fontWeight: 600, color: 'var(--text-dark)', marginBottom: 4 }}>{d.fullDate}</div>
      <div style={{ color: d.contacts > 0 ? 'var(--primary)' : 'var(--text-muted)' }}>
        {d.contacts} contact{d.contacts !== 1 ? 's' : ''}
      </div>
      <div style={{ color: '#5E8FC0', marginTop: 2 }}>7d avg: {d.avg7}</div>
    </div>
  )
}

export default function Dashboard({ clients, contactLogs, pipelineSnapshots = [] }) {
  const today = todayStr()

  const pipeline = clients.filter(c => !['active', 'dead'].includes(c.stage))
  const active   = clients.filter(c => c.stage === 'active')
  const dead     = clients.filter(c => c.stage === 'dead')

  const pipelineRevenue = pipeline.reduce((s, c) => s + (Number(c.potential_revenue) || 0), 0)
  const activeRevenue   = active.reduce((s, c) => s + (Number(c.potential_revenue) || 0), 0)

  const closedTotal = active.length + dead.length
  const winRate = closedTotal > 0 ? ((active.length / closedTotal) * 100).toFixed(0) : '—'

  const velocities = active
    .filter(c => c.created_at)
    .map(c => {
      const clientLogs = contactLogs.filter(l => l.client_id === c.id)
      if (clientLogs.length === 0) return null
      const earliest = clientLogs.reduce((min, l) =>
        new Date(l.contacted_at) < new Date(min.contacted_at) ? l : min
      )
      return Math.round((new Date(earliest.contacted_at) - new Date(c.created_at)) / 86400000)
    })
    .filter(v => v !== null && v >= 0)

  const avgVelocity = velocities.length
    ? Math.round(velocities.reduce((a, b) => a + b, 0) / velocities.length)
    : null

  const dealsWithRevenue = active.filter(c => c.potential_revenue)
  const avgDeal = dealsWithRevenue.length
    ? dealsWithRevenue.reduce((s, c) => s + Number(c.potential_revenue), 0) / dealsWithRevenue.length
    : null

  const overdue  = pipeline.filter(c => c.next_action_due && c.next_action_due < today)
  const dueToday = pipeline.filter(c => c.next_action_due === today)
  // Only flag "no next action" for leads already in conversation — not fresh unworked leads
  const noAction = pipeline.filter(c => !c.next_action && ['contacted', 'proposal'].includes(c.stage))
  const stale    = pipeline.filter(c => {
    if (!c.last_contacted_at) return true
    return new Date(c.last_contacted_at) < new Date(Date.now() - 7 * 86400000)
  })

  const sevenDaysAgo     = new Date(Date.now() - 7 * 86400000).toISOString()
  const fourteenDaysAgo  = new Date(Date.now() - 14 * 86400000).toISOString()
  const thisWeekLogs     = contactLogs.filter(l => l.contacted_at >= sevenDaysAgo)
  const lastWeekLogs     = contactLogs.filter(l => l.contacted_at < sevenDaysAgo && l.contacted_at >= fourteenDaysAgo)
  const weekTrend        = thisWeekLogs.length - lastWeekLogs.length

  // ── Activity chart — 90 days ────────────────────────────────────
  // 90 days shows the full arc: where you started, where you built momentum,
  // whether today is a trend or a spike.
  const WINDOW = 90
  const logLocalDates = contactLogs.map(l =>
    l.contacted_at ? toLocalDateStr(new Date(l.contacted_at)) : null
  )

  // Build raw daily counts first
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

  // Add 7-day rolling average — smooths out single dead days so the trend
  // line stays honest even when one Sunday shows 0
  const activityData = rawCounts.map((entry, idx) => {
    const window7 = rawCounts.slice(Math.max(0, idx - 6), idx + 1)
    const avg7 = Math.round((window7.reduce((s, e) => s + e.contacts, 0) / window7.length) * 10) / 10
    const { daysAgo, d, contacts } = entry

    return {
      idx,                          // numeric key — recharts hover maps to this exactly
      daysAgo,
      fullDate: d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
      // Show label only at month start, every 2 weeks, and today
      showLabel: daysAgo === 0 || d.getDate() === 1 || daysAgo % 14 === 0,
      shortLabel: daysAgo === 0 ? 'Today' : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
      contacts,
      avg7,
    }
  })

  const total90     = activityData.reduce((s, d) => s + d.contacts, 0)
  const peakDay     = Math.max(...activityData.map(d => d.contacts), 0)
  const total30     = activityData.slice(-30).reduce((s, d) => s + d.contacts, 0)
  const prev30      = activityData.slice(-60, -30).reduce((s, d) => s + d.contacts, 0)
  const monthTrend  = prev30 > 0
    ? Math.round(((total30 - prev30) / prev30) * 100)
    : null

  // Find personal best week (for psychological impact)
  let bestWeekStart = null
  let bestWeekCount = 0
  for (let i = 0; i <= activityData.length - 7; i++) {
    const weekCount = activityData.slice(i, i + 7).reduce((s, d) => s + d.contacts, 0)
    if (weekCount > bestWeekCount) {
      bestWeekCount = weekCount
      bestWeekStart = activityData[i].fullDate
    }
  }

  // Pipeline stages
  const stageData = PIPELINE_STAGES.map(s => ({
    name: s.label,
    count: clients.filter(c => c.stage === s.key).length,
    color: STAGE_COLORS[s.key],
  }))

  // Pipeline reserve gauge — computed from real data, no snapshot dependency.
  // History is built from contact_log: for each day, cumulative unique leads
  // that had their first log entry on or before that date (a lead becoming
  // "contacted" is the concrete event we can reconstruct from history).
  // Today's point reads live from current client stage counts so it's always
  // current, even after mid-day calls that move leads into Contacted.
  const CONTACTED_W = 1
  const PROPOSAL_W  = 8

  const pipelinePointsData = useMemo(() => {
    // Append-only history: every past day's value comes verbatim from
    // pipeline_snapshots — written once, the first time that day's app
    // session loads, and never recalculated again afterward. This is the
    // whole point: a deal won today must never reach backward and rewrite
    // what yesterday's number was. Only TODAY (not yet in the snapshot
    // table) is computed live, so it updates immediately as you work leads
    // or close deals — but the moment today ends and tomorrow's snapshot
    // gets written, today's number freezes too, permanently.

    // Build a map of won_at dates from clients — used to fill in win dots
    // that the snapshot cron may have missed (e.g. deal closed after 2am,
    // or manually backfilled with a historical won_at date).
    const wonByDate = {}
    clients.forEach(c => {
      if (c.won_at && c.stage === 'active') {
        const d = c.won_at.slice(0, 10)
        if (d !== today) wonByDate[d] = (wonByDate[d] || 0) + 1
      }
    })

    const frozen = pipelineSnapshots
      .filter(s => s.snapshot_date !== today) // exclude today even if a stale row exists
      .sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date))
      .map(s => {
        // Use whichever is larger: the snapshot's recorded wins, or the
        // actual count from clients.won_at for that date.
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

    // Today: computed live, mirroring the exact same formula used for the
    // frozen historical snapshots, so today's number is consistent with
    // yesterday's once it freezes. Each win removes a flat 24 points —
    // roughly 3 proposals' worth (8 each), reflecting that about 1 in 3
    // proposals converts. This is a deliberately simple, explainable number
    // for now; to be redesigned with a more precise formula once enough
    // win data exists to support one.
    const WIN_DEDUCTION = 24
    const CONTACTED_W = 1
    const PROPOSAL_EXPIRY_DAYS = 30

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
      reserve: Math.max(0, liveContactedCount * CONTACTED_W + liveProposalCount * 7 - wonTodayPoints),
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

  const stageOrder = ['lead', 'contacted', 'proposal', 'active']
  function atOrPastStage(stageKey) {
    const idx = stageOrder.indexOf(stageKey)
    if (idx === -1) return 0
    const laterKeys = stageOrder.slice(idx)
    return clients.filter(c => laterKeys.includes(c.stage) || c.stage === 'active').length
  }
  const funnelRates = [
    { label: 'Lead → Contacted', from: 'lead', to: 'contacted' },
    { label: 'Contacted → Proposal', from: 'contacted', to: 'proposal' },
  ].map(({ label, from, to }) => {
    const fromCount = atOrPastStage(from)
    const toCount   = atOrPastStage(to)
    const rate = fromCount > 0 ? Math.round((toCount / fromCount) * 100) : 0
    return { label, rate }
  })

  const TEMP_SCORE  = { hot: 3, warm: 2, cold: 1 }
  const STAGE_SCORE = { proposal: 3, contacted: 2, lead: 1 }
  const topOpportunities = pipeline
    .filter(c => c.potential_revenue)
    .map(c => {
      const daysSinceContact = c.last_contacted_at
        ? Math.floor((Date.now() - new Date(c.last_contacted_at)) / 86400000)
        : 999
      const recencyScore = Math.max(0, 10 - daysSinceContact)
      const score = (TEMP_SCORE[c.temperature] || 0) * 4
                  + (STAGE_SCORE[c.stage] || 0) * 3
                  + recencyScore
      return { ...c, _score: score }
    })
    .sort((a, b) => b._score - a._score || Number(b.potential_revenue) - Number(a.potential_revenue))
    .slice(0, 5)

  return (
    <div className="dashboard" style={{ maxWidth: '100%' }}>

      {/* Today context — one line, always visible */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16,
        padding: '8px 14px', marginBottom: 12,
        background: 'var(--bg-white)', border: '1px solid var(--border-light)',
        borderRadius: 'var(--radius-sm)', fontSize: 13,
      }}>
        <span style={{ fontWeight: 700, color: 'var(--text-dark)' }}>Today</span>
        {dueToday.length > 0
          ? <span style={{ color: 'var(--primary)', fontWeight: 600 }}>{dueToday.length} due today</span>
          : <span style={{ color: 'var(--text-muted)' }}>Nothing scheduled for today</span>
        }
        {overdue.length > 0 && (
          <span style={{ color: 'var(--error)', fontWeight: 600 }}>· {overdue.length} overdue</span>
        )}
        <span style={{ color: 'var(--border)', userSelect: 'none' }}>|</span>
        <span style={{ color: 'var(--text-muted)' }}>
          {thisWeekLogs.length} contacts this week
          {weekTrend !== 0 && (
            <span style={{ marginLeft: 6, color: weekTrend > 0 ? 'var(--success)' : 'var(--error)', fontWeight: 600 }}>
              {weekTrend > 0 ? `↑ ${weekTrend}` : `↓ ${Math.abs(weekTrend)}`} vs last week
            </span>
          )}
        </span>
      </div>
      <div className="dash-hero" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <StatCard
          label="Pipeline value"
          value={formatCurrency(pipelineRevenue)}
          sub={`across ${pipeline.length} open leads`}
        />
        <StatCard
          label="Active revenue"
          value={formatCurrency(activeRevenue)}
          sub={`${active.length} won clients`}
          color="var(--success)"
        />
        <StatCard
          label="Win rate"
          value={winRate === '—' ? '—' : `${winRate}%`}
          sub={closedTotal > 0 ? `${active.length} won · ${dead.length} lost` : 'No closed deals yet'}
          color={Number(winRate) >= 50 ? 'var(--success)' : winRate === '—' ? undefined : 'var(--warning)'}
        />
        <StatCard
          label="Contacts this week"
          value={thisWeekLogs.length}
          sub={weekTrend > 0 ? `↑ ${weekTrend} more than last week` : weekTrend < 0 ? `↓ ${Math.abs(weekTrend)} fewer than last week` : 'Same as last week'}
          color={weekTrend >= 0 ? 'var(--primary)' : 'var(--error)'}
        />
      </div>

      {/* Row 2: Activity chart — 90 days */}
      <div className="dash-card" style={{ padding: '18px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 }}>
          <div>
            <div className="dash-card-title" style={{ marginBottom: 2 }}>
              Contact activity — last 90 days
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-light)' }}>
              {total90} total · peak {peakDay}/day
              {bestWeekCount > 0 && (
                <span style={{ marginLeft: 10, color: 'var(--text-muted)' }}>
                  · best week: {bestWeekCount} contacts
                </span>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
            {/* Last 30 vs previous 30 — trend comparison */}
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--primary)', letterSpacing: -0.5 }}>
                {total30}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>last 30 days</div>
              {monthTrend !== null && (
                <div style={{
                  fontSize: 11, fontWeight: 600, marginTop: 1,
                  color: monthTrend >= 0 ? 'var(--success)' : 'var(--error)'
                }}>
                  {monthTrend >= 0 ? '↑' : '↓'} {Math.abs(monthTrend)}% vs prior 30d
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-muted)' }}>
            <div style={{ width: 16, height: 2, background: 'var(--primary)', borderRadius: 1 }} />
            Daily contacts
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-muted)' }}>
            <div style={{ width: 16, height: 2, background: '#5E8FC0', borderRadius: 1 }} />
            7-day average
          </div>
        </div>

        <ResponsiveContainer width="100%" height={160}>
          <LineChart data={activityData} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.04)" />
            <XAxis
              dataKey="idx"
              tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
              tickFormatter={(idx) => {
                const d = activityData[idx]
                return d?.showLabel ? d.shortLabel : ''
              }}
              interval={0}
            />
            <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} allowDecimals={false} />
            <Tooltip content={<ActivityTooltip />} />
            {/* Daily contacts — the raw truth */}
            <Line
              type="monotone"
              dataKey="contacts"
              stroke="var(--primary)"
              strokeWidth={1.5}
              dot={false}
              activeDot={{ r: 3, fill: 'var(--primary)' }}
              opacity={0.7}
            />
            {/* 7-day rolling average — the honest trend */}
            <Line
              type="monotone"
              dataKey="avg7"
              stroke="#5E8FC0"
              strokeWidth={2}
              dot={false}
              activeDot={false}
              strokeDasharray="0"
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>

        {/* Psychological context bar */}
        {monthTrend !== null && (
          <div style={{
            marginTop: 10, padding: '8px 12px', borderRadius: 8,
            background: monthTrend >= 0 ? 'var(--success-bg)' : 'var(--warning-bg)',
            fontSize: 12,
            color: monthTrend >= 0 ? '#1A7A3F' : '#854F0B',
            fontWeight: 500,
          }}>
            {monthTrend >= 20
              ? `🚀 You're ${monthTrend}% more active than last month. Momentum is building.`
              : monthTrend >= 0
              ? `↑ ${monthTrend}% more contacts than last month. Staying consistent.`
              : `↓ ${Math.abs(monthTrend)}% fewer contacts than last month. Time to push harder.`
            }
          </div>
        )}
      </div>

      {/* Pipeline points gauge — replaces the old stage bar chart. This is not
          an effort tracker, it's a reserve gauge: how much unconverted pipeline
          value (Contacted + Proposal leads, weighted by scarcity) is currently
          stored, and how it depletes when a deal is won. Builds forward only —
          no fabricated history, since stage-change dates weren't tracked
          before this feature shipped. */}
      <div className="dash-card" style={{ marginBottom: 16 }}>
        <div className="dash-card-title">
          Pipeline reserve
          <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 8 }}>
            Contacted + Proposal leads, weighted · drops when a deal is won
          </span>
        </div>
        {pipelinePointsData.length === 0 ? (
          <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            Loading…
          </div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={180}>
              <ComposedChart data={pipelinePointsData} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} interval={13} />
                {/* Left axis: reserve points (large scale, 0-150+) */}
                <YAxis yAxisId="reserve" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} allowDecimals={false} />
                {/* Right axis: active proposals (small scale, 0-10ish) — its own
                    axis so it isn't visually crushed flat against the bottom by
                    reserve's much larger range. Same underlying count as before,
                    not weighted — only the scale it's drawn on has changed. */}
                <YAxis yAxisId="proposals" orientation="right" tick={{ fontSize: 10, fill: '#5E8FC0' }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid var(--border-light)' }}
                  formatter={(v, name) => {
                    if (name === 'reserve') return [v, 'Reserve points']
                    if (name === 'proposals') return [v, 'Active proposals']
                    if (name === 'wins') return [v, 'Deal won']
                    if (name === 'pointsRemoved') return [`-${v}`, 'Points removed by this win']
                    return [v, name]
                  }}
                />
                {/* Reserve line — main story, thick, copper, left axis */}
                <Line yAxisId="reserve" type="monotone" dataKey="reserve" stroke="var(--primary)" strokeWidth={2.5} dot={false} name="reserve" />
                {/* Proposal line — own right-hand axis so it's fully visible regardless of reserve's scale */}
                <Line yAxisId="proposals" type="monotone" dataKey="proposals" stroke="#5E8FC0" strokeWidth={1.5} dot={false} strokeDasharray="4 2" name="proposals" />
                {/* Won dots — sparse event markers, plotted on the reserve axis since
                    they mark reserve depletion. Custom shape draws the exact
                    points-removed amount directly above the dot, so it's visible
                    without hovering. */}
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
                          <text x={cx} y={cy - 12} textAnchor="middle" fontSize={11} fontWeight={700} fill="#34C759">
                            -{payload.pointsRemoved}
                          </text>
                        )}
                      </g>
                    )
                  }}
                />
              </ComposedChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 8, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-muted)' }}>
                <div style={{ width: 16, height: 2.5, background: 'var(--primary)', borderRadius: 1 }} />
                Reserve (active contacted + proposals, weighted)
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

      {/* Row 3: urgency + top opportunities */}
      <div className="dash-row">

        <div className="dash-card flex-1">
          <div className="dash-card-title">Action required</div>
          <div className="alert-list">
            <div className={`alert-item ${overdue.length > 0 ? 'alert-red' : 'alert-green'}`}>
              <span className="alert-count" style={{ color: overdue.length > 0 ? 'var(--error)' : 'var(--success)' }}>
                {overdue.length}
              </span>
              <div>
                <div className="alert-text">Overdue follow-ups</div>
                {overdue.length > 0 && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    Oldest: {[...overdue].sort((a,b) => a.next_action_due.localeCompare(b.next_action_due))[0]?.next_action_due}
                  </div>
                )}
              </div>
            </div>
            <div className={`alert-item ${noAction.length > 0 ? 'alert-orange' : 'alert-green'}`}>
              <span className="alert-count" style={{ color: noAction.length > 0 ? 'var(--warning)' : 'var(--success)' }}>
                {noAction.length}
              </span>
              <div>
                <div className="alert-text">No next action set</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Contacted/proposal leads without a clear next step</div>
              </div>
            </div>
          </div>
        </div>

        <div className="dash-card flex-1">
          <div className="dash-card-title">Top opportunities <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)' }}>by temperature · stage · recency</span></div>
          {topOpportunities.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text-muted)', paddingTop: 20, textAlign: 'center' }}>
              Add potential revenue to leads to see opportunities
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {topOpportunities.map((c, i) => {
                const stageColor = STAGE_COLORS[c.stage] || '#8E8E93'
                const isOverdue = c.next_action_due && c.next_action_due < today
                return (
                  <div key={c.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 10px', borderRadius: 8,
                    background: i === 0 ? 'var(--bg-light)' : 'transparent',
                    border: i === 0 ? '1px solid var(--border-light)' : 'none',
                  }}>
                    <div style={{
                      width: 22, height: 22, borderRadius: '50%',
                      background: stageColor, display: 'flex', alignItems: 'center',
                      justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff',
                      flexShrink: 0,
                    }}>{i + 1}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-dark)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.name}
                      </div>
                      <div style={{ fontSize: 11, color: stageColor, fontWeight: 500 }}>
                        {PIPELINE_STAGES.find(s => s.key === c.stage)?.label || c.stage}
                        {isOverdue && <span style={{ color: 'var(--error)', marginLeft: 6 }}>· Overdue</span>}
                      </div>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--success)', flexShrink: 0 }}>
                      {formatCurrency(c.potential_revenue)}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
