import { useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { PIPELINE_STAGES } from '../stages'
import { formatCurrency, todayISTStr, todayStr, toISTDateKey } from '../utils'

const DAY = 86400000

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(date) {
  return date.toLocaleDateString('en-IN', { month: 'short' })
}

function currencyValue(value) {
  return Number(value || 0)
}

function displayCurrency(value) {
  return value === 0 ? '₹0' : formatCurrency(value)
}

function daysSince(dateString) {
  if (!dateString) return null
  return Math.max(0, Math.floor((Date.now() - new Date(dateString).getTime()) / DAY))
}

function PulseMetric({ label, value, detail, tone = 'default', priority = false }) {
  return (
    <div className={`pulse-metric pulse-${tone} ${priority ? 'pulse-priority' : ''}`}>
      <span className="pulse-label">{label}</span>
      <strong className="pulse-value">{value}</strong>
      <span className="pulse-detail">{detail}</span>
    </div>
  )
}

function EmptyState({ children }) {
  return <div className="dashboard-empty">{children}</div>
}

function AttentionRow({ item, onOpenClient, onNavigate }) {
  const action = item.client
    ? () => onOpenClient?.(item.client)
    : () => onNavigate?.(item.destination)

  return (
    <button className={`attention-row attention-${item.tone || 'default'}`} onClick={action}>
      <span className="attention-main">
        <strong>{item.title}</strong>
        <span>{item.detail}</span>
      </span>
      <span className="attention-value">{item.value}</span>
      <span className="attention-arrow" aria-hidden="true">→</span>
    </button>
  )
}

function PipelineHealth({ clients, onOpenClient }) {
  const rows = PIPELINE_STAGES.map(stage => {
    const records = clients.filter(client => client.stage === stage.key)
    const value = records.reduce((sum, client) => sum + currencyValue(client.proposal_value || client.potential_revenue), 0)
    const stale = records.filter(client => {
      const age = daysSince(client.proposal_sent_at || client.last_contacted_at || client.created_at)
      return age !== null && age > (stage.key === 'proposal' ? 30 : 14)
    })
    return { ...stage, records, value, stale }
  })

  return (
    <section className="dashboard-section pipeline-health" aria-labelledby="pipeline-health-heading">
      <div className="section-heading">
        <div>
          <p className="section-eyebrow">Pipeline health</p>
          <h2 id="pipeline-health-heading">Open work, value and aging</h2>
        </div>
        <p>Values use quoted value when available, otherwise potential revenue.</p>
      </div>
      <div className="pipeline-health-table" role="table" aria-label="Pipeline health by stage">
        <div className="pipeline-health-head" role="row">
          <span>Stage</span><span>Open</span><span>Value</span><span>Needs review</span>
        </div>
        {rows.map(row => (
          <button key={row.key} className="pipeline-health-row" role="row" onClick={() => row.records[0] && onOpenClient?.(row.records[0])} disabled={!row.records.length}>
            <span className="pipeline-stage"><i style={{ background: row.color }} />{row.label}</span>
            <strong>{row.records.length}</strong>
            <strong>{formatCurrency(row.value)}</strong>
            <span className={row.stale.length ? 'risk-text' : 'muted-text'}>{row.stale.length ? `${row.stale.length} aging` : 'On track'}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

function RevenueTrend({ deals }) {
  const data = useMemo(() => {
    const now = new Date()
    const months = Array.from({ length: 6 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1)
      return { key: monthKey(date), month: monthLabel(date), booked: 0, deals: 0 }
    })
    const indexed = new Map(months.map(month => [month.key, month]))
    deals.forEach(deal => {
      if (!deal.created_at) return
      const bucket = indexed.get(monthKey(new Date(deal.created_at)))
      if (!bucket) return
      bucket.booked += currencyValue(deal.deal_value)
      bucket.deals += 1
    })
    return months
  }, [deals])

  const hasData = data.some(month => month.booked > 0)
  return (
    <section className="dashboard-section revenue-trend" aria-labelledby="revenue-trend-heading">
      <div className="section-heading">
        <div>
          <p className="section-eyebrow">Primary trend</p>
          <h2 id="revenue-trend-heading">Booked revenue</h2>
        </div>
        <p>Deals booked by month, based on recorded deal value.</p>
      </div>
      {hasData ? (
        <ResponsiveContainer width="100%" height={244}>
          <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border-light)" />
            <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
            <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} width={42} />
            <Tooltip
              cursor={{ fill: 'rgba(184,82,32,.05)' }}
              contentStyle={{ borderRadius: 6, border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)', fontSize: 12 }}
              formatter={(value, name) => [name === 'booked' ? formatCurrency(value) : value, name === 'booked' ? 'Booked' : 'Deals']}
            />
            <Bar dataKey="booked" fill="var(--primary)" radius={[4, 4, 0, 0]} maxBarSize={44} />
          </BarChart>
        </ResponsiveContainer>
      ) : <EmptyState>Revenue will appear here once recorded deals have a value.</EmptyState>}
    </section>
  )
}

function DeeperInsights({ clients, contactLogs }) {
  const insights = useMemo(() => {
    const now = Date.now()
    const logs30 = contactLogs.filter(log => log.contacted_at && now - new Date(log.contacted_at).getTime() <= 30 * DAY).length
    const logs7 = contactLogs.filter(log => log.contacted_at && now - new Date(log.contacted_at).getTime() <= 7 * DAY).length
    const won = clients.filter(client => client.stage === 'active' && client.won_at)
    const cycles = won.map(client => {
      const first = contactLogs.filter(log => log.client_id === client.id && log.contacted_at).sort((a, b) => new Date(a.contacted_at) - new Date(b.contacted_at))[0]
      return first ? Math.max(0, Math.round((new Date(client.won_at) - new Date(first.contacted_at)) / DAY)) : null
    }).filter(value => value !== null)
    const averageCycle = cycles.length ? Math.round(cycles.reduce((sum, value) => sum + value, 0) / cycles.length) : null
    return { logs30, logs7, averageCycle, cycleSample: cycles.length, lead: clients.filter(client => client.stage === 'lead').length, contacted: clients.filter(client => client.stage === 'contacted').length, proposal: clients.filter(client => client.stage === 'proposal').length }
  }, [clients, contactLogs])

  return (
    <details className="deeper-insights">
      <summary>Deeper operating signals <span>Optional context, not today’s priority</span></summary>
      <div className="insight-grid">
        <div><span>Contact activity</span><strong>{insights.logs7} in 7 days</strong><small>{insights.logs30} in 30 days</small></div>
        <div><span>Sales cycle</span><strong>{insights.averageCycle == null ? 'Not enough data' : `${insights.averageCycle} days`}</strong><small>{insights.cycleSample ? `${insights.cycleSample} won deal sample` : 'Needs a recorded first contact'}</small></div>
        <div><span>Stage distribution</span><strong>{insights.lead} / {insights.contacted} / {insights.proposal}</strong><small>Lead · contacted · proposal</small></div>
      </div>
    </details>
  )
}

export default function DashboardRedesign({ clients = [], contactLogs = [], deals = [], payments = [], tasks = [], onOpenClient, onNavigate }) {
  const today = todayStr()
  const todayIST = todayISTStr()
  const data = useMemo(() => {
    const now = new Date()
    const isCurrentMonth = date => date && new Date(date).getMonth() === now.getMonth() && new Date(date).getFullYear() === now.getFullYear()
    const openPipeline = clients.filter(client => ['contacted', 'proposal'].includes(client.stage))
    const proposals = clients.filter(client => client.stage === 'proposal')
    const overdueLeads = clients.filter(client => !['active', 'dead'].includes(client.stage) && client.next_action_due && client.next_action_due < today)
    const agingProposals = proposals.filter(client => (daysSince(client.proposal_sent_at || client.last_contacted_at || client.created_at) || 0) > 30)
    const dueTasks = tasks.filter(task => !task.done && task.due_date && task.due_date <= today)
    const booked = deals.filter(deal => isCurrentMonth(deal.created_at)).reduce((sum, deal) => sum + currencyValue(deal.deal_value), 0)
    const collected = payments.filter(payment => payment.paid && isCurrentMonth(payment.paid_at)).reduce((sum, payment) => sum + currencyValue(payment.amount), 0)
    const outstanding = payments.filter(payment => !payment.paid).reduce((sum, payment) => sum + currencyValue(payment.amount), 0)
    const qualifiedValue = openPipeline.reduce((sum, client) => sum + currencyValue(client.proposal_value || client.potential_revenue), 0)
    const logsToday = contactLogs.filter(log => log.contacted_at && toISTDateKey(log.contacted_at) === todayIST).length
    const logs7 = contactLogs.filter(log => log.contacted_at && Date.now() - new Date(log.contacted_at).getTime() <= 7 * DAY).length
    const openDeals = clients.filter(client => !['active', 'dead'].includes(client.stage)).length
    const attentionLeadIds = new Set([...overdueLeads, ...agingProposals].map(client => client.id))
    const attention = [
      ...overdueLeads.sort((a, b) => a.next_action_due.localeCompare(b.next_action_due)).slice(0, 3).map(client => ({
        client, tone: 'danger', title: client.name, detail: `${client.next_action || 'Follow-up needed'} · overdue since ${client.next_action_due}`, value: 'Follow up',
      })),
      ...agingProposals.filter(client => !overdueLeads.includes(client)).slice(0, 2).map(client => ({
        client, tone: 'warning', title: client.name, detail: `Proposal aging ${daysSince(client.proposal_sent_at || client.last_contacted_at || client.created_at)} days`, value: 'Review',
      })),
    ]
    if (dueTasks.length) attention.push({ tone: 'default', title: `${dueTasks.length} task${dueTasks.length === 1 ? '' : 's'} due`, detail: 'Open Desk to complete or reschedule today’s work.', value: 'Open desk', destination: 'tasks' })
    if (outstanding > 0) attention.push({ tone: 'warning', title: 'Collections outstanding', detail: 'Unpaid payment records require review.', value: formatCurrency(outstanding), destination: 'active' })
    return { booked, collected, outstanding, qualifiedValue, overdueLeads, agingProposals, proposals, dueTasks, needsAttention: attentionLeadIds.size + dueTasks.length, attention: attention.slice(0, 6), logsToday, logs7, openDeals }
  }, [clients, contactLogs, deals, payments, tasks, today, todayIST])

  return (
    <div className="dashboard dashboard-decision">
      <header className="dashboard-header dashboard-decision-header">
        <div>
          <p className="dashboard-eyebrow">Business pulse</p>
          <h1>Know what needs attention</h1>
        </div>
        <p>Today’s work, commercial exposure, and one clear revenue signal.</p>
      </header>

      <section className="pulse-grid control-pulse-grid" aria-label="Business pulse metrics">
        <PulseMetric label="Revenue booked" value={displayCurrency(data.booked)} detail="This month · recorded deal value" priority />
        <PulseMetric label="Cash collected" value={displayCurrency(data.collected)} detail={data.outstanding ? `${formatCurrency(data.outstanding)} pending collection` : 'No pending collection'} tone={data.outstanding ? 'warning' : 'success'} priority />
        <PulseMetric label="Pipeline exposure" value={displayCurrency(data.qualifiedValue)} detail={`${data.openDeals} open deals · ${data.proposals.length} proposals`} />
        <PulseMetric label="Needs attention" value={data.needsAttention} detail={`${data.overdueLeads.length} overdue · ${data.agingProposals.length} aging · ${data.dueTasks.length} tasks`} tone={data.overdueLeads.length ? 'danger' : 'default'} />
      </section>

      <section className="control-strip" aria-label="Operating summary">
        <div>
          <span>Pending collection</span>
          <strong>{displayCurrency(data.outstanding)}</strong>
        </div>
        <div>
          <span>Sales activity</span>
          <strong>{data.logsToday} today</strong>
          <small>{data.logs7} in 7 days</small>
        </div>
        <div>
          <span>Open proposals</span>
          <strong>{data.proposals.length}</strong>
        </div>
        <div>
          <span>Overdue follow-ups</span>
          <strong className={data.overdueLeads.length ? 'danger-text' : ''}>{data.overdueLeads.length}</strong>
        </div>
      </section>

      <div className="dashboard-focus-grid">
        <section className="dashboard-section attention-queue" aria-labelledby="attention-heading">
          <div className="section-heading">
            <div>
              <p className="section-eyebrow">Act now</p>
              <h2 id="attention-heading">Attention queue</h2>
            </div>
            <button className="quiet-link" onClick={() => onNavigate?.('today')}>Open Today →</button>
          </div>
          {data.attention.length ? <div className="attention-list">{data.attention.map((item, index) => <AttentionRow key={`${item.title}-${index}`} item={item} onOpenClient={onOpenClient} onNavigate={onNavigate} />)}</div> : <EmptyState>All clear. No overdue follow-ups, aging proposals, or due tasks.</EmptyState>}
        </section>
        <RevenueTrend deals={deals} />
      </div>

      <PipelineHealth clients={clients} onOpenClient={onOpenClient} />
      <DeeperInsights clients={clients} contactLogs={contactLogs} />
    </div>
  )
}
