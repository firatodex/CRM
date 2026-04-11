export function todayStr() {
  return new Date().toISOString().split('T')[0]
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

export function waLink(phone) {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  if (!digits) return null
  return `https://wa.me/91${digits}`
}

export function exportCSV(clients) {
  const headers = ['Name','Company','Phone','Email','Stage','Temperature','Source','Potential Revenue','Pain Point','Website','Last Contacted','Notes']
  const rows = clients.map(c => [
    c.name, c.company, c.phone, c.email, c.stage, c.temperature, c.source,
    c.potential_revenue, c.pain_point, c.website, c.last_contacted_at, c.notes
  ].map(v => `"${(v || '').toString().replace(/"/g, '""')}"`))
  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `opscraft-leads-${todayStr()}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
