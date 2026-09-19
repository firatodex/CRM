import { formatCurrency } from '../utils'
import { dueStatus } from '../utils/collectionQueue'

function formatDisplayDate(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso + (iso.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric',
    })
  } catch {
    return iso
  }
}

/**
 * Shared collection queue list — same rows on Payments and Today.
 */
export default function CollectionQueueList({
  items = [],
  today,
  onOpenClient,
  onMarkPaid,
  busyKey = null,
  emptyTitle = 'Nothing to collect',
  emptyHint = 'All open amounts are settled for this filter.',
  emptyAction = null,
  compact = false,
  maxHeight = null,
}) {
  if (!items.length) {
    return (
      <div className={`collection-empty${compact ? ' collection-empty--compact' : ''}`}>
        <div className="collection-empty-title">{emptyTitle}</div>
        {emptyHint && <div className="collection-empty-hint">{emptyHint}</div>}
        {emptyAction && <div className="collection-empty-action">{emptyAction}</div>}
      </div>
    )
  }

  return (
    <div
      className={`collection-queue${compact ? ' collection-queue--compact' : ''}`}
      style={{
        maxHeight: maxHeight || undefined,
        overflowY: maxHeight ? 'auto' : undefined,
      }}
    >
      {items.map(item => (
        <CollectionQueueRow
          key={item.key}
          item={item}
          today={today}
          onOpenClient={onOpenClient}
          onMarkPaid={onMarkPaid}
          busy={busyKey === item.key}
          compact={compact}
        />
      ))}
    </div>
  )
}

export function CollectionQueueRow({
  item,
  today,
  onOpenClient,
  onMarkPaid,
  busy = false,
  compact = false,
}) {
  const st = dueStatus(item.dueDate, today)
  const statusColor = st.key === 'overdue' ? '#b91c1c' : st.key === 'today' || st.key === 'open' ? '#a16207' : '#374151'
  const statusBg = st.key === 'overdue' ? '#fee2e2' : st.key === 'today' || st.key === 'open' ? '#fef3c7' : '#f3f4f6'
  const overdueClass = st.key === 'overdue' ? ' is-overdue' : ''

  if (compact) {
    return (
      <div className={`collection-row collection-row--compact${overdueClass}`}>
        <button
          type="button"
          className="collection-row-client"
          onClick={() => onOpenClient?.(item.client)}
        >
          <div className="collection-row-name">{item.client?.name || '—'}</div>
          <div className="collection-row-meta">
            {item.client?.company || '—'} · {item.label} · {formatCurrency(item.amount)}
          </div>
        </button>
        <span className="collection-row-status" style={{ color: statusColor, background: statusBg }}>
          {st.label}
        </span>
        <button
          type="button"
          className="btn btn-primary btn-sm collection-row-action"
          disabled={busy}
          onClick={() => onMarkPaid?.(item)}
        >
          {busy ? '…' : 'Mark paid'}
        </button>
      </div>
    )
  }

  return (
    <div className={`collection-row${overdueClass}`}>
      <div className="collection-row-main">
        <button
          type="button"
          className="collection-row-client"
          onClick={() => onOpenClient?.(item.client)}
        >
          <div className="collection-row-name">{item.client?.name || '—'}</div>
          <div className="collection-row-company">{item.client?.company || '—'}</div>
        </button>
        <div className="collection-row-details">
          <span className="collection-row-status" style={{ color: statusColor, background: statusBg }}>
            {st.label}
          </span>
          <span className="collection-row-label">{item.label}</span>
          <span className={`collection-row-due${st.key === 'overdue' ? ' is-late' : ''}`}>
            Due {formatDisplayDate(item.dueDate)}
            {st.key === 'overdue' && st.days != null ? ` · ${Math.abs(st.days)}d late` : ''}
            {st.key === 'soon' && st.days != null ? ` · in ${st.days}d` : ''}
          </span>
        </div>
      </div>
      <div className="collection-row-side">
        <div className="collection-row-amount">{formatCurrency(item.amount)}</div>
        <button
          type="button"
          className="btn btn-primary btn-sm collection-row-action"
          disabled={busy}
          onClick={() => onMarkPaid?.(item)}
        >
          {busy ? '…' : 'Mark paid'}
        </button>
      </div>
    </div>
  )
}
