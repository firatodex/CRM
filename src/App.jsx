import { useEffect, useState, useCallback } from 'react'
import { PIPELINE_STAGES } from './stages'
import KanbanColumn from './components/KanbanColumn'
import TopBar from './components/TopBar'
import AddClientModal from './components/AddClientModal'
import DetailModal from './components/DetailModal'
import DashboardRedesign from './components/DashboardRedesign'
import TodayView from './components/TodayView'
import SearchBar from './components/SearchBar'
import ActiveDeadPanel from './components/ActiveDeadPanel'
import ExportModal from './components/ExportModal'
import ConfirmModal from './components/ConfirmModal'
import FilterBar, { applyFilters } from './components/FilterBar'
import TasksView from './components/TasksView'
import FinalStepView from './components/FinalStepView'
import CalendarView from './components/CalendarView'
import { useOfflineSync } from './useOfflineSync'
import { useCrmData } from './hooks/useCrmData'
import { insertClient, updateClient, patchClient, deleteClient } from './api/clients'
import { insertContactLog } from './api/contactLog'
import { insertTask, markTaskDone, rescheduleTask } from './api/tasks'
import { listDealsForClient } from './api/deals'
import { listPaymentsForDeals, listPaymentsForDeal } from './api/payments'
import { findPipelineSnapshot, insertPipelineSnapshot } from './api/pipelineSnapshots'
import { addFinalStepClient, removeFinalStepClient } from './api/finalStep'
import { buildPipelineSnapshot } from './utils/pipelineSnapshot'
import { todayStr } from './utils'
import UsersManagement from './components/UsersManagement'
import DeliveryTracker from './components/DeliveryTracker'
import CustomerHealthDashboard from './components/CustomerHealthDashboard'
import PaymentRecordModal from './components/PaymentRecordModal'
import PaymentsPage from './components/PaymentsPage'
import { getRequirePaymentPlan } from './utils/crmPolicies'
import { isDealSettled } from './utils/paymentReminders'

