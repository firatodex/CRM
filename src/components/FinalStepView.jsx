import { useState, useMemo } from 'react'

// Final Step is a manual, parallel flag — not a pipeline stage. A lead can be
// 'proposal' stage AND flagged Final Step at the same time. The list is purely
// opt-in: nothing lands here automatically, and nothing leaves except by your
// own hand or the dead/active auto-cleanup trigger in the database.
export default function FinalStepView({ clients, finalStepIds, onAdd, onRemove, onOpenClient }) {
  const [search, setSearch] = useState('')
  const [showPicker, setShowPicker] = useState(false)

  const finalStepClients = useMemo(() =>
    finalStepIds
      .map(id => clients.find(c => c.id === id))
      .filter(Boolean)
      .filter(c => !['dead', 'active'].includes(c.stage)), // safety net even before DB trigger lands
    [clients, finalStepIds]
  )

  const pickerResults = useMemo(() => {
    if (!search.trim()) return []
    const q = search.trim().toLowerCase()
    return clients
      .filter(c => !finalStepIds.includes(c.id))
      .filter(c => !['dead', 'active'].includes(c.stage))
      .filter(c => (c.name || '').toLowerCase().includes(q) || (c.company || '').toLowerCase().includes(q))
      .slice(0, 8)
  }, [clients, finalStepIds, search])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          {finalStepClients.length} lead{finalStepClients.length === 1 ? '' : 's'} one step from closing
        </div>
        <button
          onClick={() => setShowPicker(s => !s)}
          style={{
            padding: '6px 14px', borderRadius: 8, border: '1.5px solid var(--primary)',
            background: showPicker ? 'var(--primary)' : 'var(--bg-white)',
            color: showPicker ? '#fff' : 'var(--primary)',
            fontSize: 13, fontWeight: 700, cursor: 'pointer'
          }}
        >
          {showPicker ? '✕ Close' : '+ Add lead'}
        </button>
      </div>

      {showPicker && (
        <div style={{ border: '1.5px solid var(--border)', borderRadius: 10, padding: 10, background: 'var(--bg-light)' }}>
          <input
            autoFocus
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or company..."
            style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1.5px solid var(--border)', fontSize: 13, background: 'var(--bg-white)' }}
          />
          {pickerResults.length > 0 && (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {pickerResults.map(c => (
                <button
                  key={c.id}
                  onClick={() => { onAdd(c.id); setSearch(''); }}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '8px 10px', borderRadius: 7, border: '1px solid var(--border)',
                    background: 'var(--bg-white)', cursor: 'pointer', textAlign: 'left'
                  }}
                >
                  <span>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{c.name}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 6 }}>{c.company}</span>
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--primary)', fontWeight: 700 }}>+ Add</span>
                </button>
              ))}
            </div>
          )}
          {search.trim() && pickerResults.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8, textAlign: 'center' }}>No matches</div>
          )}
        </div>
      )}

      {finalStepClients.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: 13 }}>
          Nothing here yet. Add a lead that's one step from paying.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {finalStepClients.map(c => (
            <div
              key={c.id}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '12px 14px', borderRadius: 10, border: '1.5px solid var(--border)',
                background: 'var(--bg-white)'
              }}
            >
              <div style={{ cursor: 'pointer', flex: 1 }} onClick={() => onOpenClient(c)}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{c.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{c.company} · {c.stage}</div>
              </div>
              <button
                onClick={() => onRemove(c.id)}
                title="Remove from Final Step"
                style={{
                  width: 28, height: 28, borderRadius: 7, border: '1px solid var(--border)',
                  background: 'var(--bg-light)', cursor: 'pointer', fontSize: 14, color: 'var(--text-muted)'
                }}
              >✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
