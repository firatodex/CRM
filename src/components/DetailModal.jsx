import { useState } from 'react'
import { STAGES } from '../stages'

export default function DetailModal({ client, onSave, onDelete, onClose, saving }) {
  const [form, setForm] = useState({ ...client })

  function set(key, val) {
    setForm(f => ({ ...f, [key]: val }))
  }

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-title">{client.name}</div>

        <div className="field-row">
          <div className="field">
            <label>Name</label>
            <input value={form.name} onChange={e => set('name', e.target.value)} />
          </div>
          <div className="field">
            <label>Stage</label>
            <select value={form.stage} onChange={e => set('stage', e.target.value)}>
              {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>
        </div>

        <div className="section-label">Contact</div>
        <div className="field-row">
          <div className="field">
            <label>Phone</label>
            <input
              value={form.phone || ''}
              onChange={e => set('phone', e.target.value)}
              placeholder="Mobile number"
            />
          </div>
          <div className="field">
            <label>Email</label>
            <input
              value={form.email || ''}
              onChange={e => set('email', e.target.value)}
              placeholder="Email address"
            />
          </div>
        </div>

        <div className="section-label">Business</div>
        <div className="field-row">
          <div className="field">
            <label>Company</label>
            <input
              value={form.company || ''}
              onChange={e => set('company', e.target.value)}
              placeholder="Business name"
            />
          </div>
          <div className="field">
            <label>Business type</label>
            <input
              value={form.business_type || ''}
              onChange={e => set('business_type', e.target.value)}
              placeholder="e.g. FMCG Distributor"
            />
          </div>
        </div>

        <div className="section-label">Next action</div>
        <div className="field">
          <label>What needs to happen?</label>
          <input
            value={form.next_action || ''}
            onChange={e => set('next_action', e.target.value)}
            placeholder="Specific next step"
          />
        </div>
        <div className="field">
          <label>Due date</label>
          <input
            type="date"
            value={form.next_action_due || ''}
            onChange={e => set('next_action_due', e.target.value)}
          />
        </div>

        <div className="section-label">Notes</div>
        <div className="field">
          <label>Conversation history &amp; context</label>
          <textarea
            value={form.notes || ''}
            onChange={e => set('notes', e.target.value)}
            placeholder="What you know, what was discussed, what they care about..."
          />
        </div>

        <div className="modal-actions">
          <button
            className="btn btn-danger btn-sm"
            onClick={() => onDelete(client.id)}
            disabled={saving}
          >
            Delete
          </button>
          <div className="spacer" />
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary"
            onClick={() => onSave(form)}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
