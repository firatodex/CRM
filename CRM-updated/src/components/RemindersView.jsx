import { useState, useCallback } from 'react'
import { TEMPERATURES } from '../stages'
import { formatDue, waLink } from '../utils'

const REMINDER_STAGES = [
  { key: 'overdue',  label: 'Overdue',    color: '#FF3B30', emptyText: 'No overdue items' },
  { key: 'today',   label: 'Due Today',   color: '#FF9500', emptyText: 'Nothing due today' },
  { key: 'soon',    label: 'Due Soon',    color: '#007AFF', emptyText: 'Nothing due soon' },
  { key: 'no-date', label: 'No Date Set', color: '#8E8E93', emptyText: 'All leads have a due date' },
]

function getReminderStage(client) {
  const todayStr = new Date().toISOString().split('T')[0]
  if (!client.next_action_due) return 'no-date'
  if (client.next_action_due < todayStr) return 'overdue'
  if (client.next_action_due === todayStr) return 'today'
  return 'soon'
}

export default function RemindersView({ reminders, allPipelineClients, onCardClick, onUpdateClient }) {
  const [draggedClient, setDraggedClient] = useState(null)
  const [dragOver, setDragOver] = useState(null)

  // Build the pool: reminders (overdue/today) + pipeline leads with upcoming dates
  const pool = allPipelineClients || reminders

  const columns = REMINDER_STAGES.map(stage => ({
    ...stage,
    clients: pool.filter(c => getReminderStage(c) === stage.key)
      .sort((a, b) => {
        if (!a.next_action_due && !b.next_action_due) return 0
        if (!a.next_action_due) return 1
        if (!b.next_action_due) return -1
        return a.next_action_due.localeCompare(b.next_action_due)
      })
  }))

  const handleDrop = useCallback(async (toStageKey) => {
    if (!draggedClient) return
    const todayStr = new Date().toISOString().split('T')[0]
    const d = new Date()

    let newDue = null
    if (toStageKey === 'today') {
      newDue = todayStr
    } else if (toStageKey === 'soon') {
      d.setDate(d.getDate() + 3)
      newDue = d.toISOString().split('T')[0]
    } else if (toStageKey === 'overdue') {
      // Move back to yesterday
      d.setDate(d.getDate() - 1)
      newDue = d.toISOString().split('T')[0]
    } else {
      newDue = null
    }

    if (onUpdateClient) {
      await onUpdateClient(draggedClient.id, { next_action_due: newDue })
    }
    setDraggedClient(null)
    setDragOver(null)
  }, [draggedClient, onUpdateClient])

  function ReminderCard({ client }) {
    const temp = TEMPERATURES.find(t => t.key === client.temperature)
    const due = formatDue(client.next_action_due)
    const wa = waLink(client.phone)

    return (
      <div
        className="reminder-kanban-card"
        draggable
        onDragStart={() => setDraggedClient(client)}
        onDragEnd={() => { setDraggedClient(null); setDragOver(null) }}
        onClick={() => onCardClick(client)}
      >
        <div className="reminder-card-top">
          <div className="reminder-card-name">
            {temp && <span style={{ marginRight: 4 }}>{temp.emoji}</span>}
            {client.name}
          </div>
          {wa && (
            <a href={wa} target="_blank" rel="noreferrer" className="reminder-wa-btn"
              onClick={e => e.stopPropagation()}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
            </a>
          )}
        </div>
        {client.company && <div className="reminder-card-company">{client.company}</div>}
        {client.next_action && (
          <div className="reminder-card-action">{client.next_action}</div>
        )}
        {due && (
          <div className={`reminder-card-due ${due.cls || ''}`}>{due.label}</div>
        )}
      </div>
    )
  }

  const totalReminders = columns[0].clients.length + columns[1].clients.length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '0 20px 12px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <h2 className="list-panel-title" style={{ margin: 0 }}>Follow-ups</h2>
        {totalReminders > 0 && (
          <span style={{ fontSize: 13, color: 'var(--danger)', fontWeight: 500 }}>
            {totalReminders} need attention
          </span>
        )}
        <span style={{ fontSize: 12, color: 'var(--text2)', marginLeft: 'auto' }}>
          Drag cards to reschedule
        </span>
      </div>

      <div className="board" style={{ flex: 1 }}>
        {columns.map(col => (
          <div
            key={col.key}
            className={`column ${dragOver === col.key ? 'column-drag-over' : ''}`}
            style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}
            onDragOver={e => { e.preventDefault(); setDragOver(col.key) }}
            onDragLeave={() => setDragOver(null)}
            onDrop={() => handleDrop(col.key)}
          >
            <div className="column-header">
              <span className="column-title">
                <span className="stage-dot" style={{ background: col.color }} />
                {col.label}
              </span>
              <span className="column-count">{col.clients.length}</span>
            </div>
            <div className="cards" style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
              {col.clients.length === 0
                ? <div className="empty-col">{dragOver === col.key ? 'Drop here' : col.emptyText}</div>
                : col.clients.map(c => <ReminderCard key={c.id} client={c} />)
              }
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
