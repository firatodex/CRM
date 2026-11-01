// ════════════════════════════════════════════════════════════════════════════════════════
export default function MetricCard({ label, value, comparison, color = 'var(--text-dark)', trend = null, borderColor = 'var(--primary)' }) {
  return (
    <div style={{
      background: 'var(--bg-white)',
      border: '1px solid var(--border-light)',
      borderTop: `3px solid ${borderColor}`,
      borderRadius: 12,
      padding: '16px',
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      minWidth: 140,
    }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, color, lineHeight: 1.2 }}>
        {value}
      </div>
      {comparison && (
        <div style={{ fontSize: 12, color: trend === 'up' ? 'var(--success)' : trend === 'down' ? 'var(--error)' : 'var(--text-muted)' }}>
          {trend === 'up' && '↑ '}{trend === 'down' && '↓ '}{comparison}
        </div>
      )}
    </div>
  )
}
