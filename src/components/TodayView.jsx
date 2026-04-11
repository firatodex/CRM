import { useCallback, useState } from 'react'
import { supabase } from '../supabase'
import { formatDue, formatRelativeTime, formatCurrency, waLink, todayStr } from '../utils'
import { TEMPERATURES, PIPELINE_STAGES } from '../stages'

// Priority score: higher = more urgent
function priorityScore(client) {
  const today = todayStr()
  let score = 0
  // Temperature
  if (client.temperature === 'hot')  score += 30
  if (client.temperature === 'warm') score += 15
  // Due date urgency
  if (client.next_action_due) {
    const diff = Math.round(
      (new Date(client.next_action_due + 'T00:00:00') - new Date(today + 'T00:00:00')) / 86400000
    )
    if (diff < 0)   score += 50 + Math.abs(diff) * 2 // overdue gets biggest boost
    if (diff === 0) score += 40
    if (diff <= 3)  score += 20
    if (diff <= 7)  score += 10
  } else {
    score -= 10 // no due date = lower priority
  }
  // Revenue
  const rev = Number(client.potential_revenue) || 0
  if (rev > 100000) score += 15
  else if (rev > 50000) score += 8
  else if (rev > 0) score += 3
  // Staleness
  if (!client.last_contacted_at) score += 10
  else {
    const daysSince = Math.floor((Date.now() - new Date(client.last_contacted_at)) / 86400000)
    if (daysSince > 14) score += 12
    else if (daysSince > 7) score += 6
  }
  return score
}

function TodayCard({ client, onClick }) {
  const due = client.next_action_due ? formatDue(client.next_action_due) : null
  const wa = waLink(client.phone)
  const temp = TEMPERATURES.find(t => t.key === client.temperature)
  const lastContact = formatRelativeTime(client.last_contacted_at)
  const score = priorityScore(client)
  const isUrgent = due?.cls === 'overdue' || due?.cls === 'today'

  return (
    <div
      className={`card ${isUrgent ? 'card-urgent' : ''}`}
      onClick={() => onClick(client)}
      style={{ cursor: 'pointer', position: 'relative' }}
    >
      {/* Priority indicator bar at left edge */}
      {score >= 50 && (
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
          borderRadius: '8px 0 0 8px',
          background: score >= 70 ? 'var(--error)' : score >= 50 ? 'var(--warning)' : 'var(--primary)',
        }} />
      )}
      <div className="card-top-row">
        <div className="card-name-row">
          {temp && <span className="temp-badge" title={temp.label}>{temp.emoji}</span>}
          <span className="card-name">{client.name}</span>
        </div>
        {wa && (
          <a href={wa} target="_blank" rel="noreferrer" className="wa-btn"
            onClick={e => e.stopPropagation()} title="WhatsApp">
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
      {client.potential_revenue && (
        <div className="card-revenue">{formatCurrency(client.potential_revenue)}</div>
      )}
      {client.next_action && (
        <div className="card-action">{client.next_action}</div>
      )}
      <div className="card-footer">
        {due
          ? <span className={`card-due ${due.cls}`}>{due.label}</span>
          : <span className="card-due" style={{ color: 'var(--text-muted)' }}>No due date</span>
        }
        {lastContact && <span className="card-last-contact">Last: {lastContact}</span>}
      </div>
    </div>
  )
}

// Stage config mirrors Pipeline but with urgency-filtered clients
const TODAY_STAGES = [
  { key: 'overdue',  label: 'Overdue',     color: '#FF3B30' },
  { key: 'today',   label: 'Due Today',    color: '#FF9500' },
  { key: 'this-week', label: 'This Week',  color: '#007AFF' },
  { key: 'no-action', label: 'No Action',  color: '#8E8E93' },
]

