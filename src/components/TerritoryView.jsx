import { useEffect, useMemo, useState } from 'react'
import { loadTerritory, districtFor } from '../territoryData'

// ── Territory: Gujarat district map of where our clients and pipeline are ────
// Everything is opt-in: tick the layers you want; nothing else is drawn.

const LAYERS = [
  { key: 'active',    label: 'Active clients', color: '#16A34A', stages: ['active'] },
  { key: 'proposal',  label: 'Proposal',       color: '#C2622D', stages: ['proposal'] },
  { key: 'contacted', label: 'Contacted',      color: '#2563EB', stages: ['contacted'] },
  { key: 'lead',      label: 'New leads', color: '#8E8E93', stages: ['lead'] },
  { key: 'dead',      label: 'Dead / lost',    color: '#B4534B', stages: ['dead'] },
]
const LS_KEY = 'territory.filters.v1'

function readSaved() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || null } catch { return null }
}

const nf = n => Number(n || 0).toLocaleString('en-IN')

export default function TerritoryView({ clients, onOpenClient }) {
  const saved = readSaved()
  const [layers, setLayers] = useState(() => new Set(saved?.layers || ['active']))
  const [shade, setShade]   = useState(saved?.shade ?? false)
  const [metric, setMetric] = useState(saved?.metric || 'vendors') // 'vendors' | 'installs'
  const [selected, setSelected] = useState(null)
  const [hover, setHover]   = useState(null)
  const [sortBy, setSortBy] = useState('vendors')
  const [showUnplaced, setShowUnplaced] = useState(false)
  const [territory, setTerritory] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => { loadTerritory().then(setTerritory).catch(e => setError(e.message || String(e))) }, [])
  useEffect(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify({ layers: [...layers], shade, metric })) } catch { /* ignore */ }
  }, [layers, shade, metric])

  const toggle = key => setLayers(prev => {
    const next = new Set(prev)
    next.has(key) ? next.delete(key) : next.add(key)
    return next
  })

  // Group clients: district -> layer -> [clients]; plus ones without a district
  const { byDistrict, unplaced, layerTotals } = useMemo(() => {
    const byDistrict = {}, unplaced = [], layerTotals = {}
    if (!territory) return { byDistrict, unplaced, layerTotals }
    for (const c of clients) {
      const layer = LAYERS.find(l => l.stages.includes(c.stage))
      if (!layer) continue
      layerTotals[layer.key] = (layerTotals[layer.key] || 0) + 1
      const d = districtFor(c, territory)
      if (!d) { unplaced.push({ c, layer: layer.key }); continue }
      byDistrict[d] ??= {}
      ;(byDistrict[d][layer.key] ??= []).push(c)
    }
    return { byDistrict, unplaced, layerTotals }
  }, [clients, territory])

  const maxMetric = useMemo(() => {
    if (!territory) return 1
    return Math.max(1, ...Object.values(territory.market).map(m => m[metric]))
  }, [territory, metric])

  if (error) return <div style={{ padding: 24, color: 'var(--error)' }}>Couldn’t load the territory map: {error}</div>
  if (!territory) return <div style={{ padding: 24, color: 'var(--text-muted)', fontSize: 13 }}>Loading map…</div>

  const { map, market } = territory
  const activeLayers = LAYERS.filter(l => layers.has(l.key))
  const count = (d, key) => byDistrict[d]?.[key]?.length || 0

  const fillFor = name => {
    if (name === selected) return '#F3D9C8'
    if (!shade) return name === hover ? '#EFEAE3' : '#F6F4F1'
    const v = market[name]?.[metric] || 0
    const t = Math.sqrt(v / maxMetric) // sqrt keeps small districts visible
    const mix = (a, b) => Math.round(a + (b - a) * t)
    // #FBF6F1 → #D9895A
    return `rgb(${mix(251, 217)}, ${mix(246, 137)}, ${mix(241, 90)})`
  }

  // Coverage table rows
  const rows = map.districts.map(({ name }) => {
    const m = market[name] || { vendors: 0, installs: 0 }
    const active = count(name, 'active')
    const pipeline = count(name, 'proposal') + count(name, 'contacted')
    return { name, ...m, active, pipeline, share: m.vendors ? (active / m.vendors) * 100 : 0 }
  }).sort((a, b) => sortBy === 'gap'
    ? (a.active - b.active) || (b.vendors - a.vendors)
    : (b[sortBy] - a[sortBy]) || (b.vendors - a.vendors))

  const sel = selected ? rows.find(r => r.name === selected) : null
  const unplacedShown = unplaced.filter(u => layers.has(u.layer))

  return (
    <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '16px 20px', background: 'var(--bg-lighter)' }}>
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>

        {/* ── Filters ─────────────────────────────────────────── */}
        <div style={{ ...card, width: 220, flexShrink: 0 }}>
          <div style={sectionTitle}>Show on map</div>
          {LAYERS.map(l => (
            <label key={l.key} style={checkRow}>
              <input type="checkbox" checked={layers.has(l.key)} onChange={() => toggle(l.key)} style={{ accentColor: l.color }} />
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: l.color, flexShrink: 0 }} />
              <span style={{ flex: 1 }}>{l.label}</span>
              <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{layerTotals[l.key] || 0}</span>
            </label>
          ))}
          <div style={{ display: 'flex', gap: 10, margin: '4px 0 2px 2px' }}>
            <button style={linkBtn} onClick={() => setLayers(new Set(LAYERS.map(l => l.key)))}>All</button>
            <button style={linkBtn} onClick={() => setLayers(new Set())}>None</button>
          </div>

          <div style={{ ...sectionTitle, marginTop: 16 }}>Background</div>
          <label style={checkRow}>
            <input type="checkbox" checked={shade} onChange={e => setShade(e.target.checked)} style={{ accentColor: 'var(--primary)' }} />
            <span>Shade by market size</span>
          </label>
          {shade && (
            <div style={{ display: 'flex', background: 'var(--bg-light)', borderRadius: 6, padding: 2, margin: '4px 0 0 24px' }}>
              {[['vendors', 'EPCs'], ['installs', 'Installs']].map(([k, label]) => (
                <button key={k} onClick={() => setMetric(k)}
                  style={{ flex: 1, fontSize: 11, padding: '4px 6px', border: 'none', borderRadius: 5, cursor: 'pointer',
                    background: metric === k ? '#fff' : 'transparent', boxShadow: metric === k ? 'var(--shadow-sm)' : 'none',
                    color: metric === k ? 'var(--text-dark)' : 'var(--text-light)', fontWeight: metric === k ? 600 : 400 }}>
                  {label}
                </button>
              ))}
            </div>
          )}

          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 16, lineHeight: 1.5 }}>
            Bubble number = leads in that district. Districts come from PM Surya Ghar portal data
            {territory.snapshotDate ? ` (${new Date(territory.snapshotDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })})` : ''}
            {' '}or the District field on the lead.
          </div>
        </div>

        {/* ── Map ─────────────────────────────────────────────── */}
        <div style={{ ...card, flex: '1 1 480px', minWidth: 360, padding: 12, position: 'relative' }}>
          <svg viewBox={`0 0 ${map.w} ${map.h}`} style={{ width: '100%', height: 'auto', display: 'block' }}
            onMouseLeave={() => setHover(null)}>
            {map.districts.map(d => (
              <path key={d.name} d={d.d} fill={fillFor(d.name)}
                stroke={d.name === selected ? 'var(--primary)' : '#CFC8BE'} strokeWidth={d.name === selected ? 2.2 : 0.9}
                style={{ cursor: 'pointer', transition: 'fill .15s' }}
                onMouseEnter={() => setHover(d.name)}
                onClick={() => setSelected(s => s === d.name ? null : d.name)} />
            ))}
            {/* Bubbles: one per ticked layer with leads in that district, side by side */}
            {map.districts.map(d => {
              const items = activeLayers.map(l => ({ l, n: count(d.name, l.key) })).filter(x => x.n > 0)
              if (!items.length) return null
              const radii = items.map(x => Math.min(24, 8 + 2.4 * Math.sqrt(x.n)))
              const total = radii.reduce((s, r) => s + 2 * r, 0) + (items.length - 1) * 3
              let x = d.cx - total / 2
              return (
                <g key={d.name} style={{ pointerEvents: 'none' }}>
                  {items.map((it, i) => {
                    const r = radii[i]; const cx = x + r; x += 2 * r + 3
                    return (
                      <g key={it.l.key}>
                        <circle cx={cx} cy={d.cy} r={r} fill={it.l.color} fillOpacity={0.9} stroke="#fff" strokeWidth={1.5} />
                        <text x={cx} y={d.cy} textAnchor="middle" dominantBaseline="central"
                          style={{ fontSize: r > 12 ? 12 : 10, fontWeight: 700, fill: '#fff', fontFamily: 'var(--font)' }}>{it.n}</text>
                      </g>
                    )
                  })}
                </g>
              )
            })}
            {/* Name of hovered / selected district */}
            {[...new Set([hover, selected].filter(Boolean))].map(n => {
              const d = map.districts.find(x => x.name === n)
              return d && (
                <text key={n} x={d.cx} y={d.cy - 30} textAnchor="middle"
                  style={{ fontSize: 15, fontWeight: 600, fill: 'var(--text-dark)', fontFamily: 'var(--font)', pointerEvents: 'none',
                    paintOrder: 'stroke', stroke: '#fff', strokeWidth: 4 }}>{n}</text>
              )
            })}
          </svg>
          {hover && (
            <div style={{ position: 'absolute', left: 16, bottom: 14, fontSize: 12, color: 'var(--text-body)', background: 'rgba(255,255,255,0.92)', padding: '6px 10px', borderRadius: 6, boxShadow: 'var(--shadow-sm)' }}>
              <b>{hover}</b> · {nf(market[hover]?.vendors)} EPCs · {nf(market[hover]?.installs)} installs
              {activeLayers.map(l => count(hover, l.key) ? <span key={l.key} style={{ color: l.color }}> · {count(hover, l.key)} {l.label.toLowerCase()}</span> : null)}
            </div>
          )}
        </div>

        {/* ── District detail or coverage table ───────────────── */}
        <div style={{ ...card, width: 320, flexShrink: 0, maxHeight: 'calc(100vh - 140px)', overflow: 'auto' }}>
          {sel ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-dark)' }}>{sel.name}</div>
                <button onClick={() => setSelected(null)} style={{ ...linkBtn, fontSize: 12 }}>← All districts</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, margin: '12px 0 14px' }}>
                <Stat label="EPCs" value={nf(sel.vendors)} />
                <Stat label="Installs" value={nf(sel.installs)} />
                <Stat label="Our share" value={sel.vendors ? `${sel.share.toFixed(1)}%` : '—'} />
              </div>
              {activeLayers.length === 0 && <div style={muted}>Tick a layer on the left to list leads here.</div>}
              {activeLayers.map(l => {
                const list = byDistrict[sel.name]?.[l.key] || []
                return (
                  <div key={l.key} style={{ marginBottom: 12 }}>
                    <div style={{ ...sectionTitle, color: l.color, borderLeft: `3px solid ${l.color}`, paddingLeft: 6 }}>
                      {l.label} · {list.length}
                    </div>
                    {list.length === 0 ? <div style={{ ...muted, paddingLeft: 9 }}>None</div> : list
                      .slice().sort((a, b) => (b.potential_revenue || 0) - (a.potential_revenue || 0))
                      .map(c => <ClientLine key={c.id} c={c} onOpen={onOpenClient} />)}
                  </div>
                )
              })}
            </>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                <div style={sectionTitle}>Coverage by district</div>
                <select value={sortBy} onChange={e => setSortBy(e.target.value)}
                  style={{ fontSize: 11, border: '1px solid var(--border-light)', borderRadius: 5, padding: '2px 4px', background: '#fff' }}>
                  <option value="vendors">Biggest market</option>
                  <option value="gap">Biggest gaps</option>
                  <option value="active">Most clients</option>
                  <option value="pipeline">Most pipeline</option>
                  <option value="share">Highest share</option>
                </select>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ color: 'var(--text-muted)', textAlign: 'right' }}>
                    <th style={{ ...th, textAlign: 'left' }}>District</th><th style={th}>EPCs</th>
                    <th style={{ ...th, color: '#16A34A' }}>Active</th><th style={th}>Pipeline</th><th style={th}>Share</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.name} onClick={() => setSelected(r.name)} onMouseEnter={() => setHover(r.name)} onMouseLeave={() => setHover(null)}
                      style={{ cursor: 'pointer', background: hover === r.name ? 'var(--bg-light)' : 'transparent' }}>
                      <td style={{ ...td, textAlign: 'left', color: 'var(--text-dark)' }}>{r.name}</td>
                      <td style={td}>{nf(r.vendors)}</td>
                      <td style={{ ...td, fontWeight: r.active ? 700 : 400, color: r.active ? '#16A34A' : 'var(--text-muted)' }}>{r.active || '·'}</td>
                      <td style={{ ...td, color: r.pipeline ? 'var(--text-body)' : 'var(--text-muted)' }}>{r.pipeline || '·'}</td>
                      <td style={{ ...td, color: 'var(--text-light)' }}>{r.share ? `${r.share.toFixed(1)}%` : '·'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ ...muted, marginTop: 8 }}>Pipeline = proposal + contacted. Share = active clients ÷ EPCs in the district.</div>
            </>
          )}

          {unplacedShown.length > 0 && (
            <div style={{ marginTop: 14, borderTop: '1px solid var(--border-light)', paddingTop: 10 }}>
              <button style={{ ...linkBtn, fontSize: 12 }} onClick={() => setShowUnplaced(s => !s)}>
                {showUnplaced ? '▾' : '▸'} {unplacedShown.length} not on the map (no district)
              </button>
              {showUnplaced && (
                <div style={{ marginTop: 6 }}>
                  <div style={{ ...muted, marginBottom: 6 }}>Open a lead and pick its District to place it.</div>
                  {unplacedShown.map(({ c, layer }) => (
                    <ClientLine key={c.id} c={c} onOpen={onOpenClient} dot={LAYERS.find(l => l.key === layer).color} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ClientLine({ c, onOpen, dot }) {
  return (
    <button onClick={() => onOpen?.(c)}
      style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 6, textAlign: 'left', background: 'none', border: 'none',
        padding: '5px 9px', borderRadius: 5, cursor: 'pointer', fontSize: 12.5, color: 'var(--text-body)' }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-light)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'none' }}>
      {dot && <span style={{ width: 7, height: 7, borderRadius: '50%', background: dot, flexShrink: 0 }} />}
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {c.company || c.name}
        {c.company && c.name && c.company !== c.name && <span style={{ color: 'var(--text-muted)' }}> · {c.name}</span>}
      </span>
      {Number(c.potential_revenue) > 0 && <span style={{ color: 'var(--text-light)', fontSize: 11 }}>₹{nf(c.potential_revenue)}</span>}
    </button>
  )
}

function Stat({ label, value }) {
  return (
    <div style={{ background: 'var(--bg-light)', borderRadius: 6, padding: '7px 8px' }}>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-dark)', marginTop: 2 }}>{value}</div>
    </div>
  )
}

const card = { background: '#fff', border: '1px solid var(--border-light)', borderRadius: 'var(--radius)', padding: 14, boxShadow: 'var(--shadow-sm)' }
const sectionTitle = { fontSize: 11, fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 6 }
const checkRow = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-body)', padding: '5px 2px', cursor: 'pointer' }
const linkBtn = { background: 'none', border: 'none', color: 'var(--primary)', fontSize: 11, cursor: 'pointer', padding: 0 }
const muted = { fontSize: 11.5, color: 'var(--text-muted)' }
const th = { fontWeight: 600, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.4px', padding: '4px 4px 6px', borderBottom: '1px solid var(--border-light)', textAlign: 'right' }
const td = { padding: '5px 4px', borderBottom: '1px solid var(--border-light)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }
