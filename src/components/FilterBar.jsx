import { useState, useRef, useEffect } from 'react'
import { SOURCES, TEMPERATURES } from '../stages'

export default function FilterBar({ clients, filters, onChange }) {
  const { search, temperature, source, overdueOnly } = filters
  const searchRef = useRef(null)

  // Focus search on Cmd/Ctrl+F
  useEffect(() => {
    function handleKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  const activeCount = [
    search, temperature, source, overdueOnly
  ].filter(Boolean).length

  function clear() {
    onChange({ search: '', temperature: '', source: '', overdueOnly: false })
  }

  return (
    <div className="filter-bar">
      {/* Text search */}
      <div className="filter-search-wrap">
        <svg className="filter-search-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <input
          ref={searchRef}
          className="filter-search"
          value={search}
          onChange={e => onChange({ ...filters, search: e.target.value })}
          placeholder="Search name, company, city, notes…"
        />
        {search && (
          <button className="filter-clear-x" onClick={() => onChange({ ...filters, search: '' })}>×</button>
        )}
      </div>

      {/* Temperature pills */}
      <div className="filter-pills">
        {TEMPERATURES.map(t => (
          <button
            key={t.key}
            className={`filter-pill ${temperature === t.key ? 'active' : ''}`}
            onClick={() => onChange({ ...filters, temperature: temperature === t.key ? '' : t.key })}
            title={t.label}
          >
            {t.emoji}
          </button>
        ))}
      </div>

      {/* Source dropdown */}
      <select
        className="filter-select"
        value={source}
        onChange={e => onChange({ ...filters, source: e.target.value })}
      >
        <option value="">All sources</option>
        {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
      </select>

      {/* Overdue toggle */}
      <button
        className={`filter-pill filter-pill-text ${overdueOnly ? 'active' : ''}`}
        onClick={() => onChange({ ...filters, overdueOnly: !overdueOnly })}
      >
        Overdue only
      </button>

      {/* Clear all */}
      {activeCount > 0 && (
        <button className="filter-clear" onClick={clear}>
          Clear {activeCount > 1 ? `(${activeCount})` : ''}
        </button>
      )}
    </div>
  )
}

// The actual filter function — used by both Pipeline and Clients tab
export function applyFilters(clients, filters, todayStr) {
  const { search, temperature, source, overdueOnly } = filters
  const q = search.toLowerCase().trim()

  return clients.filter(c => {
    if (temperature && c.temperature !== temperature) return false
    if (source && c.source !== source) return false
    if (overdueOnly && (!c.next_action_due || c.next_action_due >= todayStr)) return false
    if (q) {
      const inName    = (c.name || '').toLowerCase().includes(q)
      const inCompany = (c.company || '').toLowerCase().includes(q)
      const inPhone   = (c.phone || '').includes(q)
      const inBizType = (c.business_type || '').toLowerCase().includes(q)
      const inPain    = (c.pain_point || '').toLowerCase().includes(q)
      const inNotes   = (c.notes || '').toLowerCase().includes(q)
      const inCity    = (c.notes || '').toLowerCase().includes(q) // notes doubles as address/city
      if (!inName && !inCompany && !inPhone && !inBizType && !inPain && !inNotes && !inCity) return false
    }
    return true
  })
}
