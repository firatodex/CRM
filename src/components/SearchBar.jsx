import { useState, useRef, useEffect } from 'react'
import { ALL_STAGES, TEMPERATURES } from '../stages'

export default function SearchBar({ clients, onSelect, onClose }) {
  const [query, setQuery] = useState('')
  const [selectedIdx, setSelectedIdx] = useState(0)
  const inputRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const q = query.toLowerCase().trim()
  const results = q
    ? clients.filter(c =>
        (c.name || '').toLowerCase().includes(q) ||
        (c.company || '').toLowerCase().includes(q) ||
        (c.phone || '').includes(q) ||
        (c.business_type || '').toLowerCase().includes(q) ||
        (c.pain_point || '').toLowerCase().includes(q)
      ).slice(0, 10)
    : []

  function handleKey(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIdx(i => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIdx(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && results[selectedIdx]) {
      onSelect(results[selectedIdx])
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  useEffect(() => { setSelectedIdx(0) }, [query])

  const stageMap = Object.fromEntries(ALL_STAGES.map(s => [s.key, s]))

  return (
    <div className="overlay search-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="search-container">
        <div className="search-input-row">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input
            ref={inputRef}
            className="search-input"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Search leads by name, company, phone..."
          />
          <kbd className="kbd">esc</kbd>
        </div>
        {results.length > 0 && (
          <div className="search-results">
            {results.map((c, i) => {
              const stage = stageMap[c.stage]
              const temp = TEMPERATURES.find(t => t.key === c.temperature)
              return (
                <div
                  key={c.id}
                  className={`search-result ${i === selectedIdx ? 'selected' : ''}`}
                  onClick={() => onSelect(c)}
                  onMouseEnter={() => setSelectedIdx(i)}
                >
                  <div className="search-result-main">
                    {temp && <span className="temp-badge-sm">{temp.emoji}</span>}
                    <span className="search-result-name">{c.name}</span>
                    {c.company && <span className="search-result-company">{c.company}</span>}
                  </div>
                  {stage && (
                    <span className="search-result-stage" style={{ color: stage.color }}>
                      {stage.label}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        )}
        {q && results.length === 0 && (
          <div className="search-empty">No results for "{query}"</div>
        )}
      </div>
    </div>
  )
}
