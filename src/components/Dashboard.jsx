import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Cell
} from 'recharts'
import { PIPELINE_STAGES } from '../stages'
import { formatCurrency, todayStr } from '../utils'

function StatCard({ label, value, sub, color, accent }) {
  return (
    <div className="dash-metric-card hero-card" style={accent ? { '--card-accent': accent } : {}}>
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

export default function Dashboard({ clients, contactLogs }) {
  const today = todayStr()

  const pipeline = clients.filter(c => !['active', 'dead'].includes(c.stage))
  const active   = clients.filter(c => c.stage === 'active')
  const dead     = clients.filter(c => c.stage === 'dead')

  const pipelineRevenue = pipeline.reduce((s, c) => s + (Number(c.potential_revenue) || 0), 0)
  const activeRevenue   = active.reduce((s, c) => s + (Number(c.potential_revenue) || 0), 0)

  // Conversion + win/loss
  const closedTotal = active.length + dead.length
  const winRate = closedTotal > 0 ? ((active.length / closedTotal) * 100).toFixed(0) : '—'

  // Velocity: avg days from lead creation to active (only for active clients with created_at)
  const velocities = active
    .filter(c => c.created_at)
    .map(c => Math.round((new Date() - new Date(c.created_at)) / 86400000))
  const avgVelocity = velocities.length
    ? Math.round(velocities.reduce((a, b) => a + b, 0) / velocities.length)
    : null

  // Average deal size
  const dealsWithRevenue = active.filter(c => c.potential_revenue)
  const avgDeal = dealsWithRevenue.length
    ? dealsWithRevenue.reduce((s, c) => s + Number(c.potential_revenue), 0) / dealsWithRevenue.length
    : null

  // Overdue / stale
  const overdue = pipeline.filter(c => c.next_action_due && c.next_action_due < today)
  const noAction = pipeline.filter(c => !c.next_action && !['active','dead'].includes(c.stage))
  const stale = pipeline.filter(c => {
    if (!c.last_contacted_at) return true
    return new Date(c.last_contacted_at) < new Date(Date.now() - 7 * 86400000)
  })

  // This week contacts
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString()
  const thisWeekLogs = contactLogs.filter(l => l.contacted_at >= sevenDaysAgo)
  const lastWeekLogs = contactLogs.filter(l => {
    const d = l.contacted_at
    return d < sevenDaysAgo && d >= new Date(Date.now() - 14 * 86400000).toISOString()
  })
  const weekTrend = thisWeekLogs.length - lastWeekLogs.length

  // Contact activity — last 30 days
  // Use local date strings to avoid UTC vs IST timezone mismatch
  function toLocalDateStr(date) {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const dd = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${dd}`
  }
  // Pre-convert all log timestamps to local date strings once
  const logLocalDates = contactLogs.map(l =>
    l.contacted_at ? toLocalDateStr(new Date(l.contacted_at)) : null
  )
  const activityData = []
  for (let i = 29; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const localDate = toLocalDateStr(d)
    const count = logLocalDates.filter(ld => ld === localDate).length
    activityData.push({
      date: i === 0 ? 'Today' : i % 7 === 0
        ? d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
        : '',
      fullDate: d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
      contacts: count,
    })
  }
  const totalThisMonth = activityData.reduce((s, d) => s + d.contacts, 0)
  const peakDay = Math.max(...activityData.map(d => d.contacts), 0)

  // Pipeline stage bar chart
  const stageData = PIPELINE_STAGES.map(s => ({
    name: s.label,
    count: clients.filter(c => c.stage === s.key).length,
    color: STAGE_COLORS[s.key],
  }))

  // Hot leads with revenue — top 5 opportunities
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

      {/* Row 2: Contact activity (full width) */}
      <div className="dash-card" style={{ padding: '18px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <div className="dash-card-title" style={{ marginBottom: 2 }}>Contact activity — last 30 days</div>
            <div style={{ fontSize: 12, color: 'var(--text-light)' }}>
              {totalThisMonth} contacts logged · peak {peakDay}/day
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--primary)', letterSpacing: -0.5 }}>{totalThisMonth}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>this month</div>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={140}>
          <LineChart data={activityData} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
            <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} allowDecimals={false} />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid var(--border-light)' }}
              labelFormatter={(_, payload) => payload?.[0]?.payload?.fullDate || ''}
              formatter={(v) => [v, 'Contacts']}
            />
            <Line
              type="monotone" dataKey="contacts" stroke="var(--primary)"
              strokeWidth={2} dot={false} activeDot={{ r: 4, fill: 'var(--primary)' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Row 3: Pipeline funnel + urgency + top opportunities */}
      <div className="dash-row">

        {/* Pipeline stage breakdown as bar chart */}
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
          {/* Conversion funnel numbers below */}
          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            {[
              { label: 'Lead→Contacted', from: 'lead', to: 'contacted' },
              { label: 'Contacted→Proposal', from: 'contacted', to: 'proposal' },
            ].map(({ label, from, to }) => {
              const fromCount = clients.filter(c => c.stage === from).length
              const toCount   = clients.filter(c => c.stage === to).length
              const rate = fromCount > 0 ? Math.round((toCount / (fromCount + toCount)) * 100) : 0
              return (
                <div key={label} style={{
                  flex: 1, background: 'var(--bg-light)', borderRadius: 6,
                  padding: '6px 10px', fontSize: 11, color: 'var(--text-light)'
                }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-dark)' }}>{rate}%</div>
                  {label}
                </div>
              )
            })}
          </div>
        </div>

        {/* Urgency — what needs action */}
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
                    Oldest: {overdue.sort((a,b) => a.next_action_due.localeCompare(b.next_action_due))[0]?.next_action_due}
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
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  Leads without a clear next step
                </div>
              </div>
            </div>
            {avgVelocity !== null && (
              <div className="alert-item" style={{ background: 'var(--blue-bg)' }}>
                <span className="alert-count" style={{ color: 'var(--primary)' }}>{avgVelocity}d</span>
                <div>
                  <div className="alert-text">Avg. days to close</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Based on {active.length} won deals</div>
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

        {/* Top revenue opportunities */}
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
