// Returns today's date as YYYY-MM-DD in LOCAL time (not UTC).
// Previously used toISOString() which returns UTC — in IST (UTC+5:30)
// this caused "today" to flip to tomorrow after 6:30 PM, hiding overdue items.
export function todayStr() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function formatDue(due) {
  if (!due) return null
  const d = new Date(due + 'T00:00:00')
  const diff = Math.round((d - new Date(todayStr() + 'T00:00:00')) / 86400000)
  if (diff < 0) return { label: `Overdue by ${Math.abs(diff)}d`, cls: 'overdue' }
  if (diff === 0) return { label: 'Due today', cls: 'today' }
  if (diff === 1) return { label: 'Due tomorrow', cls: 'tomorrow' }
  if (diff <= 7) return { label: `Due in ${diff}d`, cls: '' }
  return { label: 'Due ' + d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }), cls: '' }
}

export function formatRelativeTime(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr)
  const now = new Date()
  const diffMs = now - d
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

// Full date + time for contact history log entries
export function formatDateTime(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) +
    ' · ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
}

export function formatCurrency(amount) {
  if (!amount) return '—'
  const num = Number(amount)
  if (isNaN(num)) return '—'
  if (num >= 100000) return '₹' + (num / 100000).toFixed(num % 100000 === 0 ? 0 : 1) + 'L'
  if (num >= 1000) return '₹' + (num / 1000).toFixed(num % 1000 === 0 ? 0 : 1) + 'K'
  return '₹' + num.toLocaleString('en-IN')
}

// Build a WhatsApp link from a phone number.
// Strips all non-digits, then prepends 91 only if the number doesn't already
// start with the India country code — previously it blindly prepended 91 every
// time, producing wa.me/9191... for numbers already entered with the country code.
export function waLink(phone) {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  if (!digits) return null
  // If already starts with 91 and is 12 digits (91 + 10-digit mobile), use as-is
  // If it's a 10-digit number, prepend 91
  // Otherwise pass through as-is (handles +1, +44, etc. entered without +)
  let normalized = digits
  if (digits.length === 10) {
    normalized = '91' + digits
  }
  return `https://web.whatsapp.com/send?phone=${normalized}&text=`
}

export function exportCSV(clients) {
  const headers = ['Name','Company','Phone','Email','Stage','Temperature','Source','Potential Revenue','Pain Point','Website','Last Contacted','Notes']
  const rows = clients.map(c => [
    c.name, c.company, c.phone, c.email, c.stage, c.temperature, c.source,
    c.potential_revenue, c.pain_point, c.website, c.last_contacted_at, c.notes
  ].map(v => `"${(v ?? '').toString().replace(/"/g, '""')}"`))
  // CRLF row endings so Excel renders embedded newlines within quoted fields correctly
  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `opscraft-leads-${todayStr()}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
