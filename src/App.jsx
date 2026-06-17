import { useEffect, useState, useCallback } from 'react'
import { supabase } from './supabase'
import { PIPELINE_STAGES } from './stages'
import KanbanColumn from './components/KanbanColumn'
import AddClientModal from './components/AddClientModal'
import DetailModal from './components/DetailModal'
import Dashboard from './components/Dashboard'
import TodayView from './components/TodayView'
import SearchBar from './components/SearchBar'
import ActiveDeadPanel from './components/ActiveDeadPanel'
import ExportModal from './components/ExportModal'
import ConfirmModal from './components/ConfirmModal'
import FilterBar, { applyFilters } from './components/FilterBar'
import TasksView from './components/TasksView'
import { formatCurrency, todayStr } from './utils'

export default function App() {
  const [clients, setClients] = useState([])
  const [contactLogs, setContactLogs] = useState([])
  const [tasks, setTasks] = useState([])
  const [clientsTab, setClientsTab] = useState('active') // 'active' | 'dead' — toggle within Clients view
  const [filters, setFilters] = useState({ search: '', temperature: '', source: '', overdueOnly: false })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  const [showAdd, setShowAdd] = useState(false)
  const [selected, setSelected] = useState(null)
  const [view, setView] = useState('pipeline')
  const [searchOpen, setSearchOpen] = useState(false)
  const [draggedClient, setDraggedClient] = useState(null)
  const [showExport, setShowExport] = useState(false)
  // confirmDelete holds the client id to delete, or null
  const [confirmDelete, setConfirmDelete] = useState(null)

  useEffect(() => {
    let cancelled = false
    fetchClients(() => cancelled)
    fetchContactLogs(() => cancelled)
    fetchTasks(() => cancelled)
    return () => { cancelled = true }
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
        setConfirmDelete(null)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [selected])

  async function fetchClients(isCancelled = () => false) {
    setLoading(true)
    setError(null)
    let allClients = []
    let from = 0
    const batchSize = 1000
    while (true) {
      if (isCancelled()) return
      const { data, error } = await supabase
        .from('clients').select('*')
        .order('created_at', { ascending: false })
        .range(from, from + batchSize - 1)
      if (isCancelled()) return
      if (error) { setError(error.message); break }
      if (!data || data.length === 0) break
      allClients = [...allClients, ...data]
      if (data.length < batchSize) break
      from += batchSize
    }
    setClients(allClients)
    setLoading(false)
  }

  // Paginated contact log fetch — fetches all logs in 500-row batches
  // so the dashboard activity chart and history panel don't silently truncate.
  async function fetchContactLogs(isCancelled = () => false) {
    let allLogs = []
    let from = 0
    const batchSize = 500
    while (true) {
      if (isCancelled()) return
      const { data, error } = await supabase
        .from('contact_log').select('*')
        .order('contacted_at', { ascending: false })
        .range(from, from + batchSize - 1)
      if (isCancelled()) return
      if (error) break
      if (!data || data.length === 0) break
      allLogs = [...allLogs, ...data]
      if (data.length < batchSize) break
      from += batchSize
    }
    setContactLogs(allLogs)
  }

  async function fetchTasks(isCancelled = () => false) {
    if (isCancelled()) return
    const { data, error } = await supabase
      .from('tasks').select('*')
      .order('due_date', { ascending: true })
    if (isCancelled()) return
    if (error) { setError(`Failed to load tasks: ${error.message}`); return }
    setTasks(data || [])
  }

  async function handleAddTask(clientId, taskType, note, dueDate, dueTime) {
    const { data, error } = await supabase
      .from('tasks')
      .insert({ client_id: clientId, task_type: taskType, note: note || null, due_date: dueDate, due_time: dueTime || null })
      .select().single()
    if (error) { setError(`Failed to add task: ${error.message}`); return null }
    if (data) setTasks(prev => [...prev, data])
    return data
  }

  async function handleTaskDone(taskId) {
    // Remove immediately from view (silent — no history log per design decision)
    setTasks(prev => prev.filter(t => t.id !== taskId))
    const { error } = await supabase
      .from('tasks')
      .update({ done: true, done_at: new Date().toISOString() })
      .eq('id', taskId)
    if (error) {
      setError(`Failed to mark task done: ${error.message}`)
      fetchTasks() // resync on failure
    }
  }

  async function handleTaskReschedule(taskId, newDate, newTime) {
    const { data, error } = await supabase
      .from('tasks')
      .update({ due_date: newDate, due_time: newTime })
      .eq('id', taskId)
      .select().single()
    if (error) { setError(`Failed to reschedule task: ${error.message}`); return }
    if (data) setTasks(prev => prev.map(t => t.id === taskId ? data : t))
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
      next_action_time: form.next_action_time || null,
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

  // Instead of using native confirm(), we set the id and show ConfirmModal.
  // The actual delete runs in handleDeleteConfirmed once the user clicks Delete.
  function handleDelete(id) {
    setConfirmDelete(id)
  }

  async function handleDeleteConfirmed() {
    if (!confirmDelete) return
    setSaving(true)
    const { error } = await supabase.from('clients').delete().eq('id', confirmDelete)
    if (error) setError(error.message)
    else {
      setClients(prev => prev.filter(c => c.id !== confirmDelete))
      setSelected(null)
    }
    setSaving(false)
    setConfirmDelete(null)
  }

  async function handleLogContact(clientId, method, whatHappened, whatNext) {
    const now = new Date().toISOString()
    // Always write to the legacy `note` column so the insert never fails even
    // if the new split columns haven't been added to the DB yet via the migration.
    const note = whatHappened + (whatNext ? `\n→ Next: ${whatNext}` : '')

    // Attempt insert with new split columns. If those columns don't exist yet
    // in Supabase, the insert returns an error — we fall back to legacy schema.
    let logData = null
    const { data: d1, error: e1 } = await supabase
      .from('contact_log')
      .insert({
        client_id: clientId,
        method,
        note,
        note_what_happened: whatHappened,
        note_what_next: whatNext || null,
        contacted_at: now,
      })
      .select().single()

    if (e1) {
      // New columns may not exist yet — retry with legacy schema only.
      // Only treat this as the "missing column" case if the error says so;
      // otherwise surface the real error to the user.
      const isMissingColumn = e1.message?.includes('column') || e1.code === '42703' || e1.code === 'PGRST204'
      if (!isMissingColumn) {
        setError(`Failed to save log: ${e1.message}`)
        return
      }
      const { data: d2, error: e2 } = await supabase
        .from('contact_log')
        .insert({ client_id: clientId, method, note, contacted_at: now })
        .select().single()
      if (e2) {
        setError(`Failed to save log: ${e2.message}`)
        return
      }
      logData = d2
    } else {
      logData = d1
    }

    if (logData) setContactLogs(prev => [logData, ...prev])
    const { data: clientData, error: e3 } = await supabase
      .from('clients').update({ last_contacted_at: now }).eq('id', clientId).select().single()
    if (e3) setError(`Log saved, but failed to update client's last-contacted time: ${e3.message}`)
    else if (clientData) setClients(prev => prev.map(c => c.id === clientData.id ? clientData : c))
  }

  const [dropping, setDropping] = useState(false)

  const handleDrop = useCallback(async (stageKey) => {
    if (!draggedClient || draggedClient.stage === stageKey) { setDraggedClient(null); return }
    setDropping(true)
    const { data, error } = await supabase
      .from('clients').update({ stage: stageKey }).eq('id', draggedClient.id).select().single()
    if (!error && data) setClients(prev => prev.map(c => c.id === data.id ? data : c))
    else if (error) setError(`Failed to move card: ${error.message}`)
    setDraggedClient(null)
    setDropping(false)
  }, [draggedClient])

  const pipelineClients = clients.filter(c => !['active', 'dead'].includes(c.stage))
  const activeClients   = clients.filter(c => c.stage === 'active')
  const deadClients     = clients.filter(c => c.stage === 'dead')
  const totalPipelineRevenue = pipelineClients.reduce((sum, c) => sum + (Number(c.potential_revenue) || 0), 0)

  const today = todayStr()
  const overdueCount = clients.filter(c =>
    !['active','dead'].includes(c.stage) && c.next_action_due && c.next_action_due <= today
  ).length

  const pendingTasks = tasks.filter(t => !t.done)
  const urgentTaskCount = pendingTasks.filter(t => t.due_date <= today).length

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
          <button className={`nav-btn ${view === 'dashboard' ? 'active' : ''}`} onClick={() => setView('dashboard')}>
            Dashboard
          </button>
          {/* Active clients — won deals — now have their own view, with Archive accessible via toggle inside */}
          <button className={`nav-btn ${view === 'active' ? 'active' : ''}`} onClick={() => setView('active')}>
            Clients
            {activeClients.length > 0 && <span className="nav-badge green">{activeClients.length}</span>}
          </button>
          <button className={`nav-btn ${view === 'tasks' ? 'active' : ''}`} onClick={() => setView('tasks')}>
            Tasks
            {urgentTaskCount > 0 && <span className="nav-badge red">{urgentTaskCount}</span>}
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
          <button className="btn-icon" onClick={() => supabase.auth.signOut()} title="Sign out">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
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
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            <FilterBar clients={clients} filters={filters} onChange={setFilters} />
            <div className="board" style={{ flex: 1 }}>
              {PIPELINE_STAGES.map(stage => {
                const stageClients = applyFilters(
                  clients.filter(c => c.stage === stage.key),
                  filters,
                  todayStr()
                )
                return (
                  <KanbanColumn
                    key={stage.key}
                    stage={stage}
                    clients={stageClients}
                    onCardClick={setSelected}
                    onDragStart={setDraggedClient}
                    onDrop={handleDrop}
                    isDragTarget={!dropping && !!draggedClient && draggedClient.stage !== stage.key}
                  />
                )
              })}
            </div>
          </div>
        ) : view === 'today' ? (
          <TodayView
            clients={clients}
            onCardClick={setSelected}
            onDragStart={setDraggedClient}
            draggedClient={draggedClient}
            onDrop={handleDrop}
          />
        ) : view === 'dashboard' ? (
          <Dashboard clients={clients} contactLogs={contactLogs} />
        ) : view === 'active' ? (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            <div className="clients-subtabs">
              <button className={`subtab-btn ${clientsTab === 'active' ? 'active' : ''}`} onClick={() => setClientsTab('active')}>
                Active <span className="subtab-count">{activeClients.length}</span>
              </button>
              <button className={`subtab-btn ${clientsTab === 'dead' ? 'active' : ''}`} onClick={() => setClientsTab('dead')}>
                Archive <span className="subtab-count">{deadClients.length}</span>
              </button>
            </div>
            {clientsTab === 'active' ? (
              <ActiveDeadPanel clients={activeClients} type="active" onCardClick={setSelected} />
            ) : (
              <ActiveDeadPanel clients={deadClients} type="dead" onCardClick={setSelected} />
            )}
          </div>
        ) : view === 'tasks' ? (
          <TasksView
            tasks={tasks}
            clients={clients}
            onDone={handleTaskDone}
            onReschedule={handleTaskReschedule}
            onOpenClient={setSelected}
          />
        ) : null}
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
          tasks={tasks.filter(t => t.client_id === selected.id && !t.done)}
          onAddTask={handleAddTask}
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

      {/* Proper delete confirmation modal — replaces native confirm() */}
      {confirmDelete && (
        <ConfirmModal
          title="Delete this client?"
          message="This will permanently remove the client and all their contact history. This cannot be undone."
          confirmLabel="Delete"
          onConfirm={handleDeleteConfirmed}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  )
}
