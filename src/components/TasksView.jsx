import { useMemo, useState, useRef, useEffect } from 'react'
import { TASK_TYPES } from '../stages'
import { todayStr } from '../utils'

function taskTypeInfo(type) {
  return TASK_TYPES.find(t => t.key === type) || TASK_TYPES[TASK_TYPES.length - 1]
}

function quickDate(daysFromNow) {
  const d = new Date()
  d.setDate(d.getDate() + daysFromNow)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function LeadPicker({ clients, value, onChange }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  useEffect(() => {
    function handleClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const results = useMemo(() => {
    if (!query.trim()) return []
    const q = query.toLowerCase()
    return clients
      .filter(c => (c.name || '').toLowerCase().includes(q) || (c.company || '').toLowerCase().includes(q))
      .slice(0, 8)
  }, [clients, query])

  if (value) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '6px 10px', background: 'var(--primary-light)', borderRadius: 6, fontSize: 13,
      }}>
        <span style={{ flex: 1, color: 'var(--primary)', fontWeight: 600 }}>
          {value.name}{value.company ? ` · ${value.company}` : ''}
        </span>
        <button onClick={() => onChange(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', fontWeight: 700 }}>×</button>
      </div>
    )
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <input
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        placeholder="Search a lead (optional)…"
        style={{ width: '100%', fontSize: 13, padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 6, fontFamily: 'var(--font)' }}
      />
      {open && results.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 2,
          background: 'var(--bg-white)', border: '1px solid var(--border)', borderRadius: 6,
          boxShadow: 'var(--shadow-md)', zIndex: 30, maxHeight: 200, overflowY: 'auto',
        }}>
          {results.map(c => (
            <div
              key={c.id}
              onClick={() => { onChange(c); setQuery(''); setOpen(false) }}
              style={{ padding: '7px 10px', fontSize: 13, cursor: 'pointer', borderBottom: '1px solid var(--border-light)' }}
              onMouseDown={e => e.preventDefault()}
            >
              <div style={{ fontWeight: 600 }}>{c.name}</div>
              {c.company && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.company}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function AddTaskForm({ clients, onAdd, onCancel }) {
  const [taskType, setTaskType] = useState('custom')
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')
  const [linkedClient, setLinkedClient] = useState(null)
  const [dueDate, setDueDate] = useState(quickDate(0))
  const [dueTime, setDueTime] = useState('')

  function submit() {
    if (!dueDate) return
    // If linked to a lead, the lead's name carries identity — title is optional context.
    // If standalone, title is required to know what the task actually is.
    if (!linkedClient && !title.trim()) return
    onAdd(linkedClient ? linkedClient.id : null, taskType, note.trim() || null, dueDate, dueTime || null, title.trim() || null)
    setTaskType('custom'); setTitle(''); setNote(''); setLinkedClient(null)
    setDueDate(quickDate(0)); setDueTime('')
  }

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 14, marginBottom: 16, background: 'var(--bg-white)' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
        {TASK_TYPES.map(t => (
          <button
            key={t.key}
            onClick={() => setTaskType(t.key)}
            style={{
              fontSize: 12, padding: '5px 10px', borderRadius: 6,
              border: `1px solid ${taskType === t.key ? 'var(--primary)' : 'var(--border)'}`,
              background: taskType === t.key ? 'var(--primary-light)' : 'var(--bg-white)',
              color: taskType === t.key ? 'var(--primary)' : 'var(--text-body)',
              cursor: 'pointer', fontWeight: taskType === t.key ? 600 : 400,
            }}
          >
            {t.emoji} {t.label}
          </button>
        ))}
      </div>

      <div style={{ marginBottom: 8 }}>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder={linkedClient ? 'Title (optional — lead name will show)' : 'What is this task? e.g. "Add export feature to CRM"'}
          style={{ width: '100%', fontSize: 13, padding: '7px 9px', border: '1px solid var(--border)', borderRadius: 6, fontFamily: 'var(--font)' }}
        />
      </div>

      <div style={{ marginBottom: 8 }}>
        <LeadPicker clients={clients} value={linkedClient} onChange={setLinkedClient} />
      </div>

      <div style={{ marginBottom: 8 }}>
        <input
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Note (optional)"
          style={{ width: '100%', fontSize: 13, padding: '7px 9px', border: '1px solid var(--border)', borderRadius: 6, fontFamily: 'var(--font)' }}
        />
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        <button className="quick-date-btn" onClick={() => setDueDate(quickDate(0))}>Today</button>
        <button className="quick-date-btn" onClick={() => setDueDate(quickDate(1))}>Tomorrow</button>
        <button className="quick-date-btn" onClick={() => setDueDate(quickDate(7))}>+7 days</button>
        <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={{ fontSize: 12, padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 6 }} />
        <input type="time" value={dueTime} onChange={e => setDueTime(e.target.value)} title="Optional time" style={{ fontSize: 12, padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 6 }} />
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={submit} className="btn btn-primary btn-sm" style={{ flex: 1 }}>Add task</button>
        <button onClick={onCancel} className="btn btn-secondary btn-sm">Cancel</button>
      </div>
    </div>
  )
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

  // Display label: linked lead's name takes priority (it IS the identity);
  // otherwise fall back to the task's own title.
  const primaryLabel = client
    ? `${client.name}${client.company ? ' · ' + client.company : ''}`
    : (task.title || info.label)

  return (
    <div className="task-row">
      <button className="task-done-btn" onClick={() => onDone(task.id)} title="Mark done">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="9"/>
        </svg>
      </button>

      <div className="task-row-main" onClick={() => client && onOpenClient(client)} style={{ cursor: client ? 'pointer' : 'default' }}>
        <span className="task-type-emoji">{info.emoji}</span>
        <div className="task-row-text">
          <div className="task-row-title">
            {primaryLabel}
          </div>
          <div className="task-row-lead">
            {client ? `${info.label}${task.note ? ' — ' + task.note : ''}` : (task.note || info.label)}
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

export default function TasksView({ tasks, clients, onAddTask, onDone, onReschedule, onOpenClient }) {
  const today = todayStr()
  const [showAdd, setShowAdd] = useState(false)
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
              client={t.client_id ? clientMap.get(t.client_id) : null}
              onDone={onDone}
              onReschedule={onReschedule}
              onOpenClient={onOpenClient}
            />
          ))}
        </div>
      </div>
    )
  }

  function handleAdd(...args) {
    onAddTask(...args)
    setShowAdd(false)
  }

  return (
    <div className="list-panel">
      <div className="list-panel-header">
        <h2 className="list-panel-title">Tasks</h2>
        {!showAdd && (
          <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>+ Add task</button>
        )}
      </div>

      {showAdd && (
        <AddTaskForm clients={clients} onAdd={handleAdd} onCancel={() => setShowAdd(false)} />
      )}

      {pending.length === 0 ? (
        <div className="list-empty" style={{ padding: '60px 0', textAlign: 'center' }}>
          ✓ No pending tasks.
        </div>
      ) : (
        <>
          {renderGroup('Overdue', overdue, 'overdue-label')}
          {renderGroup('Today', dueToday, 'today-label')}
          {renderGroup('Upcoming', upcoming)}
        </>
      )}
    </div>
  )
}
