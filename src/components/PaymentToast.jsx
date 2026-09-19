import { useEffect } from 'react'
import { formatCurrency } from '../utils'

/**
 * Bottom toast after Mark paid — with optional Undo.
 */
export default function PaymentToast({
  open,
  message,
  amount,
  clientName,
  onUndo,
  onDismiss,
  durationMs = 6000,
  undoBusy = false,
}) {
  useEffect(() => {
    if (!open || !onDismiss) return undefined
    const t = setTimeout(() => onDismiss(), durationMs)
    return () => clearTimeout(t)
  }, [open, onDismiss, durationMs])

  if (!open) return null

  const text = message
    || (clientName
      ? `Marked paid${amount != null ? ` · ${formatCurrency(amount)}` : ''} · ${clientName}`
      : 'Marked paid')

  return (
    <div className="payment-toast" role="status" aria-live="polite">
      <span className="payment-toast-msg">{text}</span>
      {onUndo && (
        <button
          type="button"
          className="payment-toast-undo"
          disabled={undoBusy}
          onClick={onUndo}
        >
          {undoBusy ? '…' : 'Undo'}
        </button>
      )}
      <button
        type="button"
        className="payment-toast-close"
        aria-label="Dismiss"
        onClick={onDismiss}
      >
        ×
      </button>
    </div>
  )
}
