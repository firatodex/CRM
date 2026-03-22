import { useState } from 'react'
import { STAGES } from '../stages'
import { todayStr } from '../utils'

export default function AddClientModal({ onSave, onClose, saving }) {
  const [form, setForm] = useState({
    name: '',
    stage: 'lead',
    next_action: '',
    next_action_due: todayStr(),
  })
  const [nameError, setNameError] = useState(false)

  function set(key, val) {
    setForm(f => ({ ...f, [key]: val }))
    if (key === 'name') setNameError(false)
  }

  function handleSave() {
    if (!form.name.trim()) { setNameError(true); return }
    onSave(form)
  }

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-title">Add client</div>
        <div className="callout">
          Fill the essentials now — add full details later by clicking the card.
        </div>

        <div className="field">
          <label>Name *</label>
          <input
            className={nameError ? 'error' : ''}
            value={form.name}
            onChange={e => set('name', e.target.value)}
            placeholder="Full name"
            autoFocus
          />
        </div>

        <div className="field">
          <label>Stage *</label>
          <select value={form.stage} onChange={e => set('stage', e.target.value)}>
            {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
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
            {saving ? 'Saving...' : 'Add client'}
          </button>
        </div>
      </div>
    </div>
  )
}
