import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { STAGES } from './stages'
import KanbanColumn from './components/KanbanColumn'
import AddClientModal from './components/AddClientModal'
import DetailModal from './components/DetailModal'

export default function App() {
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  const [showAdd, setShowAdd] = useState(false)
  const [selected, setSelected] = useState(null) // client being edited

  // ── Fetch all clients on mount ──
  useEffect(() => {
    fetchClients()
  }, [])

  async function fetchClients() {
    setLoading(true)
    setError(null)
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) setError(error.message)
    else setClients(data)
    setLoading(false)
  }

  // ── Add new client ──
  async function handleAdd(form) {
    setSaving(true)
    const payload = {
      name: form.name.trim(),
      stage: form.stage,
      next_action: form.next_action?.trim() || null,
      next_action_due: form.next_action_due || null,
      company: null,
      business_type: null,
      phone: null,
      email: null,
      notes: null,
    }
    const { data, error } = await supabase
      .from('clients')
      .insert(payload)
      .select()
      .single()
    if (error) setError(error.message)
    else setClients(prev => [data, ...prev])
    setSaving(false)
    setShowAdd(false)
  }

  // ── Save edits to existing client ──
  async function handleSave(form) {
    setSaving(true)
    const payload = {
      name: form.name?.trim(),
      stage: form.stage,
      phone: form.phone?.trim() || null,
      email: form.email?.trim() || null,
      company: form.company?.trim() || null,
      business_type: form.business_type?.trim() || null,
      next_action: form.next_action?.trim() || null,
      next_action_due: form.next_action_due || null,
      notes: form.notes?.trim() || null,
    }
    const { data, error } = await supabase
      .from('clients')
      .update(payload)
      .eq('id', form.id)
      .select()
      .single()
    if (error) setError(error.message)
    else setClients(prev => prev.map(c => c.id === data.id ? data : c))
    setSaving(false)
    setSelected(null)
  }

  // ── Delete client ──
  async function handleDelete(id) {
    if (!confirm('Remove this client? This cannot be undone.')) return
    setSaving(true)
    const { error } = await supabase.from('clients').delete().eq('id', id)
    if (error) setError(error.message)
    else setClients(prev => prev.filter(c => c.id !== id))
    setSaving(false)
    setSelected(null)
  }

  const active = clients.filter(c => c.stage === 'active').length

  return (
    <div className="app">
      {/* Top bar */}
      <div className="topbar">
        <span className="topbar-logo">OpsCraft</span>
        <span className="topbar-title">CRM</span>
        <div className="topbar-right">
          <span className="topbar-meta">
            {clients.length} clients · {active} active
          </span>
          <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>
            + Add client
          </button>
        </div>
      </div>

      {/* Main board */}
      <div className="main">
        {error && (
          <div className="error-banner">
            Error: {error} —{' '}
            <span
              style={{ textDecoration: 'underline', cursor: 'pointer' }}
              onClick={() => setError(null)}
            >
              dismiss
            </span>
          </div>
        )}

        {loading ? (
          <div className="loading">Loading clients...</div>
        ) : (
          <div className="board">
            {STAGES.map(stage => (
              <KanbanColumn
                key={stage.key}
                stage={stage}
                clients={clients.filter(c => c.stage === stage.key)}
                onCardClick={setSelected}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {showAdd && (
        <AddClientModal
          onSave={handleAdd}
          onClose={() => setShowAdd(false)}
          saving={saving}
        />
      )}
      {selected && (
        <DetailModal
          client={selected}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={() => setSelected(null)}
          saving={saving}
        />
      )}
    </div>
  )
}
