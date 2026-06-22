import { useMemo, useState } from 'react'
import { TASK_TYPES } from '../stages'
import { todayStr } from '../utils'
import { AddTaskForm } from './TasksView'

// ── helpers ──────────────────────────────────────────────────────────────────

function isoDate(d) {
  return d.toISOString().slice(0, 10)
}

function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const ms = Date.UTC(y, m - 1, d + n, 12, 0, 0)
  const dt = new Date(ms)
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
}

function timeToMinutes(t) {
  if (!t) return null
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function fmtTime(t) {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'pm' : 'am'
  const hh = h % 12 || 12
  return `${hh}${m ? ':' + String(m).padStart(2, '0') : ''}${ampm}`
}

function taskTypeInfo(type) {
  return TASK_TYPES.find(t => t.key === type) || TASK_TYPES[TASK_TYPES.length - 1]
}

// ── MiniCalendar ─────────────────────────────────────────────────────────────

function MiniCalendar({ selectedDate, onSelectDate, itemsByDate }) {
  const today = todayStr()

  // Show 5 weeks starting from the Monday on or before today.
  // We use a known Monday anchor (2000-01-03 was a Monday) and compute
  // weeks elapsed since then — completely avoids getDay() timezone issues.
  const start = useMemo(() => {
    // Use UTC noon to avoid timezone date-flip issues (e.g. IST +5:30 where
    // T00:00:00Z = previous local day). 2000-01-03T12:00:00Z is unambiguously
    // Monday January 3 2000 in every timezone from UTC-12 to UTC+14.
    const KNOWN_MONDAY_NOON = new Date('2000-01-03T12:00:00Z').getTime()
    const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000
    // Parse today's date parts from local time (todayStr uses local getDate/Month/Year)
    const [y, mo, d] = today.split('-').map(Number)
    const todayNoonMs = Date.UTC(y, mo - 1, d, 12, 0, 0)
    const weeksSince = Math.floor((todayNoonMs - KNOWN_MONDAY_NOON) / MS_PER_WEEK)
    const mondayNoonMs = KNOWN_MONDAY_NOON + weeksSince * MS_PER_WEEK
    // Convert back to a date string using UTC date parts at that noon timestamp
    const mondayDate = new Date(mondayNoonMs)
    const my = mondayDate.getUTCFullYear()
    const mm = String(mondayDate.getUTCMonth() + 1).padStart(2, '0')
    const md = String(mondayDate.getUTCDate()).padStart(2, '0')
    return `${my}-${mm}-${md}`
  }, [today])

  const weeks = useMemo(() => {
    const ws = []
    for (let w = 0; w < 5; w++) {
      const week = []
      for (let d = 0; d < 7; d++) {
        week.push(addDays(start, w * 7 + d))
      }
      ws.push(week)
    }
    return ws
  }, [start])

  function densityClass(date) {
    const count = (itemsByDate[date] || []).length
    if (count === 0) return 'cal-density-0'
    if (count <= 15) return 'cal-density-1'
    if (count <= 30) return 'cal-density-2'
    return 'cal-density-3'
  }

  return (
    <div className="cal-mini">
      <div className="cal-mini-header">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
          <div key={d} className="cal-day-label">{d}</div>
        ))}
      </div>
      {weeks.map((week, wi) => (
        <div key={wi} className="cal-week-row">
          {week.map(date => {
            const isToday = date === today
            const isSelected = date === selectedDate
            const isPast = date < today
            return (
              <button
                key={date}
                onClick={() => onSelectDate(date)}
                className={`cal-day-cell ${isToday ? 'cal-today' : ''} ${isSelected ? 'cal-selected' : ''} ${isPast ? 'cal-past' : ''}`}
              >
                <span className="cal-day-num">
                  {new Date(date + 'T00:00:00').getDate()}
                </span>
                <span className={`cal-dot ${densityClass(date)}`} />
              </button>
            )
          })}
        </div>
      ))}
      <div className="cal-legend">
        <span className="cal-dot cal-density-1" /> ≤15
        <span className="cal-dot cal-density-2" style={{ marginLeft: 8 }} /> 16–30
        <span className="cal-dot cal-density-3" style={{ marginLeft: 8 }} /> 30+
      </div>
    </div>
  )
}

// ── DayColumn ────────────────────────────────────────────────────────────────

const HOUR_START = 8   // 8am
const HOUR_END   = 20  // 8pm
const TOTAL_MINS = (HOUR_END - HOUR_START) * 60
const COL_HEIGHT = 480 // px

