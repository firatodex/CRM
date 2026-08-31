import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../supabase'

function icpBucket(score) {
  if (score >= 70) return 'high'
  if (score >= 40) return 'medium'
  return 'low'
}

const BUCKET_LABELS = { high: 'High', medium: 'Medium', low: 'Low' }
const BUCKET_COLORS = { high: '#10b981', medium: '#f59e0b', low: '#ef4444' }

// All leads segmented by ICP match tier, qualification status, territory,
// and company-size segment, with filters and bulk actions.
export default function LeadSegmentationView() {
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ icpBucket: 'all', qualification: 'all', territory: 'all', segment: 'all' })
  const [selected, setSelected] = useState(new Set())
  const [bulkTerritory, setBulkTerritory] = useState('')

  useEffect(() => {
    loadClients()
  }, [])

  async function loadClients() {
    setLoading(true)
    try {
      const { data, error } = await supabase.from('clients').select('*').order('lead_score', { ascending: false })
      if (error) throw error
      setClients(data || [])
    } catch (err) {
      console.error('Error loading clients:', err)
    } finally {
      setLoading(false)
    }
  }

  const territories = useMemo(() => [...new Set(clients.map(c => c.territory).filter(Boolean))], [clients])
  const segments = useMemo(() => [...new Set(clients.map(c => c.segment).filter(Boolean))], [clients])

  const filtered = useMemo(() => {
    return clients.filter(c => {
      if (filters.icpBucket !== 'all' && icpBucket(c.icp_match_score || 0) !== filters.icpBucket) return false
      if (filters.qualification !== 'all' && c.qualification_status !== filters.qualification) return false
      if (filters.territory !== 'all' && c.territory !== filters.territory) return false
      if (filters.segment !== 'all' && c.segment !== filters.segment) return false
      return true
    })
  }, [clients, filters])

  function toggleSelect(id) {
    const next = new Set(selected)
    next.has(id) ? next.delete(id) : next.add(id)
    setSelected(next)
  }

  async function bulkMarkUnqualified() {
    if (selected.size === 0) return
    try {
      const { error } = await supabase.from('clients').update({ qualification_status: 'lead_unqualified' }).in('id', [...selected])
      if (error) throw error
      await loadClients()
      setSelected(new Set())
    } catch (err) {
      alert('Bulk update failed: ' + err.message)
    }
  }

  async function bulkAssignTerritory() {
    if (selected.size === 0 || !bulkTerritory.trim()) return
    try {
      const { error } = await supabase.from('clients').update({ territory: bulkTerritory.trim() }).in('id', [...selected])
      if (error) throw error
      await loadClients()
      setSelected(new Set())
      setBulkTerritory('')
    } catch (err) {
      alert('Bulk update failed: ' + err.message)
    }
  }

  if (loading) return <div style={{ padding: '24px', color: '#666' }}>Loading leads...</div>

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: '700', margin: 0 }}>Lead Segmentation</h1>
        <p style={{ color: '#666', margin: '8px 0 0 0' }}>{filtered.length} of {clients.length} leads shown</p>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '16px' }}>
        <select value={filters.icpBucket} onChange={e => setFilters({ ...filters, icpBucket: e.target.value })} style={selectStyle}>
          <option value="all">ICP match: all</option>
          <option value="high">ICP match: high</option>
          <option value="medium">ICP match: medium</option>
          <option value="low">ICP match: low</option>
        </select>
        <select value={filters.qualification} onChange={e => setFilters({ ...filters, qualification: e.target.value })} style={selectStyle}>
          <option value="all">Qualification: all</option>
          <option value="lead_qualified">Qualified</option>
          <option value="lead_unqualified">Unqualified</option>
          <option value="needs_review">Needs review</option>
        </select>
        <select value={filters.territory} onChange={e => setFilters({ ...filters, territory: e.target.value })} style={selectStyle}>
          <option value="all">Territory: all</option>
          {territories.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={filters.segment} onChange={e => setFilters({ ...filters, segment: e.target.value })} style={selectStyle}>
          <option value="all">Segment: all</option>
          {segments.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {selected.size > 0 && (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '16px', padding: '10px 14px', background: '#eff6ff', borderRadius: '8px' }}>
          <span style={{ fontSize: '13px', fontWeight: '600' }}>{selected.size} selected</span>
          <button onClick={bulkMarkUnqualified} style={bulkButtonStyle}>Mark unqualified</button>
          <input placeholder="Territory name" value={bulkTerritory} onChange={e => setBulkTerritory(e.target.value)} style={{ ...selectStyle, width: '160px' }} />
          <button onClick={bulkAssignTerritory} style={bulkButtonStyle}>Assign to territory</button>
        </div>
      )}

      <div style={{ display: 'grid', gap: '8px' }}>
        {filtered.map(client => {
          const bucket = icpBucket(client.icp_match_score || 0)
          return (
            <div key={client.id} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto auto auto auto', gap: '12px', alignItems: 'center', padding: '12px', background: 'white', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
              <input type="checkbox" checked={selected.has(client.id)} onChange={() => toggleSelect(client.id)} />
              <div>
                <div style={{ fontWeight: '700', fontSize: '13px' }}>{client.company || client.name}</div>
                <div style={{ fontSize: '11px', color: '#666' }}>{client.territory || '—'} · {client.segment || '—'}</div>
              </div>
              <span style={{ fontSize: '11px', fontWeight: '700', color: BUCKET_COLORS[bucket], padding: '4px 8px', borderRadius: '999px', background: BUCKET_COLORS[bucket] + '22' }}>
                ICP {BUCKET_LABELS[bucket]} ({client.icp_match_score || 0})
              </span>
              <span style={{ fontSize: '12px', fontWeight: '600' }}>Score {client.lead_score || 0}</span>
              <span style={{ fontSize: '11px', color: '#666', textTransform: 'capitalize' }}>{(client.qualification_status || 'lead_unqualified').replace(/_/g, ' ')}</span>
              <span style={{ fontSize: '11px', color: client.deal_stalled_flag ? '#ef4444' : '#999' }}>{client.deal_stalled_flag ? 'Stalled' : ''}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const selectStyle = { padding: '8px 10px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '12px' }
const bulkButtonStyle = { padding: '8px 12px', border: '1px solid #ddd', background: 'white', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }
