import { useEffect, useState, useCallback } from 'react'
import { supabase } from './supabase'
import { PIPELINE_STAGES } from './stages'
import KanbanColumn from './components/KanbanColumn'
import AddClientModal from './components/AddClientModal'
import DetailModal from './components/DetailModal'
import Dashboard from './components/Dashboard'
import RemindersView from './components/RemindersView'
import TodayView from './components/TodayView'
import SearchBar from './components/SearchBar'
import ActiveDeadPanel from './components/ActiveDeadPanel'
import ExportModal from './components/ExportModal'
import { formatCurrency, todayStr } from './utils'

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
  const [showExport, setShowExport] = useState(false)

  useEffect(() => {
    fetchClients()
    fetchContactLogs()
  }, [])

  useEffect(() => {
    function handleKey(e) {
      if (e.key === '/' && !e.ctrlKey && !e.metaKey &&
        document.activeElement.tagName !== 'INPUT' &&
        document.activeElement.tagName !== 'TEXTAREA') {
        e.preventDefault()
        setSearchOpen(true)
      }
      if (e.key === 'Escape' && !selected) {
        setSearchOpen(false)
        setShowAdd(false)
        setShowExport(false)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [selected])

  async function fetchClients() {
    setLoading(true)
    setError(null)
    let allClients = []
    let from = 0
    const batchSize = 1000
    while (true) {
      const { data, error } = await supabase
        .from('clients').select('*')
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
      .from('contact_log').select('*')
      .order('contacted_at', { ascending: false }).limit(500)
    if (data) setContactLogs(data)
  }

  async function handleAdd(form) {
    setSaving(true)
    const payload = {
      name: form.name.trim(), phone: form.phone?.trim() || null,
      stage: 'lead', temperature: form.temperature || null,
      source: form.source || null, company: form.company?.trim() || null,
      business_type: form.business_type?.trim() || null, email: null,
      next_action: form.next_action?.trim() || null,
      next_action_due: form.next_action_due || null,
      notes: null, potential_revenue: form.potential_revenue || null,
      website: null, pain_point: null,
    }
    const { data, error } = await supabase.from('clients').insert(payload).select().single()
    if (error) setError(error.message)
    else setClients(prev => [data, ...prev])
    setSaving(false)
    setShowAdd(false)
  }

  async function handleSave(form) {
    setSaving(true)
    const payload = {
      name: form.name?.trim(), stage: form.stage,
      phone: form.phone?.trim() || null, email: form.email?.trim() || null,
      company: form.company?.trim() || null, business_type: form.business_type?.trim() || null,
      next_action: form.next_action?.trim() || null,
      next_action_due: form.next_action_due || null,
      notes: form.notes?.trim() || null, temperature: form.temperature || null,
      potential_revenue: form.potential_revenue || null, source: form.source || null,
      website: form.website?.trim() || null, pain_point: form.pain_point?.trim() || null,
    }
    const { data, error } = await supabase
      .from('clients').update(payload).eq('id', form.id).select().single()
    if (error) setError(error.message)
    else setClients(prev => prev.map(c => c.id === data.id ? data : c))
    setSaving(false)
    setSelected(null)
  }

  async function handleUpdateClient(id, updates) {
    const { data, error } = await supabase
      .from('clients').update(updates).eq('id', id).select().single()
    if (!error && data) setClients(prev => prev.map(c => c.id === data.id ? data : c))
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
      .select().single()
    if (logData) setContactLogs(prev => [logData, ...prev])
    const { data: clientData } = await supabase
      .from('clients').update({ last_contacted_at: now }).eq('id', clientId).select().single()
    if (clientData) setClients(prev => prev.map(c => c.id === clientData.id ? clientData : c))
  }

  const handleDrop = useCallback(async (stageKey) => {
    if (!draggedClient || draggedClient.stage === stageKey) { setDraggedClient(null); return }
    const { data, error } = await supabase
      .from('clients').update({ stage: stageKey }).eq('id', draggedClient.id).select().single()
    if (!error && data) setClients(prev => prev.map(c => c.id === data.id ? data : c))
    setDraggedClient(null)
  }, [draggedClient])

  const pipelineClients = clients.filter(c => !['active', 'dead'].includes(c.stage))
  const activeClients   = clients.filter(c => c.stage === 'active')
  const deadClients     = clients.filter(c => c.stage === 'dead')
  const totalPipelineRevenue = pipelineClients.reduce((sum, c) => sum + (Number(c.potential_revenue) || 0), 0)

  const today = todayStr()
  const overdueCount = clients.filter(c =>
    !['active','dead'].includes(c.stage) && c.next_action_due && c.next_action_due <= today
  ).length

  // Board views need to fill full height — non-board views scroll normally
  const isBoardView = view === 'pipeline' || view === 'today'

  return (
    <div className="app" style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {/* Top bar */}
      <div className="topbar">
        <div className="topbar-left">
          <span className="topbar-logo">OpsCraft</span>
        </div>
        <nav className="topbar-nav">
          <button className={`nav-btn ${view === 'pipeline' ? 'active' : ''}`} onClick={() => setView('pipeline')}>
            Pipeline
          </button>
          <button className={`nav-btn ${view === 'today' ? 'active' : ''}`} onClick={() => setView('today')}>
            Today
            {overdueCount > 0 && <span className="nav-badge red">{overdueCount}</span>}
          </button>
          <button className={`nav-btn ${view === 'reminders' ? 'active' : ''}`} onClick={() => setView('reminders')}>
            Follow-ups
            {overdueCount > 0 && <span className="nav-badge orange">{overdueCount}</span>}
          </button>
          <button className={`nav-btn ${view === 'dashboard' ? 'active' : ''}`} onClick={() => setView('dashboard')}>
            Dashboard
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
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
          </button>
          <button className="btn-icon" onClick={() => setShowExport(true)} title="Export data">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>
            </svg>
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>+ Add lead</button>
        </div>
      </div>

      {/* Main */}
      <div
        className="main"
        style={{
          flex: 1,
          minHeight: 0,
          padding: isBoardView ? '16px 24px 0' : '16px 24px 32px',
          display: 'flex',
          flexDirection: 'column',
          overflow: isBoardView ? 'hidden' : 'auto',
        }}
      >
        {error && (
          <div className="error-banner" style={{ flexShrink: 0 }}>
            {error}
            <button className="dismiss-btn" onClick={() => setError(null)}>✕</button>
          </div>
        )}

        {loading ? (
          <div className="loading"><div className="loading-spinner" />Loading...</div>
        ) : view === 'pipeline' ? (
          <div className="board" style={{ flex: 1 }}>
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
        ) : view === 'today' ? (
          <TodayView
            clients={clients}
            onCardClick={setSelected}
            onUpdateClient={handleUpdateClient}
          />
        ) : view === 'reminders' ? (
          <RemindersView
            reminders={clients.filter(c =>
              !['active','dead'].includes(c.stage) && c.next_action_due && c.next_action_due <= today
            )}
            allPipelineClients={pipelineClients}
            onCardClick={setSelected}
            onUpdateClient={handleUpdateClient}
          />
        ) : view === 'dashboard' ? (
          <Dashboard clients={clients} contactLogs={contactLogs} />
        ) : (
          <ActiveDeadPanel clients={deadClients} type="dead" onCardClick={setSelected} />
        )}
      </div>

      {searchOpen && (
        <SearchBar
          clients={clients}
          onSelect={c => { setSelected(c); setSearchOpen(false) }}
          onClose={() => setSearchOpen(false)}
        />
      )}

      {showAdd && <AddClientModal onSave={handleAdd} onClose={() => setShowAdd(false)} saving={saving} />}
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
      {showExport && (
        <ExportModal clients={clients} contactLogs={contactLogs} onClose={() => setShowExport(false)} />
      )}
    </div>
  )
}
