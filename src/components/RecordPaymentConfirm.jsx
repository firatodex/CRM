import { useEffect, useRef } from 'react'
import { formatCurrency, todayStr } from '../utils'

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

/**
 * Simple confirm sheet: Mark as paid?
 * Enter confirms, Escape cancels.
 * type: 'invoice' | 'renewal'
 */
export default function RecordPaymentConfirm({
  open,
  client,
  amount,
  label,
  dueDate,
  type = 'invoice',
  busy = false,
  onConfirm,
  onCancel,
}) {
  const confirmRef = useRef(null)

  useEffect(() => {
    if (!open) return
    document.body.classList.add('modal-open')
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // Focus primary action for keyboard users
    const t = setTimeout(() => confirmRef.current?.focus(), 50)
    return () => {
      clearTimeout(t)
      document.body.classList.remove('modal-open')
      document.body.style.overflow = prev
    }
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    function onKey(e) {
      if (e.key === 'Escape' && !busy) {
        e.preventDefault()
        onCancel?.()
        return
      }
      if (e.key === 'Enter' && !busy && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey) {
        const tag = (e.target?.tagName || '').toLowerCase()
        if (tag === 'textarea') return
        e.preventDefault()
        onConfirm?.()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, busy, onConfirm, onCancel])

  if (!open) return null

  const today = todayStr()
  const isRenewal = type === 'renewal'

  return (
    <div className="modal-overlay" onClick={() => !busy && onCancel?.()}>
      <div
        className="modal-box"
        style={{ maxWidth: 400, padding: 24 }}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mark-paid-title"
      >
        <div
          id="mark-paid-title"
          style={{ fontSize: 11, fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}
        >
          Mark as paid?
        </div>
        <div style={{ fontSize: 18, fontWeight: 750, marginBottom: 4 }}>
          {client?.name || 'Client'}
        </div>
        {client?.company && (
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>{client.company}</div>
        )}

        <div style={{
          background: 'var(--bg-light)',
          borderRadius: 12,
          padding: '14px 16px',
          marginBottom: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}>
          <Row label="What" value={label || (isRenewal ? 'Renewal' : 'Payment')} />
          <Row label="Amount" value={formatCurrency(amount)} bold />
          <Row label="Due date" value={formatDisplayDate(dueDate)} />
          <Row label="Paid date" value={formatDisplayDate(today)} />
        </div>

        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 16px', lineHeight: 1.45 }}>
          {isRenewal
            ? 'Marks this renewal paid and sets the next due date automatically. You can undo from the toast or History.'
            : 'Marks this amount paid. You can undo from the toast or History.'}
        </p>

        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy} style={{ flex: 1 }}>
            Cancel
          </button>
          <button
            ref={confirmRef}
            type="button"
            className="btn btn-primary"
            onClick={onConfirm}
            disabled={busy}
            style={{ flex: 1.4 }}
          >
            {busy ? 'Saving…' : 'Yes, mark paid'}
          </button>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 10, textAlign: 'center' }}>
          Press Enter to confirm · Esc to cancel
        </div>
      </div>
    </div>
  )
}

function Row({ label, value, bold }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13 }}>
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontWeight: bold ? 750 : 600 }}>{value}</span>
    </div>
  )
}
