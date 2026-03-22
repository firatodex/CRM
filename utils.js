export function todayStr() {
  return new Date().toISOString().split('T')[0]
}

export function formatDue(due) {
  if (!due) return null
  const d = new Date(due + 'T00:00:00')
  const diff = Math.round((d - new Date(todayStr())) / 86400000)
  if (diff < 0) return { label: `Overdue by ${Math.abs(diff)}d`, cls: 'overdue' }
  if (diff === 0) return { label: 'Due today', cls: 'today' }
  if (diff === 1) return { label: 'Due tomorrow', cls: '' }
  return { label: 'Due ' + d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }), cls: '' }
}
