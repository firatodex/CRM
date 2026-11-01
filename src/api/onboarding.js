import { supabase } from '../supabase'
import { addDays } from '../utils'

export const DEFAULT_ONBOARDING_STEPS = [
  'Onboarding call',
  'Setup & data migration',
  'Training session',
  'Go-live',
  'Client handoff',
]

export function listOnboardingSteps(clientId) {
  return supabase.from('onboarding_steps').select('*').eq('client_id', clientId).order('step_order')
}

export function hasOnboardingSteps(clientId) {
  return supabase.from('onboarding_steps').select('id').eq('client_id', clientId).limit(1)
}

/** Insert the default five steps, one week apart starting from startDate. */
export function insertDefaultOnboardingSteps(clientId, startDate) {
  return supabase.from('onboarding_steps').insert(
    DEFAULT_ONBOARDING_STEPS.map((step_label, i) => ({
      client_id: clientId,
      step_order: i,
      step_label,
      due_date: addDays(startDate, i * 7),
    }))
  )
}

export function updateOnboardingStep(id, updates) {
  return supabase.from('onboarding_steps').update(updates).eq('id', id)
}
