// Sales process metrics: lead scoring, ICP matching, deal momentum,
// stalled-deal detection, next-step recommendations, and weekly activity
// rollups. Pure functions only — no Supabase calls here, so these can be
// unit tested and reused from both components and any future batch job.
//
// This codebase is plain JS/JSX (no TypeScript build step configured), so
// shapes are documented with JSDoc typedefs instead of .ts interfaces —
// editors still get autocomplete/hover types from these.

/**
 * @typedef {Object} Client
 * @property {string} id
 * @property {string} [company]
 * @property {number} [team_size]
 * @property {number} [annual_revenue]
 * @property {string} [business_type]
 * @property {string} [territory]
 * @property {string} [stage]
 * @property {string} created_at
 * @property {number} [potential_revenue]
 * @property {string} [pain_point]
 */

/**
 * @typedef {Object} LeadScoringRule
 * @property {string} id
 * @property {string} rule_name
 * @property {{ field: string, operator: '>='|'<='|'>'|'<'|'=='|'!=', value: any }} rule_criteria
 * @property {number} points_awarded
 * @property {boolean} active
 * @property {number} order_sequence
 */

/**
 * @typedef {Object} IdealCustomerProfile
 * @property {number} [company_size_min]
 * @property {number} [company_size_max]
 * @property {number} [annual_revenue_min]
 * @property {number} [annual_revenue_max]
 * @property {string} [industry_vertical]
 * @property {string[]} [geography]
 * @property {string} [use_case_fit]
 * @property {number} [budget_min]
 * @property {number} [budget_max]
 */

/**
 * @typedef {Object} Deal
 * @property {string} id
 * @property {string} client_id
 * @property {string} [stage]
 * @property {string} created_at
 * @property {string} [last_activity_at]
 * @property {number} [proposal_version_count]
 * @property {boolean} [deal_stalled_flag]
 */

/**
 * @typedef {Object} ContactLog
 * @property {string} id
 * @property {string} client_id
 * @property {string} contacted_at
 * @property {string} [contact_outcome]
 * @property {string} [objection_type]
 * @property {boolean} [meeting_commitment_made]
 * @property {boolean} [discovery_completed]
 */

const MS_PER_DAY = 1000 * 60 * 60 * 24;

function daysSince(dateStr) {
  if (!dateStr) return Infinity;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / MS_PER_DAY);
}

function getFieldValue(record, field) {
  return field.split('.').reduce((obj, key) => (obj == null ? undefined : obj[key]), record);
}

function compare(actual, operator, expected) {
  switch (operator) {
    case '>=': return actual >= expected;
    case '<=': return actual <= expected;
    case '>': return actual > expected;
    case '<': return actual < expected;
    case '==': return actual == expected; // eslint-disable-line eqeqeq
    case '!=': return actual != expected; // eslint-disable-line eqeqeq
    default: return false;
  }
}

/**
 * Evaluate every active scoring rule against a client and sum the awarded
 * points, in ascending `order_sequence`. Rules whose target field is
 * missing on the client are skipped (treated as not matched) rather than
 * throwing, since lead data is entered incrementally.
 *
 * @param {Client} client
 * @param {LeadScoringRule[]} scoringRules
 * @returns {number} 0-100 lead score (clamped)
 */
export function calculateLeadScore(client, scoringRules) {
  if (!client || !Array.isArray(scoringRules)) return 0;

  const activeRules = scoringRules
    .filter(rule => rule.active)
    .sort((a, b) => (a.order_sequence ?? 0) - (b.order_sequence ?? 0));

  let score = 0;
  for (const rule of activeRules) {
    const { field, operator, value } = rule.rule_criteria || {};
    if (!field || !operator) continue;
    const actual = getFieldValue(client, field);
    if (actual === undefined) continue;
    if (compare(actual, operator, value)) {
      score += rule.points_awarded || 0;
    }
  }

  return Math.max(0, Math.min(100, score));
}

