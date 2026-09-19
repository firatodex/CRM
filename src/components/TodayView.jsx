import { useMemo, useState } from 'react'
import { PIPELINE_STAGES } from '../stages'
import ClientCard from './ClientCard'
import CollectionQueueList from './CollectionQueueList'
import RecordPaymentConfirm from './RecordPaymentConfirm'
import PaymentToast from './PaymentToast'
import { todayStr } from '../utils'
import {
  buildCollectionQueue,
  confirmPayloadFromItem,
  filterCollectionQueue,
  summarizeCollectionQueue,
} from '../utils/collectionQueue'
import { markCollectionItemPaid, undoMarkCollectionPaid } from '../utils/markCollectionPaid'

// Priority score within a column — higher = shown first
function priorityScore(client) {
  const today = todayStr()
  let score = 0

  if (client.next_action_due) {
    const diff = Math.round(
      (new Date(client.next_action_due + 'T00:00:00') - new Date(today + 'T00:00:00')) / 86400000
    )

    if (diff < 0) {
      const dayScore = 10000000 + Math.abs(diff) * 10000
      if (client.next_action_time) {
        const [hh, mm] = client.next_action_time.split(':').map(Number)
        score = dayScore + (1440 - (hh * 60 + mm)) * 5
      } else {
        score = dayScore
      }
    } else if (diff === 0) {
      if (client.next_action_time) {
        const [hh, mm] = client.next_action_time.split(':').map(Number)
        score = 1000000 + (1440 - (hh * 60 + mm)) * 5
      } else {
        score = 500000
      }
    }
  }

  if (client.temperature === 'hot')  score += 2
  if (client.temperature === 'warm') score += 1

  return score
}

function TodayColumn({ stage, clients, onCardClick, draggedClient, onDragStart, onDrop }) {
  const [dragOver, setDragOver] = useState(false)
  const isDragTarget = !!draggedClient && draggedClient.stage !== stage.key

  return (
    <div
      className={`column ${dragOver ? 'column-drag-over' : ''}`}
      style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}
      onDragOver={e => { e.preventDefault(); if (isDragTarget) setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={() => { setDragOver(false); onDrop(stage.key) }}
    >
      <div className="column-header">
        <span className="column-title">
          <span className="stage-dot" style={{ background: stage.color }} />
          {stage.label}
        </span>
        <span className="column-count">{clients.length}</span>
      </div>
      <div className="cards" style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
        {clients.length === 0
          ? <div className="empty-col">{dragOver ? 'Drop here' : 'No leads due'}</div>
          : clients.map(c => (
              <ClientCard
                key={c.id}
                client={c}
                onClick={onCardClick}
                onDragStart={onDragStart}
              />
            ))
        }
      </div>
    </div>
  )
}

export default function TodayView({
  clients,
  deals = [],
  payments = [],
  onCardClick,
  onDragStart,
  draggedClient,
  onDrop,
  onPaymentReminderDone,
}) {
  const today = todayStr()
  const [busyKey, setBusyKey] = useState(null)
  const [payError, setPayError] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [confirmBusy, setConfirmBusy] = useState(false)
  const [toast, setToast] = useState(null)
  const [toastUndoBusy, setToastUndoBusy] = useState(false)
  const [hiddenKeys, setHiddenKeys] = useState(() => new Set())

  const pipeline = clients.filter(c => !['active', 'dead'].includes(c.stage))
  const dueLeads = pipeline.filter(c => c.next_action_due && c.next_action_due <= today)

  const columns = PIPELINE_STAGES.map(stage => ({
    ...stage,
    clients: dueLeads
      .filter(c => c.stage === stage.key)
      .sort((a, b) => priorityScore(b) - priorityScore(a)),
  }))

  // Same builder as Payments; Today shows overdue + due today (actionable)
  const moneyQueue = useMemo(() => {
    const full = buildCollectionQueue({ payments, deals, clients, today, horizonDays: 7 })
    return filterCollectionQueue(full, { aging: 'actionable', today })
      .filter(item => !hiddenKeys.has(item.key))
  }, [payments, deals, clients, today, hiddenKeys])

  const moneyTotals = useMemo(
    () => summarizeCollectionQueue(moneyQueue, today),
    [moneyQueue, today]
  )

  const totalDue = dueLeads.length

  function askMarkPaid(item) {
    setPayError(null)
    setConfirm(confirmPayloadFromItem(item))
  }

  async function handleConfirmPayment() {
    if (!confirm) return
    setConfirmBusy(true)
    setPayError(null)
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
      })
      onPaymentReminderDone?.()
    } catch (err) {
      setPayError(err?.message || 'Failed to mark paid')
    } finally {
      setConfirmBusy(false)
      setBusyKey(null)
    }
  }

  async function handleToastUndo() {
    if (!toast?.undo) return
    setToastUndoBusy(true)
    try {
      await undoMarkCollectionPaid(toast.undo)
      setHiddenKeys(new Set())
      setToast(null)
      onPaymentReminderDone?.()
    } catch (err) {
      setPayError(err?.message || 'Failed to undo')
    } finally {
      setToastUndoBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, marginBottom: 12, flexWrap: 'wrap' }}>
        {totalDue > 0
          ? <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--error)', background: 'var(--error-bg)', padding: '2px 10px', borderRadius: 20 }}>
              {totalDue} lead{totalDue === 1 ? '' : 's'} need attention
            </span>
          : <span style={{ fontSize: 12, color: 'var(--success)', fontWeight: 600 }}>✓ Pipeline caught up</span>
        }
        {moneyQueue.length > 0 && (
          <span style={{
            fontSize: 12, fontWeight: 600, padding: '2px 10px', borderRadius: 20,
            color: moneyTotals.overdueCount ? '#b91c1c' : '#a16207',
            background: moneyTotals.overdueCount ? '#fee2e2' : '#fef3c7',
          }}>
            {moneyQueue.length} to collect
            {moneyTotals.overdueCount ? ` · ${moneyTotals.overdueCount} overdue` : ''}
          </span>
        )}
        <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>
          Priority sorted within each stage
        </span>
      </div>

      {moneyQueue.length > 0 && (
        <div style={{
          flexShrink: 0,
          marginBottom: 12,
          border: '1px solid var(--border)',
          borderRadius: 10,
          background: 'var(--bg-white)',
          overflow: 'hidden',
        }}>
          <div style={{
            padding: '10px 14px',
            borderBottom: '1px solid var(--border-light)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 8,
          }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>Money to collect</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Overdue & due today · same list as Payments
            </div>
          </div>
          {payError && <div className="login-error" style={{ margin: 10 }}>{payError}</div>}
          <CollectionQueueList
            items={moneyQueue}
            today={today}
            onOpenClient={onCardClick}
            onMarkPaid={askMarkPaid}
            busyKey={busyKey}
            compact
            maxHeight={220}
            emptyTitle="Nothing to collect"
            emptyHint=""
          />
        </div>
      )}

      <div className="board" style={{ flex: 1 }}>
        {columns.map(col => (
          <TodayColumn
            key={col.key}
            stage={col}
            clients={col.clients}
            onCardClick={onCardClick}
            onDragStart={onDragStart}
            onDrop={onDrop || (() => {})}
            draggedClient={draggedClient}
          />
        ))}
      </div>

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
