import {
  Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ComposedChart, Scatter,
} from 'recharts'
import { useMemo } from 'react'
import { todayStr } from '../../utils'

// ════════════════════════════════════════════════════════════════════════════════════════
// SECTION: PIPELINE RESERVE GRAPH (CORE GRAPH — PRESERVED)
// ════════════════════════════════════════════════════════════════════════════════════════
export default function PipelineReserveGraph({ clients, pipelineSnapshots }) {
  const today = todayStr()
  
  const PROPOSAL_EXPIRY_DAYS = 30
  const WIN_DEDUCTION = 24

  const pipelinePointsData = useMemo(() => {
    // Build map of won_at dates
    const wonByDate = {}
    clients.forEach(c => {
      if (c.won_at && c.stage === 'active') {
        const d = c.won_at.slice(0, 10)
        if (d !== today) wonByDate[d] = (wonByDate[d] || 0) + 1
      }
    })

    // Historical snapshots
    const frozen = pipelineSnapshots
      .filter(s => s.snapshot_date !== today)
      .sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date))
      .map(s => {
        const snapshotWins = s.wins_today || 0
        const clientWins = wonByDate[s.snapshot_date] || 0
        const wins = Math.max(snapshotWins, clientWins)
        return {
          date: s.snapshot_date,
          label: new Date(s.snapshot_date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
          reserve: s.points,
          proposals: s.proposal_count,
          wins: wins > 0 ? wins : null,
          pointsRemoved: s.win_points_removed > 0 ? s.win_points_removed : null,
        }
      })

    // Today: live calculation
    const liveContactedCount = clients.filter(c => c.stage === 'contacted').length
    const liveProposalCount = clients.filter(c => {
      if (c.stage !== 'proposal') return false
      const sentAt = c.proposal_sent_at || c.updated_at
      if (!sentAt) return true
      const daysSinceSent = (Date.now() - new Date(sentAt).getTime()) / (1000 * 60 * 60 * 24)
      return daysSinceSent <= PROPOSAL_EXPIRY_DAYS
    }).length
    const wonTodayList = clients.filter(c => c.won_at && c.won_at.slice(0, 10) === today)
    const wonTodayPoints = wonTodayList.length * WIN_DEDUCTION

    const todayPoint = {
      date: today,
      label: new Date(today + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
      reserve: Math.max(0, liveContactedCount * 1 + liveProposalCount * 7 - wonTodayPoints),
      proposals: liveProposalCount,
      wins: wonTodayList.length > 0 ? wonTodayList.length : null,
      pointsRemoved: wonTodayPoints > 0 ? wonTodayPoints : null,
    }

    return [...frozen, todayPoint]
  }, [pipelineSnapshots, clients, today])

  const currentPoints = pipelinePointsData.length > 0
    ? pipelinePointsData[pipelinePointsData.length - 1].reserve
    : null
  const currentProposals = pipelinePointsData.length > 0
    ? pipelinePointsData[pipelinePointsData.length - 1].proposals
    : null

  return (
    <div className="dash-card">
      <div className="dash-card-title">Pipeline Reserve — Deal Machine Health</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
        Reserve points: 1 per contacted lead + 7 per proposal sent in the last 30 days. Green dots = deals won = reserve released.
      </div>

      {pipelinePointsData.length === 0 ? (
        <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
          No pipeline data yet
        </div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={pipelinePointsData} margin={{ top: 20, right: 8, left: -24, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
              <XAxis 
                dataKey="label" 
                tick={{ fontSize: 10, fill: 'var(--text-muted)' }} 
                interval={Math.max(0, Math.floor(pipelinePointsData.length / 8) - 1)}
              />
              <YAxis yAxisId="reserve" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} allowDecimals={false} />
              <YAxis yAxisId="proposals" orientation="right" tick={{ fontSize: 10, fill: '#5E8FC0' }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid var(--border-light)' }}
                formatter={(v, name) => {
                  if (name === 'reserve') return [v, 'Reserve points']
                  if (name === 'proposals') return [v, 'Active proposals']
                  if (name === 'wins') return [v, 'Deal won']
                  if (name === 'pointsRemoved') return [`-${v}`, 'Points removed by win']
                  return [v, name]
                }}
              />
              <Line yAxisId="reserve" type="monotone" dataKey="reserve" stroke="var(--primary)" strokeWidth={2.5} dot={false} name="reserve" />
              <Line yAxisId="proposals" type="monotone" dataKey="proposals" stroke="#5E8FC0" strokeWidth={1.5} dot={false} strokeDasharray="4 2" name="proposals" />
              <Scatter
                yAxisId="reserve"
                dataKey="wins"
                fill="var(--success)"
                name="wins"
                shape={(props) => {
                  const { cx, cy, payload } = props
                  if (!payload?.wins) return null
                  return (
                    <g>
                      <circle cx={cx} cy={cy} r={5} fill="var(--success)" />
                      {payload.pointsRemoved && (
                        <text 
                          x={cx} 
                          y={cy - 14} 
                          textAnchor="middle" 
                          fontSize={10} 
                          fontWeight={700} 
                          fill="var(--success)"
                          pointerEvents="none"
                        >
                          -{payload.pointsRemoved}
                        </text>
                      )}
                    </g>
                  )
                }}
              />
            </ComposedChart>
          </ResponsiveContainer>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-muted)' }}>
              <div style={{ width: 16, height: 2.5, background: 'var(--primary)', borderRadius: 1 }} />
              Reserve (contacted + recent proposals)
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-muted)' }}>
              <div style={{ width: 16, height: 1.5, background: '#5E8FC0', borderRadius: 1 }} />
              Active proposals (right axis)
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-muted)' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--success)' }} />
              Deal won
            </div>

            <div style={{ marginLeft: 'auto', display: 'flex', gap: 16 }}>
              {currentPoints !== null && (
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--primary)', lineHeight: 1 }}>{currentPoints}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>reserve pts</div>
                </div>
              )}
              {currentProposals !== null && (
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#5E8FC0', lineHeight: 1 }}>{currentProposals}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>proposals</div>
                </div>
              )}
            </div>
          </div>

        </>
      )}
    </div>
  )
}
