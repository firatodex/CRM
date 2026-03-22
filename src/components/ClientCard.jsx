import { formatDue } from '../utils'

export default function ClientCard({ client, onClick }) {
  const due = client.next_action_due ? formatDue(client.next_action_due) : null

  return (
    <div className="card" onClick={() => onClick(client)}>
      <div className="card-name">{client.name}</div>
      <div className="card-company">
        {[client.company, client.business_type].filter(Boolean).join(' · ')}
      </div>
      {client.next_action && (
        <div className="card-action">{client.next_action}</div>
      )}
      {due && (
        <div className={`card-due ${due.cls}`}>{due.label}</div>
      )}
    </div>
  )
}