/**
 * Score how well a client matches the Ideal Customer Profile, 0-100.
 * Each of the 5 dimensions (company size, revenue, industry, location,
 * use-case fit) contributes up to 20 points; a dimension with no ICP
 * constraint configured is skipped and its weight redistributed so an
 * incomplete ICP definition doesn't unfairly cap the score.
 *
 * @param {Client} client
 * @param {IdealCustomerProfile} icp
 * @returns {number} 0-100 ICP match score
 */
export function calculateICPMatch(client, icp) {
  if (!client || !icp) return 0;

  const checks = [];

  if (icp.company_size_min != null || icp.company_size_max != null) {
    const size = client.team_size;
    const min = icp.company_size_min ?? -Infinity;
    const max = icp.company_size_max ?? Infinity;
    checks.push(size != null && size >= min && size <= max);
  }

  if (icp.annual_revenue_min != null || icp.annual_revenue_max != null) {
    const revenue = client.annual_revenue;
    const min = icp.annual_revenue_min ?? -Infinity;
    const max = icp.annual_revenue_max ?? Infinity;
    checks.push(revenue != null && revenue >= min && revenue <= max);
  }

  if (icp.industry_vertical) {
    checks.push(
      !!client.business_type &&
      client.business_type.toLowerCase().includes(icp.industry_vertical.toLowerCase())
    );
  }

  if (icp.geography && icp.geography.length > 0) {
    checks.push(!!client.territory && icp.geography.includes(client.territory));
  }

  if (icp.use_case_fit) {
    checks.push(
      !!client.pain_point &&
      client.pain_point.toLowerCase().includes(icp.use_case_fit.toLowerCase())
    );
  }

  if (checks.length === 0) return 0;

  const pointsPerCheck = 100 / checks.length;
  const matched = checks.filter(Boolean).length;
  return Math.round(matched * pointsPerCheck);
}

/**
 * Score deal momentum 0-10:
 *  -2 points per 5 days since last contact (floor at 0)
 *  +3 if 2+ distinct stakeholders have been contacted
 *  +2 if any recent contact logged a confirmed commitment
 *  +1 per proposal version beyond the first
 *  +2 if discovery has been completed
 *
 * @param {Deal} deal
 * @param {ContactLog[]} recentContacts contact_log rows for this deal's client
 * @returns {number} 0-10 momentum score
 */
export function calculateDealMomentumScore(deal, recentContacts) {
  if (!deal) return 0;
  const contacts = recentContacts || [];

  let score = 10;

  const lastContact = contacts
    .map(c => c.contacted_at)
    .sort()
    .pop();
  const daysSinceContact = daysSince(lastContact || deal.created_at);
  score -= Math.floor(daysSinceContact / 5) * 2;

  const distinctContactMethods = new Set(contacts.map(c => c.method || c.contacted_by).filter(Boolean));
  if (distinctContactMethods.size >= 2) score += 3;

  if (contacts.some(c => c.meeting_commitment_made && c.prospect_confirmed)) score += 2;

  const versions = deal.proposal_version_count || 1;
  score += Math.max(0, versions - 1);

  if (contacts.some(c => c.discovery_completed)) score += 2;

  return Math.max(0, Math.min(10, score));
}

/**
 * Flag deals sitting in the proposal stage past `threshold_days` with no
 * activity in that window. Returns new Deal objects with
 * `deal_stalled_flag: true` set — callers persist the flag themselves.
 *
 * @param {Deal[]} deals
 * @param {number} [threshold_days=14]
 * @returns {Deal[]} the stalled subset, flagged
 */
export function identifyStalledDeals(deals, threshold_days = 14) {
  if (!Array.isArray(deals)) return [];

  return deals
    .filter(deal => deal.stage === 'proposal')
    .filter(deal => daysSince(deal.last_activity_at || deal.created_at) > threshold_days)
    .map(deal => ({ ...deal, deal_stalled_flag: true }));
}

