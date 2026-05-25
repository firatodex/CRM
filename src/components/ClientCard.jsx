import { formatDue, formatRelativeTime, formatCurrency, waLink } from '../utils'
import { TEMPERATURES } from '../stages'
import {
  getDecision, getEffortScore, getStaleness,
  getStalenessColor, getDecisionStyle, getEffortColor
} from '../decisionEngine'

export default function ClientCard({ client, onClick, onDragStart, logCount = 0 }) {
  const due        = client.next_action_due ? formatDue(client.next_action_due) : null
  const wa         = waLink(client.phone)
  const temp       = TEMPERATURES.find(t => t.key === client.temperature)
  const lastContact = formatRelativeTime(client.last_contacted_at)

  // Decision engine — instant, no API call
  const decision   = getDecision(client, logCount)
  const ds         = getDecisionStyle(decision)
  const effortScore = getEffortScore(client, logCount)
  const staleness  = getStaleness(client.last_contacted_at)
  const stalenessColor = getStalenessColor(staleness)

  return (
    <div
      className="card"
      onClick={() => onClick(client)}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        onDragStart(client)
      }}
      style={stalenessColor ? { background: stalenessColor, borderColor: 'transparent' } : {}}
    >
      {/* Top row: name + WhatsApp */}
      <div className="card-top-row">
        <div className="card-name-row">
          {temp && <span className="temp-badge" title={temp.label}>{temp.emoji}</span>}
          <span className="card-name">{client.name}</span>
        </div>
        {wa && (
          <a
            href={wa}
            target="_blank"
            rel="noreferrer"
            className="wa-btn"
            onClick={e => e.stopPropagation()}
            title="WhatsApp"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
          </a>
        )}
      </div>

      {client.company && (
        <div className="card-company">
          {[client.company, client.business_type].filter(Boolean).join(' · ')}
        </div>
      )}

      {/* Revenue + decision badge on same row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        {client.potential_revenue ? (
          <span className="card-revenue" style={{ margin: 0 }}>
            {formatCurrency(client.potential_revenue)}
          </span>
        ) : (
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>No revenue set</span>
        )}

        {/* Decision badge — instant, no API */}
        {ds && (
          <span style={{
            fontSize: 10, fontWeight: 800, padding: '2px 7px',
            borderRadius: 20, letterSpacing: '0.3px',
            background: ds.bg, color: ds.color,
            border: '1px solid ' + ds.border,
            flexShrink: 0,
          }}>
            {decision}
          </span>
        )}
      </div>

      {client.next_action && (
        <div className="card-action">{client.next_action}</div>
      )}

      {/* Footer: due date + effort score + last contact */}
      <div className="card-footer">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          {due && <span className={`card-due ${due.cls}`}>{due.label}</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {/* Effort/value score — lower is worse */}
          {effortScore !== null && (
            <span
              title={`Effort score: ${effortScore}/100 — revenue vs interactions ratio`}
              style={{
                fontSize: 10, fontWeight: 700,
                color: getEffortColor(effortScore),
              }}
            >
              {logCount}× {effortScore < 40 ? '⚠' : ''}
            </span>
          )}
          {lastContact && (
            <span className="card-last-contact">{lastContact}</span>
          )}
        </div>
      </div>
    </div>
  )
}
