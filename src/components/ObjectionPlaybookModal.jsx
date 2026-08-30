import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../supabase'
import { objectionPlaybookEntrySchema } from '../schemas/salesProcessSchemas'

const OBJECTION_TYPES = ['price', 'competitor', 'timing', 'need', 'authority', 'budget', 'other']

// Searchable objection_playbook browser. Pass a contactLogId to enable the
// "Use this counter" button, which logs the chosen counter-strategy onto
// that contact_log row's objection_counter_used column.
export default function ObjectionPlaybookModal({ onClose, contactLogId, onCounterUsed }) {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [showAddForm, setShowAddForm] = useState(false)
  const [newEntry, setNewEntry] = useState({ objection_type: 'price', objection_statement: '', counter_strategy: '', success_rate: '' })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadEntries()
  }, [])

  async function loadEntries() {
    setLoading(true)
    try {
      const { data, error: loadError } = await supabase
        .from('objection_playbook')
        .select('*')
        .order('success_rate', { ascending: false, nullsFirst: false })
      if (loadError) throw loadError
      setEntries(data || [])
    } catch (err) {
      console.error('Error loading objection playbook:', err)
    } finally {
      setLoading(false)
    }
  }

  const filtered = useMemo(() => {
    return entries.filter(entry => {
      if (typeFilter !== 'all' && entry.objection_type !== typeFilter) return false
      if (!search.trim()) return true
      const q = search.toLowerCase()
      return entry.objection_statement.toLowerCase().includes(q) || entry.counter_strategy.toLowerCase().includes(q)
    })
  }, [entries, search, typeFilter])

  async function useCounter(entry) {
    if (!contactLogId) {
      onCounterUsed?.(entry.counter_strategy)
      return
    }
    try {
      const { error: updateError } = await supabase
        .from('contact_log')
        .update({ objection_counter_used: entry.counter_strategy, objection_type: entry.objection_type })
        .eq('id', contactLogId)
      if (updateError) throw updateError
      onCounterUsed?.(entry.counter_strategy)
    } catch (err) {
      alert('Failed to log counter used: ' + err.message)
    }
  }

  async function saveNewEntry() {
    setError('')
    const result = objectionPlaybookEntrySchema.safeParse({
      ...newEntry,
      success_rate: newEntry.success_rate === '' ? null : Number(newEntry.success_rate),
    })
    if (!result.success) {
      setError(result.error.issues[0]?.message || 'Invalid entry')
      return
    }
    setSaving(true)
    try {
      const { data, error: insertError } = await supabase.from('objection_playbook').insert(result.data).select().single()
      if (insertError) throw insertError
      setEntries([data, ...entries])
      setShowAddForm(false)
      setNewEntry({ objection_type: 'price', objection_statement: '', counter_strategy: '', success_rate: '' })
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: 'white', borderRadius: '8px', padding: '24px', width: '90%', maxWidth: '640px', maxHeight: '85vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ margin: 0, fontSize: '18px' }}>Objection Playbook</h2>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', fontSize: '20px', cursor: 'pointer' }}>×</button>
        </div>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          <input
            placeholder="Search objections or counters..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ flex: 1, padding: '8px', border: '1px solid #ddd', borderRadius: '6px' }}
          />
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{ padding: '8px', border: '1px solid #ddd', borderRadius: '6px' }}>
            <option value="all">All types</option>
            {OBJECTION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '24px', color: '#666' }}>Loading...</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px', color: '#666' }}>No objections match.</div>
        ) : (
          <div style={{ display: 'grid', gap: '10px', marginBottom: '16px' }}>
            {filtered.map(entry => (
              <div key={entry.id} style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: '#666' }}>{entry.objection_type}</span>
                  {entry.success_rate != null && (
                    <span style={{ fontSize: '12px', fontWeight: '600', color: entry.success_rate >= 60 ? '#10b981' : entry.success_rate >= 40 ? '#f59e0b' : '#ef4444' }}>
                      {entry.success_rate}% success
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '13px', fontStyle: 'italic', color: '#333', marginBottom: '6px' }}>"{entry.objection_statement}"</div>
                <div style={{ fontSize: '13px', color: '#111', marginBottom: '8px' }}>→ {entry.counter_strategy}</div>
                <button
                  onClick={() => useCounter(entry)}
                  style={{ padding: '6px 12px', border: 'none', background: '#007AFF', color: 'white', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}
                >
                  Use this counter
                </button>
              </div>
            ))}
          </div>
        )}

        {!showAddForm ? (
          <button onClick={() => setShowAddForm(true)} style={{ padding: '8px 14px', border: '1px solid #ddd', background: 'white', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' }}>
            + Add new objection
          </button>
        ) : (
          <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '12px' }}>
            <select
              value={newEntry.objection_type}
              onChange={e => setNewEntry({ ...newEntry, objection_type: e.target.value })}
              style={{ width: '100%', padding: '8px', marginBottom: '8px', border: '1px solid #ddd', borderRadius: '6px' }}
            >
              {OBJECTION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <textarea
              placeholder="Objection statement"
              value={newEntry.objection_statement}
              onChange={e => setNewEntry({ ...newEntry, objection_statement: e.target.value })}
              style={{ width: '100%', padding: '8px', marginBottom: '8px', border: '1px solid #ddd', borderRadius: '6px', minHeight: '50px' }}
            />
            <textarea
              placeholder="Counter strategy"
              value={newEntry.counter_strategy}
              onChange={e => setNewEntry({ ...newEntry, counter_strategy: e.target.value })}
              style={{ width: '100%', padding: '8px', marginBottom: '8px', border: '1px solid #ddd', borderRadius: '6px', minHeight: '50px' }}
            />
            {error && <div style={{ color: '#ef4444', fontSize: '12px', marginBottom: '8px' }}>{error}</div>}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={saveNewEntry} disabled={saving} style={{ padding: '8px 14px', border: 'none', background: '#007AFF', color: 'white', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' }}>
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button onClick={() => setShowAddForm(false)} style={{ padding: '8px 14px', border: '1px solid #ddd', background: 'white', borderRadius: '6px', cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
