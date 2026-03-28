import { useState } from 'react'
import { TEMPERATURES, SOURCES } from '../stages'
import { todayStr } from '../utils'

export default function AddClientModal({ onSave, onClose, saving }) {
  const [form, setForm] = useState({
    name: '',
    phone: '',
    temperature: '',
    source: '',
    company: '',
    business_type: '',
    next_action: '',
    next_action_due: todayStr(),
    potential_revenue: '',
  })
  const [nameError, setNameError] = useState(false)

  function set(key, val) {
    setForm(f => ({ ...f, [key]: val }))
    if (key === 'name') setNameError(false)
  }

  function handleSave() {
    if (!form.name.trim()) { setNameError(true); return }
    onSave({
      ...form,
      potential_revenue: form.potential_revenue ? Number(form.potential_revenue) : null,
    })
  }

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-sm">
        <div className="modal-title">Add lead</div>
        <div className="callout">
          Name is required. Everything else can be filled later.
        </div>

        <div className="field">
          <label>Name *</label>
          <input
            className={nameError ? 'error' : ''}
            value={form.name}
            onChange={e => set('name', e.target.value)}
            placeholder="Person's name"
            autoFocus
          />
        </div>

        <div className="field">
          <label>Phone</label>
          <input
            value={form.phone}
            onChange={e => set('phone', e.target.value)}
            placeholder="Mobile number"
            type="tel"
          />
        </div>

        <div className="field-row">
          <div className="field">
            <label>Temperature</label>
            <select value={form.temperature} onChange={e => set('temperature', e.target.value)}>
              <option value="">—</option>
              {TEMPERATURES.map(t => <option key={t.key} value={t.key}>{t.emoji} {t.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Source</label>
            <select value={form.source} onChange={e => set('source', e.target.value)}>
              <option value="">—</option>
              {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        <div className="field-row">
          <div className="field">
            <label>Company</label>
            <input
              value={form.company}
              onChange={e => set('company', e.target.value)}
              placeholder="Business name"
            />
          </div>
          <div className="field">
            <label>Potential revenue (₹)</label>
            <input
              value={form.potential_revenue}
              onChange={e => set('potential_revenue', e.target.value)}
              placeholder="e.g. 50000"
              type="number"
            />
          </div>
        </div>

        <div className="field">
          <label>Next action</label>
          <input
            value={form.next_action}
            onChange={e => set('next_action', e.target.value)}
            placeholder="What needs to happen next?"
          />
        </div>

        <div className="field">
          <label>Due date</label>
          <input
            type="date"
            value={form.next_action_due}
            onChange={e => set('next_action_due', e.target.value)}
          />
        </div>

        <div className="modal-actions">
          <div className="spacer" />
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Add lead'}
          </button>
        </div>
      </div>
    </div>
  )
}
