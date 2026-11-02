// Payment amounts are stored as the gross amount the client pays.
// gst_rate on each payment says how much of that is GST; the database also
// stores the split in gst_amount / net_amount. These helpers read the split,
// falling back to calculating it for rows loaded before those columns existed.

export const DEFAULT_GST_RATE = 18

const round2 = n => Math.round(n * 100) / 100

/** { gross, gst, net, rate } for one payment. */
export function paymentSplit(payment) {
  const gross = Number(payment?.amount) || 0
  const rate = Number(payment?.gst_rate) || 0
  const gst = payment?.gst_amount != null
    ? Number(payment.gst_amount) || 0
    : round2((gross * rate) / (100 + rate))
  return { gross, gst, net: round2(gross - gst), rate }
}

/** Totals { gross, gst, net } over a list of payments. */
export function sumSplit(payments) {
  return payments.reduce((t, p) => {
    const s = paymentSplit(p)
    return { gross: round2(t.gross + s.gross), gst: round2(t.gst + s.gst), net: round2(t.net + s.net) }
  }, { gross: 0, gst: 0, net: 0 })
}

/** GST included in a gross amount at the given rate. */
export function gstIncluded(gross, rate = DEFAULT_GST_RATE) {
  const g = Number(gross) || 0
  const r = Number(rate) || 0
  return round2((g * r) / (100 + r))
}

/** GST returns for a month are due on the 20th of the following month (GSTR-3B). */
export function gstDueDateLabel(monthKey) {
  const [y, m] = monthKey.split('-').map(Number)
  return new Date(y, m, 20).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}
