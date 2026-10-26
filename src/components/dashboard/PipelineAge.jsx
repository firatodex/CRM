import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Bar, BarChart } from 'recharts'

// ════════════════════════════════════════════════════════════════════════════════════════
// SECTION: PIPELINE AGE
// ════════════════════════════════════════════════════════════════════════════════════════
export default function PipelineAge({ clients }) {
  const today = new Date()
  const pipeline = clients.filter(c => !['active', 'dead'].includes(c.stage))

  const ageGroups = {
    '0-7d': 0,
    '8-14d': 0,
    '15-30d': 0,
    '31-60d': 0,
    '60+d': 0,
  }

  const proposalAgeGroups = {
    '0-7d': 0,
    '8-14d': 0,
    '15-30d': 0,
    '30+d': 0,
  }

  pipeline.forEach(c => {
    if (!c.last_contacted_at) {
      ageGroups['60+d']++
      return
    }

    const daysOld = Math.floor((today - new Date(c.last_contacted_at)) / 86400000)
    if (daysOld <= 7) ageGroups['0-7d']++
    else if (daysOld <= 14) ageGroups['8-14d']++
    else if (daysOld <= 30) ageGroups['15-30d']++
    else if (daysOld <= 60) ageGroups['31-60d']++
    else ageGroups['60+d']++
  })

  const proposals = clients.filter(c => c.stage === 'proposal' && c.proposal_sent_at)
  proposals.forEach(p => {
    const daysOld = Math.floor((today - new Date(p.proposal_sent_at)) / 86400000)
    if (daysOld <= 7) proposalAgeGroups['0-7d']++
    else if (daysOld <= 14) proposalAgeGroups['8-14d']++
    else if (daysOld <= 30) proposalAgeGroups['15-30d']++
    else proposalAgeGroups['30+d']++
  })

  const ageData = Object.entries(ageGroups).map(([age, count]) => ({ age, count }))
  const proposalAgeData = Object.entries(proposalAgeGroups).map(([age, count]) => ({ age, count }))

  return (
    <div className="dash-card">
      <div className="dash-card-title">Pipeline Age — Proposal Stalling Risk</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
        How long have opportunities been sitting? Older proposals need urgency.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 12 }}>All Pipeline</div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={ageData} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
              <XAxis dataKey="age" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
              <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} />
              <Bar dataKey="count" fill="var(--primary)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 12 }}>Proposals Only (Risk)</div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={proposalAgeData} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
              <XAxis dataKey="age" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
              <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} />
              <Bar dataKey="count" fill={proposalAgeGroups['30+d'] > 0 ? 'var(--error)' : 'var(--primary)'} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {proposalAgeGroups['30+d'] > 0 && (
        <div style={{ marginTop: 16, padding: '12px', background: '#fff3cd', borderRadius: 8, fontSize: 12, color: '#856404' }}>
          ⚠️ {proposalAgeGroups['30+d']} proposals older than 30 days — follow up or close
        </div>
      )}
    </div>
  )
}
