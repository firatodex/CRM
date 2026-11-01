// Daily pipeline "reserve" snapshot. Points = 1 per contacted lead + 7 per proposal
// sent in the last 30 days, minus 24 per deal won today. Pure function: no DB access.
const CONTACTED_WEIGHT = 1
const PROPOSAL_WEIGHT = 7
const WIN_DEDUCTION = 24
const PROPOSAL_EXPIRY_DAYS = 30

export function buildPipelineSnapshot(clients, today) {
  const contactedCount = clients.filter(c => c.stage === 'contacted').length

  // Proposals without proposal_sent_at fall back to updated_at; with no date at all they count.
  const proposalCount = clients.filter(c => {
    if (c.stage !== 'proposal') return false
    const sentAt = c.proposal_sent_at || c.updated_at
    if (!sentAt) return true
    const daysSinceSent = (Date.now() - new Date(sentAt).getTime()) / 86400000
    return daysSinceSent <= PROPOSAL_EXPIRY_DAYS
  }).length

  const winsToday = clients.filter(c => c.won_at && c.won_at.slice(0, 10) === today).length
  const winPointsRemoved = winsToday * WIN_DEDUCTION

  return {
    snapshot_date: today,
    contacted_count: contactedCount,
    proposal_count: proposalCount,
    points: Math.max(0, contactedCount * CONTACTED_WEIGHT + proposalCount * PROPOSAL_WEIGHT - winPointsRemoved),
    wins_today: winsToday,
    win_points_removed: winPointsRemoved,
  }
}
