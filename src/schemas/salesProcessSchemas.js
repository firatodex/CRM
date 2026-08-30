// Zod validation schemas for the sales-process forms. Zod works fine in a
// plain JS project (no TypeScript build step required) — used here purely
// for runtime form validation before writing to Supabase.
import { z } from 'zod'

export const contactOutcomeEnum = z.enum([
  'call_booked',
  'objection_raised',
  'decision_pending',
  'no_interest',
  'wrong_fit',
  'needs_info',
])

export const objectionTypeEnum = z.enum([
  'price',
  'competitor',
  'timing',
  'need',
  'authority',
  'budget',
  'other',
])

export const qualificationStatusEnum = z.enum([
  'lead_unqualified',
  'lead_qualified',
  'needs_review',
])

export const contactRoleEnum = z.enum([
  'economic_buyer',
  'technical_buyer',
  'user_champion',
  'influencer',
  'coach',
])

export const competitiveSituationEnum = z.enum([
  'vs_specific_competitor',
  'vs_donothing',
  'vs_multiple',
  'unknown',
])

export const winReasonEnum = z.enum([
  'better_fit',
  'price',
  'relationship',
  'timing',
  'urgency',
  'other',
])

export const lossReasonEnum = z.enum([
  'price',
  'competitor',
  'timeline',
  'budget',
  'authority',
  'need',
  'other',
])

export const forecastStatusEnum = z.enum(['on_track', 'at_risk', 'closed_won', 'closed_lost'])

export const callSummarySchema = z.object({
  problem_identified: z.string().optional().default(''),
  current_process: z.string().optional().default(''),
  stakeholders: z.array(z.string()).optional().default([]),
  pain_points: z.string().optional().default(''),
  lost_deals_per_month: z.number().int().nonnegative().optional(),
  budget_indication: z.string().optional().default(''),
  next_step: z.string().optional().default(''),
  objections: z.array(z.string()).optional().default([]),
})

export const enhancedContactFormSchema = z.object({
  method: z.string().min(1, 'Contact method is required'),
  contact_outcome: contactOutcomeEnum,
  objection_type: objectionTypeEnum.optional().nullable(),
  objection_counter_used: z.string().optional().nullable(),
  meeting_commitment_made: z.boolean().default(false),
  commitment_specificity: z.string().optional().nullable(),
  prospect_confirmed: z.boolean().default(false),
  discovery_completed: z.boolean().default(false),
  call_summary_json: callSummarySchema.optional().nullable(),
}).refine(
  data => data.contact_outcome !== 'objection_raised' || !!data.objection_type,
  { message: 'objection_type is required when contact_outcome is objection_raised', path: ['objection_type'] }
).refine(
  data => !data.meeting_commitment_made || !!data.commitment_specificity,
  { message: 'commitment_specificity is required when a meeting commitment is made', path: ['commitment_specificity'] }
)

export const leadScoreOverrideSchema = z.object({
  lead_score: z.number().int().min(0).max(100),
  qualification_status: qualificationStatusEnum,
  override_reason: z.string().min(1, 'A reason is required when manually overriding the score'),
})

export const stakeholderSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  title: z.string().optional().default(''),
  role: contactRoleEnum,
  contact_method: z.string().optional().default(''),
  last_contact: z.string().optional().nullable(),
})

export const stakeholderMappingSchema = z.object({
  stakeholders: z.array(stakeholderSchema).min(1, 'At least one stakeholder is required'),
  internal_champion_name: z.string().optional().nullable(),
  internal_champion_identified: z.boolean().default(false),
})

export const objectionPlaybookEntrySchema = z.object({
  objection_type: objectionTypeEnum,
  objection_statement: z.string().min(1, 'Objection statement is required'),
  counter_strategy: z.string().min(1, 'Counter strategy is required'),
  success_rate: z.number().min(0).max(100).optional().nullable(),
})

export const icpSchema = z.object({
  company_size_min: z.number().int().nonnegative().optional().nullable(),
  company_size_max: z.number().int().nonnegative().optional().nullable(),
  annual_revenue_min: z.number().nonnegative().optional().nullable(),
  annual_revenue_max: z.number().nonnegative().optional().nullable(),
  industry_vertical: z.string().optional().nullable(),
  geography: z.array(z.string()).default([]),
  use_case_fit: z.string().optional().nullable(),
  budget_min: z.number().nonnegative().optional().nullable(),
  budget_max: z.number().nonnegative().optional().nullable(),
  decision_timeline_days: z.number().int().nonnegative().optional().nullable(),
  notes: z.string().optional().nullable(),
})

export const activityTargetsSchema = z.object({
  period: z.enum(['weekly', 'monthly']),
  target_cold_calls: z.number().int().nonnegative(),
  target_followups: z.number().int().nonnegative(),
  target_in_person_meetings: z.number().int().nonnegative(),
  target_discoveries: z.number().int().nonnegative(),
  target_proposals: z.number().int().nonnegative(),
  target_closes: z.number().int().nonnegative(),
  effective_from: z.string(),
})

export const forecastEntrySchema = z.object({
  period_month: z.string().regex(/^\d{4}-\d{2}$/, 'Expected format YYYY-MM'),
  forecasted_revenue: z.number().nonnegative(),
  forecasted_wins: z.number().int().nonnegative(),
  actual_revenue: z.number().nonnegative().optional().default(0),
  actual_wins: z.number().int().nonnegative().optional().default(0),
})

export const winLossAnalysisSchema = z.object({
  deal_id: z.string().uuid(),
  outcome: z.enum(['won', 'lost']),
  primary_reason: z.string().min(1, 'Primary reason is required'),
  secondary_reasons: z.array(z.string()).default([]),
  competitive_context: z.string().optional().nullable(),
  estimated_deal_value: z.number().nonnegative().optional().nullable(),
  lessons_learned: z.string().optional().nullable(),
}).refine(
  data => data.outcome !== 'won' || winReasonEnum.safeParse(data.primary_reason).success,
  { message: 'primary_reason must be a valid win_reason when outcome is won', path: ['primary_reason'] }
).refine(
  data => data.outcome !== 'lost' || lossReasonEnum.safeParse(data.primary_reason).success,
  { message: 'primary_reason must be a valid loss_reason when outcome is lost', path: ['primary_reason'] }
)
