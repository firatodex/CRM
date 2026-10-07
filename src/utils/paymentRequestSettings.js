/** Pay-in details for payment-request PDFs (device-local, same pattern as crmPolicies). */

const PAYIN_KEY = 'crm_payment_request_payin'

export const DEFAULT_PAYIN = {
  accountHolder: 'Afzal Dosani',
  bankName: 'ICICI Bank',
  accountNumber: '058601526858',
  ifsc: 'ICIC0003245',
  upiId: '',
  qrDataUrl: '',
}

export function getPaymentRequestPayin() {
  try {
    const raw = localStorage.getItem(PAYIN_KEY)
    if (!raw) return { ...DEFAULT_PAYIN }
    const parsed = JSON.parse(raw)
    return { ...DEFAULT_PAYIN, ...(parsed && typeof parsed === 'object' ? parsed : {}) }
  } catch {
    return { ...DEFAULT_PAYIN }
  }
}

export function savePaymentRequestPayin(next) {
  const merged = { ...DEFAULT_PAYIN, ...next }
  try {
    localStorage.setItem(PAYIN_KEY, JSON.stringify(merged))
  } catch {
    /* quota / private mode */
  }
  return merged
}

/** Exact rupees for customer-facing PDFs (do not use compact K/L). */
export function formatInrExact(num) {
  const n = Number(num)
  if (!Number.isFinite(n)) return '0.00'
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function paymentRequestTotals({ base, gstRate, gstEnabled }) {
  const b = Math.max(0, Number(base) || 0)
  const rate = Math.max(0, Number(gstRate) || 0)
  const gst = gstEnabled ? (b * rate) / 100 : 0
  return { base: b, gstRate: rate, gst, total: b + gst }
}

export function requestDraftFromQueueItem(item) {
  if (!item) return null
  return {
    client: item.client || null,
    amount: Number(item.amount) || 0,
    mode: item.kind === 'renewal' ? 'general' : 'advance',
    note: item.label || '',
  }
}

export function sanitizePdfName(name) {
  const s = String(name || 'Customer')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '_')
  return s || 'Customer'
}

/** Shrink uploaded QR so it fits in localStorage. */
export function fileToQrDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) {
      reject(new Error('Choose an image file for the QR code.'))
      return
    }
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const max = 480
      let { width, height } = img
      if (width > max || height > max) {
        const scale = max / Math.max(width, height)
        width = Math.round(width * scale)
        height = Math.round(height * scale)
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, width, height)
      ctx.drawImage(img, 0, 0, width, height)
      resolve(canvas.toDataURL('image/jpeg', 0.88))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not read that image.'))
    }
    img.src = url
  })
}
