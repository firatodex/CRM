// Pipeline stages shown on the Kanban board
export const PIPELINE_STAGES = [
  { key: 'lead',        label: 'Lead',          color: '#8E8E93' },
  { key: 'contacted',   label: 'Contacted',      color: '#007AFF' },
  { key: 'proposal',    label: 'Proposal sent',  color: '#FF9500' },
  { key: 'final_step',  label: 'Final Step',     color: '#AF52DE' },
]
// Terminal stages (shown in detail modal dropdown, NOT on the board)
export const TERMINAL_STAGES = [
  { key: 'active',    label: 'Active client',  color: '#34C759' },
  { key: 'dead',      label: 'Dead lead',      color: '#FF3B30' },
]
// All stages combined (for dropdowns)
export const ALL_STAGES = [...PIPELINE_STAGES, ...TERMINAL_STAGES]
// Lead temperature options
export const TEMPERATURES = [
  { key: 'hot',  label: 'Hot',  color: '#FF3B30', emoji: '🔥' },
  { key: 'warm', label: 'Warm', color: '#FF9500', emoji: '🌤' },
  { key: 'cold', label: 'Cold', color: '#007AFF', emoji: '❄️' },
]
// Lead source options
export const SOURCES = [
  'Cold call',
  'Referral',
  'JustDial',
  'IndiaMart',
  'LinkedIn',
  'Walk-in',
  'WhatsApp',
  'Website',
  'AKRSP cohort',
  'PM Surya Ghar',
  'Other',
]
// Task types — independent of pipeline stage. A lead can have a task
// without changing where it sits in the funnel.
export const TASK_TYPES = [
  { key: 'demo',      label: 'Demo',           emoji: '🖥️' },
  { key: 'proposal',  label: 'Send proposal',  emoji: '📄' },
  { key: 'reminder',  label: 'Send reminder',  emoji: '🔔' },
  { key: 'call',      label: 'Follow-up call', emoji: '📞' },
  { key: 'custom',    label: 'Custom',         emoji: '✅' },
]
