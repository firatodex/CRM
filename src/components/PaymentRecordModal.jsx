import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase'
import { paymentRecordSchema } from '../schemas/paymentRecordSchema'
import {
  CADENCE_OPTIONS,
  applyDiscount,
  cadenceLabel,
  computeNextReminder,
  recomputeNextReminderFromSchedule,
  legacyPaymentType,
  legacySubscriptionType,
  monthsForCadence,
  periodEnd,
  roundMoney,
  syncMonthlyAndTotal,
} from '../utils/paymentMath'
import { formatCurrency, todayStr } from '../utils'

const inputStyle = { width: '100%' }

function numOrEmpty(v) {
  if (v === '' || v === null || v === undefined) return ''
  return String(v)
}

export default function PaymentRecordModal({
  client,
  existingDeal = null,
  onSkip,
  onSaved,
  onError,
  requirePlan = false,
}) {
  const today = todayStr()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const [productSold, setProductSold] = useState('')
  const [pricingModel, setPricingModel] = useState('one_time')
  const [listPrice, setListPrice] = useState('')
  const [discountPercent, setDiscountPercent] = useState('0')
  const [discountAmount, setDiscountAmount] = useState('0')
  const [monthlyPrice, setMonthlyPrice] = useState('')
  const [planTotal, setPlanTotal] = useState('')
  const [cadence, setCadence] = useState('1m')
  const [customMonths, setCustomMonths] = useState('1')
  const [billingStart, setBillingStart] = useState(today)
  const [markPaidToday, setMarkPaidToday] = useState(false)

  useEffect(() => {
    if (!client) return
    document.body.classList.add('modal-open')
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.classList.remove('modal-open')
      document.body.style.overflow = prev
    }
  }, [client])

  useEffect(() => {
    if (!client) return
    if (existingDeal) {
      const model = existingDeal.pricing_model || (existingDeal.subscription_type === 'one_time' ? 'one_time' : 'recurring')
      setProductSold(existingDeal.product_sold || '')
      setPricingModel(model)
      setListPrice(numOrEmpty(existingDeal.list_price ?? existingDeal.deal_value ?? client.potential_revenue ?? ''))
      setDiscountPercent(numOrEmpty(existingDeal.discount_percent ?? 0))
      setDiscountAmount(numOrEmpty(existingDeal.discount_amount ?? 0))
      setCadence(existingDeal.billing_cadence || '1m')
      setCustomMonths(numOrEmpty(existingDeal.custom_interval_months || 1))
      setBillingStart(existingDeal.billing_start_date || existingDeal.subscription_start || today)
      setMonthlyPrice(numOrEmpty(existingDeal.monthly_price ?? ''))
      const months = monthsForCadence(existingDeal.billing_cadence || '1m', existingDeal.custom_interval_months || 1)
      const total = existingDeal.net_price != null
        ? existingDeal.list_price ?? existingDeal.deal_value
        : (Number(existingDeal.monthly_price) || 0) * months
      setPlanTotal(numOrEmpty(existingDeal.list_price != null && model === 'recurring'
        ? (Number(existingDeal.monthly_price) || 0) * months || existingDeal.list_price
        : total))
      if (model === 'recurring' && !existingDeal.monthly_price && existingDeal.list_price) {
        const synced = syncMonthlyAndTotal({
          monthly: 0,
          total: Number(existingDeal.list_price) || 0,
          months,
          edited: 'total',
        })
        setMonthlyPrice(String(synced.monthly))
        setPlanTotal(String(synced.total))
      }
      setMarkPaidToday(false)
    } else {
      const seed = client.potential_revenue || client.proposal_value || ''
      setProductSold('')
      setPricingModel('one_time')
      setListPrice(numOrEmpty(seed))
      setDiscountPercent('0')
      setDiscountAmount('0')
      setMonthlyPrice('')
      setPlanTotal(numOrEmpty(seed))
      setCadence('1m')
      setCustomMonths('1')
      setBillingStart(today)
      setMarkPaidToday(false)
    }
    setError(null)
  }, [client?.id, existingDeal?.id])

  const months = monthsForCadence(cadence, customMonths)

  const discountBase = useMemo(() => {
    if (pricingModel === 'recurring') return roundMoney(Number(planTotal) || 0)
    return roundMoney(Number(listPrice) || 0)
  }, [pricingModel, planTotal, listPrice])

  const net = useMemo(() => {
    const amt = Number(discountAmount) || 0
    return roundMoney(Math.max(0, discountBase - amt))
  }, [discountBase, discountAmount])

  const netMonthly = useMemo(() => {
    if (pricingModel !== 'recurring') return null
    return roundMoney(net / months)
  }, [pricingModel, net, months])

  const nextReminder = useMemo(() => {
    if (pricingModel !== 'recurring' || !billingStart) return null
    return computeNextReminder(billingStart, cadence, customMonths, today)
  }, [pricingModel, billingStart, cadence, customMonths, today])

  function onListPriceChange(raw) {
    setListPrice(raw)
    if (pricingModel === 'one_time') {
      const disc = applyDiscount({
        base: Number(raw) || 0,
        percent: Number(discountPercent) || 0,
        edited: 'percent',
      })
      setDiscountAmount(String(disc.amount))
      setDiscountPercent(String(disc.percent))
    }
  }

  function onMonthlyChange(raw) {
    setMonthlyPrice(raw)
    const synced = syncMonthlyAndTotal({
      monthly: Number(raw) || 0,
      total: Number(planTotal) || 0,
      months,
      edited: 'monthly',
    })
    setPlanTotal(String(synced.total))
    const disc = applyDiscount({
      base: synced.total,
      percent: Number(discountPercent) || 0,
      edited: 'percent',
    })
    setDiscountAmount(String(disc.amount))
    setDiscountPercent(String(disc.percent))
  }

  function onPlanTotalChange(raw) {
    setPlanTotal(raw)
    const synced = syncMonthlyAndTotal({
      monthly: Number(monthlyPrice) || 0,
      total: Number(raw) || 0,
      months,
      edited: 'total',
    })
    setMonthlyPrice(String(synced.monthly))
    const disc = applyDiscount({
      base: synced.total,
      percent: Number(discountPercent) || 0,
      edited: 'percent',
    })
    setDiscountAmount(String(disc.amount))
    setDiscountPercent(String(disc.percent))
  }

  function onCadenceChange(key) {
    setCadence(key)
    const m = monthsForCadence(key, customMonths)
    const synced = syncMonthlyAndTotal({
      monthly: Number(monthlyPrice) || 0,
      total: Number(planTotal) || 0,
      months: m,
      edited: monthlyPrice !== '' ? 'monthly' : 'total',
    })
    setMonthlyPrice(String(synced.monthly || ''))
    setPlanTotal(String(synced.total || ''))
    const disc = applyDiscount({
      base: synced.total,
      percent: Number(discountPercent) || 0,
      edited: 'percent',
    })
    setDiscountAmount(String(disc.amount))
  }

  function onCustomMonthsChange(raw) {
    setCustomMonths(raw)
    const m = monthsForCadence('custom', raw)
    const synced = syncMonthlyAndTotal({
      monthly: Number(monthlyPrice) || 0,
      total: Number(planTotal) || 0,
      months: m,
      edited: monthlyPrice !== '' ? 'monthly' : 'total',
    })
    setMonthlyPrice(String(synced.monthly || ''))
    setPlanTotal(String(synced.total || ''))
  }

  function onDiscountPercentChange(raw) {
    setDiscountPercent(raw)
    const disc = applyDiscount({
      base: discountBase,
      percent: Number(raw) || 0,
      edited: 'percent',
    })
    setDiscountAmount(String(disc.amount))
  }

  function onDiscountAmountChange(raw) {
    setDiscountAmount(raw)
    const disc = applyDiscount({
      base: discountBase,
      amount: Number(raw) || 0,
      edited: 'amount',
    })
    setDiscountPercent(String(disc.percent))
  }

  function switchModel(model) {
    setPricingModel(model)
    setMarkPaidToday(false)
    if (model === 'recurring') {
      const seed = Number(listPrice) || Number(planTotal) || 0
      const synced = syncMonthlyAndTotal({ monthly: 0, total: seed, months, edited: 'total' })
      setPlanTotal(String(synced.total || seed || ''))
      setMonthlyPrice(String(synced.monthly || ''))
      const disc = applyDiscount({
        base: synced.total || seed,
        percent: Number(discountPercent) || 0,
        edited: 'percent',
      })
      setDiscountAmount(String(disc.amount))
    } else {
      if (!listPrice && planTotal) setListPrice(planTotal)
      const base = Number(listPrice) || Number(planTotal) || 0
      const disc = applyDiscount({
        base,
        percent: Number(discountPercent) || 0,
        edited: 'percent',
      })
      setDiscountAmount(String(disc.amount))
    }
  }

  async function handleSave() {
    setError(null)
    const list = pricingModel === 'recurring'
      ? roundMoney(Number(planTotal) || 0)
      : roundMoney(Number(listPrice) || 0)
    const payload = {
      product_sold: productSold.trim() || null,
      pricing_model: pricingModel,
      list_price: list,
      discount_percent: Number(discountPercent) || 0,
      discount_amount: Number(discountAmount) || 0,
      net_price: net,
      monthly_price: pricingModel === 'recurring' ? roundMoney(Number(monthlyPrice) || 0) : null,
      net_monthly_price: pricingModel === 'recurring' ? netMonthly : null,
      billing_cadence: pricingModel === 'recurring' ? cadence : null,
      custom_interval_months: pricingModel === 'recurring' && cadence === 'custom'
        ? Number(customMonths) || 1
        : null,
      billing_start_date: billingStart || today,
      mark_paid_today: pricingModel === 'one_time' ? markPaidToday : false,
      reminder_enabled: pricingModel === 'recurring',
    }

    const parsed = paymentRecordSchema.safeParse(payload)
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message || 'Invalid payment record'
      setError(msg)
      return
    }

    setSaving(true)
    try {
      const data = parsed.data
      if (data.net_price === 0 && data.discount_percent >= 100) {
        const ok = window.confirm('Net payable is ₹0 (100% discount). Save anyway?')
        if (!ok) { setSaving(false); return }
      }

      const start = data.billing_start_date || today
      const cadenceChanged = !!(existingDeal && data.pricing_model === 'recurring' && (
        existingDeal.billing_cadence !== data.billing_cadence
        || Number(existingDeal.custom_interval_months || 0) !== Number(data.custom_interval_months || 0)
        || (existingDeal.billing_start_date || existingDeal.subscription_start) !== start
      ))

      // New plans: first reminder from start. Mid-stream cadence/start edits: snap to next boundary >= today.
      const nextRem = data.pricing_model === 'recurring'
        ? (existingDeal && cadenceChanged
          ? recomputeNextReminderFromSchedule(start, data.billing_cadence, data.custom_interval_months, today)
          : (existingDeal?.next_reminder_at && !cadenceChanged
            ? existingDeal.next_reminder_at
            : computeNextReminder(start, data.billing_cadence, data.custom_interval_months, today)))
        : null

      const dealRow = {
        client_id: client.id,
        company: client.company || null,
        stage: 'active',
        product_sold: data.product_sold,
        pricing_model: data.pricing_model,
        list_price: data.list_price,
        discount_percent: data.discount_percent,
        discount_amount: data.discount_amount,
        net_price: data.net_price,
        monthly_price: data.monthly_price,
        net_monthly_price: data.net_monthly_price,
        billing_cadence: data.billing_cadence,
        custom_interval_months: data.custom_interval_months,
        billing_start_date: start,
        next_reminder_at: nextRem,
        reminder_enabled: !!data.reminder_enabled,
        currency: 'INR',
        deal_value: data.net_price,
        payment_type: legacyPaymentType(data.pricing_model),
        subscription_type: legacySubscriptionType(data.pricing_model, data.billing_cadence),
        subscription_start: start,
        delivery_status: existingDeal?.delivery_status ?? false,
      }

      let deal
      if (existingDeal?.id) {
        const { data: updated, error: upErr } = await supabase
          .from('deals')
          .update(dealRow)
          .eq('id', existingDeal.id)
          .select()
          .single()
        if (upErr) throw upErr
        deal = updated
      } else {
        const { data: existing } = await supabase
          .from('deals')
          .select('id')
          .eq('client_id', client.id)
          .maybeSingle()
        if (existing?.id) {
          const { data: updated, error: upErr } = await supabase
            .from('deals')
            .update(dealRow)
            .eq('id', existing.id)
            .select()
            .single()
          if (upErr) throw upErr
          deal = updated
        } else {
          const { data: inserted, error: inErr } = await supabase
            .from('deals')
            .insert(dealRow)
            .select()
            .single()
          if (inErr) throw inErr
          deal = inserted
        }
      }

      // First collection row — only if none exist yet for this deal
      const { data: existingPayments } = await supabase
        .from('payments')
        .select('id')
        .eq('deal_id', deal.id)
        .limit(1)

      if (!existingPayments?.length) {
        const pStart = start
        const pEnd = data.pricing_model === 'recurring'
          ? periodEnd(start, data.billing_cadence, data.custom_interval_months)
          : start
        const label = data.pricing_model === 'recurring'
          ? `${cadenceLabel(data.billing_cadence, data.custom_interval_months)} fee`
          : 'Deal close payment'

        const paymentRow = {
          deal_id: deal.id,
          label,
          amount: data.net_price,
          due_date: start,
          paid: !!data.mark_paid_today,
          paid_at: data.mark_paid_today ? today : null,
          kind: data.pricing_model === 'recurring' ? 'recurring_period' : 'one_time',
          period_start: pStart,
          period_end: pEnd,
        }
        const { error: payErr } = await supabase.from('payments').insert(paymentRow)
        if (payErr) throw payErr
      }

      // Default onboarding if missing
      const { data: steps } = await supabase
        .from('onboarding_steps')
        .select('id')
        .eq('client_id', client.id)
        .limit(1)
      if (!steps?.length) {
        const labels = ['Onboarding call', 'Setup & data migration', 'Training session', 'Go-live', 'Client handoff']
        await supabase.from('onboarding_steps').insert(
          labels.map((step_label, i) => ({
            client_id: client.id,
            step_order: i,
            step_label,
            due_date: (() => {
              const d = new Date(start + 'T00:00:00')
              d.setDate(d.getDate() + i * 7)
              const y = d.getFullYear()
              const m = String(d.getMonth() + 1).padStart(2, '0')
              const day = String(d.getDate()).padStart(2, '0')
              return `${y}-${m}-${day}`
            })(),
          }))
        )
      }

      onSaved?.(deal)
    } catch (err) {
      const msg = err?.message || 'Failed to save payment record'
      setError(msg)
      onError?.(msg)
    } finally {
      setSaving(false)
    }
  }

  if (!client) return null

  return (
    <div className="modal-overlay" onClick={() => {}}>
      <div className="modal-box" style={{ maxWidth: 480, padding: 28, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
            {existingDeal ? 'Update payment record' : 'Record deal close'}
          </div>
          <div style={{ fontSize: 17, fontWeight: 700 }}>{client.name}</div>
          {client.company && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{client.company}</div>
          )}
        </div>

        <div className="field" style={{ marginBottom: 12 }}>
          <label>Product / what was sold (optional)</label>
          <input
            style={inputStyle}
            value={productSold}
            onChange={e => setProductSold(e.target.value)}
            placeholder="e.g. OpsCraft CRM Annual"
          />
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: 'var(--text-muted)' }}>Pricing model</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {[
              { key: 'one_time', label: 'One-time fixed' },
              { key: 'recurring', label: 'Recurring' },
            ].map(opt => (
              <button
                key={opt.key}
                type="button"
                onClick={() => switchModel(opt.key)}
                style={{
                  flex: 1,
                  padding: '12px 10px',
                  borderRadius: 10,
                  cursor: 'pointer',
                  border: '2px solid',
                  borderColor: pricingModel === opt.key ? 'var(--primary)' : 'var(--border)',
                  background: pricingModel === opt.key ? 'rgba(194,98,45,0.08)' : 'var(--bg-white)',
                  fontWeight: 700,
                  fontSize: 13,
                  color: pricingModel === opt.key ? 'var(--primary)' : 'var(--text)',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {pricingModel === 'one_time' ? (
          <div className="field" style={{ marginBottom: 12 }}>
            <label>Deal close price (₹)</label>
            <input
              style={inputStyle}
              type="number"
              min="0"
              value={listPrice}
              onChange={e => onListPriceChange(e.target.value)}
              placeholder="e.g. 150000"
              autoFocus
            />
          </div>
        ) : (
          <>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: 'var(--text-muted)' }}>Billing cadence</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {CADENCE_OPTIONS.map(opt => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => onCadenceChange(opt.key)}
                    style={{
                      padding: '8px 10px',
                      borderRadius: 8,
                      border: '1.5px solid',
                      borderColor: cadence === opt.key ? 'var(--primary)' : 'var(--border)',
                      background: cadence === opt.key ? 'rgba(194,98,45,0.08)' : 'var(--bg-white)',
                      fontWeight: 600,
                      fontSize: 12,
                      cursor: 'pointer',
                      color: cadence === opt.key ? 'var(--primary)' : 'var(--text)',
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            {cadence === 'custom' && (
              <div className="field" style={{ marginBottom: 12 }}>
                <label>Custom interval (months)</label>
                <input
                  style={inputStyle}
                  type="number"
                  min="1"
                  value={customMonths}
                  onChange={e => onCustomMonthsChange(e.target.value)}
                />
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
              <div className="field" style={{ flex: 1 }}>
                <label>Monthly (₹)</label>
                <input
                  style={inputStyle}
                  type="number"
                  min="0"
                  value={monthlyPrice}
                  onChange={e => onMonthlyChange(e.target.value)}
                  placeholder="per month"
                />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>Plan total (₹ / {months}m)</label>
                <input
                  style={inputStyle}
                  type="number"
                  min="0"
                  value={planTotal}
                  onChange={e => onPlanTotalChange(e.target.value)}
                  placeholder="period total"
                />
              </div>
            </div>
          </>
        )}

        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
          <div className="field" style={{ flex: 1 }}>
            <label>Discount %</label>
            <input
              style={inputStyle}
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={discountPercent}
              onChange={e => onDiscountPercentChange(e.target.value)}
            />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>Discount ₹</label>
            <input
              style={inputStyle}
              type="number"
              min="0"
              value={discountAmount}
              onChange={e => onDiscountAmountChange(e.target.value)}
            />
          </div>
        </div>

        <div className="field" style={{ marginBottom: 12 }}>
          <label>Billing start date {pricingModel === 'recurring' ? '(reminders)' : '(optional)'}</label>
          <input
            style={inputStyle}
            type="date"
            value={billingStart}
            onChange={e => setBillingStart(e.target.value)}
          />
        </div>

        {pricingModel === 'one_time' && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, fontSize: 13, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={markPaidToday}
              onChange={e => setMarkPaidToday(e.target.checked)}
            />
            Mark as fully paid today
          </label>
        )}

        <div style={{
          background: 'var(--bg-light)',
          borderRadius: 10,
          padding: '12px 14px',
          marginBottom: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          fontSize: 13,
        }}>
          <Row label="List / plan" value={formatCurrency(discountBase)} />
          <Row label="Discount" value={`${Number(discountPercent) || 0}% · ${formatCurrency(Number(discountAmount) || 0)}`} />
          <Row label="Net payable" value={formatCurrency(net)} bold />
          {pricingModel === 'recurring' && (
            <>
              <Row label="Net monthly" value={formatCurrency(netMonthly)} />
              <Row label="Cadence" value={cadenceLabel(cadence, customMonths)} />
              <Row label="Renews on" value={nextReminder || '—'} bold />
            </>
          )}
        </div>

        {error && (
          <div className="login-error" style={{ marginBottom: 12 }}>{error}</div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          {!requirePlan && (
            <button className="btn btn-secondary" type="button" onClick={onSkip} disabled={saving}>
              Skip for now
            </button>
          )}
          <button className="btn btn-primary" style={{ flex: 1 }} type="button" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : existingDeal ? 'Update record' : 'Save payment record'}
          </button>
        </div>
        {requirePlan && !existingDeal && (
          <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-muted)' }}>
            Payment record is required for Active clients (policy enabled).
          </div>
        )}
      </div>
    </div>
  )
}

function Row({ label, value, bold }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontWeight: bold ? 700 : 600 }}>{value}</span>
    </div>
  )
}
