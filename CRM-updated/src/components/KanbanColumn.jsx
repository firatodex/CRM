import { useState } from 'react'
import ClientCard from './ClientCard'

export default function KanbanColumn({ stage, clients, onCardClick, onDragStart, onDrop, isDragTarget }) {
  const [dragOver, setDragOver] = useState(false)

  function handleDragOver(e) {
    e.preventDefault()
    if (isDragTarget) setDragOver(true)
  }

  function handleDragLeave() {
    setDragOver(false)
  }

  function handleDrop(e) {
    e.preventDefault()
    setDragOver(false)
    onDrop(stage.key)
  }

  return (
    <div
      className={`column ${dragOver ? 'column-drag-over' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}
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
          ? <div className="empty-col">{dragOver ? 'Drop here' : 'No leads'}</div>
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
