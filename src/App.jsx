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
import { useOfflineSync } from './useOfflineSync'
import { formatCurrency, todayStr } from './utils'

// Fallback UUID generator for browsers without crypto.randomUUID (pre-Chrome 92).
// Produces a valid v4 UUID string, since the contact_log.id column is type uuid
// and a malformed value would cause the insert itself to fail.
function generateUuidFallback() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

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

  // Offline sync — currently scoped to logging a contact and marking a
  // task done, the two actions most likely to happen with no signal.
  const { isOnline, pendingCount, failedCount, syncing, queueAction } = useOfflineSync({
    log_contact: (payload, rowId) => performLogContact(payload, rowId),
    task_done: (payload) => performTaskDone(payload),
    post_log_update: (payload) => performPostLogUpdate(payload),
  })

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

  async function handleAddTask(clientId, taskType, note, dueDate, dueTime, title) {
    const { data, error } = await supabase
      .from('tasks')
      .insert({
        client_id: clientId || null,
        task_type: taskType,
        title: title || null,
        note: note || null,
        due_date: dueDate,
        due_time: dueTime || null,
      })
      .select().single()
    if (error) { setError(`Failed to add task: ${error.message}`); return null }
    if (data) setTasks(prev => [...prev, data])
    return data
  }

  async function performTaskDone({ taskId }) {
    const { error } = await supabase
      .from('tasks')
      .update({ done: true, done_at: new Date().toISOString() })
      .eq('id', taskId)
    if (error) throw error
  }

  // The post-log update: stage flip (Lead -> Contacted) and next-action
  // fields. This is intentionally separate from the full lead-edit save
  // (handleSave), since this specific update is the one that fires every
  // time you log a call — including, often, while offline. Unlike an
  // insert, an UPDATE with the same payload applied twice is naturally
  // idempotent (re-applying "set stage = contacted" a second time changes
  // nothing), so no special dedup key is needed here, just well-ordered
  // queuing.
  async function performPostLogUpdate({ clientId, updates }) {
    const { data, error } = await supabase
      .from('clients').update(updates).eq('id', clientId).select().single()
    if (error) throw error
    if (data) setClients(prev => prev.map(c => c.id === data.id ? data : c))
  }

  async function handlePostLogUpdate(clientId, updates) {
    // Optimistic local update happens immediately either way
    setClients(prev => prev.map(c => c.id === clientId ? { ...c, ...updates } : c))

    if (!navigator.onLine) {
      await queueAction('post_log_update', { clientId, updates })
      return
    }
    try {
      await performPostLogUpdate({ clientId, updates })
    } catch (err) {
      if (!navigator.onLine || err?.message?.toLowerCase().includes('fetch')) {
        await queueAction('post_log_update', { clientId, updates })
      } else {
        setError(`Log saved, but failed to update the lead's stage/next action: ${err.message}`)
      }
    }
  }

  async function handleTaskDone(taskId) {
    // Remove immediately from view (silent — no history log per design decision)
    setTasks(prev => prev.filter(t => t.id !== taskId))

    if (!navigator.onLine) {
      await queueAction('task_done', { taskId }, taskId)
      return
    }

    try {
      const { error } = await supabase
        .from('tasks')
        .update({ done: true, done_at: new Date().toISOString() })
        .eq('id', taskId)
      if (error) throw error
    } catch (err) {
      // Network failure mid-flight (went offline after the click) — queue it
      // instead of showing an error, since this is a recoverable, expected case.
      if (!navigator.onLine || err?.message?.toLowerCase().includes('fetch')) {
        await queueAction('task_done', { taskId }, taskId)
      } else {
        setError(`Failed to mark task done: ${err.message}`)
        fetchTasks() // resync on a real failure
      }
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
    setSaving(false)
    if (error) { setError(error.message); throw error }
    if (data) setClients(prev => prev.map(c => c.id === data.id ? data : c))
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
    const note = whatHappened + (whatNext ? `\n→ Next: ${whatNext}` : '')
    const rowId = crypto.randomUUID ? crypto.randomUUID() : generateUuidFallback()

    // Optimistic local update — happens immediately regardless of connectivity,
    // so the UI (History tab, last-contacted time) reflects the log right away.
    const optimisticLog = {
      id: rowId, client_id: clientId, method, note,
      note_what_happened: whatHappened, note_what_next: whatNext || null,
      contacted_at: now,
    }
    setContactLogs(prev => [optimisticLog, ...prev])
    setClients(prev => prev.map(c => c.id === clientId ? { ...c, last_contacted_at: now } : c))

    if (!navigator.onLine) {
      await queueAction('log_contact', { clientId, method, note, whatHappened, whatNext, now }, rowId)
      return
    }

    try {
      await performLogContact({ clientId, method, note, whatHappened, whatNext, now }, rowId)
    } catch (err) {
      if (!navigator.onLine || err?.message?.toLowerCase().includes('fetch')) {
        // Went offline mid-request — the optimistic update already stands,
        // just queue the actual write for later.
        await queueAction('log_contact', { clientId, method, note, whatHappened, whatNext, now }, rowId)
      } else {
        setError(`Failed to save log: ${err.message}`)
      }
    }
  }

  // The actual Supabase write for a contact log entry — used both for the
  // immediate online path and when the offline queue drains. `rowId` is the
  // client-generated UUID used as the primary key, making this safe to
  // call twice with the same rowId (e.g. a retried sync) without creating
  // a duplicate row.
  async function performLogContact({ clientId, method, note, whatHappened, whatNext, now }, rowId) {
    let logData = null
    const { data: d1, error: e1 } = await supabase
      .from('contact_log')
      .insert({
        id: rowId,
        client_id: clientId,
        method,
        note,
        note_what_happened: whatHappened,
        note_what_next: whatNext || null,
        contacted_at: now,
      })
      .select().single()

    if (e1) {
      const isMissingColumn = e1.message?.includes('column') || e1.code === '42703' || e1.code === 'PGRST204'
      const isDuplicate = e1.code === '23505' // unique violation — this rowId was already synced
      if (isDuplicate) {
        // Already synced in a previous attempt — nothing more to do.
        return
      }
      if (!isMissingColumn) throw e1
      const { data: d2, error: e2 } = await supabase
        .from('contact_log')
        .insert({ id: rowId, client_id: clientId, method, note, contacted_at: now })
        .select().single()
      if (e2) {
        if (e2.code === '23505') return
        throw e2
      }
      logData = d2
    } else {
      logData = d1
    }

    if (logData) setContactLogs(prev => prev.map(l => l.id === rowId ? logData : l))
    const { data: clientData, error: e3 } = await supabase
      .from('clients').update({ last_contacted_at: now }).eq('id', clientId).select().single()
    if (e3) throw e3
    if (clientData) setClients(prev => prev.map(c => c.id === clientData.id ? clientData : c))
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
          {/* Offline sync status — always visible, never silent */}
          {(!isOnline || pendingCount > 0 || failedCount > 0 || syncing) && (
            <span
              className={`sync-status ${!isOnline ? 'sync-offline' : failedCount > 0 ? 'sync-failed' : 'sync-pending'}`}
              title={
                !isOnline ? `Offline — ${pendingCount} action${pendingCount !== 1 ? 's' : ''} queued`
                : failedCount > 0 ? `${failedCount} action${failedCount !== 1 ? 's' : ''} failed to sync`
                : syncing ? 'Syncing…'
                : `${pendingCount} action${pendingCount !== 1 ? 's' : ''} queued`
              }
            >
              {!isOnline ? `⚡ Offline${pendingCount > 0 ? ` · ${pendingCount}` : ''}`
                : failedCount > 0 ? `⚠ ${failedCount} failed`
                : syncing ? '↻ Syncing…'
                : `↻ ${pendingCount} queued`}
            </span>
          )}
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
            onAddTask={handleAddTask}
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
          onPostLogUpdate={handlePostLogUpdate}
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
