import { useState, useMemo } from 'react'
import { formatCurrency, waLink, todayStr } from '../utils'
import { paymentStatusForClient } from '../utils/paymentReminders'

const SORT_OPTIONS = [
  { key: 'last_contacted', label: 'Last contacted' },
  { key: 'revenue',        label: 'Revenue' },
  { key: 'name',           label: 'Name' },
  { key: 'created',        label: 'Date added' },
]

const BADGE_TONES = {
  ok:     { bg: '#dcfce7', color: '#15803d' },
  warn:   { bg: '#fef3c7', color: '#a16207' },
  danger: { bg: '#fee2e2', color: '#b91c1c' },
  muted:  { bg: '#f3f4f6', color: '#6b7280' },
}

function getRevenueColor(amount) {
  const num = Number(amount) || 0
  if (num >= 50000) return '#10b981'
  if (num >= 20000) return '#f59e0b'
  if (num >= 5000) return '#3b82f6'
  return '#8b5cf6'
}

function formatRelativeDate(dateStr) {
  if (!dateStr) return '—'
  const date = new Date(dateStr)
  const now = new Date()
  const days = Math.floor((now - date) / (1000 * 60 * 60 * 24))
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return `${Math.floor(days / 30)}m ago`
}

export default function ActiveDeadPanel({ clients, type, onCardClick, deals = [], payments = [] }) {
  const isActive = type === 'active'
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('last_contacted')
  const today = todayStr()

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    let list = q
      ? clients.filter(c =>
          (c.name || '').toLowerCase().includes(q) ||
          (c.company || '').toLowerCase().includes(q) ||
          (c.phone || '').includes(q) ||
          (c.business_type || '').toLowerCase().includes(q) ||
          (c.notes || '').toLowerCase().includes(q) ||
          (c.pain_point || '').toLowerCase().includes(q)
        )
      : [...clients]

    list.sort((a, b) => {
      if (sortBy === 'last_contacted') {
        if (!a.last_contacted_at) return 1
        if (!b.last_contacted_at) return -1
        return new Date(b.last_contacted_at) - new Date(a.last_contacted_at)
      }
      if (sortBy === 'revenue') {
        return (Number(b.potential_revenue) || 0) - (Number(a.potential_revenue) || 0)
      }
      if (sortBy === 'name') {
        return (a.name || '').localeCompare(b.name || '')
      }
      if (sortBy === 'created') {
        return new Date(b.created_at) - new Date(a.created_at)
      }
      return 0
    })
    return list
  }, [clients, search, sortBy])

  return (
    <div className="list-panel">
      <div className="list-panel-header">
        <h2 className="list-panel-title">
          {isActive ? 'Active Clients' : 'Archived Leads'}
        </h2>
        <span className="list-panel-count">{filtered.length}{filtered.length !== clients.length ? ` of ${clients.length}` : ''}</span>
      </div>

      <div className="list-controls">
        <div className="filter-search-wrap" style={{ flex: 1 }}>
          <svg className="filter-search-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            className="filter-search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name, company, city, notes…"
          />
          {search && (
            <button className="filter-clear-x" onClick={() => setSearch('')}>×</button>
          )}
        </div>
        <select className="filter-select" value={sortBy} onChange={e => setSortBy(e.target.value)}>
          {SORT_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
      </div>

      {clients.length === 0 ? (
        <div className="list-empty">
          {isActive ? 'No active clients yet. Move leads here when they convert.' : 'No archived leads.'}
        </div>
      ) : filtered.length === 0 ? (
        <div className="list-empty">No results for "{search}"</div>
      ) : (
        <div className="clients-grid">
          {filtered.map(c => {
            const wa = waLink(c.phone)
            const revenue = Number(c.potential_revenue) || 0
            const revColor = getRevenueColor(revenue)
            const lastContact = formatRelativeDate(c.last_contacted_at)
            const payStatus = isActive ? paymentStatusForClient(c.id, deals, payments, today) : null
            const tone = payStatus ? BADGE_TONES[payStatus.tone] || BADGE_TONES.muted : null

            return (
              <div
                key={c.id}
                className="client-card"
                onClick={() => onCardClick(c)}
              >
                <div className="client-card-header">
                  <div className="client-info-main">
                    <div className="client-name">{c.name}</div>
                    <div className="client-company">{c.company || 'No company'}</div>
                  </div>

                  <div className="client-revenue-badge" style={{ borderLeftColor: revColor }}>
                    <div className="client-revenue-label">Potential</div>
                    <div className="client-revenue-value" style={{ color: revColor }}>
                      {formatCurrency(revenue)}
                    </div>
                  </div>
                </div>

                <div className="client-card-body">
                  {isActive && payStatus && (
                    <div style={{ marginBottom: 8 }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '2px 8px',
                        borderRadius: 999,
                        fontSize: 11,
                        fontWeight: 700,
                        background: tone.bg,
                        color: tone.color,
                      }}>
                        {payStatus.label}
                        {payStatus.deal?.next_reminder_at ? ` · next ${payStatus.deal.next_reminder_at}` : ''}
                      </span>
                    </div>
                  )}

                  {c.phone && (
                    <div className="client-contact-info">
                      <span className="client-phone">📱 {c.phone}</span>
                    </div>
                  )}

                  {c.business_type && (
                    <div className="client-badge-group">
                      <span className="client-badge" style={{ background: '#f3f4f6', color: '#6b7280' }}>
                        {c.business_type}
                      </span>
                    </div>
                  )}

                  {c.pain_point && (
                    <div className="client-pain-point">
                      <span className="client-pain-label">Pain:</span>
                      <span className="client-pain-text">{c.pain_point.substring(0, 50)}...</span>
                    </div>
                  )}
                </div>

                <div className="client-card-footer">
                  <div className="client-last-contact">
                    <span className="client-contact-label">Last contact</span>
                    <span className="client-contact-time">{lastContact}</span>
                  </div>

                  <div className="client-actions">
                    {wa && (
                      <a
                        href={wa}
                        target="_blank"
                        rel="noreferrer"
                        className="client-wa-btn"
                        onClick={e => e.stopPropagation()}
                        title="Open WhatsApp"
                      >
                        💬
                      </a>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
