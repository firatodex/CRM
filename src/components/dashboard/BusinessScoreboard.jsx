import { formatCurrency, todayStr, datePart, addDays } from '../../utils'
import { addMonths } from '../../utils/paymentMath'
import MetricCard from './MetricCard'

export default function BusinessScoreboard({ clients, deals, payments }) {
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
