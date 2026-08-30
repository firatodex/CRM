// Mock data for exercising the new sales-process components without a
// live Supabase connection — import these directly in a component during
// local development, or use them as fixtures in tests.

export const mockICP = {
  id: 'icp-1',
  company_size_min: 20,
  company_size_max: 200,
  annual_revenue_min: 5000000,
  annual_revenue_max: 50000000,
  industry_vertical: 'Solar EPC',
  geography: ['Ahmedabad', 'Mumbai', 'Bangalore'],
  use_case_fit: 'manual tracking of installation pipeline causing missed follow-ups',
  budget_min: 50000,
  budget_max: 500000,
  decision_timeline_days: 30,
  notes: 'Best-fit segment based on 2026 H1 win analysis.',
}

export const mockScoringRules = [
  { id: 'rule-1', rule_name: 'Has 20+ employees', rule_criteria: { field: 'team_size', operator: '>=', value: 20 }, points_awarded: 25, active: true, order_sequence: 1 },
  { id: 'rule-2', rule_name: 'Solar EPC business type', rule_criteria: { field: 'business_type', operator: '==', value: 'Solar EPC' }, points_awarded: 30, active: true, order_sequence: 2 },
  { id: 'rule-3', rule_name: 'In target territory', rule_criteria: { field: 'territory', operator: '==', value: 'Ahmedabad' }, points_awarded: 20, active: true, order_sequence: 3 },
  { id: 'rule-4', rule_name: 'Revenue above 50L', rule_criteria: { field: 'annual_revenue', operator: '>=', value: 5000000 }, points_awarded: 25, active: true, order_sequence: 4 },
]

export const mockClients = [
  {
    id: 'client-1',
    company: 'Surya Solaris Pvt Ltd',
    business_type: 'Solar EPC',
    team_size: 45,
    annual_revenue: 12000000,
    territory: 'Ahmedabad',
    segment: 'SME_20-50',
    stage: 'proposal',
    qualification_status: 'lead_qualified',
    icp_match_score: 80,
    lead_score: 75,
    primary_contact_role: 'economic_buyer',
    internal_champion_name: 'Rajesh Patel',
    internal_champion_identified: true,
    pain_point: 'manual tracking of installation pipeline causing missed follow-ups',
    created_at: '2026-08-05T09:00:00Z',
    deal_stalled_flag: false,
  },
  {
    id: 'client-2',
    company: 'Greenfield Energy',
    business_type: 'Solar EPC',
    team_size: 8,
    annual_revenue: 2000000,
    territory: 'Mumbai',
    segment: 'SME_20-50',
    stage: 'contacted',
    qualification_status: 'needs_review',
    icp_match_score: 40,
    lead_score: 35,
    primary_contact_role: 'influencer',
    internal_champion_name: null,
    internal_champion_identified: false,
    pain_point: 'unclear',
    created_at: '2026-08-20T09:00:00Z',
    deal_stalled_flag: false,
  },
]

export const mockContactLogs = [
  {
    id: 'log-1',
    client_id: 'client-1',
    contacted_at: '2026-08-25T11:00:00Z',
    method: 'call',
    contact_outcome: 'objection_raised',
    objection_type: 'price',
    objection_counter_used: 'Sent ROI comparison sheet',
    meeting_commitment_made: true,
    commitment_specificity: 'Call Rajesh Tuesday 10am to review proposal',
    prospect_confirmed: true,
    discovery_completed: true,
    call_summary_json: {
      problem_identified: 'No visibility into installation delays',
      current_process: 'Excel sheet updated weekly by ops manager',
      stakeholders: ['Rajesh Patel', 'Ops Manager'],
      pain_points: 'Missed SLA penalties twice this quarter',
      lost_deals_per_month: 2,
      budget_indication: '2-3L per year',
      next_step: 'Send revised proposal with tiered pricing',
      objections: ['price'],
    },
  },
]

export const mockDeals = [
  {
    id: 'deal-1',
    client_id: 'client-1',
    company: 'Surya Solaris Pvt Ltd',
    stage: 'proposal',
    created_at: '2026-08-10T09:00:00Z',
    last_activity_at: '2026-08-25T11:00:00Z',
    proposal_version_count: 2,
    deal_momentum_score: 6,
    forecast_status: 'at_risk',
    competitive_situation: 'vs_specific_competitor',
    deal_value: 250000,
  },
]

export const mockObjectionPlaybook = [
  { id: 'obj-1', objection_type: 'price', objection_statement: "It's too expensive compared to what we pay now.", counter_strategy: 'Reframe on cost-of-inaction: show missed-SLA penalty cost vs subscription cost.', success_rate: 62 },
  { id: 'obj-2', objection_type: 'competitor', objection_statement: "We're using [competitor] and it's working fine.", counter_strategy: 'Share a case study of a similar EPC that switched and cut delays 30%.', success_rate: 48 },
  { id: 'obj-3', objection_type: 'timing', objection_statement: 'Not the right time, check back next quarter.', counter_strategy: 'Offer a scoped pilot for one project site to remove the "not now" blocker.', success_rate: 55 },
]

export const mockActivityTargets = {
  id: 'target-1',
  period: 'weekly',
  target_cold_calls: 40,
  target_followups: 20,
  target_in_person_meetings: 3,
  target_discoveries: 5,
  target_proposals: 3,
  target_closes: 1,
  effective_from: '2026-08-24T00:00:00Z',
}

export const mockForecastLog = [
  { id: 'fc-1', period_month: '2026-07', forecasted_revenue: 1200000, forecasted_wins: 4, actual_revenue: 950000, actual_wins: 3, forecast_accuracy_pct: 79.17 },
  { id: 'fc-2', period_month: '2026-08', forecasted_revenue: 1500000, forecasted_wins: 5, actual_revenue: 0, actual_wins: 0, forecast_accuracy_pct: null },
]

export const mockWinLossAnalysis = [
  { id: 'wl-1', deal_id: 'deal-old-1', outcome: 'won', primary_reason: 'better_fit', secondary_reasons: ['relationship'], competitive_context: 'vs_specific_competitor', estimated_deal_value: 300000, lessons_learned: 'Champion in ops team made the difference.' },
  { id: 'wl-2', deal_id: 'deal-old-2', outcome: 'lost', primary_reason: 'price', secondary_reasons: ['timeline'], competitive_context: 'vs_donothing', estimated_deal_value: 180000, lessons_learned: 'Should have offered phased rollout earlier.' },
]
