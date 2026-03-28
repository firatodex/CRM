import { ALL_STAGES, TEMPERATURES, SOURCES, PIPELINE_STAGES } from '../stages'
import { formatCurrency, todayStr } from '../utils'

export default function Dashboard({ clients, contactLogs }) {
  // ── Core numbers ──
  const total = clients.length
  const pipeline = clients.filter(c => !['active', 'dead'].includes(c.stage))
  const active = clients.filter(c => c.stage === 'active')
  const dead = clients.filter(c => c.stage === 'dead')
  const pipelineRevenue = pipeline.reduce((s, c) => s + (Number(c.potential_revenue) || 0), 0)
  const activeRevenue = active.reduce((s, c) => s + (Number(c.potential_revenue) || 0), 0)
  const totalRevenue = clients.reduce((s, c) => s + (Number(c.potential_revenue) || 0), 0)

  // ── Conversion rate ──
  const conversionRate = total > 0 ? ((active.length / total) * 100).toFixed(1) : 0

  // ── Stage breakdown ──
  const stageCounts = ALL_STAGES.map(s => ({
    ...s,
    count: clients.filter(c => c.stage === s.key).length,
    revenue: clients.filter(c => c.stage === s.key).reduce((sum, c) => sum + (Number(c.potential_revenue) || 0), 0),
  }))

  // ── Temperature breakdown ──
  const tempCounts = TEMPERATURES.map(t => ({
    ...t,
    count: pipeline.filter(c => c.temperature === t.key).length,
  }))
  const noTemp = pipeline.filter(c => !c.temperature).length

  // ── Source breakdown ──
  const sourceCounts = SOURCES.map(s => ({
    source: s,
    count: clients.filter(c => c.source === s).length,
  })).filter(s => s.count > 0).sort((a, b) => b.count - a.count)

  // ── Overdue actions ──
  const today = todayStr()
  const overdue = pipeline.filter(c => c.next_action_due && c.next_action_due < today)
  const dueToday = pipeline.filter(c => c.next_action_due === today)
  const noAction = pipeline.filter(c => !c.next_action)

  // ── Contact activity (last 7 days) ──
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString()
  const recentLogs = contactLogs.filter(l => l.contacted_at >= sevenDaysAgo)
  const contactsThisWeek = recentLogs.length

  // ── Stale leads (no contact in 7+ days) ──
  const staleLeads = pipeline.filter(c => {
    if (!c.last_contacted_at) return true
    return new Date(c.last_contacted_at) < new Date(Date.now() - 7 * 86400000)
  })

  // ── Pipeline bar widths ──
  const maxStageCount = Math.max(...stageCounts.map(s => s.count), 1)

  return (
    <div className="dashboard">
      {/* Hero metrics */}
      <div className="dash-hero">
        <div className="dash-metric-card hero-card">
          <div className="dash-metric-label">Pipeline Value</div>
          <div className="dash-metric-value large">{formatCurrency(pipelineRevenue)}</div>
          <div className="dash-metric-sub">{pipeline.length} leads in pipeline</div>
        </div>
        <div className="dash-metric-card hero-card">
          <div className="dash-metric-label">Active Revenue</div>
          <div className="dash-metric-value large green">{formatCurrency(activeRevenue)}</div>
          <div className="dash-metric-sub">{active.length} active clients</div>
        </div>
        <div className="dash-metric-card hero-card">
          <div className="dash-metric-label">Conversion Rate</div>
          <div className="dash-metric-value large">{conversionRate}%</div>
          <div className="dash-metric-sub">{active.length} of {total} total</div>
        </div>
        <div className="dash-metric-card hero-card">
          <div className="dash-metric-label">This Week</div>
          <div className="dash-metric-value large blue">{contactsThisWeek}</div>
          <div className="dash-metric-sub">contacts made</div>
        </div>
      </div>

      {/* Row 2: Pipeline + Temperature */}
      <div className="dash-row">
        <div className="dash-card flex-2">
          <div className="dash-card-title">Pipeline Breakdown</div>
          <div className="pipeline-bars">
            {stageCounts.map(s => (
              <div key={s.key} className="pipeline-bar-row">
                <div className="pipeline-bar-label">
                  <span className="stage-dot" style={{ background: s.color }} />
                  {s.label}
                </div>
                <div className="pipeline-bar-track">
                  <div
                    className="pipeline-bar-fill"
                    style={{
                      width: `${(s.count / maxStageCount) * 100}%`,
                      background: s.color,
                    }}
                  />
                </div>
                <div className="pipeline-bar-stats">
                  <span className="pipeline-bar-count">{s.count}</span>
                  {s.revenue > 0 && <span className="pipeline-bar-rev">{formatCurrency(s.revenue)}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="dash-card flex-1">
          <div className="dash-card-title">Lead Temperature</div>
          <div className="temp-grid">
            {tempCounts.map(t => (
              <div key={t.key} className="temp-item">
                <span className="temp-emoji">{t.emoji}</span>
                <span className="temp-count">{t.count}</span>
                <span className="temp-label">{t.label}</span>
              </div>
            ))}
            {noTemp > 0 && (
              <div className="temp-item">
                <span className="temp-emoji">❓</span>
                <span className="temp-count">{noTemp}</span>
                <span className="temp-label">Unset</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Row 3: Alerts + Sources */}
      <div className="dash-row">
        <div className="dash-card flex-1">
          <div className="dash-card-title">Attention Needed</div>
          <div className="alert-list">
            <div className={`alert-item ${overdue.length > 0 ? 'alert-red' : 'alert-green'}`}>
              <span className="alert-count">{overdue.length}</span>
              <span className="alert-text">Overdue actions</span>
            </div>
            <div className={`alert-item ${dueToday.length > 0 ? 'alert-orange' : 'alert-green'}`}>
              <span className="alert-count">{dueToday.length}</span>
              <span className="alert-text">Due today</span>
            </div>
            <div className={`alert-item ${staleLeads.length > 0 ? 'alert-orange' : 'alert-green'}`}>
              <span className="alert-count">{staleLeads.length}</span>
              <span className="alert-text">Stale leads (7+ days)</span>
            </div>
            <div className={`alert-item ${noAction.length > 0 ? 'alert-orange' : 'alert-green'}`}>
              <span className="alert-count">{noAction.length}</span>
              <span className="alert-text">No next action set</span>
            </div>
          </div>
        </div>

        <div className="dash-card flex-1">
          <div className="dash-card-title">Lead Sources</div>
          {sourceCounts.length === 0 ? (
            <div className="empty-sources">No sources tracked yet</div>
          ) : (
            <div className="source-list">
              {sourceCounts.map(s => (
                <div key={s.source} className="source-item">
                  <span className="source-name">{s.source}</span>
                  <div className="source-bar-track">
                    <div
                      className="source-bar-fill"
                      style={{ width: `${(s.count / sourceCounts[0].count) * 100}%` }}
                    />
                  </div>
                  <span className="source-count">{s.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
