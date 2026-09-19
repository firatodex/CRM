import { useMemo, useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { formatCurrency, todayStr } from '../utils'
import PaymentRecordModal from './PaymentRecordModal'
import RecordPaymentConfirm from './RecordPaymentConfirm'
import PaymentToast from './PaymentToast'
import { cadenceLabel } from '../utils/paymentMath'
import {
  buildCollectionQueue,
  confirmPayloadFromItem,
  dueStatus,
} from '../utils/collectionQueue'
import { markCollectionItemPaid, undoMarkCollectionPaid } from '../utils/markCollectionPaid'

const DEFAULT_ONBOARDING_STEPS = [
  'Onboarding call',
  'Setup & data migration',
  'Training session',
  'Go-live',
  'Client handoff',
]

function addDays(date, n) {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

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

export default function ClientTab({ client }) {
  const [deal, setDeal] = useState(null)
  const [payments, setPayments] = useState([])
  const [onboarding, setOnboarding] = useState([])
  const [loading, setLoading] = useState(true)
  const [showPaymentRecord, setShowPaymentRecord] = useState(false)
  const [moneyError, setMoneyError] = useState(null)
  const [payConfirm, setPayConfirm] = useState(null)
  const [payConfirmBusy, setPayConfirmBusy] = useState(false)
  const [showAdjustments, setShowAdjustments] = useState(false)
  const [adjustBusy, setAdjustBusy] = useState(false)
  const [toast, setToast] = useState(null)
  const [toastUndoBusy, setToastUndoBusy] = useState(false)

  useEffect(() => {
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client.id])

  async function loadAll() {
    setLoading(true)
    const [{ data: d }, { data: s }] = await Promise.all([
      supabase.from('deals').select('*').eq('client_id', client.id).maybeSingle(),
      supabase.from('onboarding_steps').select('*').eq('client_id', client.id).order('step_order'),
    ])
    if (d) {
      setDeal(d)
      const { data: p } = await supabase.from('payments').select('*').eq('deal_id', d.id).order('created_at')
      setPayments(p || [])
    } else {
      setDeal(null)
      setPayments([])
    }
    setOnboarding(s || [])
    setLoading(false)
  }

  async function ensureOnboardingSteps() {
    if (onboarding.length > 0) return
    const today = todayStr()
    await supabase.from('onboarding_steps').insert(
      DEFAULT_ONBOARDING_STEPS.map((label, i) => ({
        client_id: client.id,
        step_order: i,
        step_label: label,
        due_date: addDays(today, i * 7),
      }))
    )
  }

  async function markDelivered() {
    const today = todayStr()
    await supabase.from('deals').update({ delivery_status: true, delivered_at: today }).eq('id', deal.id)
    setDeal(d => ({ ...d, delivery_status: true, delivered_at: today }))
  }

  async function unmarkDelivered() {
    await supabase.from('deals').update({ delivery_status: false, delivered_at: null }).eq('id', deal.id)
    setDeal(d => ({ ...d, delivery_status: false, delivered_at: null }))
  }

  function daysRemaining(fromDate, totalDays) {
    if (!fromDate) return null
    const end = new Date(fromDate)
    end.setDate(end.getDate() + totalDays)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return Math.ceil((end - today) / (1000 * 60 * 60 * 24))
  }

  function CountdownBar({ label, fromDate, totalDays, color }) {
    const remaining = daysRemaining(fromDate, totalDays)
    const elapsed = totalDays - (remaining > 0 ? remaining : 0)
    const pct = Math.min(100, Math.round((elapsed / totalDays) * 100))
    const expired = remaining !== null && remaining <= 0
    return (
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{label}</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: expired ? 'var(--text-muted)' : remaining <= 7 ? '#dc2626' : color }}>
            {expired ? 'Expired' : `${remaining}d left`}
          </span>
        </div>
        <div style={{ height: 5, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ height: '100%', borderRadius: 3, width: `${pct}%`, background: expired ? 'var(--border)' : color, transition: 'width 0.3s' }} />
        </div>
      </div>
    )
  }

  const today = todayStr()

  const dueItems = useMemo(() => {
    if (!deal) return []
    return buildCollectionQueue({
      payments,
      deals: [deal],
      clients: [client],
      today,
      horizonDays: 7,
    })
  }, [deal, payments, client, today])

  const nextDue = dueItems[0] || null
  const nextStatus = nextDue ? dueStatus(nextDue.dueDate, today) : null

  const outstanding = useMemo(() => {
    if (dueItems.length > 0) {
      return dueItems.reduce((s, i) => s + (Number(i.amount) || 0), 0)
    }
    return payments.filter(p => !p.paid).reduce((s, p) => s + (Number(p.amount) || 0), 0)
  }, [dueItems, payments])

  const recentActivity = useMemo(() => {
    return [...payments]
      .sort((a, b) => {
        const da = a.paid_at || a.due_date || a.created_at || ''
        const db = b.paid_at || b.due_date || b.created_at || ''
        return String(db).localeCompare(String(da))
      })
      .slice(0, 8)
  }, [payments])

  function askMarkNextDue() {
    if (!nextDue) return
    setMoneyError(null)
    setPayConfirm(confirmPayloadFromItem(nextDue))
  }

  async function confirmMarkPaid() {
    if (!payConfirm) return
    setPayConfirmBusy(true)
    setMoneyError(null)
    try {
      const result = await markCollectionItemPaid({
        kind: payConfirm.type === 'renewal' ? 'renewal' : 'invoice',
        payment: payConfirm.payment,
        deal: payConfirm.type === 'renewal' ? deal : payConfirm.deal,
        client,
        label: payConfirm.label,
        amount: payConfirm.amount,
      }, today)
      setPayConfirm(null)
      setToast({
        undo: result.undo,
        clientName: result.clientName || client.name,
        amount: result.amount ?? payConfirm.amount,
      })
      await loadAll()
    } catch (err) {
      setMoneyError(err?.message || 'Failed to mark paid')
    } finally {
      setPayConfirmBusy(false)
    }
  }

  async function handleToastUndo() {
    if (!toast?.undo) return
    setToastUndoBusy(true)
    setMoneyError(null)
    try {
      await undoMarkCollectionPaid(toast.undo)
      setToast(null)
      await loadAll()
    } catch (err) {
      setMoneyError(err?.message || 'Failed to undo')
    } finally {
      setToastUndoBusy(false)
    }
  }

  async function addAdjustment(kind) {
    if (!deal) return
    setAdjustBusy(true)
    setMoneyError(null)
    try {
      const isCredit = kind === 'credit'
      const { data, error } = await supabase.from('payments').insert({
        deal_id: deal.id,
        label: isCredit ? 'Credit note' : kind === 'partial' ? 'Partial payment' : 'Adjustment',
        amount: 0,
        due_date: today,
        paid: false,
        kind: 'adjustment',
      }).select().single()
      if (error) throw error
      if (data) setPayments(prev => [...prev, data])
      setShowAdjustments(true)
    } catch (err) {
      setMoneyError(err?.message || 'Failed to add adjustment')
    } finally {
      setAdjustBusy(false)
    }
  }

  async function updateAdjustment(id, field, value) {
    const updated = { [field]: field === 'amount' ? Number(value) : value }
    setPayments(prev => prev.map(p => p.id === id ? { ...p, ...updated } : p))
    await supabase.from('payments').update(updated).eq('id', id)
  }

  async function deletePayment(id) {
    await supabase.from('payments').delete().eq('id', id)
    setPayments(prev => prev.filter(p => p.id !== id))
  }

  async function toggleStep(step) {
    const completed = !step.completed
    await supabase.from('onboarding_steps').update({
      completed,
      completed_at: completed ? new Date().toISOString() : null,
    }).eq('id', step.id)
    setOnboarding(prev => prev.map(s => s.id === step.id ? { ...s, completed, completed_at: completed ? new Date().toISOString() : null } : s))
  }

  async function updateStep(id, field, value) {
    await supabase.from('onboarding_steps').update({ [field]: value }).eq('id', id)
    setOnboarding(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s))
  }

  if (loading) return <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 13 }}>Loading…</div>

  const stepsCompleted = onboarding.filter(s => s.completed).length
  const openAdjustments = payments.filter(p => p.kind === 'adjustment' && !p.paid)

  const planLine = deal
    ? [
        deal.pricing_model === 'recurring' ? 'Recurring' : deal.pricing_model === 'one_time' ? 'One-time' : null,
        deal.pricing_model === 'recurring' ? cadenceLabel(deal.billing_cadence, deal.custom_interval_months) : null,
        formatCurrency(deal.net_price ?? deal.deal_value) + ' net',
      ].filter(Boolean).join(' · ')
    : null

  return (
    <div style={{ padding: '0 2px', overflowY: 'auto', flex: 1, minHeight: 0 }}>

      {/* ── Money card ── */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Money
          </div>
          {deal && (
            <button
              type="button"
              onClick={() => setShowPaymentRecord(true)}
              style={{ fontSize: 11, color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}
            >
              Edit plan
            </button>
          )}
        </div>

        {!deal ? (
          <div style={{
            border: '1px dashed var(--border)', borderRadius: 10, padding: '16px 12px',
            textAlign: 'center', color: 'var(--text-muted)', fontSize: 13,
          }}>
            No payment plan yet.
            <div style={{ marginTop: 10 }}>
              <button
                className="btn btn-primary btn-sm"
                type="button"
                onClick={async () => {
                  await ensureOnboardingSteps()
                  setShowPaymentRecord(true)
                }}
              >
                Add plan
              </button>
            </div>
          </div>
        ) : (
          <div style={{
            border: '1px solid var(--border)',
            borderRadius: 12,
            background: 'var(--bg-white)',
            overflow: 'hidden',
          }}>
            {/* Summary */}
            <div style={{ padding: '14px 14px 12px', background: 'var(--bg-light)' }}>
              <div style={{ fontSize: 13, fontWeight: 650, marginBottom: 8 }}>{planLine}</div>
              {deal.product_sold && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>{deal.product_sold}</div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 12 }}>
                <div>
                  <div style={{ color: 'var(--text-muted)', marginBottom: 2 }}>Next due</div>
                  {nextDue ? (
                    <div style={{ fontWeight: 700, color: nextStatus?.key === 'overdue' ? '#dc2626' : 'var(--text)' }}>
                      {formatDisplayDate(nextDue.dueDate)}
                      {nextStatus ? ` (${nextStatus.label})` : ''}
                    </div>
                  ) : (
                    <div style={{ fontWeight: 650, color: 'var(--success)' }}>Nothing due</div>
                  )}
                  {nextDue && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{nextDue.label}</div>
                  )}
                </div>
                <div>
                  <div style={{ color: 'var(--text-muted)', marginBottom: 2 }}>Outstanding</div>
                  <div style={{
                    fontWeight: 750, fontSize: 15,
                    color: outstanding > 0 ? '#b45309' : 'var(--success)',
                  }}>
                    {formatCurrency(outstanding)}
                  </div>
                  {dueItems.length > 1 && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                      {dueItems.length} open amounts
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                {nextDue && (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={payConfirmBusy}
                    onClick={askMarkNextDue}
                  >
                    Mark paid
                    {nextDue.amount != null ? ` · ${formatCurrency(nextDue.amount)}` : ''}
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setShowPaymentRecord(true)}
                >
                  Edit plan
                </button>
              </div>
              {moneyError && <div className="login-error" style={{ marginTop: 8 }}>{moneyError}</div>}
            </div>

            {/* Recent activity — read-only */}
            <div style={{ padding: '12px 14px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>
                Recent activity
              </div>
              {recentActivity.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No payments logged yet.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {recentActivity.map(p => {
                    const isCredit = Number(p.amount) < 0
                    return (
                      <div
                        key={p.id}
                        style={{
                          display: 'flex', justifyContent: 'space-between', gap: 8,
                          fontSize: 12, alignItems: 'baseline',
                        }}
                      >
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <span style={{ color: 'var(--text-muted)' }}>
                            {formatDisplayDate(p.paid_at || p.due_date)}
                          </span>
                          {' · '}
                          <span style={{
                            fontWeight: 650,
                            color: p.paid ? 'var(--success)' : isCredit ? '#a16207' : '#b45309',
                          }}>
                            {p.paid ? 'Paid' : isCredit ? 'Credit' : 'Open'}
                          </span>
                          {' · '}
                          <span style={{ color: 'var(--text)' }}>{p.label || 'Payment'}</span>
                        </div>
                        <div style={{
                          fontWeight: 700, whiteSpace: 'nowrap',
                          color: isCredit ? '#a16207' : p.paid ? 'var(--success)' : 'var(--text)',
                        }}>
                          {formatCurrency(p.amount)}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Add adjustment — progressive disclosure */}
              <div style={{ marginTop: 12, borderTop: '1px solid var(--border-light)', paddingTop: 10 }}>
                <button
                  type="button"
                  onClick={() => setShowAdjustments(v => !v)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                    fontSize: 12, color: 'var(--primary)', fontWeight: 600,
                  }}
                >
                  {showAdjustments ? '▾ Hide adjustments' : '+ Add adjustment'}
                </button>

                {showAdjustments && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
                      <button
                        type="button"
                        disabled={adjustBusy}
                        onClick={() => addAdjustment('partial')}
                        style={{ fontSize: 11, color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                      >
                        + Partial payment
                      </button>
                      <button
                        type="button"
                        disabled={adjustBusy}
                        onClick={() => addAdjustment('credit')}
                        style={{ fontSize: 11, color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                      >
                        + Credit note
                      </button>
                    </div>
                    {openAdjustments.length === 0 ? (
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        New adjustments appear here so you can set amount and due date.
                      </div>
                    ) : (
                      openAdjustments.map(p => (
                        <div
                          key={p.id}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            padding: '6px 8px', borderRadius: 6, marginBottom: 4,
                            border: '1px solid var(--border-light)', background: 'var(--bg-light)',
                          }}
                        >
                          <input
                            value={p.label || ''}
                            onChange={e => updateAdjustment(p.id, 'label', e.target.value)}
                            style={{ flex: 1, fontSize: 12, border: 'none', background: 'transparent', fontFamily: 'var(--font)' }}
                          />
                          <input
                            type="number"
                            value={p.amount}
                            onChange={e => updateAdjustment(p.id, 'amount', e.target.value)}
                            style={{ width: 72, fontSize: 12, textAlign: 'right', border: 'none', background: 'transparent', fontFamily: 'var(--font)', fontWeight: 700 }}
                          />
                          <input
                            type="date"
                            value={p.due_date || ''}
                            onChange={e => updateAdjustment(p.id, 'due_date', e.target.value)}
                            style={{ fontSize: 11, border: 'none', background: 'transparent', color: 'var(--text-muted)', fontFamily: 'var(--font)' }}
                          />
                          <button
                            type="button"
                            onClick={() => deletePayment(p.id)}
                            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13 }}
                            title="Remove"
                          >
                            ×
                          </button>
                        </div>
                      ))
                    )}
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '8px 0 0' }}>
                      After you set the amount, use <strong>Mark paid</strong> above when money lands.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Divider */}
      <div style={{ borderTop: '1px solid var(--border-light)', marginBottom: 16 }} />

      {/* ── Delivery & Support ── */}
      {deal && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>
            Delivery & Support
          </div>

          {deal.product_sold && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
              Product: <span style={{ fontWeight: 600, color: 'var(--text)' }}>{deal.product_sold}</span>
            </div>
          )}

          {!deal.delivery_status ? (
            <button
              onClick={markDelivered}
              style={{
                width: '100%', padding: '10px 0', borderRadius: 8, border: '1.5px dashed var(--border)',
                background: 'var(--bg-light)', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                color: 'var(--text-muted)', marginBottom: 12
              }}
            >
              ✓ Mark as Delivered
            </button>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, padding: '8px 12px', borderRadius: 8, background: 'var(--success-bg)', border: '1px solid var(--success)' }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--success)' }}>✓ Delivered</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {deal.delivered_at ? formatDisplayDate(deal.delivered_at) : ''}
                </div>
              </div>
              <button onClick={unmarkDelivered} style={{ fontSize: 11, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>Undo</button>
            </div>
          )}

          {deal.delivery_status && deal.delivered_at && (
            <div>
              <CountdownBar label="🔧 Changes window" fromDate={deal.delivered_at} totalDays={30} color="#f59e0b" />
              <CountdownBar label="💬 Support window" fromDate={deal.delivered_at} totalDays={90} color="#6366f1" />
            </div>
          )}
        </div>
      )}

      {/* Divider */}
      <div style={{ borderTop: '1px solid var(--border-light)', marginBottom: 16 }} />
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Onboarding
            {onboarding.length > 0 && (
              <span style={{ marginLeft: 6, color: stepsCompleted === onboarding.length ? 'var(--success)' : 'var(--primary)' }}>
                {stepsCompleted}/{onboarding.length}
              </span>
            )}
          </div>
        </div>

        {onboarding.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '12px 0' }}>
            Add a payment plan to auto-create onboarding steps.
          </div>
        ) : (
          <>
            {onboarding.map((step, idx) => (
              <div key={step.id} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 8px', borderRadius: 6, marginBottom: 4,
                background: step.completed ? 'var(--success-bg)' : 'var(--bg-white)',
                border: '1px solid',
                borderColor: step.completed ? 'var(--success)' : 'var(--border-light)',
              }}>
                <button
                  onClick={() => toggleStep(step)}
                  style={{
                    width: 18, height: 18, borderRadius: '50%', flexShrink: 0, cursor: 'pointer',
                    background: step.completed ? 'var(--success)' : 'none',
                    border: `2px solid ${step.completed ? 'var(--success)' : 'var(--border)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  {step.completed && <span style={{ color: '#fff', fontSize: 10, lineHeight: 1 }}>✓</span>}
                </button>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 16, flexShrink: 0 }}>{idx + 1}</span>
                <input
                  value={step.step_label}
                  onChange={e => updateStep(step.id, 'step_label', e.target.value)}
                  style={{
                    flex: 1, fontSize: 12, border: 'none', background: 'transparent',
                    fontFamily: 'var(--font)', fontWeight: 500,
                    color: step.completed ? 'var(--text-muted)' : 'var(--text-dark)',
                    textDecoration: step.completed ? 'line-through' : 'none',
                  }}
                />
                <input
                  type="date"
                  value={step.due_date || ''}
                  onChange={e => updateStep(step.id, 'due_date', e.target.value)}
                  style={{ fontSize: 11, border: 'none', background: 'transparent', color: 'var(--text-muted)', fontFamily: 'var(--font)' }}
                />
              </div>
            ))}

            <div style={{ marginTop: 8, height: 4, background: 'var(--border-light)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 2,
                background: stepsCompleted === onboarding.length ? 'var(--success)' : 'var(--primary)',
                width: `${onboarding.length ? (stepsCompleted / onboarding.length) * 100 : 0}%`,
                transition: 'width 0.3s ease',
              }} />
            </div>
          </>
        )}
      </div>

      {showPaymentRecord && (
        <PaymentRecordModal
          client={client}
          existingDeal={deal}
          onSkip={() => setShowPaymentRecord(false)}
          onSaved={async () => {
            setShowPaymentRecord(false)
            await ensureOnboardingSteps()
            await loadAll()
          }}
        />
      )}

      <RecordPaymentConfirm
        open={!!payConfirm}
        type={payConfirm?.type}
        client={client}
        amount={payConfirm?.amount}
        label={payConfirm?.label}
        dueDate={payConfirm?.dueDate}
        busy={payConfirmBusy}
        onConfirm={confirmMarkPaid}
        onCancel={() => !payConfirmBusy && setPayConfirm(null)}
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
