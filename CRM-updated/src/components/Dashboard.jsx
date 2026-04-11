import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend
} from 'recharts'
import { ALL_STAGES, TEMPERATURES, SOURCES, PIPELINE_STAGES } from '../stages'
import { formatCurrency, todayStr } from '../utils'

const COLORS = {
  lead: '#8E8E93',
  contacted: '#007AFF',
  proposal: '#FF9500',
  active: '#34C759',
  dead: '#FF3B30',
}

const TEMP_COLORS = {
  hot: '#FF3B30',
  warm: '#FF9500',
  cold: '#007AFF',
}

function StatCard({ label, value, sub, color }) {
  return (
    <div className="dash-metric-card hero-card">
      <div className="dash-metric-label">{label}</div>
      <div className={`dash-metric-value large ${color || ''}`}>{value}</div>
      {sub && <div className="dash-metric-sub">{sub}</div>}
    </div>
  )
}

export default function Dashboard({ clients, contactLogs }) {
  const today = todayStr()
  const pipeline = clients.filter(c => !['active', 'dead'].includes(c.stage))
  const active = clients.filter(c => c.stage === 'active')
  const dead = clients.filter(c => c.stage === 'dead')

  const pipelineRevenue = pipeline.reduce((s, c) => s + (Number(c.potential_revenue) || 0), 0)
  const activeRevenue = active.reduce((s, c) => s + (Number(c.potential_revenue) || 0), 0)
  const conversionRate = clients.length > 0 ? ((active.length / clients.length) * 100).toFixed(1) : 0

  // Overdue / urgent
  const overdue = pipeline.filter(c => c.next_action_due && c.next_action_due < today)
  const dueToday = pipeline.filter(c => c.next_action_due === today)
  const stale = pipeline.filter(c => {
    if (!c.last_contacted_at) return true
    return new Date(c.last_contacted_at) < new Date(Date.now() - 7 * 86400000)
  })
  const noAction = pipeline.filter(c => !c.next_action)

  // Stage bar chart data
  const stageData = ALL_STAGES.map(s => ({
    name: s.label,
    count: clients.filter(c => c.stage === s.key).length,
    revenue: clients.filter(c => c.stage === s.key).reduce((sum, c) => sum + (Number(c.potential_revenue) || 0), 0) / 100000,
    color: COLORS[s.key],
  })).filter(d => d.count > 0)

  // Source pie chart data
  const sourceCounts = {}
  clients.forEach(c => { if (c.source) sourceCounts[c.source] = (sourceCounts[c.source] || 0) + 1 })
  const sourceData = Object.entries(sourceCounts).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, value]) => ({ name, value }))
  const PIE_COLORS = ['#007AFF', '#34C759', '#FF9500', '#FF3B30', '#AF52DE', '#5AC8FA']

  // Temperature bar
  const tempData = TEMPERATURES.map(t => ({
    name: `${t.emoji} ${t.label}`,
    count: pipeline.filter(c => c.temperature === t.key).length,
    color: TEMP_COLORS[t.key],
  }))

  // Activity line chart — contacts per day, last 30 days
  const days = []
  for (let i = 29; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const dateStr = d.toISOString().split('T')[0]
    const count = contactLogs.filter(l => l.contacted_at && l.contacted_at.startsWith(dateStr)).length
    days.push({
      date: d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
      contacts: count,
    })
  }

  // Win rate funnel
  const funnelData = PIPELINE_STAGES.map(s => ({
    stage: s.label,
    count: clients.filter(c => c.stage === s.key).length,
    color: COLORS[s.key],
  }))

  const urgencyTotal = overdue.length + dueToday.length + stale.length + noAction.length

  return (
    <div className="dashboard">
      {/* Hero metrics */}
      <div className="dash-hero">
        <StatCard label="Pipeline Value" value={formatCurrency(pipelineRevenue)} sub={`${pipeline.length} leads in pipeline`} />
        <StatCard label="Active Revenue" value={formatCurrency(activeRevenue)} sub={`${active.length} active clients`} color="green" />
        <StatCard label="Conversion Rate" value={`${conversionRate}%`} sub={`${active.length} of ${clients.length} total`} />
        <StatCard
          label="Needs Attention"
          value={urgencyTotal}
          sub={overdue.length > 0 ? `${overdue.length} overdue right now` : dueToday.length > 0 ? `${dueToday.length} due today` : 'All good!'}
          color={urgencyTotal > 0 ? 'danger' : 'green'}
        />
      </div>

      {/* Row 1: Activity line + urgency alerts */}
      <div className="dash-row">
        <div className="dash-card flex-2">
          <div className="dash-card-title">Contact activity — last 30 days</div>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={days} margin={{ top: 4, right: 12, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} interval={6} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Line type="monotone" dataKey="contacts" stroke="#007AFF" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="dash-card flex-1">
          <div className="dash-card-title">Urgency alerts</div>
          <div className="alert-list">
            <div className={`alert-item ${overdue.length > 0 ? 'alert-red' : 'alert-green'}`}>
              <span className="alert-count">{overdue.length}</span>
              <span className="alert-text">Overdue follow-ups</span>
            </div>
            <div className={`alert-item ${dueToday.length > 0 ? 'alert-orange' : 'alert-green'}`}>
              <span className="alert-count">{dueToday.length}</span>
              <span className="alert-text">Due today</span>
            </div>
            <div className={`alert-item ${stale.length > 0 ? 'alert-orange' : 'alert-green'}`}>
              <span className="alert-count">{stale.length}</span>
              <span className="alert-text">Stale — no contact 7d+</span>
            </div>
            <div className={`alert-item ${noAction.length > 0 ? 'alert-orange' : 'alert-green'}`}>
              <span className="alert-count">{noAction.length}</span>
              <span className="alert-text">No next action set</span>
            </div>
          </div>
        </div>
      </div>

      {/* Row 2: Stage bar chart + Source pie */}
      <div className="dash-row">
        <div className="dash-card flex-2">
          <div className="dash-card-title">Leads by stage</div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={stageData} margin={{ top: 4, right: 12, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="left" tick={{ fontSize: 10 }} allowDecimals={false} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} tickFormatter={v => v > 0 ? `₹${v}L` : ''} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
                formatter={(value, name) => name === 'Revenue (₹L)' ? [`₹${value.toFixed(1)}L`, name] : [value, name]}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar yAxisId="left" dataKey="count" name="Leads" radius={[4, 4, 0, 0]}>
                {stageData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Bar>
              <Bar yAxisId="right" dataKey="revenue" name="Revenue (₹L)" fill="rgba(52,199,89,0.3)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="dash-card flex-1">
          <div className="dash-card-title">Lead sources</div>
          {sourceData.length === 0 ? (
            <div className="empty-sources" style={{ paddingTop: 40, textAlign: 'center', color: 'var(--text2)', fontSize: 13 }}>No sources tracked yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie
                  data={sourceData}
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={72}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {sourceData.map((entry, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={(v, n) => [v, n]} />
                <Legend
                  wrapperStyle={{ fontSize: 11 }}
                  formatter={(value) => value.length > 12 ? value.slice(0, 12) + '…' : value}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Row 3: Temperature + Win rate */}
      <div className="dash-row">
        <div className="dash-card flex-1">
          <div className="dash-card-title">Lead temperature (pipeline only)</div>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={tempData} layout="vertical" margin={{ top: 0, right: 40, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={72} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Bar dataKey="count" name="Leads" radius={[0, 4, 4, 0]}>
                {tempData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="dash-card flex-1">
          <div className="dash-card-title">Pipeline funnel</div>
          <div style={{ padding: '8px 0' }}>
            {[...funnelData, { stage: 'Active', count: active.length, color: COLORS.active }, { stage: 'Dead', count: dead.length, color: COLORS.dead }].map((row, i) => {
              const maxCount = Math.max(...[...funnelData, { count: active.length }, { count: dead.length }].map(r => r.count), 1)
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <div style={{ width: 72, fontSize: 11, color: 'var(--text2)', textAlign: 'right', flexShrink: 0 }}>{row.stage}</div>
                  <div style={{ flex: 1, background: 'var(--border)', borderRadius: 4, height: 18, overflow: 'hidden' }}>
                    <div style={{ width: `${(row.count / maxCount) * 100}%`, background: row.color, height: '100%', borderRadius: 4, transition: 'width 0.4s' }} />
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 500, color: row.color, minWidth: 20 }}>{row.count}</div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