/** Flip to true to put Delivery, Health, and Desk back in the top nav. Screens stay wired below. */
const SHOW_DELIVERY_HEALTH_DESK_NAV = false

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
  const {
    clients, setClients,
    contactLogs, setContactLogs,
    tasks, setTasks,
    pipelineSnapshots, setPipelineSnapshots,
    deals, setDeals,
    payments, setPayments,
    finalStepIds, setFinalStepIds,
    loading, error, setError,
    fetchClients, fetchTasks, fetchFinalStepIds, fetchDeals, fetchPayments,
  } = useCrmData()
  const [clientsTab, setClientsTab] = useState('active') // 'active' | 'dead' — toggle within Clients view
  const [tasksViewMode, setTasksViewMode] = useState('list') // 'list' | 'calendar' | 'final_step'
  const [filters, setFilters] = useState({ search: '', temperature: '', source: '', overdueOnly: false })
  const [saving, setSaving] = useState(false)

  const [showAdd, setShowAdd] = useState(false)
  const [selected, setSelected] = useState(null)
  const [view, setView] = useState('pipeline')
  const [searchOpen, setSearchOpen] = useState(false)
  const [draggedClient, setDraggedClient] = useState(null)
  const [showExport, setShowExport] = useState(false)
  // confirmDelete holds the client id to delete, or null
  const [confirmDelete, setConfirmDelete] = useState(null)
  // Payment record modal — shown when a lead moves to Active
  const [paymentPrompt, setPaymentPrompt] = useState(null) // { client, existingDeal? } | null
  const [requirePaymentPlan, setRequirePaymentPlanState] = useState(() => getRequirePaymentPlan())

  // Offline sync — currently scoped to logging a contact and marking a
  // task done, the two actions most likely to happen with no signal.
  const { isOnline, pendingCount, failedCount, syncing, queueAction } = useOfflineSync({
    log_contact: (payload, rowId) => performLogContact(payload, rowId),
    task_done: (payload) => performTaskDone(payload),
    post_log_update: (payload) => performPostLogUpdate(payload),
  })

  // Pipeline points snapshot — once per day, the first time the app loads
  // that day, record today's pipeline reserve (Contacted + Proposal points)
  // and any win-driven depletion. This can only build forward from today;
  // there's no reliable stage-history to reconstruct past days honestly,
  // so we don't fake one — the chart simply starts now and stays accurate.
  useEffect(() => {
    if (loading || clients.length === 0) return
    recordPipelineSnapshotIfNeeded()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, clients.length])

  async function recordPipelineSnapshotIfNeeded() {
    const today = todayStr()
    const { data: existing } = await findPipelineSnapshot(today)
    if (existing) return // already recorded today — append-only, never overwritten
    const { data: inserted, error } = await insertPipelineSnapshot(buildPipelineSnapshot(clients, today))
    if (!error && inserted) setPipelineSnapshots(prev => [...prev, inserted])
  }

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

  async function handleAddFinalStep(clientId) {
    setFinalStepIds(prev => prev.includes(clientId) ? prev : [...prev, clientId])
    const { error } = await addFinalStepClient(clientId)
    if (error && error.code !== '23505') { // ignore duplicate-key races
      setError(`Failed to add to Final Step: ${error.message}`)
      setFinalStepIds(prev => prev.filter(id => id !== clientId))
    }
  }

  async function handleRemoveFinalStep(clientId) {
    setFinalStepIds(prev => prev.filter(id => id !== clientId))
    const { error } = await removeFinalStepClient(clientId)
    if (error) {
      setError(`Failed to remove from Final Step: ${error.message}`)
      fetchFinalStepIds()
    }
  }

  async function handleSaveFinalStepRevenue(clientId, value) {
    setClients(prev => prev.map(c => c.id === clientId ? { ...c, potential_revenue: value } : c))
    const { error } = await patchClient(clientId, { potential_revenue: value })
    if (error) setError(`Failed to save revenue: ${error.message}`)
  }

  async function handleAddTask(clientId, taskType, note, dueDate, dueTime, title) {
    const { data, error } = await insertTask({
      client_id: clientId || null,
      task_type: taskType,
      title: title || null,
      note: note || null,
      due_date: dueDate,
      due_time: dueTime || null,
    })
    if (error) { setError(`Failed to add task: ${error.message}`); return null }
    if (data) setTasks(prev => [...prev, data])
    return data
  }

  async function performTaskDone({ taskId }) {
    const { error } = await markTaskDone(taskId)
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
    const { data, error } = await updateClient(clientId, updates)
    if (error) throw error
    if (data) setClients(prev => prev.map(c => c.id === data.id ? data : c))
  }

  async function handlePostLogUpdate(clientId, updates) {
    // DB write for these fields is now handled by handleSave (merged form).
    // This function only needs to update local state so the pipeline card
    // reflects the new stage/next action immediately.
    setClients(prev => prev.map(c => c.id === clientId ? { ...c, ...updates } : c))
    if (updates.stage === 'dead' || updates.stage === 'active') {
      setFinalStepIds(prev => prev.filter(id => id !== clientId))
    }
    if (updates.stage === 'dead') {
      setTasks(prev => prev.filter(t => t.client_id !== clientId))
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
      await performTaskDone({ taskId })
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
    const { data, error } = await rescheduleTask(taskId, newDate, newTime)
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
      proposal_value: null, current_solution: null, objection: null,
    }
    const { data, error } = await insertClient(payload)
    if (error) setError(error.message)
    else setClients(prev => [data, ...prev])
    setSaving(false)
    setShowAdd(false)
  }

  async function handleSave(form) {
    setSaving(true)
    if (form.stage === 'dead' || form.stage === 'active') {
      setFinalStepIds(prev => prev.filter(id => id !== form.id))
    }
    if (form.stage === 'dead') {
      setTasks(prev => prev.filter(t => t.client_id !== form.id))
    }
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
      proposal_value: form.proposal_value || null,
      current_solution: form.current_solution?.trim() || null,
      objection: form.objection?.trim() || null,
      discovery_team_size: form.discovery_team_size || null,
      discovery_monthly_leads: form.discovery_monthly_leads || null,
      discovery_current_tool: form.discovery_current_tool || null,
      discovery_lost_deals: form.discovery_lost_deals || null,
      discovery_decision_maker: form.discovery_decision_maker || null,
      discovery_switch_openness: form.discovery_switch_openness || null,
      discovery_completed_at: form.discovery_completed_at || null,
      // Include post-log fields that may be merged in from DetailModal
      last_contacted_at: form.last_contacted_at || null,
      proposal_sent_at: form.proposal_sent_at || null,
    }
    const previousClient = clients.find(c => c.id === form.id)
    if (form.stage === 'active' && previousClient?.stage !== 'active') {
      payload.won_at = new Date().toISOString()
      payload.won_from_stage = previousClient?.stage || null
    }
    try {
      const { data, error } = await updateClient(form.id, payload)
      if (error) { setError(error.message); throw error }
      if (data) {
        setClients(prev => prev.map(c => c.id === data.id ? data : c))
        if (form.stage === 'active' && previousClient?.stage !== 'active') {
          promptForPayment(data)
        }
      }
    } finally {
      setSaving(false)
    }
  }

  // Instead of using native confirm(), we set the id and show ConfirmModal.
  // The actual delete runs in handleDeleteConfirmed once the user clicks Delete.
  function handleDelete(id) {
    setConfirmDelete(id)
  }

  async function handleDeleteConfirmed() {
    if (!confirmDelete) return
    setSaving(true)
    const { error } = await deleteClient(confirmDelete)
    if (error) setError(error.message)
    else {
      setClients(prev => prev.filter(c => c.id !== confirmDelete))
      setSelected(null)
    }
    setSaving(false)
    setConfirmDelete(null)
  }

  async function handleLogContact(clientId, method, whatHappened, whatNext, progress = false) {
    const now = new Date().toISOString()
    const note = whatHappened + (whatNext ? `\n→ Next: ${whatNext}` : '')
    const rowId = crypto.randomUUID ? crypto.randomUUID() : generateUuidFallback()

    // Optimistic local update — happens immediately regardless of connectivity,
    // so the UI (History tab, last-contacted time) reflects the log right away.
    const optimisticLog = {
      id: rowId, client_id: clientId, method, note,
      contacted_at: now, progress,
    }
    setContactLogs(prev => [optimisticLog, ...prev])
    setClients(prev => prev.map(c => c.id === clientId ? { ...c, last_contacted_at: now } : c))

    if (!navigator.onLine) {
      await queueAction('log_contact', { clientId, method, note, whatHappened, whatNext, now, progress }, rowId)
      return
    }

    try {
      await performLogContact({ clientId, method, note, whatHappened, whatNext, now, progress }, rowId)
    } catch (err) {
      if (!navigator.onLine || err?.message?.toLowerCase().includes('fetch')) {
        // Went offline mid-request — the optimistic update already stands,
        // just queue the actual write for later.
        await queueAction('log_contact', { clientId, method, note, whatHappened, whatNext, now, progress }, rowId)
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
  async function performLogContact({ clientId, method, note, now, progress = false }, rowId) {
    const { data: logData, error } = await insertContactLog({
      id: rowId,
      client_id: clientId,
      method,
      note,
      contacted_at: now,
      progress,
    })

    if (error) {
      if (error.code === '23505') return // already synced
      throw error
    }

    if (logData) setContactLogs(prev => prev.map(l => l.id === rowId ? logData : l))
    // last_contacted_at is merged into the performPostLogUpdate client write
    // so we don't need a separate UPDATE here — saves one round trip.
  }

  async function promptForPayment(client) {
    const { data: clientDeals } = await listDealsForClient(client.id)
    const list = clientDeals || []
    if (!list.length) {
      setPaymentPrompt({ client, existingDeal: null, mode: 'new' })
      return
    }
    const ids = list.map(d => d.id)
    const { data: pays } = await listPaymentsForDeals(ids)
    const open = list.find(d => !isDealSettled(d, pays || []))
    if (open) {
      setPaymentPrompt({ client, existingDeal: open, mode: 'edit' })
    } else {
      // All settled — start a new project rather than overwrite history
      setPaymentPrompt({ client, existingDeal: null, mode: 'new' })
    }
  }

  async function handlePaymentRecordSaved(deal) {
    setPaymentPrompt(null)
    if (deal) {
      setDeals(prev => {
        const idx = prev.findIndex(d => d.id === deal.id)
        if (idx >= 0) {
          const next = [...prev]
          next[idx] = deal
          return next
        }
        return [deal, ...prev]
      })
      const { data: pays } = await listPaymentsForDeal(deal.id)
      if (pays) {
        setPayments(prev => {
          const without = prev.filter(p => p.deal_id !== deal.id)
          return [...pays, ...without]
        })
      }
    } else {
      fetchDeals()
      fetchPayments()
    }
  }

  const [dropping, setDropping] = useState(false)

  const handleDrop = useCallback(async (stageKey) => {
    if (!draggedClient || draggedClient.stage === stageKey) { setDraggedClient(null); return }
    setDropping(true)
    const payload = { stage: stageKey }
    // Record the moment a lead is won, and which stage it converted from —
    // used by the pipeline reserve gauge to deduct a ratio-weighted amount
    // specific to that stage's real conversion rate (e.g. Proposal->Won is
    // rarer and represents more consumed pipeline than a hypothetical
    // Contacted->Won). updated_at alone isn't reliable for the date since
    // it changes on any unrelated field edit too.
    if (stageKey === 'active') {
      payload.won_at = new Date().toISOString()
      payload.won_from_stage = draggedClient.stage
    }
    const { data: dropData, error: dropError } = await updateClient(draggedClient.id, payload)
    if (!dropError && dropData) {
      setClients(prev => prev.map(c => c.id === dropData.id ? dropData : c))
      if (stageKey === 'active') promptForPayment(dropData)
    }
    else if (dropError) setError(`Failed to move card: ${dropError.message}`)
    setDraggedClient(null)
    setDropping(false)
  }, [draggedClient, setClients, setError])

  const pipelineClients = clients.filter(c => !['active', 'dead'].includes(c.stage)).map(c => ({
    ...c,
    progress_count: contactLogs.filter(l => l.client_id === c.id && l.progress).length,
  }))
  const activeClients   = clients.filter(c => c.stage === 'active')
  const deadClients     = clients.filter(c => c.stage === 'dead')
  const totalPipelineRevenue = pipelineClients.reduce((sum, c) => sum + (Number(c.potential_revenue) || 0), 0)

  const today = todayStr()
  const overdueCount = clients.filter(c =>
    !['active','dead'].includes(c.stage) && c.next_action_due && c.next_action_due <= today
  ).length
  const paymentReminderCount = deals.filter(d =>
    d.next_reminder_at &&
    d.next_reminder_at <= today &&
    d.reminder_enabled !== false &&
    (d.pricing_model === 'recurring' || d.subscription_type === 'monthly' || d.subscription_type === 'annual')
  ).length

  const pendingTasks = tasks.filter(t => !t.done)
  const urgentTaskCount = pendingTasks.filter(t => t.due_date <= today).length

  const isBoardView = view === 'pipeline' || view === 'today'

  return (
    <div className="app" style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <TopBar
        view={view}
        onViewChange={setView}
        todayBadge={overdueCount + paymentReminderCount}
        activeClientCount={activeClients.length}
        urgentTaskCount={urgentTaskCount}
        showHiddenViews={SHOW_DELIVERY_HEALTH_DESK_NAV}
        sync={{ isOnline, pendingCount, failedCount, syncing }}
        pipelineRevenue={totalPipelineRevenue}
        onSearch={() => setSearchOpen(true)}
        onExport={() => setShowExport(true)}
        onAddLead={() => setShowAdd(true)}
      />

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
            <FilterBar filters={filters} onChange={setFilters} />
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
          <DashboardRedesign clients={clients} contactLogs={contactLogs} deals={deals} payments={payments} pipelineSnapshots={pipelineSnapshots} />
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
              <ActiveDeadPanel clients={activeClients} type="active" onCardClick={setSelected} deals={deals} payments={payments} />
            ) : (
              <ActiveDeadPanel clients={deadClients} type="dead" onCardClick={setSelected} />
            )}
          </div>
        ) : view === 'payments' ? (
          <PaymentsPage
            clients={clients}
            deals={deals}
            payments={payments}
            onOpenClient={setSelected}
            onRefresh={() => { fetchDeals(); fetchPayments(); fetchClients() }}
            onExport={() => setShowExport(true)}
            onRequirePlanChange={setRequirePaymentPlanState}
          />
        ) : view === 'tasks' ? (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            <div style={{ display: 'flex', gap: 4, marginBottom: 12, flexShrink: 0 }}>
              <button
                className={`subtab-btn ${tasksViewMode === 'list' ? 'active' : ''}`}
                onClick={() => setTasksViewMode('list')}
              >☰ List</button>
              <button
                className={`subtab-btn ${tasksViewMode === 'calendar' ? 'active' : ''}`}
                onClick={() => setTasksViewMode('calendar')}
              >📅 Calendar</button>
              <button
                className={`subtab-btn ${tasksViewMode === 'final_step' ? 'active' : ''}`}
                onClick={() => setTasksViewMode('final_step')}
              >🎯 Final Step{finalStepIds.length > 0 ? ` (${finalStepIds.length})` : ''}</button>
            </div>
            {tasksViewMode === 'list' ? (
              <TasksView
                tasks={tasks}
                clients={clients}
                onAddTask={handleAddTask}
                onDone={handleTaskDone}
                onReschedule={handleTaskReschedule}
                onOpenClient={setSelected}
              />
            ) : tasksViewMode === 'final_step' ? (
              <FinalStepView
                clients={clients}
                finalStepIds={finalStepIds}
                onAdd={handleAddFinalStep}
                onRemove={handleRemoveFinalStep}
                onOpenClient={setSelected}
                onSaveRevenue={handleSaveFinalStepRevenue}
              />
            ) : (
              <CalendarView
                tasks={tasks}
                clients={clients}
                onAddTask={handleAddTask}
                onDone={handleTaskDone}
                onOpenClient={setSelected}
              />
            )}
          </div>
        ) : view === 'team' ? (
          <UsersManagement />
        ) : view === 'delivery' ? (
          <DeliveryTracker />
        ) : view === 'health' ? (
          <CustomerHealthDashboard />
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
        <ExportModal
          clients={clients}
          contactLogs={contactLogs}
          deals={deals}
          payments={payments}
          onClose={() => setShowExport(false)}
        />
      )}

      {/* Payment record — shown when a lead moves to Active */}
      {paymentPrompt && (
        <PaymentRecordModal
          client={paymentPrompt.client}
          existingDeal={paymentPrompt.existingDeal || null}
          mode={paymentPrompt.mode || (paymentPrompt.existingDeal ? 'edit' : 'new')}
          requirePlan={requirePaymentPlan && !paymentPrompt.existingDeal}
          onSkip={() => {
            if (requirePaymentPlan && !paymentPrompt.existingDeal) {
              setError('Payment record is required before leaving Active. Disable the policy on Payments if you need to skip.')
              return
            }
            setPaymentPrompt(null)
          }}
          onSaved={handlePaymentRecordSaved}
          onError={msg => setError(msg)}
        />
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
