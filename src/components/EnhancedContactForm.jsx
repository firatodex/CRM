import { useState, useRef } from 'react'
import { supabase } from '../supabase'
import CallSummaryTemplate from './CallSummaryTemplate'
import ObjectionPlaybookModal from './ObjectionPlaybookModal'
import { enhancedContactFormSchema } from '../schemas/salesProcessSchemas'

const CONTACT_OUTCOMES = [
  { key: 'call_booked', label: 'Call booked' },
  { key: 'objection_raised', label: 'Objection raised' },
  { key: 'decision_pending', label: 'Decision pending' },
  { key: 'no_interest', label: 'No interest' },
  { key: 'wrong_fit', label: 'Wrong fit' },
  { key: 'needs_info', label: 'Needs info' },
]

const OBJECTION_TYPES = ['price', 'competitor', 'timing', 'need', 'authority', 'budget', 'other']
const METHODS = ['call', 'whatsapp', 'in_person', 'email', 'proposal']

const AUTOSAVE_DELAY_MS = 800

// Replaces the old contact_log form with structured discovery/objection
// fields. Auto-saves the row a moment after each field change (debounced)
// so partial entries aren't lost if the user navigates away mid-call.
export default function EnhancedContactForm({ clientId, existingLogId, onSaved }) {
  const [form, setForm] = useState({
    method: 'call',
    contact_outcome: 'call_booked',
    objection_type: null,
    objection_counter_used: '',
    meeting_commitment_made: false,
    commitment_specificity: '',
    prospect_confirmed: false,
    discovery_completed: false,
    call_summary_json: null,
  })
  const [logId, setLogId] = useState(existingLogId || null)
  const [status, setStatus] = useState('idle') // idle | saving | saved | error
  const [errorMsg, setErrorMsg] = useState('')
  const [showPlaybook, setShowPlaybook] = useState(false)
  const saveTimer = useRef(null)

  function update(patch) {
    const next = { ...form, ...patch }
    setForm(next)
    scheduleAutosave(next)
  }

  function scheduleAutosave(next) {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => save(next), AUTOSAVE_DELAY_MS)
  }

  async function save(dataOverride) {
    const data = dataOverride || form
    const result = enhancedContactFormSchema.safeParse(data)
    if (!result.success) {
      // Don't surface validation errors during autosave for a still-in-progress
      // form — only block the explicit "Save now" action below.
      return
    }

    setStatus('saving')
    try {
      const payload = {
        client_id: clientId,
        method: result.data.method,
        contact_outcome: result.data.contact_outcome,
        objection_type: result.data.objection_type || null,
        objection_counter_used: result.data.objection_counter_used || null,
        meeting_commitment_made: result.data.meeting_commitment_made,
        commitment_specificity: result.data.commitment_specificity || null,
        prospect_confirmed: result.data.prospect_confirmed,
        discovery_completed: result.data.discovery_completed,
        call_summary_json: result.data.call_summary_json || null,
      }

      if (logId) {
        const { error } = await supabase.from('contact_log').update(payload).eq('id', logId)
        if (error) throw error
      } else {
        const { data: inserted, error } = await supabase.from('contact_log').insert(payload).select().single()
        if (error) throw error
        setLogId(inserted.id)
      }
      setStatus('saved')
      onSaved?.(logId, payload)
    } catch (err) {
      console.error('Autosave failed:', err)
      setStatus('error')
      setErrorMsg(err.message)
    }
  }

  function saveNow() {
    const result = enhancedContactFormSchema.safeParse(form)
    if (!result.success) {
      setErrorMsg(result.error.issues[0]?.message || 'Please fix the form')
      setStatus('error')
      return
    }
    setErrorMsg('')
    save(form)
  }

  return (
    <div style={{ background: 'white', borderRadius: '8px', border: '1px solid #e5e7eb', padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '700' }}>Log Contact</h3>
        <AutosaveIndicator status={status} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
        <div>
          <label style={labelStyle}>Method</label>
          <select value={form.method} onChange={e => update({ method: e.target.value })} style={inputStyle}>
            {METHODS.map(m => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Outcome</label>
          <select value={form.contact_outcome} onChange={e => update({ contact_outcome: e.target.value })} style={inputStyle}>
            {CONTACT_OUTCOMES.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </div>
      </div>

      {form.contact_outcome === 'objection_raised' && (
        <div style={{ marginBottom: '12px', padding: '12px', background: '#fffbeb', borderRadius: '8px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px' }}>
            <div>
              <label style={labelStyle}>Objection type</label>
              <select
                value={form.objection_type || ''}
                onChange={e => update({ objection_type: e.target.value || null })}
                style={inputStyle}
              >
                <option value="">Select...</option>
                {OBJECTION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Counter used</label>
                <input value={form.objection_counter_used} onChange={e => update({ objection_counter_used: e.target.value })} style={inputStyle} />
              </div>
              <button type="button" onClick={() => setShowPlaybook(true)} style={{ ...smallButtonStyle, marginBottom: '0' }}>
                Browse playbook
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ marginBottom: '12px' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', marginBottom: '8px' }}>
          <input type="checkbox" checked={form.meeting_commitment_made} onChange={e => update({ meeting_commitment_made: e.target.checked })} />
          Meeting/next-step commitment made
        </label>
        {form.meeting_commitment_made && (
          <>
            <input
              placeholder='Exact next step, e.g. "Call Rajesh Tuesday 10am to review proposal"'
              value={form.commitment_specificity}
              onChange={e => update({ commitment_specificity: e.target.value })}
              style={{ ...inputStyle, marginBottom: '8px' }}
            />
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
              <input type="checkbox" checked={form.prospect_confirmed} onChange={e => update({ prospect_confirmed: e.target.checked })} />
              Prospect confirmed this commitment
            </label>
          </>
        )}
      </div>

      <div style={{ marginBottom: '12px' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', marginBottom: '8px' }}>
          <input type="checkbox" checked={form.discovery_completed} onChange={e => update({ discovery_completed: e.target.checked })} />
          Discovery completed this call
        </label>
        <CallSummaryTemplate value={form.call_summary_json} onChange={v => update({ call_summary_json: v })} />
      </div>

      {status === 'error' && errorMsg && <div style={{ color: '#ef4444', fontSize: '12px', marginBottom: '8px' }}>{errorMsg}</div>}

      <button onClick={saveNow} style={{ padding: '10px 16px', border: 'none', background: '#007AFF', color: 'white', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' }}>
        Save now
      </button>

      {showPlaybook && (
        <ObjectionPlaybookModal
          contactLogId={logId}
          onClose={() => setShowPlaybook(false)}
          onCounterUsed={counter => { update({ objection_counter_used: counter }); setShowPlaybook(false) }}
        />
      )}
    </div>
  )
}

function AutosaveIndicator({ status }) {
  const map = {
    idle: { text: '', color: '#999' },
    saving: { text: 'Saving...', color: '#f59e0b' },
    saved: { text: 'Saved', color: '#10b981' },
    error: { text: 'Save failed', color: '#ef4444' },
  }
  const s = map[status] || map.idle
  if (!s.text) return null
  return <span style={{ fontSize: '12px', color: s.color, fontWeight: '600' }}>{s.text}</span>
}

const labelStyle = { display: 'block', fontSize: '11px', color: '#666', fontWeight: '600', marginBottom: '4px', textTransform: 'uppercase' }
const inputStyle = { width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }
const smallButtonStyle = { padding: '8px 12px', border: '1px solid #ddd', background: 'white', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600', whiteSpace: 'nowrap' }
