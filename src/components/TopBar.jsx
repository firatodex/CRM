import { formatCurrency } from '../utils'
import { signOut } from '../api/auth'

const NAV = [
  { key: 'pipeline', label: 'Pipeline' },
  { key: 'today', label: 'Today', badge: 'today' },
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'active', label: 'Clients', badge: 'clients' },
  { key: 'payments', label: 'Payments' },
  { key: 'team', label: 'Team' },
]

// Hidden behind SHOW_DELIVERY_HEALTH_DESK_NAV in App.jsx
const HIDDEN_NAV = [
  { key: 'delivery', label: 'Delivery' },
  { key: 'health', label: 'Health' },
  { key: 'tasks', label: 'Desk', badge: 'tasks' },
]

const plural = (n, word) => `${n} ${word}${n !== 1 ? 's' : ''}`

function SyncStatus({ isOnline, pendingCount, failedCount, syncing }) {
  if (isOnline && pendingCount === 0 && failedCount === 0 && !syncing) return null
  const cls = !isOnline ? 'sync-offline' : failedCount > 0 ? 'sync-failed' : 'sync-pending'
  const title = !isOnline ? `Offline — ${plural(pendingCount, 'action')} queued`
    : failedCount > 0 ? `${plural(failedCount, 'action')} failed to sync`
    : syncing ? 'Syncing…'
    : `${plural(pendingCount, 'action')} queued`
  const label = !isOnline ? `⚡ Offline${pendingCount > 0 ? ` · ${pendingCount}` : ''}`
    : failedCount > 0 ? `⚠ ${failedCount} failed`
    : syncing ? '↻ Syncing…'
    : `↻ ${pendingCount} queued`
  return <span className={`sync-status ${cls}`} title={title}>{label}</span>
}

export default function TopBar({
  view, onViewChange,
  todayBadge, activeClientCount, urgentTaskCount, showHiddenViews,
  sync, pipelineRevenue,
  onSearch, onExport, onAddLead,
}) {
  const badges = {
    today: todayBadge > 0 && <span className="nav-badge red">{todayBadge}</span>,
    clients: activeClientCount > 0 && <span className="nav-badge green">{activeClientCount}</span>,
    tasks: urgentTaskCount > 0 && <span className="nav-badge red">{urgentTaskCount}</span>,
  }
  const items = showHiddenViews ? [...NAV, ...HIDDEN_NAV] : NAV

  return (
    <div className="topbar">
      <div className="topbar-left">
        <span className="topbar-logo">Dyzen Solar Technologies</span>
      </div>
      <nav className="topbar-nav">
        {items.map(item => (
          <button
            key={item.key}
            className={`nav-btn ${view === item.key ? 'active' : ''}`}
            onClick={() => onViewChange(item.key)}
          >
            {item.label}
            {item.badge && badges[item.badge]}
          </button>
        ))}
      </nav>
      <div className="topbar-right">
        <SyncStatus {...sync} />
        {pipelineRevenue > 0 && (
          <span className="topbar-revenue" title="Pipeline potential revenue">
            {formatCurrency(pipelineRevenue)}
          </span>
        )}
        <button className="btn-icon" onClick={onSearch} title="Search (/)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
        </button>
        <button className="btn-icon" onClick={onExport} title="Export data">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>
          </svg>
        </button>
        <button className="btn btn-primary btn-sm" onClick={onAddLead}>+ Add lead</button>
        <button className="btn-icon" onClick={signOut} title="Sign out">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
        </button>
      </div>
    </div>
  )
}
