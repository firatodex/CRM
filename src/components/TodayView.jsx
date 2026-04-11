import { useState, useCallback } from 'react'
import { PIPELINE_STAGES } from '../stages'
import ClientCard from './ClientCard'
import { todayStr } from '../utils'

// Priority score within a column — higher = shown first
function priorityScore(client) {
  const today = todayStr()
  let score = 0
  if (client.temperature === 'hot')  score += 30
  if (client.temperature === 'warm') score += 15
  if (client.next_action_due) {
    const diff = Math.round(
      (new Date(client.next_action_due + 'T00:00:00') - new Date(today + 'T00:00:00')) / 86400000
    )
    if (diff < 0)   score += 50 + Math.abs(diff) * 2
    if (diff === 0) score += 40
  }
  const rev = Number(client.potential_revenue) || 0
  if (rev > 100000) score += 15
  else if (rev > 50000) score += 8
  else if (rev > 0) score += 3
  if (!client.last_contacted_at) score += 10
  else {
    const daysSince = Math.floor((Date.now() - new Date(client.last_contacted_at)) / 86400000)
    if (daysSince > 14) score += 12
    else if (daysSince > 7) score += 6
  }
  return score
}

function TodayColumn({ stage, clients, onCardClick, draggedClient, onDragStart, onDrop }) {
  const [dragOver, setDragOver] = useState(false)
  const isDragTarget = !!draggedClient && draggedClient.stage !== stage.key

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
          ? <div className="empty-col">{dragOver ? 'Drop here' : 'No leads due'}</div>
          : clients.map(c => (
              <ClientCard
                key={c.id}
                client={c}
                onClick={onCardClick}
                onDragStart={onDragStart}
              />
            ))
        }
      </div>
    </div>
  )
}

export default function TodayView({ clients, onCardClick, onDrop }) {
  const today = todayStr()

  // Only pipeline leads that are overdue or due today
  const pipeline = clients.filter(c => !['active', 'dead'].includes(c.stage))
  const dueLeads = pipeline.filter(c => c.next_action_due && c.next_action_due <= today)

  // Group by pipeline stage, sorted by priority within each column
  const columns = PIPELINE_STAGES.map(stage => ({
    ...stage,
    clients: dueLeads
      .filter(c => c.stage === stage.key)
      .sort((a, b) => priorityScore(b) - priorityScore(a)),
  }))

  const totalDue = dueLeads.length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, marginBottom: 12 }}>
        {totalDue > 0
          ? <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--error)', background: 'var(--error-bg)', padding: '2px 10px', borderRadius: 20 }}>
              {totalDue} need attention today
            </span>
          : <span style={{ fontSize: 12, color: 'var(--success)', fontWeight: 600 }}>✓ All caught up</span>
        }
        <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>
          Priority sorted within each stage
        </span>
      </div>
      <div className="board" style={{ flex: 1 }}>
        {columns.map(col => (
          <TodayColumn
            key={col.key}
            stage={col}
            clients={col.clients}
            onCardClick={onCardClick}
            onDragStart={() => {}}
            onDrop={onDrop || (() => {})}
            draggedClient={null}
          />
        ))}
      </div>
    </div>
  )
}