const OBJECTION_PLAYS = {
  price: 'Send competitor/ROI comparison email showing total cost of inaction.',
  competitor: 'Share a case study or differentiator sheet against the named competitor.',
  timing: 'Propose a smaller pilot scope to remove the "not now" blocker.',
  need: 'Re-run discovery — the pain point may not be validated yet.',
  authority: 'Ask to be introduced to the actual economic buyer.',
  budget: 'Offer a phased rollout that fits this quarter\'s budget.',
  other: 'Log the objection in the playbook and schedule a manual follow-up.',
};

const OUTCOME_PLAYS = {
  call_booked: 'Confirm the meeting in writing and send a calendar invite.',
  objection_raised: 'Use the objection playbook for the logged objection_type.',
  decision_pending: 'Set a follow-up reminder for the promised decision date.',
  no_interest: 'Mark as unqualified and stop active outreach.',
  wrong_fit: 'Disqualify against the ICP and archive the lead.',
  needs_info: 'Send the requested information within 24 hours.',
};

/**
 * Recommend the next action based on the last contact's outcome and, when
 * the outcome was an objection, its specific objection_type.
 *
 * @param {ContactLog} contact
 * @param {Client} client
 * @returns {string} a single recommended next step
 */
export function getRecommendedNextStep(contact, client) {
  if (!contact) return 'Log a contact attempt to get a recommendation.';

  if (contact.contact_outcome === 'objection_raised' && contact.objection_type) {
    return OBJECTION_PLAYS[contact.objection_type] || OBJECTION_PLAYS.other;
  }

  if (contact.contact_outcome && OUTCOME_PLAYS[contact.contact_outcome]) {
    return OUTCOME_PLAYS[contact.contact_outcome];
  }

  return `Follow up with ${client?.company || 'the client'} — no outcome logged for the last contact.`;
}

/**
 * @typedef {Object} WeeklyActivitySummary
 * @property {string} userId
 * @property {string} weekStart ISO date
 * @property {string} weekEnd ISO date
 * @property {Record<string, { actual: number, target: number, pct: number }>} metrics
 */

/**
 * Count this user's logged activity for the week starting `weekStartDate`
 * and compare it against `sales_activity_targets`. Callers fetch
 * `contactLogs` (contact_log rows) and `target` (a sales_activity_targets
 * row for period='weekly') themselves — kept pure here for testability.
 *
 * @param {string} userId
 * @param {Date} weekStartDate
 * @param {ContactLog[]} contactLogs contact_log rows for this user, already filtered to the week
 * @param {Object} target a sales_activity_targets row (period='weekly')
 * @returns {WeeklyActivitySummary}
 */
export function generateWeeklyActivitySummary(userId, weekStartDate, contactLogs, target) {
  const weekStart = new Date(weekStartDate);
  const weekEnd = new Date(weekStart.getTime() + 7 * MS_PER_DAY);
  const logs = contactLogs || [];

  const counts = {
    cold_calls: logs.filter(l => l.method === 'call' && !l.meeting_commitment_made).length,
    followups: logs.filter(l => l.contact_outcome === 'decision_pending').length,
    in_person_meetings: logs.filter(l => l.method === 'in_person').length,
    discoveries: logs.filter(l => l.discovery_completed).length,
    proposals: logs.filter(l => l.contact_outcome === 'call_booked' && l.method === 'proposal').length,
    closes: logs.filter(l => l.contact_outcome === 'call_booked' && l.commitment_specificity?.toLowerCase().includes('close')).length,
  };

  const targets = {
    cold_calls: target?.target_cold_calls || 0,
    followups: target?.target_followups || 0,
    in_person_meetings: target?.target_in_person_meetings || 0,
    discoveries: target?.target_discoveries || 0,
    proposals: target?.target_proposals || 0,
    closes: target?.target_closes || 0,
  };

  const metrics = {};
  for (const key of Object.keys(counts)) {
    const actual = counts[key];
    const t = targets[key];
    metrics[key] = {
      actual,
      target: t,
      pct: t > 0 ? Math.round((actual / t) * 100) : 0,
    };
  }

  return {
    userId,
    weekStart: weekStart.toISOString().slice(0, 10),
    weekEnd: weekEnd.toISOString().slice(0, 10),
    metrics,
  };
}
