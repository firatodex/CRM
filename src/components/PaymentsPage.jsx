import { useMemo, useState } from 'react'
import { supabase } from '../supabase'
import { formatCurrency, todayStr } from '../utils'
import { CADENCE_OPTIONS, cadenceLabel } from '../utils/paymentMath'
import {
  buildCollectionQueue,
  confirmPayloadFromItem,
  daysUntil,
  filterCollectionQueue,
  summarizeCollectionQueue,
} from '../utils/collectionQueue'
import { markCollectionItemPaid, undoMarkCollectionPaid } from '../utils/markCollectionPaid'
import { getRequirePaymentPlan, setRequirePaymentPlan } from '../utils/crmPolicies'
import PaymentRecordModal from './PaymentRecordModal'
import RecordPaymentConfirm from './RecordPaymentConfirm'
import CollectionQueueList from './CollectionQueueList'
import PaymentToast from './PaymentToast'

const AGING_CHIPS = [
  { key: 'all', label: 'All due' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'Next 7 days' },
]

function formatDisplayDate(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso + (iso.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric',
    })
  } catch {
    return iso
  }
}

export default function PaymentsPage({
  clients = [],
  deals = [],
  payments = [],
  onOpenClient,
  onRefresh,
  onExport,
  onRequirePlanChange,
}) {
  const today = todayStr()

  const [view, setView] = useState('inbox') // inbox | plans | history | missing
  const [aging, setAging] = useState('all')
  const [search, setSearch] = useState('')
  const [modelFilter, setModelFilter] = useState('all')
  const [cadenceFilter, setCadenceFilter] = useState('all')
  const [showMoreFilters, setShowMoreFilters] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [editPrompt, setEditPrompt] = useState(null)
  const [actionError, setActionError] = useState(null)
  const [requirePlan, setRequirePlan] = useState(() => getRequirePaymentPlan())
  const [statusBusyId, setStatusBusyId] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [confirmBusy, setConfirmBusy] = useState(false)
  const [busyKey, setBusyKey] = useState(null)
  const [toast, setToast] = useState(null) // { undo, clientName, amount, label }
  const [toastUndoBusy, setToastUndoBusy] = useState(false)
  const [hiddenKeys, setHiddenKeys] = useState(() => new Set())

  const clientById = useMemo(() => {
    const map = {}
    clients.forEach(c => { map[c.id] = c })
    return map
  }, [clients])

  const paymentsByDeal = useMemo(() => {
    const map = {}
    payments.forEach(p => {
      if (!map[p.deal_id]) map[p.deal_id] = []
      map[p.deal_id].push(p)
    })
    return map
  }, [payments])

  const plans = useMemo(() => {
    return deals.map(deal => {
      const client = clientById[deal.client_id]
      const rows = paymentsByDeal[deal.id] || []
      const unpaid = rows.filter(p => !p.paid)
      const unpaidBalance = unpaid.reduce((s, p) => s + (Number(p.amount) || 0), 0)
      const hasOverduePayment = unpaid.some(p => p.due_date && p.due_date < today)
      const reminderOverdue = deal.reminder_enabled && deal.next_reminder_at && deal.next_reminder_at < today
      const model = deal.pricing_model
        || (deal.subscription_type === 'one_time' ? 'one_time' : deal.subscription_type ? 'recurring' : null)
      return {
        deal,
        client,
        model,
        unpaidBalance,
        hasOverduePayment,
        reminderOverdue,
      }
    }).filter(p => p.client)
  }, [deals, clientById, paymentsByDeal, today])

  const activeWithoutPlan = useMemo(() => {
    const dealClientIds = new Set(deals.map(d => d.client_id))
    return clients.filter(c => c.stage === 'active' && !dealClientIds.has(c.id))
  }, [clients, deals])

  /** Unified collection queue — shared with TodayView. */
  const collectionQueue = useMemo(
    () => buildCollectionQueue({ payments, deals, clients, today, horizonDays: 7 }),
    [payments, deals, clients, today]
  )

  const inboxItems = useMemo(
    () => filterCollectionQueue(collectionQueue, { aging, search, today })
      .filter(item => !hiddenKeys.has(item.key)),
    [collectionQueue, aging, search, today, hiddenKeys]
  )

  const inboxTotals = useMemo(
    () => summarizeCollectionQueue(collectionQueue, today),
    [collectionQueue, today]
  )

  const filteredPlans = useMemo(() => {
    const q = search.trim().toLowerCase()
    return plans.filter(({ deal, client, model }) => {
      if (modelFilter !== 'all' && model !== modelFilter) return false
      if (cadenceFilter !== 'all') {
        if (model !== 'recurring') return false
        if ((deal.billing_cadence || '') !== cadenceFilter) return false
      }
      if (q) {
        const hay = `${client?.name || ''} ${client?.company || ''} ${deal.product_sold || ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [plans, modelFilter, cadenceFilter, search])

  const historyRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return [...payments]
      .map(p => {
        const deal = deals.find(d => d.id === p.deal_id)
        const client = deal ? clientById[deal.client_id] : null
        return { payment: p, deal, client }
      })
      .filter(r => r.client)
      .filter(r => {
        if (modelFilter !== 'all') {
          const model = r.deal?.pricing_model
            || (r.deal?.subscription_type === 'one_time' ? 'one_time' : r.deal?.subscription_type ? 'recurring' : null)
          if (model !== modelFilter) return false
        }
        if (q) {
          const hay = `${r.client?.name || ''} ${r.client?.company || ''} ${r.payment.label || ''}`.toLowerCase()
          if (!hay.includes(q)) return false
        }
        return true
      })
      .sort((a, b) => String(b.payment.paid_at || b.payment.due_date || b.payment.created_at || '')
        .localeCompare(String(a.payment.paid_at || a.payment.due_date || a.payment.created_at || '')))
  }, [payments, deals, clientById, modelFilter, search])

  function openEdit(client, deal = null) {
    setEditPrompt({ client, existingDeal: deal })
  }

  function askMarkPaid(item) {
    setConfirm(confirmPayloadFromItem(item))
  }

  function askMarkInvoice(payment) {
    const deal = deals.find(d => d.id === payment.deal_id)
    const client = deal ? clientById[deal.client_id] : null
    askMarkPaid({
      kind: 'invoice',
      payment,
      deal,
      client,
      amount: payment.amount,
      label: payment.label || 'Payment',
      dueDate: payment.due_date,
    })
  }

  async function handleUndoPaid(payment) {
    setActionError(null)
    setStatusBusyId(payment.id)
    try {
      const { error } = await supabase
        .from('payments')
        .update({ paid: false, paid_at: null })
        .eq('id', payment.id)
      if (error) throw error
      onRefresh?.()
    } catch (err) {
      setActionError(err?.message || 'Failed to undo payment')
    } finally {
      setStatusBusyId(null)
    }
  }

  async function handleTogglePaymentStatus(payment) {
    if (payment.paid) {
      await handleUndoPaid(payment)
      return
    }
    askMarkInvoice(payment)
  }

  async function handleConfirmPayment() {
    if (!confirm) return
    setConfirmBusy(true)
    setActionError(null)
    const itemKey = confirm.type === 'renewal'
      ? `renew-${confirm.deal?.id}`
      : `pay-${confirm.payment?.id}`
    setBusyKey(itemKey)
    try {
      const result = await markCollectionItemPaid({
        kind: confirm.type === 'renewal' ? 'renewal' : 'invoice',
        payment: confirm.payment,
        deal: confirm.deal,
        client: confirm.client,
        label: confirm.label,
        amount: confirm.amount,
      }, today)
      setHiddenKeys(prev => new Set(prev).add(itemKey))
      setConfirm(null)
      setToast({
        undo: result.undo,
        clientName: result.clientName || confirm.client?.name,
        amount: result.amount ?? confirm.amount,
        label: result.label || confirm.label,
      })
      onRefresh?.()
    } catch (err) {
      setActionError(err?.message || 'Failed to mark paid')
    } finally {
      setConfirmBusy(false)
      setBusyKey(null)
    }
  }

  async function handleToastUndo() {
    if (!toast?.undo) return
    setToastUndoBusy(true)
    setActionError(null)
    try {
      await undoMarkCollectionPaid(toast.undo)
      setHiddenKeys(new Set())
      setToast(null)
      onRefresh?.()
    } catch (err) {
      setActionError(err?.message || 'Failed to undo')
    } finally {
      setToastUndoBusy(false)
    }
  }

  const secondaryLinks = [
    { key: 'inbox', label: 'Collections' },
    { key: 'plans', label: 'Clients with plans' },
    { key: 'history', label: 'History' },
    {
      key: 'missing',
      label: activeWithoutPlan.length > 0
        ? `${activeWithoutPlan.length} need a plan`
        : 'Need a plan',
      alert: activeWithoutPlan.length > 0,
    },
  ]

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
        gap: 16, marginBottom: 14, flexWrap: 'wrap',
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Payments</h1>
          <p style={{ margin: '6px 0 0', fontSize: 14, color: 'var(--text-muted)' }}>
            {inboxTotals.count === 0 ? (
              <>Nothing to collect right now</>
            ) : (
              <>
                <span style={{ fontWeight: 700, color: inboxTotals.overdueCount ? '#b45309' : 'var(--text)' }}>
                  {formatCurrency(inboxTotals.amount)}
                </span>
                {' '}to collect
                {inboxTotals.overdueCount > 0 && (
                  <>
                    {' · '}
                    <span style={{ fontWeight: 700, color: '#dc2626' }}>
                      {inboxTotals.overdueCount} overdue
                    </span>
                  </>
                )}
              </>
            )}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary btn-sm" type="button" onClick={() => onExport?.()}>
            Export CSV
          </button>
          <button className="btn btn-secondary btn-sm" type="button" onClick={() => onRefresh?.()}>
            Refresh
          </button>
        </div>
      </div>

      {/* Secondary destinations (not equal tabs) */}
      <div style={{
        display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap',
        borderBottom: '1px solid var(--border-light)', paddingBottom: 10,
      }}>
        {secondaryLinks.map(link => (
          <button
            key={link.key}
            type="button"
            onClick={() => {
              setView(link.key)
              if (link.key === 'inbox') setShowMoreFilters(false)
            }}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: view === link.key ? 700 : 500,
              color: view === link.key
                ? 'var(--text)'
                : link.alert ? '#dc2626' : 'var(--text-muted)',
              padding: '4px 10px',
              borderRadius: 6,
              textDecoration: view === link.key ? 'none' : 'underline',
              textUnderlineOffset: 3,
              backgroundColor: view === link.key ? 'var(--bg-light)' : 'transparent',
            }}
          >
            {link.label}
          </button>
        ))}
      </div>

      {actionError && (
        <div className="login-error" style={{ marginBottom: 12 }}>{actionError}</div>
      )}

      {/* Inbox toolbar */}
      {view === 'inbox' && (
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center',
          marginBottom: 14,
        }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {AGING_CHIPS.map(chip => (
              <button
                key={chip.key}
                type="button"
                onClick={() => setAging(chip.key)}
                style={{
                  fontSize: 12,
                  fontWeight: aging === chip.key ? 700 : 500,
                  padding: '6px 12px',
                  borderRadius: 999,
                  border: `1px solid ${aging === chip.key ? 'var(--primary)' : 'var(--border)'}`,
                  background: aging === chip.key ? 'var(--primary)' : 'var(--bg-white)',
                  color: aging === chip.key ? '#fff' : 'var(--text)',
                  cursor: 'pointer',
                }}
              >
                {chip.label}
              </button>
            ))}
          </div>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search client or company…"
            style={{ flex: '1 1 160px', minWidth: 140, fontSize: 13 }}
          />
        </div>
      )}

      {/* Plans / History toolbar */}
      {(view === 'plans' || view === 'history') && (
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center',
          marginBottom: 14,
        }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search…"
            style={{ flex: '1 1 160px', minWidth: 140, fontSize: 13 }}
          />
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setShowMoreFilters(v => !v)}
          >
            {showMoreFilters ? 'Hide filters' : 'More filters'}
          </button>
          {showMoreFilters && (
            <>
              <select value={modelFilter} onChange={e => setModelFilter(e.target.value)} style={{ fontSize: 13 }}>
                <option value="all">All models</option>
                <option value="one_time">One-time</option>
                <option value="recurring">Recurring</option>
              </select>
              {view === 'plans' && (
                <select value={cadenceFilter} onChange={e => setCadenceFilter(e.target.value)} style={{ fontSize: 13 }}>
                  <option value="all">All cadences</option>
                  {CADENCE_OPTIONS.map(c => (
                    <option key={c.key} value={c.key}>{c.label}</option>
                  ))}
                </select>
              )}
            </>
          )}
        </div>
      )}

      {view === 'inbox' && (
        <CollectionQueueList
          items={inboxItems}
          today={today}
          onOpenClient={onOpenClient}
          onMarkPaid={askMarkPaid}
          busyKey={busyKey}
          emptyTitle={
            collectionQueue.length === 0
              ? 'Nothing to collect'
              : 'No matches for this filter'
          }
          emptyHint={
            collectionQueue.length === 0
              ? (activeWithoutPlan.length > 0
                ? 'All open amounts are settled. Some active clients still need a plan.'
                : 'All open amounts are settled. You’re caught up.')
              : 'Try All due, clear search, or switch aging chips.'
          }
          emptyAction={
            collectionQueue.length === 0 && activeWithoutPlan.length > 0 ? (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setView('missing')}>
                {activeWithoutPlan.length} client{activeWithoutPlan.length === 1 ? '' : 's'} need a plan
              </button>
            ) : collectionQueue.length > 0 ? (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setAging('all'); setSearch('') }}>
                Show all due
              </button>
            ) : null
          }
        />
      )}

      {view === 'plans' && (
        <PlansTable
          rows={filteredPlans}
          today={today}
          onOpenClient={onOpenClient}
          onEditPlan={openEdit}
        />
      )}

      {view === 'history' && (
        <HistoryTable
          rows={historyRows}
          today={today}
          onOpenClient={onOpenClient}
          onToggleStatus={handleTogglePaymentStatus}
          statusBusyId={statusBusyId}
        />
      )}

      {view === 'missing' && (
        <MissingTable
          rows={activeWithoutPlan}
          onOpenClient={onOpenClient}
          onAddPlan={client => openEdit(client, null)}
        />
      )}

      {/* Advanced — policy toggle tucked away */}
      <div style={{ marginTop: 28, borderTop: '1px solid var(--border-light)', paddingTop: 12 }}>
        <button
          type="button"
          onClick={() => setShowAdvanced(v => !v)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 12, color: 'var(--text-muted)', padding: 0,
          }}
        >
          {showAdvanced ? '▾ Advanced' : '▸ Advanced'}
        </button>
        {showAdvanced && (
          <label style={{
            display: 'flex', alignItems: 'center', gap: 8,
            fontSize: 12, cursor: 'pointer', marginTop: 10,
            color: 'var(--text-muted)',
          }}>
            <input
              type="checkbox"
              checked={requirePlan}
              onChange={e => {
                const v = setRequirePaymentPlan(e.target.checked)
                setRequirePlan(v)
                onRequirePlanChange?.(v)
              }}
            />
            Require payment plan when moving a lead to Active
          </label>
        )}
      </div>

      {editPrompt && (
        <PaymentRecordModal
          client={editPrompt.client}
          existingDeal={editPrompt.existingDeal}
          requirePlan={requirePlan && !editPrompt.existingDeal}
          onSkip={() => setEditPrompt(null)}
          onSaved={() => {
            setEditPrompt(null)
            onRefresh?.()
          }}
        />
      )}

      <RecordPaymentConfirm
        open={!!confirm}
        type={confirm?.type}
        client={confirm?.client}
        amount={confirm?.amount}
        label={confirm?.label}
        dueDate={confirm?.dueDate}
        busy={confirmBusy}
        onConfirm={handleConfirmPayment}
        onCancel={() => !confirmBusy && setConfirm(null)}
      />

      <PaymentToast
        open={!!toast}
        clientName={toast?.clientName}
        amount={toast?.amount}
        onUndo={toast?.undo ? handleToastUndo : null}
        undoBusy={toastUndoBusy}
        onDismiss={() => setToast(null)}
      />
    </div>
  )
}

function PlansTable({ rows, today, onOpenClient, onEditPlan }) {
  if (!rows.length) {
    return (
      <EmptyState
        title="No plans match"
        text="Try clearing search or More filters. Or add a plan from Need a plan."
      />
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
        Commercial terms directory. To collect money, use Collections.
      </p>
      {rows.map(({ deal, client, model, unpaidBalance, hasOverduePayment, reminderOverdue }) => {
        const renewsOn = deal.next_reminder_at
        const days = daysUntil(renewsOn, today)
        const isRecurring = model === 'recurring'
        return (
          <div
            key={deal.id}
            className="pay-plan-card"
            style={{
              border: '1px solid var(--border)',
              borderRadius: 14,
              background: 'var(--bg-white)',
              padding: '14px 16px',
              display: 'grid',
              gridTemplateColumns: '1.4fr 1fr 1fr auto',
              gap: 14,
              alignItems: 'center',
            }}
          >
            <div>
              <button type="button" onClick={() => onOpenClient?.(client)} style={{ ...linkBtn, marginBottom: 4 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{client?.name || '—'}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{client?.company || '—'}</div>
              </button>
              {deal.product_sold && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{deal.product_sold}</div>
              )}
              <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                <Pill
                  color={isRecurring ? '#1d4ed8' : '#374151'}
                  bg={isRecurring ? '#dbeafe' : '#f3f4f6'}
                >
                  {isRecurring ? 'Recurring' : 'One-time'}
                </Pill>
                <StatusPill overdue={hasOverduePayment || reminderOverdue} unpaid={unpaidBalance > 0} />
              </div>
            </div>

            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.3 }}>
                Net
              </div>
              <div style={{ fontSize: 18, fontWeight: 750, marginTop: 2 }}>
                {formatCurrency(deal.net_price ?? deal.deal_value)}
              </div>
              {isRecurring && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  {formatCurrency(deal.net_monthly_price)}/mo · {cadenceLabel(deal.billing_cadence, deal.custom_interval_months)}
                </div>
              )}
              {unpaidBalance > 0 && (
                <div style={{ fontSize: 12, color: '#b45309', fontWeight: 650, marginTop: 4 }}>
                  Unpaid {formatCurrency(unpaidBalance)}
                </div>
              )}
            </div>

            <div>
              {isRecurring ? (
                <>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.3 }}>
                    Renews on
                  </div>
                  <div style={{
                    fontSize: 15, fontWeight: 750, marginTop: 2,
                    color: reminderOverdue ? '#dc2626' : days === 0 ? '#a16207' : 'var(--text)',
                  }}>
                    {formatDisplayDate(renewsOn)}
                  </div>
                  <div style={{ fontSize: 12, color: reminderOverdue ? '#dc2626' : 'var(--text-muted)', marginTop: 2 }}>
                    {!renewsOn ? 'No renewal date set'
                      : reminderOverdue ? `Overdue by ${Math.abs(days)}d`
                      : days === 0 ? 'Due today'
                      : days > 0 ? `In ${days} day${days === 1 ? '' : 's'}`
                      : ''}
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.3 }}>
                    Close date
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 650, marginTop: 2 }}>
                    {formatDisplayDate(deal.billing_start_date || deal.subscription_start)}
                  </div>
                </>
              )}
            </div>

            <div>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => onEditPlan?.(client, deal)}>
                Edit plan
              </button>
            </div>
          </div>
        )
      })}
      <style>{`
        @media (max-width: 820px) {
          .pay-plan-card { grid-template-columns: 1fr !important; }
        }
      `}</style>
      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
        {rows.length} plan{rows.length === 1 ? '' : 's'}
      </div>
    </div>
  )
}

function HistoryTable({ rows, today, onOpenClient, onToggleStatus, statusBusyId }) {
  if (!rows.length) {
    return (
      <EmptyState
        title="No payment history"
        text="Marked-paid amounts show up here. You can Undo from a row if needed."
      />
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {rows.map(({ payment, client, deal }) => {
        const overdue = !payment.paid && payment.due_date && payment.due_date < today
        const isCredit = Number(payment.amount) < 0
        const busy = statusBusyId === payment.id
        return (
          <div
            key={payment.id}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr auto auto',
              gap: 12,
              alignItems: 'center',
              padding: '12px 14px',
              borderRadius: 12,
              border: '1px solid var(--border)',
              background: payment.paid ? 'rgba(34,197,94,0.06)' : overdue ? 'rgba(239,68,68,0.05)' : 'var(--bg-white)',
            }}
          >
            <div style={{ minWidth: 0 }}>
              <button type="button" onClick={() => onOpenClient?.(client)} style={linkBtn}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{client?.name || '—'}</div>
              </button>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                {payment.label || 'Payment'}
                {payment.kind ? ` · ${payment.kind === 'adjustment' && isCredit ? 'credit' : (payment.kind || '').replace('_', ' ')}` : ''}
              </div>
              <div style={{ fontSize: 11, color: overdue ? '#dc2626' : 'var(--text-muted)', marginTop: 2 }}>
                {payment.paid
                  ? `Paid ${formatDisplayDate(payment.paid_at)}`
                  : `Due ${formatDisplayDate(payment.due_date)}${overdue ? ' · overdue' : ''}`}
              </div>
            </div>

            <div style={{
              fontWeight: 750, fontSize: 15, textAlign: 'right',
              color: isCredit ? '#a16207' : payment.paid ? '#15803d' : 'var(--text)',
            }}>
              {formatCurrency(payment.amount)}
            </div>

            {payment.paid ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => onToggleStatus?.(payment)}
                style={{
                  background: 'none', border: 'none', cursor: busy ? 'wait' : 'pointer',
                  fontSize: 12, color: 'var(--text-muted)', textDecoration: 'underline',
                  whiteSpace: 'nowrap', padding: '4px 2px',
                }}
              >
                Undo
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={busy}
                onClick={() => onToggleStatus?.(payment)}
                style={{ whiteSpace: 'nowrap' }}
              >
                {busy ? '…' : 'Mark paid'}
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

function MissingTable({ rows, onOpenClient, onAddPlan }) {
  if (!rows.length) {
    return (
      <EmptyState
        title="Every active client has a plan"
        text="Nice — nothing left to set up here."
      />
    )
  }
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', background: 'var(--bg-white)' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: 'var(--bg-light)', textAlign: 'left' }}>
            <Th>Client</Th>
            <Th>Company</Th>
            <Th>Potential</Th>
            <Th></Th>
          </tr>
        </thead>
        <tbody>
          {rows.map(client => (
            <tr key={client.id} style={{ borderTop: '1px solid var(--border-light)' }}>
              <Td>
                <button type="button" onClick={() => onOpenClient?.(client)} style={linkBtn}>
                  {client.name}
                </button>
              </Td>
              <Td>{client.company || '—'}</Td>
              <Td>{formatCurrency(client.potential_revenue)}</Td>
              <Td>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => onAddPlan?.(client)}>
                  Add plan
                </button>
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function StatusPill({ overdue, unpaid }) {
  if (overdue) return <Pill color="#b91c1c" bg="#fee2e2">Overdue</Pill>
  if (unpaid) return <Pill color="#a16207" bg="#fef3c7">Open</Pill>
  return <Pill color="#15803d" bg="#dcfce7">Settled</Pill>
}

function Pill({ children, color, bg }) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: 999,
      fontSize: 11,
      fontWeight: 700,
      color,
      background: bg,
    }}>
      {children}
    </span>
  )
}

function EmptyState({ title, text }) {
  return (
    <div className="collection-empty">
      {title && <div className="collection-empty-title">{title}</div>}
      {text && <div className="collection-empty-hint">{text}</div>}
    </div>
  )
}

function Th({ children }) {
  return (
    <th style={{ padding: '10px 12px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.3 }}>
      {children}
    </th>
  )
}

function Td({ children, style }) {
  return <td style={{ padding: '10px 12px', verticalAlign: 'top', ...style }}>{children}</td>
}

const linkBtn = {
  background: 'none',
  border: 'none',
  padding: 0,
  cursor: 'pointer',
  textAlign: 'left',
  color: 'inherit',
  font: 'inherit',
}
