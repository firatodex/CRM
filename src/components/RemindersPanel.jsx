import { formatDue } from '../utils'

export default function RemindersPanel({ reminders, onCardClick }) {
  const overdue = reminders.filter(c => {
    const d = new Date(c.next_action_due + 'T00:00:00')
    return d < new Date(new Date().toISOString().split('T')[0] + 'T00:00:00')
  })
  const dueToday = reminders.filter(c => {
    return c.next_action_due === new Date().toISOString().split('T')[0]
  })

  return (
    <div className="reminders-bar">
      <div className="reminders-inner">
        <span className="reminders-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0"/></svg>
          Today
        </span>
        <div className="reminders-items">
          {overdue.map(c => (
            <button key={c.id} className="reminder-chip overdue" onClick={() => onCardClick(c)}>
              <span className="reminder-name">{c.name}</span>
              <span className="reminder-action">{c.next_action || 'Follow up'}</span>
              <span className="reminder-due">{formatDue(c.next_action_due).label}</span>
            </button>
          ))}
          {dueToday.map(c => (
            <button key={c.id} className="reminder-chip today" onClick={() => onCardClick(c)}>
              <span className="reminder-name">{c.name}</span>
              <span className="reminder-action">{c.next_action || 'Follow up'}</span>
              <span className="reminder-due">Due today</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
