import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
  ResponsiveContainer, BarChart, Bar, Cell
} from 'recharts'
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
  const d = payload[0].payload
  return (
    <div style={{
      background: 'var(--bg-white)', border: '1px solid var(--border-light)',
      borderRadius: 8, padding: '8px 12px', fontSize: 12, boxShadow: 'var(--shadow-sm)'
    }}>
      <div style={{ fontWeight: 600, color: 'var(--text-dark)', marginBottom: 4 }}>{d.fullDate}</div>
      <div style={{ color: 'var(--primary)' }}>{d.contacts} contact{d.contacts !== 1 ? 's' : ''}</div>
      {d.avg7 !== null && (
        <div style={{ color: 'var(--text-muted)', marginTop: 2 }}>7d avg: {d.avg7}</div>
      )}
    </div>
  )
}

export default function Dashboard({ clients, contactLogs }) {
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
  const noAction = pipeline.filter(c => !c.next_action)
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
    const avg7 = window7.length >= 3
      ? Math.round((window7.reduce((s, e) => s + e.contacts, 0) / window7.length) * 10) / 10
      : null

    const { daysAgo, d, contacts } = entry
    // Show date labels at month boundaries and today
    let dateLabel = ''
    if (daysAgo === 0) dateLabel = 'Today'
    else if (d.getDate() === 1) dateLabel = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
    else if (daysAgo % 14 === 0) dateLabel = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })

    return {
      date: dateLabel,
      fullDate: d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
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

  const topOpportunities = pipeline
    .filter(c => c.potential_revenue)
    .sort((a, b) => Number(b.potential_revenue) - Number(a.potential_revenue))
    .slice(0, 5)

  return (
    <div className="dashboard" style={{ maxWidth: '100%' }}>

      {/* Row 1: Hero KPIs */}
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
            <div style={{ width: 16, height: 2, background: 'var(--warning)', borderRadius: 1, opacity: 0.7 }} />
            7-day average
          </div>
        </div>

        <ResponsiveContainer width="100%" height={160}>
          <LineChart data={activityData} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.04)" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
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
              stroke="var(--warning)"
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

      {/* Row 3: Pipeline funnel + urgency + top opportunities */}
      <div className="dash-row">

        <div className="dash-card flex-1">
          <div className="dash-card-title">Pipeline stages</div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={stageData} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" horizontal={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-body)' }} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} allowDecimals={false} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid var(--border-light)' }} formatter={v => [v, 'Leads']} />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {stageData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            {funnelRates.map(({ label, rate }) => (
              <div key={label} style={{
                flex: 1, background: 'var(--bg-light)', borderRadius: 6,
                padding: '6px 10px', fontSize: 11, color: 'var(--text-light)'
              }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-dark)' }}>{rate}%</div>
                {label}
              </div>
            ))}
          </div>
        </div>

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
            <div className={`alert-item ${stale.length > 0 ? 'alert-orange' : 'alert-green'}`}>
              <span className="alert-count" style={{ color: stale.length > 0 ? 'var(--warning)' : 'var(--success)' }}>
                {stale.length}
              </span>
              <div>
                <div className="alert-text">Stale leads (7d+ no contact)</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {stale.length > 0 ? 'Leads going cold' : 'All leads contacted recently'}
                </div>
              </div>
            </div>
            <div className={`alert-item ${noAction.length > 0 ? 'alert-orange' : 'alert-green'}`}>
              <span className="alert-count" style={{ color: noAction.length > 0 ? 'var(--warning)' : 'var(--success)' }}>
                {noAction.length}
              </span>
              <div>
                <div className="alert-text">No next action set</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Leads without a clear next step</div>
              </div>
            </div>
            {avgVelocity !== null && (
              <div className="alert-item" style={{ background: 'var(--blue-bg)' }}>
                <span className="alert-count" style={{ color: 'var(--primary)' }}>{avgVelocity}d</span>
                <div>
                  <div className="alert-text">Avg. days to first contact</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Lead created → first log entry</div>
                </div>
              </div>
            )}
            {avgDeal !== null && (
              <div className="alert-item" style={{ background: 'var(--success-bg)' }}>
                <span className="alert-count" style={{ color: 'var(--success)', fontSize: 14 }}>
                  {formatCurrency(avgDeal)}
                </span>
                <div>
                  <div className="alert-text">Avg. deal size</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Active clients only</div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="dash-card flex-1">
          <div className="dash-card-title">Top opportunities</div>
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
