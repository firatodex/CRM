import { useMemo, useState } from 'react'
import { TASK_TYPES } from '../stages'
import { todayStr } from '../utils'

function taskTypeInfo(type) {
  return TASK_TYPES.find(t => t.key === type) || TASK_TYPES[TASK_TYPES.length - 1]
}

function TaskRow({ task, client, onDone, onReschedule, onOpenClient }) {
  const info = taskTypeInfo(task.task_type)
  const [reschedOpen, setReschedOpen] = useState(false)
  const [newDate, setNewDate] = useState(task.due_date)
  const [newTime, setNewTime] = useState(task.due_time || '')

  function submitResched() {
    onReschedule(task.id, newDate, newTime || null)
    setReschedOpen(false)
  }

  return (
    <div className="task-row">
      <button className="task-done-btn" onClick={() => onDone(task.id)} title="Mark done">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="9"/>
        </svg>
      </button>

      <div className="task-row-main" onClick={() => onOpenClient(client)}>
        <span className="task-type-emoji">{info.emoji}</span>
        <div className="task-row-text">
          <div className="task-row-title">
            {info.label}
            {task.note && <span className="task-row-note"> — {task.note}</span>}
          </div>
          <div className="task-row-lead">
            {client ? `${client.name}${client.company ? ' · ' + client.company : ''}` : 'Lead not found'}
          </div>
        </div>
      </div>

      <div className="task-row-time">
        {task.due_time && <span className="task-time-badge">{task.due_time}</span>}
      </div>

      <button className="task-resched-btn" onClick={() => setReschedOpen(v => !v)} title="Reschedule">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
      </button>

      {reschedOpen && (
        <div className="task-resched-popover" onClick={e => e.stopPropagation()}>
          <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} />
          <input type="time" value={newTime} onChange={e => setNewTime(e.target.value)} placeholder="Optional" />
          <button className="btn btn-primary btn-sm" onClick={submitResched}>Save</button>
        </div>
      )}
    </div>
  )
}

export default function TasksView({ tasks, clients, onDone, onReschedule, onOpenClient }) {
  const today = todayStr()
  const clientMap = useMemo(() => {
    const m = new Map()
    clients.forEach(c => m.set(c.id, c))
    return m
  }, [clients])

  const pending = tasks.filter(t => !t.done)

  const overdue  = pending.filter(t => t.due_date < today)
    .sort((a, b) => a.due_date.localeCompare(b.due_date))
  const dueToday = pending.filter(t => t.due_date === today)
    .sort((a, b) => (a.due_time || '99:99').localeCompare(b.due_time || '99:99'))
  const upcoming = pending.filter(t => t.due_date > today)
    .sort((a, b) => a.due_date.localeCompare(b.due_date) || (a.due_time || '99:99').localeCompare(b.due_time || '99:99'))

  function renderGroup(title, list, cls) {
    if (list.length === 0) return null
    return (
      <div className="task-group">
        <div className={`task-group-title ${cls || ''}`}>{title} <span className="task-group-count">{list.length}</span></div>
        <div className="task-group-list">
          {list.map(t => (
            <TaskRow
              key={t.id}
              task={t}
              client={clientMap.get(t.client_id)}
              onDone={onDone}
              onReschedule={onReschedule}
              onOpenClient={onOpenClient}
            />
          ))}
        </div>
      </div>
    )
  }

  if (pending.length === 0) {
    return (
      <div className="list-panel">
        <div className="list-empty" style={{ padding: '60px 0', textAlign: 'center' }}>
          ✓ No pending tasks. Add one from any lead's detail view.
        </div>
      </div>
    )
  }

  return (
    <div className="list-panel">
      {renderGroup('Overdue', overdue, 'overdue-label')}
      {renderGroup('Today', dueToday, 'today-label')}
      {renderGroup('Upcoming', upcoming)}
    </div>
  )
}