function DayColumn({ date, items, onOpenClient, onAddAtTime, onDone }) {
  const today = todayStr()
  const isToday = date === today

  const timed = items.filter(i => i.time)
  const untimed = items.filter(i => !i.time)

  // Check for time conflicts (two items within 30 min of each other)
  const conflicts = new Set()
  timed.forEach((a, ai) => {
    timed.forEach((b, bi) => {
      if (ai >= bi) return
      if (Math.abs(timeToMinutes(a.time) - timeToMinutes(b.time)) < 30) {
        conflicts.add(ai)
        conflicts.add(bi)
      }
    })
  })

  function topPct(timeStr) {
    const mins = timeToMinutes(timeStr)
    const fromStart = mins - HOUR_START * 60
    return Math.max(0, Math.min(100, (fromStart / TOTAL_MINS) * 100))
  }

  const hours = []
  for (let h = HOUR_START; h <= HOUR_END; h++) hours.push(h)

  const WORK_START = 10 * 60 + 30  // 10:30am in minutes
  const WORK_END   = 17 * 60        // 5:00pm in minutes
  const WORK_MINS  = WORK_END - WORK_START  // 390 min

  // Capacity consumed: demos = 20 min each, everything else = 5 min
  const timedInWorkHours = timed.filter(i => {
    const m = timeToMinutes(i.time)
    return m !== null && m >= WORK_START && m < WORK_END
  })
  const demoCount = [...timedInWorkHours, ...untimed].filter(i =>
    i.taskType === 'demo' || i.title?.toLowerCase().includes('demo') || i.note?.toLowerCase().includes('demo')
  ).length
  const otherCount = timedInWorkHours.length + untimed.length - demoCount
  const usedMins = demoCount * 20 + otherCount * 5
  const pct = Math.min(100, Math.round((usedMins / WORK_MINS) * 100))
  const capColor = pct < 60 ? 'var(--success)' : pct < 90 ? 'var(--warning)' : 'var(--error)'
  const freeHours = Math.max(0, Math.round((WORK_MINS - usedMins) / 60 * 10) / 10)

  const label = date === today
    ? 'Today'
    : new Date(date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })

  return (
    <div className="cal-day-col">
      <div className="cal-day-col-header">
        <span className="cal-day-col-title">{label}</span>
        <span className="cal-day-col-count">{items.length} item{items.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Capacity bar — 10:30am to 5pm, demos=20min, other=5min */}
      <div className="cal-capacity-wrap" title={`${demoCount} demo${demoCount !== 1 ? 's' : ''} (${demoCount * 20}min) + ${otherCount} other items (${otherCount * 5}min) = ~${Math.round(usedMins / 60 * 10) / 10}h used of 6.5h`}>
        <div className="cal-capacity-bar-bg">
          <div className="cal-capacity-bar-fill" style={{ width: `${pct}%`, background: capColor }} />
        </div>
        <span className="cal-capacity-label" style={{ color: capColor }}>
          {pct}% full · {freeHours}h free
        </span>
      </div>

      {/* Timed timeline */}
      <div className="cal-timeline" style={{ height: COL_HEIGHT }}>
        {/* Hour grid lines */}
        {hours.map(h => (
          <div
            key={h}
            className="cal-hour-line"
            style={{ top: `${((h - HOUR_START) / (HOUR_END - HOUR_START)) * 100}%` }}
            onClick={() => onAddAtTime(date, `${String(h).padStart(2, '0')}:00`)}
          >
            <span className="cal-hour-label">{fmtTime(`${h}:00`)}</span>
          </div>
        ))}

        {/* Items */}
        {timed.map((item, idx) => {
          const top = topPct(item.time)
          const info = taskTypeInfo(item.taskType)
          const isConflict = conflicts.has(idx)
          return (
            <div
              key={item.key}
              className={`cal-item ${item.source === 'task' ? 'cal-item-task' : 'cal-item-action'} ${isConflict ? 'cal-item-conflict' : ''}`}
              style={{ top: `${top}%` }}
              onClick={() => item.client ? onOpenClient(item.client) : null}
              title={item.client ? `${item.client.name}${item.client.company ? ' · ' + item.client.company : ''}` : item.title}
            >
              <span className="cal-item-time">{fmtTime(item.time)}</span>
              <span className="cal-item-emoji">{info.emoji}</span>
              <span className="cal-item-label">
                {item.client
                  ? item.client.name
                  : (item.title || info.label)}
              </span>
              {item.source === 'task' && item.id && (
                <button
                  className="cal-item-done"
                  onClick={e => { e.stopPropagation(); onDone(item.id) }}
                  title="Mark done"
                >✓</button>
              )}
            </div>
          )
        })}

        {/* Click on empty timeline area to add task */}
        <div
          className="cal-timeline-click"
          onClick={e => {
            const rect = e.currentTarget.getBoundingClientRect()
            const pct = (e.clientY - rect.top) / rect.height
            const totalMin = TOTAL_MINS * pct
            const h = Math.floor(totalMin / 60) + HOUR_START
            const m = Math.round((totalMin % 60) / 15) * 15
            const hh = String(Math.min(h, HOUR_END - 1)).padStart(2, '0')
            const mm = String(m % 60).padStart(2, '0')
            onAddAtTime(date, `${hh}:${mm}`)
          }}
          title="Click to add a task at this time"
        />
      </div>

      {/* Untimed items */}
      {untimed.length > 0 && (
        <div className="cal-untimed">
          <div className="cal-untimed-label">
            Anytime today
            <span style={{
              marginLeft: 6,
              fontWeight: 700,
              color: untimed.length <= 10 ? 'var(--success)' : untimed.length <= 25 ? 'var(--warning)' : 'var(--error)',
            }}>
              {untimed.length}
            </span>
          </div>
          {untimed.map(item => {
            const info = taskTypeInfo(item.taskType)
            return (
              <div
                key={item.key}
                className={`cal-untimed-item ${item.source === 'task' ? 'cal-item-task' : 'cal-item-action'}`}
                onClick={() => item.client ? onOpenClient(item.client) : null}
              >
                <span className="cal-item-emoji">{info.emoji}</span>
                <span className="cal-untimed-text">
                  {item.client
                    ? item.client.name
                    : (item.title || info.label)}
                  {item.note ? <span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>— {item.note}</span> : null}
                </span>
                {item.source === 'task' && item.id && (
                  <button
                    className="cal-item-done"
                    onClick={e => { e.stopPropagation(); onDone(item.id) }}
                    title="Mark done"
                  >✓</button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Add task button for the day */}
      <button className="cal-add-day-btn" onClick={() => onAddAtTime(date, null)}>
        + Add task on this day
      </button>
    </div>
  )
}

// ── CalendarView (main export) ────────────────────────────────────────────────

export default function CalendarView({ tasks, clients, onAddTask, onDone, onOpenClient }) {
  const today = todayStr()
  const [selectedDate, setSelectedDate] = useState(today)
  const [addingForDate, setAddingForDate] = useState(null)
  const [addingAtTime, setAddingAtTime] = useState(null)

  const clientMap = useMemo(() => {
    const m = new Map()
    clients.forEach(c => m.set(c.id, c))
    return m
  }, [clients])

  // Merge tasks + client next_actions into one unified item list.
  // If a task and a next_action share the same client_id and same date,
  // only show the task (more explicit) to avoid double-counting.
  const allItems = useMemo(() => {
    const items = []
    const taskClientDates = new Set()

    // Tasks first (more explicit — created intentionally)
    tasks.filter(t => !t.done && t.due_date).forEach(t => {
      const client = t.client_id ? clientMap.get(t.client_id) : null
      if (t.client_id) taskClientDates.add(`${t.client_id}::${t.due_date}`)
      items.push({
        key: `task-${t.id}`,
        id: t.id,
        source: 'task',
        date: t.due_date,
        time: t.due_time || null,
        taskType: t.task_type,
        title: t.title,
        note: t.note,
        client,
      })
    })

    // Client next_actions — skip if the same client already has a task on
    // that day to avoid double-counting the same appointment.
    clients.filter(c =>
      c.next_action_due &&
      !['active', 'dead'].includes(c.stage)
    ).forEach(c => {
      const key = `${c.id}::${c.next_action_due}`
      if (taskClientDates.has(key)) return // already represented by a task
      items.push({
        key: `action-${c.id}`,
        id: null,
        source: 'action',
        date: c.next_action_due,
        time: c.next_action_time || null,
        taskType: c.next_action?.toLowerCase().includes('demo') ? 'demo'
                : c.next_action?.toLowerCase().includes('proposal') ? 'proposal'
                : 'call',
        title: c.next_action,
        note: null,
        client: c,
      })
    })

    return items
  }, [tasks, clients, clientMap])

  // Group by date for the mini calendar density dots
  const itemsByDate = useMemo(() => {
    const m = {}
    allItems.forEach(i => {
      if (!m[i.date]) m[i.date] = []
      m[i.date].push(i)
    })
    return m
  }, [allItems])

  const selectedItems = useMemo(() =>
    (itemsByDate[selectedDate] || []).sort((a, b) => {
      if (!a.time && !b.time) return 0
      if (!a.time) return 1
      if (!b.time) return -1
      return a.time.localeCompare(b.time)
    }),
    [itemsByDate, selectedDate]
  )

  function handleAddAtTime(date, time) {
    setAddingForDate(date)
    setAddingAtTime(time || null)
  }

  function handleAdd(...args) {
    onAddTask(...args)
    setAddingForDate(null)
    setAddingAtTime(null)
  }

  return (
    <div className="cal-root">
      {/* Left: mini calendar */}
      <div className="cal-left">
        <MiniCalendar
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          itemsByDate={itemsByDate}
        />
      </div>

      {/* Right: day column + optional add form */}
      <div className="cal-right">
        {addingForDate ? (
          <div style={{ padding: '0 0 16px' }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
              Adding task for {new Date(addingForDate + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}
              {addingAtTime && ` at ${fmtTime(addingAtTime)}`}
            </div>
            <AddTaskForm
              clients={clients}
              initialDate={addingForDate}
              initialTime={addingAtTime}
              onAdd={handleAdd}
              onCancel={() => { setAddingForDate(null); setAddingAtTime(null) }}
            />
          </div>
        ) : (
          <DayColumn
            date={selectedDate}
            items={selectedItems}
            onOpenClient={onOpenClient}
            onAddAtTime={handleAddAtTime}
            onDone={onDone}
          />
        )}
      </div>
    </div>
  )
}
