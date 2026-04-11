import { todayStr } from '../utils'

function buildCSV(rows, headers) {
  const lines = [headers.join(','), ...rows.map(r =>
    r.map(v => `"${(v || '').toString().replace(/"/g, '""')}"`).join(',')
  )]
  return lines.join('\n')
}

function download(csv, filename) {
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function ExportModal({ clients, contactLogs, onClose }) {
  const today = todayStr()

  const exports = [
    {
      title: 'Full lead list',
      desc: 'All leads with every field — name, stage, phone, email, revenue, next action, notes.',
      action() {
        const headers = ['Name','Company','Phone','Email','Stage','Temperature','Source','Potential Revenue (₹)','Pain Point','Website','Next Action','Next Action Due','Last Contacted','Notes','Created']
        const rows = clients.map(c => [
          c.name, c.company, c.phone, c.email, c.stage, c.temperature, c.source,
          c.potential_revenue, c.pain_point, c.website, c.next_action, c.next_action_due,
          c.last_contacted_at ? new Date(c.last_contacted_at).toLocaleDateString('en-IN') : '',
          c.notes, c.created_at ? new Date(c.created_at).toLocaleDateString('en-IN') : ''
        ])
        download(buildCSV(rows, headers), `all-leads-${today}.csv`)
      }
    },
    {
      title: 'Overdue follow-ups',
      desc: 'Only leads with a past due date. Sort by oldest overdue first. Use this as your urgent call list.',
      action() {
        const overdue = clients
          .filter(c => !['active','dead'].includes(c.stage) && c.next_action_due && c.next_action_due < today)
          .sort((a,b) => a.next_action_due.localeCompare(b.next_action_due))
        const headers = ['Name','Company','Phone','Stage','Next Action','Due Date','Days Overdue']
        const rows = overdue.map(c => {
          const diff = Math.round((new Date(today) - new Date(c.next_action_due)) / 86400000)
          return [c.name, c.company, c.phone, c.stage, c.next_action, c.next_action_due, diff]
        })
        download(buildCSV(rows, headers), `overdue-leads-${today}.csv`)
      }
    },
    {
      title: 'Pipeline snapshot',
      desc: 'All active pipeline leads (not dead/active clients) with contact history count and revenue.',
      action() {
        const pipeline = clients.filter(c => !['active','dead'].includes(c.stage))
        const headers = ['Name','Company','Phone','Stage','Temperature','Revenue (₹)','Next Action','Due Date','Total Contacts','Last Contacted']
        const rows = pipeline.map(c => {
          const logCount = contactLogs.filter(l => l.client_id === c.id).length
          return [
            c.name, c.company, c.phone, c.stage, c.temperature, c.potential_revenue,
            c.next_action, c.next_action_due, logCount,
            c.last_contacted_at ? new Date(c.last_contacted_at).toLocaleDateString('en-IN') : 'Never'
          ]
        })
        download(buildCSV(rows, headers), `pipeline-${today}.csv`)
      }
    },
    {
      title: 'Active clients',
      desc: 'Won deals — active clients only, with revenue and contact info.',
      action() {
        const active = clients.filter(c => c.stage === 'active')
        const headers = ['Name','Company','Phone','Email','Revenue (₹)','Source','Website','Last Contacted']
        const rows = active.map(c => [
          c.name, c.company, c.phone, c.email, c.potential_revenue, c.source, c.website,
          c.last_contacted_at ? new Date(c.last_contacted_at).toLocaleDateString('en-IN') : 'Never'
        ])
        download(buildCSV(rows, headers), `active-clients-${today}.csv`)
      }
    },
    {
      title: 'Contact log history',
      desc: 'Every logged contact — method, notes, timestamps. Full audit trail.',
      action() {
        const clientMap = Object.fromEntries(clients.map(c => [c.id, c]))
        const headers = ['Lead Name','Company','Method','Note','Date & Time']
        const rows = contactLogs.map(l => {
          const c = clientMap[l.client_id] || {}
          return [
            c.name || 'Unknown', c.company || '', l.method, l.note,
            l.contacted_at ? new Date(l.contacted_at).toLocaleString('en-IN') : ''
          ]
        })
        download(buildCSV(rows, headers), `contact-log-${today}.csv`)
      }
    },
  ]

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 480 }}>
        <div className="modal-title">Export data</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, margin: '16px 0' }}>
          {exports.map((exp, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
              border: '0.5px solid var(--border)', borderRadius: 8, cursor: 'pointer',
              background: 'var(--surface)'
            }} onClick={() => { exp.action(); onClose() }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text1)', marginBottom: 2 }}>{exp.title}</div>
                <div style={{ fontSize: 12, color: 'var(--text2)' }}>{exp.desc}</div>
              </div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>
              </svg>
            </div>
          ))}
        </div>
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
