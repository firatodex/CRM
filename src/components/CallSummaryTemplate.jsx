import { useState } from 'react'

const DISCOVERY_QUESTIONS = [
  { key: 'problem_identified', label: 'Problem identified?' },
  { key: 'current_process', label: 'Current process documented?' },
  { key: 'pain_points', label: 'Pain points discovered?' },
  { key: 'budget_indication', label: 'Budget indication given?' },
  { key: 'next_step', label: 'Next step agreed?' },
]

// Structured form that fills contact_log.call_summary_json. Rendered inline
// inside EnhancedContactForm, but usable standalone too.
export default function CallSummaryTemplate({ value, onChange }) {
  const summary = value || {
    problem_identified: '',
    current_process: '',
    stakeholders: [],
    pain_points: '',
    lost_deals_per_month: '',
    budget_indication: '',
    next_step: '',
    objections: [],
  }
  const [stakeholderInput, setStakeholderInput] = useState('')
  const [objectionInput, setObjectionInput] = useState('')

  function set(field, val) {
    onChange({ ...summary, [field]: val })
  }

  function addStakeholder() {
    if (!stakeholderInput.trim()) return
    set('stakeholders', [...(summary.stakeholders || []), stakeholderInput.trim()])
    setStakeholderInput('')
  }

  function removeStakeholder(idx) {
    set('stakeholders', summary.stakeholders.filter((_, i) => i !== idx))
  }

  function addObjection() {
    if (!objectionInput.trim()) return
    set('objections', [...(summary.objections || []), objectionInput.trim()])
    setObjectionInput('')
  }

  function removeObjection(idx) {
    set('objections', summary.objections.filter((_, i) => i !== idx))
  }

  const answeredCount = DISCOVERY_QUESTIONS.filter(q => !!summary[q.key]).length

  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '16px', background: '#f9fafb' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <h4 style={{ margin: 0, fontSize: '13px', fontWeight: '700' }}>Call Summary</h4>
        <span style={{ fontSize: '12px', color: answeredCount === DISCOVERY_QUESTIONS.length ? '#10b981' : '#f59e0b', fontWeight: '600' }}>
          {answeredCount}/{DISCOVERY_QUESTIONS.length} discovery questions answered
        </span>
      </div>

      <div style={{ display: 'grid', gap: '4px', marginBottom: '12px' }}>
        {DISCOVERY_QUESTIONS.map(q => (
          <label key={q.key} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: summary[q.key] ? '#10b981' : '#999' }}>
            <input type="checkbox" checked={!!summary[q.key]} readOnly />
            {q.label}
          </label>
        ))}
      </div>

      <FieldText label="Problem identified" value={summary.problem_identified} onChange={v => set('problem_identified', v)} />
      <FieldText label="Current process" value={summary.current_process} onChange={v => set('current_process', v)} />
      <FieldText label="Pain points discovered" value={summary.pain_points} onChange={v => set('pain_points', v)} multiline />

      <div style={{ marginBottom: '10px' }}>
        <label style={fieldLabelStyle}>Stakeholders identified</label>
        <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
          <input
            value={stakeholderInput}
            onChange={e => setStakeholderInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addStakeholder())}
            placeholder="Add a name..."
            style={{ ...fieldInputStyle, flex: 1 }}
          />
          <button type="button" onClick={addStakeholder} style={smallButtonStyle}>Add</button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {(summary.stakeholders || []).map((s, i) => (
            <span key={i} style={chipStyle}>
              {s} <button type="button" onClick={() => removeStakeholder(i)} style={chipRemoveStyle}>×</button>
            </span>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
        <div>
          <label style={fieldLabelStyle}>Lost deals per month</label>
          <input
            type="number" min="0" value={summary.lost_deals_per_month}
            onChange={e => set('lost_deals_per_month', e.target.value === '' ? '' : Number(e.target.value))}
            style={fieldInputStyle}
          />
        </div>
        <div>
          <label style={fieldLabelStyle}>Budget indication</label>
          <input
            value={summary.budget_indication}
            onChange={e => set('budget_indication', e.target.value)}
            style={fieldInputStyle}
          />
        </div>
      </div>

      <FieldText label="Next step" value={summary.next_step} onChange={v => set('next_step', v)} />

      <div>
        <label style={fieldLabelStyle}>Objections raised</label>
        <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
          <input
            value={objectionInput}
            onChange={e => setObjectionInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addObjection())}
            placeholder="Add an objection..."
            style={{ ...fieldInputStyle, flex: 1 }}
          />
          <button type="button" onClick={addObjection} style={smallButtonStyle}>Add</button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {(summary.objections || []).map((o, i) => (
            <span key={i} style={{ ...chipStyle, background: '#fef3c7', color: '#92400e' }}>
              {o} <button type="button" onClick={() => removeObjection(i)} style={chipRemoveStyle}>×</button>
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

function FieldText({ label, value, onChange, multiline }) {
  return (
    <div style={{ marginBottom: '10px' }}>
      <label style={fieldLabelStyle}>{label}</label>
      {multiline ? (
        <textarea value={value || ''} onChange={e => onChange(e.target.value)} style={{ ...fieldInputStyle, minHeight: '60px' }} />
      ) : (
        <input value={value || ''} onChange={e => onChange(e.target.value)} style={fieldInputStyle} />
      )}
    </div>
  )
}

const fieldLabelStyle = { display: 'block', fontSize: '11px', color: '#666', fontWeight: '600', marginBottom: '4px', textTransform: 'uppercase' }
const fieldInputStyle = { width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }
const smallButtonStyle = { padding: '8px 12px', border: '1px solid #ddd', background: 'white', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }
const chipStyle = { display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 8px', background: '#e0f2fe', color: '#075985', borderRadius: '999px', fontSize: '12px' }
const chipRemoveStyle = { border: 'none', background: 'transparent', cursor: 'pointer', fontWeight: '700', color: 'inherit', padding: 0, lineHeight: 1 }
