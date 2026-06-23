import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { formatCurrency } from '../utils'

const DEFAULT_ONBOARDING_STEPS = [
  'Onboarding call',
  'Setup & data migration',
  'Training session',
  'Go-live',
  'Client handoff',
]

const PAYMENT_TYPES = [
  { key: 'milestone', label: 'Milestone (50-50 etc.)' },
  { key: 'monthly',   label: 'Monthly subscription' },
  { key: 'lump_sum',  label: 'Lump sum' },
]

const SUBSCRIPTION_TYPES = [
  { key: 'one_time', label: 'One-time / Perpetual' },
  { key: 'annual',   label: 'Annual subscription' },
  { key: 'monthly',  label: 'Monthly subscription' },
]

function addDays(date, n) {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

export default function ClientTab({ client }) {
  const [deal, setDeal]               = useState(null)
  const [payments, setPayments]       = useState([])
  const [onboarding, setOnboarding]   = useState([])
  const [loading, setLoading]         = useState(true)
  const [saving, setSaving]           = useState(false)
  const [editingDeal, setEditingDeal] = useState(false)
  const [dealForm, setDealForm]       = useState(null)

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
    }
    setOnboarding(s || [])
    setLoading(false)
  }

  async function createDeal() {
    setSaving(true)
    const dealValue = client.potential_revenue || 0
    const today = new Date().toISOString().slice(0, 10)

    const { data: newDeal, error } = await supabase.from('deals').insert({
      client_id: client.id,
      deal_value: dealValue,
      payment_type: 'milestone',
      subscription_type: 'one_time',
      subscription_start: today,
    }).select().single()

    if (error) { setSaving(false); return }

    // Default 50-50 payments
    const half = Math.round(dealValue / 2)
    await supabase.from('payments').insert([
      { deal_id: newDeal.id, label: 'Advance (50%)',     amount: half,            due_date: today },
      { deal_id: newDeal.id, label: 'Final payment (50%)', amount: dealValue - half, due_date: addDays(today, 30) },
    ])

    // Default onboarding steps if none exist
    if (onboarding.length === 0) {
      await supabase.from('onboarding_steps').insert(
        DEFAULT_ONBOARDING_STEPS.map((label, i) => ({
          client_id: client.id,
          step_order: i,
          step_label: label,
          due_date: addDays(today, i * 7),
        }))
      )
    }

    await loadAll()
    setSaving(false)
  }

  async function saveDeal() {
    setSaving(true)
    await supabase.from('deals').update({
      deal_value: Number(dealForm.deal_value) || 0,
      payment_type: dealForm.payment_type,
      subscription_type: dealForm.subscription_type,
      subscription_start: dealForm.subscription_start || null,
      subscription_end: dealForm.subscription_end || null,
      notes: dealForm.notes || null,
    }).eq('id', deal.id)
    await loadAll()
    setEditingDeal(false)
    setSaving(false)
  }

  async function togglePaid(payment) {
    const paid = !payment.paid
    await supabase.from('payments').update({
      paid,
      paid_at: paid ? new Date().toISOString().slice(0, 10) : null,
    }).eq('id', payment.id)
    setPayments(prev => prev.map(p => p.id === payment.id ? { ...p, paid, paid_at: paid ? new Date().toISOString().slice(0, 10) : null } : p))
  }

  async function addPayment() {
    if (!deal) return
    const { data } = await supabase.from('payments').insert({
      deal_id: deal.id, label: 'New payment', amount: 0,
    }).select().single()
    if (data) setPayments(prev => [...prev, data])
  }

  async function updatePayment(id, field, value) {
    const updated = { [field]: value }
    await supabase.from('payments').update(updated).eq('id', id)
    setPayments(prev => prev.map(p => p.id === id ? { ...p, ...updated } : p))
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

  const totalPaid = payments.filter(p => p.paid).reduce((s, p) => s + Number(p.amount), 0)
  const totalDue  = payments.reduce((s, p) => s + Number(p.amount), 0)
  const stepsCompleted = onboarding.filter(s => s.completed).length

  return (
    <div style={{ padding: '0 2px', overflowY: 'auto', flex: 1, minHeight: 0 }}>

      {/* ── Payments ── */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Payments
          </div>
          {deal && !editingDeal && (
            <button
              onClick={() => { setDealForm({ ...deal }); setEditingDeal(true) }}
              style={{ fontSize: 11, color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              Edit deal
            </button>
          )}
        </div>

        {!deal ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 10 }}>
              No deal set up yet.
            </div>
            <button className="btn btn-primary btn-sm" onClick={createDeal} disabled={saving}>
              {saving ? 'Setting up…' : 'Set up deal & payments'}
            </button>
          </div>
        ) : editingDeal ? (
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, marginBottom: 8 }}>
            <div className="field-row">
              <div className="field">
                <label>Deal value (₹)</label>
                <input type="number" value={dealForm.deal_value} onChange={e => setDealForm(p => ({ ...p, deal_value: e.target.value }))} />
              </div>
              <div className="field">
                <label>Payment type</label>
                <select value={dealForm.payment_type} onChange={e => setDealForm(p => ({ ...p, payment_type: e.target.value }))}>
                  {PAYMENT_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
              </div>
            </div>
            <div className="field-row">
              <div className="field">
                <label>Subscription</label>
                <select value={dealForm.subscription_type} onChange={e => setDealForm(p => ({ ...p, subscription_type: e.target.value }))}>
                  {SUBSCRIPTION_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Start date</label>
                <input type="date" value={dealForm.subscription_start || ''} onChange={e => setDealForm(p => ({ ...p, subscription_start: e.target.value }))} />
              </div>
            </div>
            {['annual','monthly'].includes(dealForm.subscription_type) && (
              <div className="field">
                <label>End / renewal date</label>
                <input type="date" value={dealForm.subscription_end || ''} onChange={e => setDealForm(p => ({ ...p, subscription_end: e.target.value }))} />
              </div>
            )}
            <div className="field">
              <label>Deal notes</label>
              <input value={dealForm.notes || ''} onChange={e => setDealForm(p => ({ ...p, notes: e.target.value }))} placeholder="Special terms, custom arrangements…" />
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <button className="btn btn-primary btn-sm" onClick={saveDeal} disabled={saving} style={{ flex: 1 }}>Save</button>
              <button className="btn btn-secondary btn-sm" onClick={() => setEditingDeal(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          <>
            {/* Deal summary bar */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 10, padding: '8px 10px', background: 'var(--bg-light)', borderRadius: 8, fontSize: 12 }}>
              <div>
                <div style={{ color: 'var(--text-muted)' }}>Deal value</div>
                <div style={{ fontWeight: 700, color: 'var(--text-dark)' }}>{formatCurrency(deal.deal_value)}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-muted)' }}>Received</div>
                <div style={{ fontWeight: 700, color: 'var(--success)' }}>{formatCurrency(totalPaid)}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-muted)' }}>Outstanding</div>
                <div style={{ fontWeight: 700, color: totalDue - totalPaid > 0 ? 'var(--error)' : 'var(--success)' }}>{formatCurrency(totalDue - totalPaid)}</div>
              </div>
              {deal.subscription_end && (
                <div>
                  <div style={{ color: 'var(--text-muted)' }}>Renewal</div>
                  <div style={{ fontWeight: 700, color: 'var(--primary)' }}>
                    {new Date(deal.subscription_end + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </div>
                </div>
              )}
            </div>

            {/* Payment rows */}
            {payments.map(p => (
              <div key={p.id} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 8px', borderRadius: 6, marginBottom: 4,
                background: p.paid ? 'var(--success-bg)' : 'var(--bg-white)',
                border: '1px solid',
                borderColor: p.paid ? 'var(--success)' : 'var(--border-light)',
              }}>
                <button
                  onClick={() => togglePaid(p)}
                  style={{
                    width: 18, height: 18, borderRadius: '50%', flexShrink: 0, cursor: 'pointer',
                    background: p.paid ? 'var(--success)' : 'none',
                    border: `2px solid ${p.paid ? 'var(--success)' : 'var(--border)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                  title={p.paid ? 'Mark unpaid' : 'Mark paid'}
                >
                  {p.paid && <span style={{ color: '#fff', fontSize: 10, lineHeight: 1 }}>✓</span>}
                </button>
                <input
                  value={p.label}
                  onChange={e => updatePayment(p.id, 'label', e.target.value)}
                  style={{ flex: 1, fontSize: 12, border: 'none', background: 'transparent', fontFamily: 'var(--font)', fontWeight: 500, color: 'var(--text-dark)' }}
                />
                <input
                  type="number"
                  value={p.amount}
                  onChange={e => updatePayment(p.id, 'amount', Number(e.target.value))}
                  style={{ width: 70, fontSize: 12, textAlign: 'right', border: 'none', background: 'transparent', fontFamily: 'var(--font)', fontWeight: 700, color: p.paid ? 'var(--success)' : 'var(--text-dark)' }}
                />
                <input
                  type="date"
                  value={p.due_date || ''}
                  onChange={e => updatePayment(p.id, 'due_date', e.target.value)}
                  style={{ fontSize: 11, border: 'none', background: 'transparent', color: 'var(--text-muted)', fontFamily: 'var(--font)' }}
                />
                <button onClick={() => deletePayment(p.id)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13, padding: '0 2px' }} title="Remove">×</button>
              </div>
            ))}
            <button
              onClick={addPayment}
              style={{ fontSize: 11, color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', width: '100%', textAlign: 'left' }}
            >
              + Add payment
            </button>
          </>
        )}
      </div>

      {/* Divider */}
      <div style={{ borderTop: '1px solid var(--border-light)', marginBottom: 16 }} />

      {/* ── Onboarding ── */}
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
            Set up the deal above to auto-create onboarding steps.
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

            {/* Progress bar */}
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
    </div>
  )
}
