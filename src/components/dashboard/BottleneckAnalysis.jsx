import { todayStr } from '../../utils'

// ════════════════════════════════════════════════════════════════════════════════════════
// SECTION: BOTTLENECK ANALYSIS
// ════════════════════════════════════════════════════════════════════════════════════════
export default function BottleneckAnalysis({ clients }) {
  const count = stage => clients.filter(c => c.stage === stage).length
  const stages = { lead: count('lead'), contacted: count('contacted'), proposal: count('proposal'), active: count('active') }

  // A lead that is now at "proposal" has also passed "contacted", so each step counts
  // everyone who reached it or went further. Dead leads are left out: we don't record
  // how far they got before dying.
  const funnel = [
    { stage: 'Lead', reached: stages.lead + stages.contacted + stages.proposal + stages.active },
    { stage: 'Contacted', reached: stages.contacted + stages.proposal + stages.active },
    { stage: 'Proposal', reached: stages.proposal + stages.active },
    { stage: 'Won', reached: stages.active },
  ]
  const rate = (to, from) => (from > 0 ? Math.round((to / from) * 100) : null)
  const steps = funnel.slice(1).map((step, i) => ({
    label: `${funnel[i].stage} → ${step.stage}`,
    pct: rate(step.reached, funnel[i].reached),
  }))
  const maxReached = Math.max(...funnel.map(f => f.reached), 1)

  let bottleneck = null
  if (stages.contacted === 0 && stages.lead > 5) {
    bottleneck = '⚠️ Too many unworked leads — increase contact activity'
  } else if (stages.proposal > 0 && stages.active === 0 && stages.proposal > stages.contacted) {
    bottleneck = '⚠️ Proposals stuck — follow-up cadence weak or offer not compelling'
  } else if (stages.contacted > stages.proposal * 2 && stages.proposal > 0) {
    bottleneck = '⚠️ Leads not converting to proposals — discovery or demo gap'
  }

  const today = todayStr()
  const overdue = clients.filter(c =>
    !['active', 'dead'].includes(c.stage) && c.next_action_due && c.next_action_due < today
  ).length
  if (overdue > 5) bottleneck = `⚠️ ${overdue} overdue follow-ups — execution issue`

  return (
    <div className="dash-card">
      <div className="dash-card-title">Sales Funnel & Bottleneck Analysis</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
        How many leads reached each stage (dead leads excluded).
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        <div>
          {funnel.map((item, idx) => (
            <div key={item.stage} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <div style={{ fontSize: 12, fontWeight: 600 }}>{item.stage}</div>
                <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--primary)' }}>{item.reached}</div>
              </div>
              <div style={{ height: 24, background: 'var(--bg-light)', borderRadius: 6, overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${(item.reached / maxReached) * 100}%`,
                  background: idx === funnel.length - 1 ? 'var(--success)' : 'var(--primary)',
                  transition: 'width 0.3s',
                }} />
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
          {steps.map(step => (
            <div key={step.label} style={{ background: 'var(--bg-light)', borderRadius: 8, padding: '12px' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{step.label}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--primary)', lineHeight: 1 }}>
                {step.pct === null ? '—' : `${step.pct}%`}
              </div>
            </div>
          ))}
        </div>
      </div>

      {bottleneck && (
        <div style={{ marginTop: 16, padding: '12px', background: '#fff3cd', borderRadius: 8, fontSize: 12, color: '#856404' }}>
          {bottleneck}
        </div>
      )}
    </div>
  )
}
