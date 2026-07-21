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
import FinalStepView from './components/FinalStepView'
import CalendarView from './components/CalendarView'
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
  const [pipelineSnapshots, setPipelineSnapshots] = useState([])
  const [clientsTab, setClientsTab] = useState('active') // 'active' | 'dead' — toggle within Clients view
  const [tasksViewMode, setTasksViewMode] = useState('list') // 'list' | 'calendar' | 'final_step'
  const [finalStepIds, setFinalStepIds] = useState([]) // client_ids manually flagged Final Step
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
  // Payment prompt — shown when a lead moves to Active, collects deal value
  // + received + pending before creating any records. Never auto-creates.
  const [paymentPrompt, setPaymentPrompt] = useState(null) // { client } | null
  const [dealStep, setDealStep] = useState(1) // 1=product, 2=payment terms, 3=confirm
  const [dealForm, setDealForm] = useState({
    product_sold: '',
    deal_value: '',
    payment_terms: '', // '50_50' | '100_0'
    advance_amount: '',
    advance_label: 'Advance',
    final_amount: '',
    final_label: 'On delivery',
  })

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
    fetchPipelineSnapshots(() => cancelled)
    fetchFinalStepIds(() => cancelled)
    return () => { cancelled = true }
  }, [])

  async function fetchPipelineSnapshots(isCancelled = () => false) {
    if (isCancelled()) return
    const { data, error } = await supabase
      .from('pipeline_snapshots').select('*')
      .order('snapshot_date', { ascending: true })
    if (isCancelled()) return
    if (!error && data) setPipelineSnapshots(data)
  }

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
    const { data: existing } = await supabase
      .from('pipeline_snapshots').select('snapshot_date').eq('snapshot_date', today).maybeSingle()
    if (existing) return // already recorded today — append-only, never overwritten

    const CONTACTED_WEIGHT = 1
    const WIN_DEDUCTION = 24
    const PROPOSAL_EXPIRY_DAYS = 30

    const contactedCount = clients.filter(c => c.stage === 'contacted').length

    // Only count proposals sent within the last 30 days — expired ones are
    // unlikely to convert and inflate the reserve gauge misleadingly.
    // Falls back to updated_at for proposals without a proposal_sent_at date.
    const proposalCount = clients.filter(c => {
      if (c.stage !== 'proposal') return false
      const sentAt = c.proposal_sent_at || c.updated_at
      if (!sentAt) return true // no date info, include it
      const daysSinceSent = (Date.now() - new Date(sentAt).getTime()) / (1000 * 60 * 60 * 24)
      return daysSinceSent <= PROPOSAL_EXPIRY_DAYS
    }).length

    const wonToday = clients.filter(c => c.won_at && c.won_at.slice(0, 10) === today)
    const winPointsRemoved = wonToday.length * WIN_DEDUCTION
    const points = Math.max(0, contactedCount * CONTACTED_WEIGHT + proposalCount * 7 - winPointsRemoved)

    const { data: inserted, error } = await supabase.from('pipeline_snapshots').insert({
      snapshot_date: today,
      contacted_count: contactedCount,
      proposal_count: proposalCount,
      points,
      wins_today: wonToday.length,
      win_points_removed: winPointsRemoved,
    }).select().single()
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

  async function fetchFinalStepIds(isCancelled = () => false) {
    if (isCancelled()) return
    const { data, error } = await supabase.from('final_step_clients').select('client_id')
    if (isCancelled()) return
    if (error) { setError(`Failed to load Final Step list: ${error.message}`); return }
    setFinalStepIds((data || []).map(r => r.client_id))
  }

  async function handleAddFinalStep(clientId) {
    setFinalStepIds(prev => prev.includes(clientId) ? prev : [...prev, clientId])
    const { error } = await supabase.from('final_step_clients').insert({ client_id: clientId })
    if (error && error.code !== '23505') { // ignore duplicate-key races
      setError(`Failed to add to Final Step: ${error.message}`)
      setFinalStepIds(prev => prev.filter(id => id !== clientId))
    }
  }

  async function handleRemoveFinalStep(clientId) {
    setFinalStepIds(prev => prev.filter(id => id !== clientId))
    const { error } = await supabase.from('final_step_clients').delete().eq('client_id', clientId)
    if (error) {
      setError(`Failed to remove from Final Step: ${error.message}`)
      fetchFinalStepIds()
    }
  }

  async function handleSaveFinalStepRevenue(clientId, value) {
    setClients(prev => prev.map(c => c.id === clientId ? { ...c, potential_revenue: value } : c))
    const { error } = await supabase.from('clients').update({ potential_revenue: value }).eq('id', clientId)
    if (error) setError(`Failed to save revenue: ${error.message}`)
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
      proposal_value: null, current_solution: null, objection: null,
    }
    const { data, error } = await supabase.from('clients').insert(payload).select().single()
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
      const { data, error } = await supabase
        .from('clients').update(payload).eq('id', form.id).select().single()
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
  async function performLogContact({ clientId, method, note, whatHappened, whatNext, now, progress = false }, rowId) {
    const { data: logData, error } = await supabase
      .from('contact_log')
      .insert({
        id: rowId,
        client_id: clientId,
        method,
        note,
        contacted_at: now,
        progress,
      })
      .select().single()

    if (error) {
      if (error.code === '23505') return // already synced
      throw error
    }

    if (logData) setContactLogs(prev => prev.map(l => l.id === rowId ? logData : l))
    // last_contacted_at is merged into the performPostLogUpdate client write
    // so we don't need a separate UPDATE here — saves one round trip.
  }

  function promptForPayment(client) {
    // Never auto-create. Always ask what was received and what is pending.
    setPaymentForm({
      deal_value: client.potential_revenue || '',
      received: '',
      pending: '',
      received_label: 'Advance',
      pending_label: 'Final payment',
    })
    setDealStep(1)
    setDealForm({ product_sold: '', deal_value: '', payment_terms: '', advance_amount: '', advance_label: 'Advance', final_amount: '', final_label: 'On delivery' })
    setPaymentPrompt({ client })
  }

  async function submitDealWizard() {
    const { client } = paymentPrompt
    const dealValue = Number(dealForm.deal_value) || 0
    const today = new Date().toISOString().slice(0, 10)
    const addDays = (d, n) => { const dt = new Date(d); dt.setDate(dt.getDate() + n); return dt.toISOString().slice(0, 10) }

    const { data: existing } = await supabase.from('deals').select('id').eq('client_id', client.id).maybeSingle()
    if (existing) { setPaymentPrompt(null); return }

    const { data: deal, error } = await supabase.from('deals').insert({
      client_id: client.id,
      deal_value: dealValue,
      product_sold: dealForm.product_sold.trim() || null,
      payment_type: 'milestone',
      subscription_type: 'one_time',
      subscription_start: today,
      delivery_status: false,
    }).select().single()
    if (error || !deal) { setError('Failed to create deal: ' + error?.message); return }

    const rows = []
    if (dealForm.payment_terms === '100_0') {
      rows.push({ deal_id: deal.id, label: 'Full payment', amount: dealValue, due_date: today, paid: true, paid_at: today })
    } else {
      const adv = Number(dealForm.advance_amount) || 0
      const fin = Number(dealForm.final_amount) || 0
      if (adv > 0) rows.push({ deal_id: deal.id, label: dealForm.advance_label, amount: adv, due_date: today, paid: true, paid_at: today })
      if (fin > 0) rows.push({ deal_id: deal.id, label: dealForm.final_label, amount: fin, due_date: addDays(today, 30), paid: false })
    }
    if (rows.length > 0) await supabase.from('payments').insert(rows)

    const STEPS = ['Onboarding call','Setup & data migration','Training session','Go-live','Client handoff']
    await supabase.from('onboarding_steps').insert(
      STEPS.map((label, i) => ({ client_id: client.id, step_order: i, step_label: label, due_date: addDays(today, i * 7) }))
    )

    setPaymentPrompt(null)
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
    const { data: dropData, error: dropError } = await supabase
      .from('clients').update(payload).eq('id', draggedClient.id).select().single()
    if (!dropError && dropData) {
      setClients(prev => prev.map(c => c.id === dropData.id ? dropData : c))
      if (stageKey === 'active') promptForPayment(dropData)
    }
    else if (dropError) setError(`Failed to move card: ${dropError.message}`)
    setDraggedClient(null)
    setDropping(false)
  }, [draggedClient])

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
            Desk
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
          <Dashboard clients={clients} contactLogs={contactLogs} pipelineSnapshots={pipelineSnapshots} />
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

      {/* Payment prompt — shown when a lead moves to Active, always, never skipped */}
      {paymentPrompt && (
        <div className="modal-overlay" onClick={() => {}}>
          <div className="modal-box" style={{ maxWidth: 420, padding: 28 }}>

            {/* Header */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
                Deal Closed
              </div>
              <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)' }}>
                {paymentPrompt.client.name}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                {paymentPrompt.client.company}
              </div>
            </div>

            {/* Step indicators */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 24 }}>
              {['Product', 'Payment', 'Confirm'].map((label, i) => (
                <div key={i} style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{
                    height: 3, borderRadius: 2, marginBottom: 4,
                    background: dealStep > i ? 'var(--primary)' : dealStep === i + 1 ? 'var(--primary)' : 'var(--border)'
                  }} />
                  <span style={{ fontSize: 10, fontWeight: 600, color: dealStep === i + 1 ? 'var(--primary)' : 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    {label}
                  </span>
                </div>
              ))}
            </div>

            {/* Step 1 — Product */}
            {dealStep === 1 && (
              <div>
                <div className="field" style={{ marginBottom: 14 }}>
                  <label>What was sold?</label>
                  <input
                    autoFocus
                    value={dealForm.product_sold}
                    onChange={e => setDealForm(p => ({ ...p, product_sold: e.target.value }))}
                    placeholder="e.g. CRM Software, Leads Sheet..."
                  />
                </div>
                <div className="field" style={{ marginBottom: 20 }}>
                  <label>Deal value (₹)</label>
                  <input
                    type="number"
                    value={dealForm.deal_value}
                    onChange={e => setDealForm(p => ({ ...p, deal_value: e.target.value }))}
                    placeholder="e.g. 21999"
                  />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-primary" style={{ flex: 1 }}
                    disabled={!dealForm.product_sold.trim() || !dealForm.deal_value}
                    onClick={() => setDealStep(2)}>
                    Next →
                  </button>
                  <button className="btn btn-secondary" onClick={() => setPaymentPrompt(null)}>Skip</button>
                </div>
              </div>
            )}

            {/* Step 2 — Payment terms */}
            {dealStep === 2 && (
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: 'var(--text)' }}>Payment terms</div>
                <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
                  {[
                    { key: '50_50', label: '50 / 50', sub: 'Advance + on delivery' },
                    { key: '100_0', label: '100%', sub: 'Full payment upfront' },
                  ].map(opt => (
                    <button key={opt.key} onClick={() => setDealForm(p => ({
                      ...p,
                      payment_terms: opt.key,
                      advance_amount: opt.key === '50_50' ? String(Math.round(Number(p.deal_value) / 2)) : '',
                      final_amount: opt.key === '50_50' ? String(Math.round(Number(p.deal_value) / 2)) : '',
                    }))}
                      style={{
                        flex: 1, padding: '14px 10px', borderRadius: 10, cursor: 'pointer',
                        border: '2px solid', textAlign: 'center',
                        borderColor: dealForm.payment_terms === opt.key ? 'var(--primary)' : 'var(--border)',
                        background: dealForm.payment_terms === opt.key ? 'rgba(var(--primary-rgb,180,90,40),0.06)' : 'var(--bg-white)',
                      }}>
                      <div style={{ fontWeight: 700, fontSize: 16, color: dealForm.payment_terms === opt.key ? 'var(--primary)' : 'var(--text)' }}>{opt.label}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{opt.sub}</div>
                    </button>
                  ))}
                </div>

                {dealForm.payment_terms === '50_50' && (
                  <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                    <div className="field" style={{ flex: 1 }}>
                      <label>Advance (₹)</label>
                      <input type="number" value={dealForm.advance_amount}
                        onChange={e => setDealForm(p => ({ ...p, advance_amount: e.target.value }))} />
                    </div>
                    <div className="field" style={{ flex: 1 }}>
                      <label>On delivery (₹)</label>
                      <input type="number" value={dealForm.final_amount}
                        onChange={e => setDealForm(p => ({ ...p, final_amount: e.target.value }))} />
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-secondary" onClick={() => setDealStep(1)}>← Back</button>
                  <button className="btn btn-primary" style={{ flex: 1 }}
                    disabled={!dealForm.payment_terms}
                    onClick={() => setDealStep(3)}>
                    Next →
                  </button>
                </div>
              </div>
            )}

            {/* Step 3 — Confirm */}
            {dealStep === 3 && (
              <div>
                <div style={{ background: 'var(--bg-light)', borderRadius: 10, padding: '14px 16px', marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[
                    { label: 'Product', value: dealForm.product_sold },
                    { label: 'Deal value', value: `₹${Number(dealForm.deal_value).toLocaleString('en-IN')}` },
                    { label: 'Payment', value: dealForm.payment_terms === '100_0'
                        ? 'Full payment upfront'
                        : `₹${Number(dealForm.advance_amount).toLocaleString('en-IN')} advance + ₹${Number(dealForm.final_amount).toLocaleString('en-IN')} on delivery` },
                  ].map(row => (
                    <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                      <span style={{ color: 'var(--text-muted)' }}>{row.label}</span>
                      <span style={{ fontWeight: 600 }}>{row.value}</span>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-secondary" onClick={() => setDealStep(2)}>← Back</button>
                  <button className="btn btn-primary" style={{ flex: 1 }} onClick={submitDealWizard}>
                    Confirm & Save
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
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
