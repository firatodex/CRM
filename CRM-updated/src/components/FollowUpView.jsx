import { useState } from 'react'
import { TEMPERATURES } from '../stages'
import { formatDue, waLink, todayStr } from '../utils'

export default function FollowUpView({ clients, onCardClick, onLogContact }) {
  const [done, setDone] = useState(new Set())
  const today = todayStr()

  const due = clients
    .filter(c => !['active', 'dead'].includes(c.stage))
    .filter(c => c.next_action_due && c.next_action_due <= today)
    .sort((a, b) => a.next_action_due.localeCompare(b.next_action_due))

  const upcoming = clients
    .filter(c => !['active', 'dead'].includes(c.stage))
    .filter(c => {
      if (!c.next_action_due || c.next_action_due <= today) return false
      const d = new Date(c.next_action_due + 'T00:00:00')
      const diff = Math.round((d - new Date(today + 'T00:00:00')) / 86400000)
      return diff <= 7
    })
    .sort((a, b) => a.next_action_due.localeCompare(b.next_action_due))

  function toggleDone(id) {
    setDone(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function LeadRow({ client }) {
    const temp = TEMPERATURES.find(t => t.key === client.temperature)
    const due = formatDue(client.next_action_due)
    const wa = waLink(client.phone)
    const isDone = done.has(client.id)

    return (
      <div className={`followup-row ${isDone ? 'followup-done' : ''}`}>
        <button
          className={`followup-check ${isDone ? 'checked' : ''}`}
          onClick={() => toggleDone(client.id)}
          title="Mark as contacted"
        >
          {isDone ? '✓' : ''}
        </button>
        <div className="followup-info" onClick={() => onCardClick(client)}>
          <div className="followup-name">
            {temp && <span style={{ marginRight: 4 }}>{temp.emoji}</span>}
            {client.name}
            {client.company && <span className="followup-company"> · {client.company}</span>}
          </div>
          {client.next_action && (
            <div className="followup-action">{client.next_action}</div>
          )}
        </div>
        <div className={`reminder-row-due ${due?.cls || ''}`} style={{ fontSize: 12, flexShrink: 0 }}>
          {due?.label}
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          {wa && (
            <a href={wa} target="_blank" rel="noreferrer" className="wa-btn" onClick={e => e.stopPropagation()}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
            </a>
          )}
          <button className="btn btn-secondary btn-sm" onClick={() => onCardClick(client)}>Open</button>
        </div>
      </div>
    )
  }

  return (
    <div className="reminders-view">
      <div className="reminders-view-header">
        <h2 className="list-panel-title">Daily Call Sheet</h2>
        <span className="list-panel-count">
          {due.length} due · {done.size} done today
        </span>
      </div>

      {due.length === 0 && upcoming.length === 0 ? (
        <div className="reminders-empty">
          <div className="reminders-empty-icon">✓</div>
          <div className="reminders-empty-text">No follow-ups pending. Add next actions to your leads.</div>
        </div>
      ) : (
        <>
          {due.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div className="reminder-section-label overdue-label" style={{ marginBottom: 8 }}>
                Overdue & due today ({due.length})
              </div>
              {due.map(c => <LeadRow key={c.id} client={c} />)}
            </div>
          )}

          {upcoming.length > 0 && (
            <div>
              <div className="reminder-section-label today-label" style={{ marginBottom: 8 }}>
                Coming up this week ({upcoming.length})
              </div>
              {upcoming.map(c => <LeadRow key={c.id} client={c} />)}
            </div>
          )}
        </>
      )}
    </div>
  )
}
