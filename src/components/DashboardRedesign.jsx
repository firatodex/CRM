import BusinessScoreboard from './dashboard/BusinessScoreboard'
import RevenueRealization from './dashboard/RevenueRealization'
import PipelineReserveGraph from './dashboard/PipelineReserveGraph'
import ContactActivityGraph from './dashboard/ContactActivityGraph'
import SalesCycleAnalysis from './dashboard/SalesCycleAnalysis'
import PipelineAge from './dashboard/PipelineAge'
import BottleneckAnalysis from './dashboard/BottleneckAnalysis'

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