function getUrgencyBucket(client) {
  const today = todayStr()
  if (!client.next_action_due && !client.next_action) return 'no-action'
  if (!client.next_action_due) return 'no-action'
  if (client.next_action_due < today) return 'overdue'
  if (client.next_action_due === today) return 'today'
  const diff = Math.round(
    (new Date(client.next_action_due + 'T00:00:00') - new Date(today + 'T00:00:00')) / 86400000
  )
  if (diff <= 7) return 'this-week'
  return null // not shown (too far out)
}

function TodayColumn({ stage, clients, onCardClick, draggedClient, onDragStart, onDrop }) {
  const [dragOver, setDragOver] = useState(false)
  const isDragTarget = !!draggedClient && draggedClient._urgencyKey !== stage.key

  return (
    <div
      className={`column ${dragOver ? 'column-drag-over' : ''}`}
      style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}
      onDragOver={e => { e.preventDefault(); if (isDragTarget) setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={() => { setDragOver(false); onDrop(stage.key) }}
    >
      <div className="column-header">
        <span className="column-title">
          <span className="stage-dot" style={{ background: stage.color }} />
          {stage.label}
        </span>
        <span className="column-count">{clients.length}</span>
      </div>
      <div className="cards" style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
        {clients.length === 0
          ? <div className="empty-col">{dragOver ? 'Drop here' : '—'}</div>
          : clients.map(c => (
              <div
                key={c.id}
                draggable
                onDragStart={() => onDragStart({ ...c, _urgencyKey: stage.key })}
                onDragEnd={() => onDragStart(null)}
              >
                <TodayCard client={c} onClick={onCardClick} />
              </div>
            ))
        }
      </div>
    </div>
  )
}

export default function TodayView({ clients, onCardClick, onUpdateClient }) {
  const [draggedClient, setDraggedClient] = useState(null)

  // Only pipeline leads
  const pipeline = clients.filter(c => !['active', 'dead'].includes(c.stage))

  // Bucket and sort by priority score
  const columns = TODAY_STAGES.map(stage => ({
    ...stage,
    clients: pipeline
      .filter(c => getUrgencyBucket(c) === stage.key)
      .sort((a, b) => priorityScore(b) - priorityScore(a)),
  }))

  const handleDrop = useCallback(async (toBucket) => {
    if (!draggedClient) return
    const today = todayStr()
    const d = new Date()
    let newDue = null

    if (toBucket === 'overdue') {
      d.setDate(d.getDate() - 1)
      newDue = d.toISOString().split('T')[0]
    } else if (toBucket === 'today') {
      newDue = today
    } else if (toBucket === 'this-week') {
      d.setDate(d.getDate() + 3)
      newDue = d.toISOString().split('T')[0]
    } else if (toBucket === 'no-action') {
      newDue = null
    }

    if (onUpdateClient) {
      await onUpdateClient(draggedClient.id, { next_action_due: newDue })
    }
    setDraggedClient(null)
  }, [draggedClient, onUpdateClient])

  const totalUrgent = columns[0].clients.length + columns[1].clients.length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '0 0 12px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {totalUrgent > 0 && (
            <span style={{
              fontSize: 12, fontWeight: 600, color: 'var(--error)',
              background: 'var(--error-bg)', padding: '2px 10px', borderRadius: 20
            }}>
              {totalUrgent} need attention today
            </span>
          )}
          {totalUrgent === 0 && (
            <span style={{ fontSize: 12, color: 'var(--success)', fontWeight: 600 }}>
              ✓ All caught up
            </span>
          )}
        </div>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>
          Priority sorted · drag to reschedule
        </span>
      </div>
      <div className="board" style={{ flex: 1, maxWidth: '100%' }}>
        {columns.map(col => (
          <TodayColumn
            key={col.key}
            stage={col}
            clients={col.clients}
            onCardClick={onCardClick}
            draggedClient={draggedClient}
            onDragStart={setDraggedClient}
            onDrop={handleDrop}
          />
        ))}
      </div>
    </div>
  )
}
