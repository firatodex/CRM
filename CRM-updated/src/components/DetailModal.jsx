import { useState, useEffect, useRef } from 'react'
import { ALL_STAGES, TEMPERATURES, SOURCES } from '../stages'
import { waLink, formatDateTime, todayStr } from '../utils'

const LOG_METHODS = ['Phone call', 'WhatsApp', 'Email', 'In person', 'LinkedIn']

function quickDate(daysFromNow) {
  const d = new Date()
  d.setDate(d.getDate() + daysFromNow)
  return d.toISOString().split('T')[0]
}

export default function DetailModal({ client, contactLogs, onSave, onDelete, onLogContact, onClose, saving }) {
  const [form, setForm] = useState({ ...client })
  const [logMethod, setLogMethod] = useState('Phone call')
  const [logWhatHappened, setLogWhatHappened] = useState('')
  const [logWhatNext, setLogWhatNext] = useState('')
  const [logDue, setLogDue] = useState('')
  const [showLogForm, setShowLogForm] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)
  const firstInputRef = useRef(null)
  const isFirstEdit = useRef(true)

  function set(key, val) {
    setForm(f => ({ ...f, [key]: val }))
  }

  const wa = waLink(client.phone)
  const emailLink = client.email ? `mailto:${client.email}` : null

  // ⌘S / Ctrl+S shortcut
  useEffect(() => {
    function handleKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [form])

  async function handleSave() {
    let saveForm = { ...form }
    // Auto-advance to Contacted on first save if still in Lead stage
    if (client.stage === 'lead' && saveForm.stage === 'lead' && isFirstEdit.current) {
      saveForm.stage = 'contacted'
      isFirstEdit.current = false
    }
    await onSave(saveForm)
    setSavedFlash(true)
    setTimeout(() => setSavedFlash(false), 1500)
  }

  async function handleLog() {
    if (!logWhatHappened.trim()) return
    const note = logWhatHappened.trim() + (logWhatNext.trim() ? `\n→ Next: ${logWhatNext.trim()}` : '')
    await onLogContact(client.id, logMethod, note)

    // Update next action fields from log form
    const updates = {}
    if (logWhatNext.trim()) updates.next_action = logWhatNext.trim()
    if (logDue) updates.next_action_due = logDue

    // Auto-advance stage if still Lead
    if (form.stage === 'lead') {
      updates.stage = 'contacted'
    }

    if (Object.keys(updates).length > 0) {
      const newForm = { ...form, ...updates }
      setForm(newForm)
      await onSave({ ...client, ...newForm })
    }

    setLogWhatHappened('')
    setLogWhatNext('')
    setLogDue('')
    setShowLogForm(false)
    setSavedFlash(true)
    setTimeout(() => setSavedFlash(false), 1500)
  }

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-lg">
        {/* Header */}
        <div className="detail-header">
          <div>
            <div className="modal-title" style={{ margin: 0 }}>{client.name}</div>
            {client.company && <div className="detail-company">{client.company}</div>}
          </div>
          <div className="detail-header-actions">
            {wa && (
              <a href={wa} target="_blank" rel="noreferrer" className="btn btn-whatsapp btn-sm" onClick={e => e.stopPropagation()}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                WhatsApp
              </a>
            )}
            {emailLink && (
              <a href={emailLink} className="btn btn-secondary btn-sm" onClick={e => e.stopPropagation()}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
                </svg>
                Email
              </a>
            )}
          </div>
        </div>

        {/* Two-column layout */}
        <div className="detail-grid detail-grid-wide">
          {/* Left column: fields */}
          <div className="detail-fields">
            <div className="field-row">
              <div className="field">
                <label>Name</label>
                <input ref={firstInputRef} value={form.name || ''} onChange={e => set('name', e.target.value)} />
              </div>
              <div className="field">
                <label>Stage</label>
                <select value={form.stage} onChange={e => set('stage', e.target.value)}>
                  {ALL_STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </div>
            </div>

            <div className="field-row">
              <div className="field">
                <label>Temperature</label>
                <select value={form.temperature || ''} onChange={e => set('temperature', e.target.value)}>
                  <option value="">—</option>
                  {TEMPERATURES.map(t => <option key={t.key} value={t.key}>{t.emoji} {t.label}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Source</label>
                <select value={form.source || ''} onChange={e => set('source', e.target.value)}>
                  <option value="">—</option>
                  {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            <div className="section-label">Contact</div>
            <div className="field-row">
              <div className="field">
                <label>Phone</label>
                <input value={form.phone || ''} onChange={e => set('phone', e.target.value)} placeholder="Mobile number" />
              </div>
              <div className="field">
                <label>Email</label>
                <input value={form.email || ''} onChange={e => set('email', e.target.value)} placeholder="Email address" />
              </div>
            </div>

            <div className="section-label">Business</div>
            <div className="field-row">
              <div className="field">
                <label>Company</label>
                <input value={form.company || ''} onChange={e => set('company', e.target.value)} placeholder="Business name" />
              </div>
              <div className="field">
                <label>Business type</label>
                <input value={form.business_type || ''} onChange={e => set('business_type', e.target.value)} placeholder="e.g. FMCG Distributor" />
              </div>
            </div>

            <div className="field-row">
              <div className="field">
                <label>Potential revenue (₹)</label>
                <input value={form.potential_revenue || ''} onChange={e => set('potential_revenue', e.target.value)} placeholder="e.g. 50000" type="number" />
              </div>
              <div className="field">
                <label>Website</label>
                <input value={form.website || ''} onChange={e => set('website', e.target.value)} placeholder="https://..." />
              </div>
            </div>

            <div className="field">
              <label>Pain point</label>
              <input value={form.pain_point || ''} onChange={e => set('pain_point', e.target.value)} placeholder="What problem are they trying to solve?" />
            </div>

            <div className="section-label">Notes</div>
            <div className="field">
              <textarea value={form.notes || ''} onChange={e => set('notes', e.target.value)} placeholder="Context, observations, anything relevant..." rows={4} />
            </div>
          </div>

          {/* Right column: contact history — wider */}
          <div className="detail-history detail-history-wide">
            <div className="history-header">
              <span className="section-label" style={{ margin: 0, padding: 0, border: 'none' }}>Contact History</span>
              <button className="btn btn-sm btn-primary" onClick={() => setShowLogForm(!showLogForm)}>
                {showLogForm ? '✕ Cancel' : '+ Log'}
              </button>
            </div>

            {/* Next action summary (moved from left panel) */}
            {(form.next_action || form.next_action_due) && !showLogForm && (
              <div className="next-action-summary">
                <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 3, fontWeight: 500 }}>NEXT ACTION</div>
                {form.next_action && <div style={{ fontSize: 13, color: 'var(--text1)' }}>{form.next_action}</div>}
                {form.next_action_due && (
                  <div style={{ fontSize: 12, color: form.next_action_due < todayStr() ? 'var(--danger)' : 'var(--text2)', marginTop: 2 }}>
                    Due: {new Date(form.next_action_due + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </div>
                )}
              </div>
            )}

            {showLogForm && (
              <div className="log-form log-form-rich">
                <div className="log-method-row">
                  {LOG_METHODS.map(m => (
                    <button
                      key={m}
                      className={`log-method-btn ${logMethod === m ? 'active' : ''}`}
                      onClick={() => setLogMethod(m)}
                    >
                      {m}
                    </button>
                  ))}
                </div>

                <div className="field" style={{ marginTop: 10 }}>
                  <label style={{ fontSize: 12, color: 'var(--text2)' }}>What happened?</label>
                  <textarea
                    value={logWhatHappened}
                    onChange={e => setLogWhatHappened(e.target.value)}
                    placeholder="Describe the conversation, outcome, objections..."
                    rows={3}
                    autoFocus
                  />
                </div>

                <div className="field">
                  <label style={{ fontSize: 12, color: 'var(--text2)' }}>What happens next?</label>
                  <input
                    value={logWhatNext}
                    onChange={e => setLogWhatNext(e.target.value)}
                    placeholder="Specific next step..."
                  />
                </div>

                <div className="field">
                  <label style={{ fontSize: 12, color: 'var(--text2)' }}>Due date</label>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    <button className={`quick-date-btn ${logDue === quickDate(1) ? 'active' : ''}`}
                      onClick={() => setLogDue(quickDate(1))}>Tomorrow</button>
                    <button className={`quick-date-btn ${logDue === quickDate(3) ? 'active' : ''}`}
                      onClick={() => setLogDue(quickDate(3))}>+3 days</button>
                    <button className={`quick-date-btn ${logDue === quickDate(7) ? 'active' : ''}`}
                      onClick={() => setLogDue(quickDate(7))}>+7 days</button>
                    <input
                      type="date"
                      value={logDue}
                      onChange={e => setLogDue(e.target.value)}
                      style={{ flex: 1, minWidth: 120 }}
                    />
                  </div>
                </div>

                <button className="btn btn-primary btn-sm" style={{ marginTop: 4, width: '100%' }} onClick={handleLog}
                  disabled={!logWhatHappened.trim()}>
                  Save Log
                </button>
              </div>
            )}

            <div className="history-list">
              {contactLogs.length === 0 ? (
                <div className="empty-history">No contact history yet</div>
              ) : (
                contactLogs.map(log => {
                  const parts = log.note.split('\n→ Next: ')
                  return (
                    <div key={log.id} className="history-item">
                      <div className="history-method">{log.method}</div>
                      <div className="history-note">{parts[0]}</div>
                      {parts[1] && (
                        <div className="history-next-action">→ {parts[1]}</div>
                      )}
                      <div className="history-time">{formatDateTime(log.contacted_at)}</div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="modal-actions">
          <button className="btn btn-danger btn-sm" onClick={() => onDelete(client.id)} disabled={saving}>
            Delete
          </button>
          <div className="spacer" />
          <span style={{ fontSize: 12, color: 'var(--text2)', opacity: savedFlash ? 1 : 0, transition: 'opacity 0.3s' }}>
            ✓ Saved
          </span>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save'} <span style={{ opacity: 0.6, fontSize: 11 }}>⌘S</span>
          </button>
        </div>
      </div>
    </div>
  )
}
