import { useState } from 'react'
import { STAGES } from '../stages'

function waLink(phone) {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  if (!digits) return null
  return `https://wa.me/91${digits}`
}

export default function DetailModal({ client, onSave, onDelete, onClose, saving }) {
  const [form, setForm] = useState({ ...client })

  function set(key, val) {
    setForm(f => ({ ...f, [key]: val }))
  }

  const wa = waLink(client.phone)

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div className="modal-title" style={{ margin: 0 }}>{client.name}</div>
          {wa && (
            <a
              href={wa}
              target="_blank"
              rel="noreferrer"
              className="btn btn-secondary btn-sm"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', textDecoration: 'none', color: '#25D366', borderColor: '#25D366' }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              WhatsApp
            </a>
          )}
        </div>

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
