import { formatDue, formatRelativeTime, waLink } from '../utils'
import { ALL_STAGES, TEMPERATURES } from '../stages'

export default function RemindersView({ reminders, onCardClick }) {
  const today = new Date().toISOString().split('T')[0]

  const overdue = reminders
    .filter(c => c.next_action_due < today)
    .sort((a, b) => a.next_action_due.localeCompare(b.next_action_due))

  const dueToday = reminders
    .filter(c => c.next_action_due === today)

  const stageMap = Object.fromEntries(ALL_STAGES.map(s => [s.key, s]))

  function ReminderRow({ client }) {
    const stage = stageMap[client.stage]
    const temp = TEMPERATURES.find(t => t.key === client.temperature)
    const due = formatDue(client.next_action_due)
    const wa = waLink(client.phone)

    return (
      <div className="reminder-row" onClick={() => onCardClick(client)}>
        <div className="reminder-row-left">
          {temp && <span className="temp-badge">{temp.emoji}</span>}
          <div className="reminder-row-info">
            <span className="reminder-row-name">{client.name}</span>
            {client.company && <span className="reminder-row-company">{client.company}</span>}
          </div>
        </div>
        <div className="reminder-row-action">
          {client.next_action || 'No action set'}
        </div>
        <div className="reminder-row-stage" style={{ color: stage?.color }}>
          {stage?.label}
        </div>
        <div className={`reminder-row-due ${due?.cls || ''}`}>
          {due?.label}
        </div>
        <div className="reminder-row-contact">
          {formatRelativeTime(client.last_contacted_at) || 'Never'}
        </div>
        <div className="reminder-row-actions">
          {wa && (
            <a href={wa} target="_blank" rel="noreferrer" className="wa-btn" onClick={e => e.stopPropagation()}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
            </a>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="reminders-view">
      <div className="reminders-view-header">
        <h2 className="list-panel-title">Today's Follow-ups</h2>
        <span className="list-panel-count">{reminders.length} pending</span>
      </div>

      {reminders.length === 0 ? (
        <div className="reminders-empty">
          <div className="reminders-empty-icon">✓</div>
          <div className="reminders-empty-text">All caught up. No follow-ups due today.</div>
        </div>
      ) : (
        <>
          {/* Table header */}
          <div className="reminder-row reminder-header-row">
            <div className="reminder-row-left">Lead</div>
            <div className="reminder-row-action">Next Action</div>
            <div className="reminder-row-stage">Stage</div>
            <div className="reminder-row-due">Status</div>
            <div className="reminder-row-contact">Last Contact</div>
            <div className="reminder-row-actions"></div>
          </div>

          {/* Overdue section */}
          {overdue.length > 0 && (
            <>
              <div className="reminder-section-label overdue-label">
                Overdue ({overdue.length})
              </div>
              {overdue.map(c => <ReminderRow key={c.id} client={c} />)}
            </>
          )}

          {/* Due today section */}
          {dueToday.length > 0 && (
            <>
              <div className="reminder-section-label today-label">
                Due Today ({dueToday.length})
              </div>
              {dueToday.map(c => <ReminderRow key={c.id} client={c} />)}
            </>
          )}
        </>
      )}
    </div>
  )
}
