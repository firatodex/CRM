import { useEffect, useState, useCallback } from 'react'
import { supabase } from './supabase'
import { PIPELINE_STAGES, ALL_STAGES } from './stages'
import KanbanColumn from './components/KanbanColumn'
import AddClientModal from './components/AddClientModal'
import DetailModal from './components/DetailModal'
import Dashboard from './components/Dashboard'
import RemindersView from './components/RemindersView'
import SearchBar from './components/SearchBar'
import ActiveDeadPanel from './components/ActiveDeadPanel'
import { formatCurrency, exportCSV } from './utils'

export default function App() {
  const [clients, setClients] = useState([])
  const [contactLogs, setContactLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  const [showAdd, setShowAdd] = useState(false)
  const [selected, setSelected] = useState(null)
  const [view, setView] = useState('pipeline')
  const [searchOpen, setSearchOpen] = useState(false)
  const [draggedClient, setDraggedClient] = useState(null)

  // Fetch all data
  useEffect(() => {
    fetchClients()
    fetchContactLogs()
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    function handleKey(e) {
      if (e.key === '/' && !e.ctrlKey && !e.metaKey && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
        e.preventDefault()
        setSearchOpen(true)
      }
      if (e.key === 'Escape') {
        setSearchOpen(false)
        setSelected(null)
        setShowAdd(false)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  async function fetchClients() {
    setLoading(true)
    setError(null)

    let allClients = []
    let from = 0
    const batchSize = 1000

    while (true) {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .order('created_at', { ascending: false })
        .range(from, from + batchSize - 1)

      if (error) { setError(error.message); break }
      if (!data || data.length === 0) break

      allClients = [...allClients, ...data]
      if (data.length < batchSize) break
      from += batchSize
    }

    setClients(allClients)
    setLoading(false)
  }

  async function fetchContactLogs() {
    const { data } = await supabase
      .from('contact_log')
      .select('*')
      .order('contacted_at', { ascending: false })
      .limit(500)
    if (data) setContactLogs(data)
  }

  async function handleAdd(form) {
    setSaving(true)
    const payload = {
      name: form.name.trim(),
      phone: form.phone?.trim() || null,
      stage: 'lead',
      temperature: form.temperature || null,
      source: form.source || null,
      company: form.company?.trim() || null,
      business_type: form.business_type?.trim() || null,
      email: null,
      next_action: form.next_action?.trim() || null,
      next_action_due: form.next_action_due || null,
      notes: null,
      potential_revenue: form.potential_revenue || null,
      website: null,
      pain_point: null,
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
      temperature: form.temperature || null,
      potential_revenue: form.potential_revenue || null,
      source: form.source || null,
      website: form.website?.trim() || null,
      pain_point: form.pain_point?.trim() || null,
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

  async function handleDelete(id) {
    if (!confirm('Remove this client? This cannot be undone.')) return
    setSaving(true)
    const { error } = await supabase.from('clients').delete().eq('id', id)
    if (error) setError(error.message)
    else setClients(prev => prev.filter(c => c.id !== id))
    setSaving(false)
    setSelected(null)
  }

  async function handleLogContact(clientId, method, note) {
    const now = new Date().toISOString()
    const { data: logData } = await supabase
      .from('contact_log')
      .insert({ client_id: clientId, method, note, contacted_at: now })
      .select()
      .single()
    if (logData) setContactLogs(prev => [logData, ...prev])

    const { data: clientData } = await supabase
      .from('clients')
      .update({ last_contacted_at: now })
      .eq('id', clientId)
      .select()
      .single()
    if (clientData) setClients(prev => prev.map(c => c.id === clientData.id ? clientData : c))
  }

  const handleDrop = useCallback(async (stageKey) => {
    if (!draggedClient || draggedClient.stage === stageKey) {
      setDraggedClient(null)
      return
    }
    const { data, error } = await supabase
      .from('clients')
      .update({ stage: stageKey })
      .eq('id', draggedClient.id)
      .select()
      .single()
    if (!error && data) {
      setClients(prev => prev.map(c => c.id === data.id ? data : c))
    }
    setDraggedClient(null)
  }, [draggedClient])

  // Computed
  const pipelineClients = clients.filter(c => !['active', 'dead'].includes(c.stage))
  const activeClients = clients.filter(c => c.stage === 'active')
  const deadClients = clients.filter(c => c.stage === 'dead')
  const totalPipelineRevenue = pipelineClients.reduce((sum, c) => sum + (Number(c.potential_revenue) || 0), 0)

  // Reminders: due today or overdue (only pipeline leads)
  const today = new Date().toISOString().split('T')[0]
  const reminders = clients.filter(c => {
    if (!c.next_action_due || ['active', 'dead'].includes(c.stage)) return false
    return c.next_action_due <= today
  })

  return (
    <div className="app">
      {/* Top bar */}
      <div className="topbar">
        <div className="topbar-left">
          <span className="topbar-logo">OpsCraft</span>
        </div>
        <nav className="topbar-nav">
          <button className={`nav-btn ${view === 'pipeline' ? 'active' : ''}`} onClick={() => setView('pipeline')}>
            Pipeline
          </button>
          <button className={`nav-btn ${view === 'reminders' ? 'active' : ''}`} onClick={() => setView('reminders')}>
            Reminders
            {reminders.length > 0 && <span className="nav-badge orange">{reminders.length}</span>}
          </button>
          <button className={`nav-btn ${view === 'dashboard' ? 'active' : ''}`} onClick={() => setView('dashboard')}>
            Dashboard
          </button>
          <button className={`nav-btn ${view === 'active' ? 'active' : ''}`} onClick={() => setView('active')}>
            Active
            {activeClients.length > 0 && <span className="nav-badge green">{activeClients.length}</span>}
          </button>
          <button className={`nav-btn ${view === 'dead' ? 'active' : ''}`} onClick={() => setView('dead')}>
            Archive
            {deadClients.length > 0 && <span className="nav-badge red">{deadClients.length}</span>}
          </button>
        </nav>
        <div className="topbar-right">
          {totalPipelineRevenue > 0 && (
            <span className="topbar-revenue" title="Pipeline potential revenue">
              {formatCurrency(totalPipelineRevenue)}
            </span>
          )}
          <button className="btn-icon" onClick={() => setSearchOpen(true)} title="Search (/)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          </button>
          <button className="btn-icon" onClick={() => exportCSV(clients)} title="Export CSV">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>
            + Add lead
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="main">
        {error && (
          <div className="error-banner">
            {error}
            <button className="dismiss-btn" onClick={() => setError(null)}>✕</button>
          </div>
        )}

        {loading ? (
          <div className="loading">
            <div className="loading-spinner" />
            Loading...
          </div>
        ) : view === 'pipeline' ? (
          <div className="board">
            {PIPELINE_STAGES.map(stage => (
              <KanbanColumn
                key={stage.key}
                stage={stage}
                clients={clients.filter(c => c.stage === stage.key)}
                onCardClick={setSelected}
                onDragStart={setDraggedClient}
                onDrop={handleDrop}
                isDragTarget={!!draggedClient && draggedClient.stage !== stage.key}
              />
            ))}
          </div>
        ) : view === 'reminders' ? (
          <RemindersView reminders={reminders} onCardClick={setSelected} />
        ) : view === 'dashboard' ? (
          <Dashboard clients={clients} contactLogs={contactLogs} />
        ) : view === 'active' ? (
          <ActiveDeadPanel clients={activeClients} type="active" onCardClick={setSelected} />
        ) : (
          <ActiveDeadPanel clients={deadClients} type="dead" onCardClick={setSelected} />
        )}
      </div>

      {/* Search overlay */}
      {searchOpen && (
        <SearchBar
          clients={clients}
          onSelect={(c) => { setSelected(c); setSearchOpen(false) }}
          onClose={() => setSearchOpen(false)}
        />
      )}

      {/* Modals */}
      {showAdd && (
        <AddClientModal onSave={handleAdd} onClose={() => setShowAdd(false)} saving={saving} />
      )}
      {selected && (
        <DetailModal
          client={selected}
          contactLogs={contactLogs.filter(l => l.client_id === selected.id)}
          onSave={handleSave}
          onDelete={handleDelete}
          onLogContact={handleLogContact}
          onClose={() => setSelected(null)}
          saving={saving}
        />
      )}
    </div>
  )
}
