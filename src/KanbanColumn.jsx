import ClientCard from './ClientCard'

export default function KanbanColumn({ stage, clients, onCardClick }) {
  return (
    <div className="column">
      <div className="column-header">
        <span className="column-title">
          <span className="stage-dot" style={{ background: stage.color }} />
          {stage.label}
        </span>
        <span className="column-count">{clients.length}</span>
      </div>
      <div className="cards">
        {clients.length === 0
          ? <div className="empty-col">No clients</div>
          : clients.map(c => (
              <ClientCard key={c.id} client={c} onClick={onCardClick} />
            ))
        }
      </div>
    </div>
  )
}
