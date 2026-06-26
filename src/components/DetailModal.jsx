import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { ALL_STAGES, TEMPERATURES, SOURCES, TASK_TYPES } from '../stages'
import { waLink, formatDateTime, todayStr, formatPhoneDisplay } from '../utils'
import LeadIntelligencePanel, { SmartNoteDumper } from './LeadIntelligencePanel'
import ClientTab from './ClientTab'
import { supabase } from '../supabase'

// ── Additional contacts per lead ──────────────────────────────────────────────
function LeadContactsSection({ clientId }) {
  const [contacts, setContacts] = useState([])
  const [adding, setAdding]     = useState(false)
  const [newContact, setNewContact] = useState({ name: '', designation: '', phone: '' })

  useEffect(() => {
    supabase.from('lead_contacts').select('*')
      .eq('client_id', clientId).order('created_at')
      .then(({ data }) => setContacts(data || []))
  }, [clientId])

  async function addContact() {
    if (!newContact.name.trim()) return
    const { data } = await supabase.from('lead_contacts').insert({
      client_id: clientId,
      name: newContact.name.trim(),
      designation: newContact.designation.trim() || null,
      phone: newContact.phone.trim() || null,
    }).select().single()
    if (data) setContacts(prev => [...prev, data])
    setNewContact({ name: '', designation: '', phone: '' })
    setAdding(false)
  }

  async function deleteContact(id) {
    await supabase.from('lead_contacts').delete().eq('id', id)
    setContacts(prev => prev.filter(c => c.id !== id))
  }

  async function updateContact(id, field, value) {
    await supabase.from('lead_contacts').update({ [field]: value }).eq('id', id)
    setContacts(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c))
  }

  return (
    <div style={{ marginBottom: 6 }}>
      {contacts.map(c => (
        <div key={c.id} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '5px 8px', borderRadius: 6, marginBottom: 3,
          background: 'var(--bg-light)', border: '1px solid var(--border-light)',
        }}>
          <input
            value={c.name}
            onChange={e => updateContact(c.id, 'name', e.target.value)}
            placeholder="Name"
            style={{ flex: 2, fontSize: 12, fontWeight: 600, border: 'none', background: 'transparent', fontFamily: 'var(--font)', color: 'var(--text-dark)' }}
          />
          <input
            value={c.designation || ''}
            onChange={e => updateContact(c.id, 'designation', e.target.value)}
            placeholder="Role"
            style={{ flex: 1, fontSize: 11, border: 'none', background: 'transparent', fontFamily: 'var(--font)', color: 'var(--text-muted)' }}
          />
          {c.phone ? (
            <a
              href={`tel:${c.phone.replace(/\s/g, '')}`}
              onClick={e => e.stopPropagation()}
              style={{ flex: 2, fontSize: 12, color: 'var(--primary)', textDecoration: 'none', letterSpacing: '0.3px', fontFamily: 'var(--font)' }}
              title="Tap to call"
            >
              📞 {formatPhoneDisplay(c.phone)}
            </a>
          ) : (
            <input
              value={c.phone || ''}
              onChange={e => updateContact(c.id, 'phone', e.target.value)}
              placeholder="Phone"
              style={{ flex: 2, fontSize: 12, border: 'none', background: 'transparent', fontFamily: 'var(--font)', color: 'var(--text-body)' }}
            />
          )}
          <button onClick={() => deleteContact(c.id)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, padding: '0 2px', flexShrink: 0 }} title="Remove">×</button>
        </div>
      ))}
      {adding ? (
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 4 }}>
          <input
            autoFocus
            value={newContact.name}
            onChange={e => setNewContact(p => ({ ...p, name: e.target.value }))}
            placeholder="Name *"
            style={{ flex: 2, fontSize: 12, padding: '4px 6px', border: '1px solid var(--border)', borderRadius: 4, fontFamily: 'var(--font)' }}
          />
          <input
            value={newContact.designation}
            onChange={e => setNewContact(p => ({ ...p, designation: e.target.value }))}
            placeholder="Role"
            style={{ flex: 1, fontSize: 12, padding: '4px 6px', border: '1px solid var(--border)', borderRadius: 4, fontFamily: 'var(--font)' }}
          />
          <input
            value={newContact.phone}
            onChange={e => setNewContact(p => ({ ...p, phone: e.target.value }))}
            placeholder="Phone"
            style={{ flex: 2, fontSize: 12, padding: '4px 6px', border: '1px solid var(--border)', borderRadius: 4, fontFamily: 'var(--font)' }}
            onKeyDown={e => { if (e.key === 'Enter') addContact(); if (e.key === 'Escape') setAdding(false) }}
          />
          <button className="btn btn-primary btn-sm" onClick={addContact} style={{ flexShrink: 0 }}>Add</button>
          <button onClick={() => setAdding(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, flexShrink: 0 }}>×</button>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          style={{ fontSize: 11, color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0' }}
        >
          + Add contact person
        </button>
      )}
    </div>
  )
}

const LOG_METHODS = ['Phone call', 'WhatsApp', 'Email', 'In person']

function quickDate(daysFromNow) {
  const d = new Date()
  d.setDate(d.getDate() + daysFromNow)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const RIGHT_TABS = ['Log', 'History', 'Discovery']

function getLastMethod() {
  try { return localStorage.getItem('lastLogMethod') || 'Phone call' } catch { return 'Phone call' }
}

export default function DetailModal({ client, contactLogs, tasks = [], onSave, onPostLogUpdate, onDelete, onLogContact, onClose, saving }) {
  const [form, setForm] = useState({ ...client })
  const [logMethod, setLogMethod] = useState(getLastMethod)
  const [logWhatHappened, setLogWhatHappened] = useState('')
  const [logWhatNext, setLogWhatNext]         = useState('')
  const [logDue, setLogDue]                   = useState('')
  const [logTime, setLogTime]                  = useState('')
  const [showSmartDump, setShowSmartDump]     = useState(false)
  const [rightTab, setRightTab]               = useState('Log')
  const [savedFlash, setSavedFlash]           = useState(false)
  const [logSavedFlash, setLogSavedFlash]     = useState(false)
  const [saveWarning, setSaveWarning]         = useState(null)
  const firstInputRef = useRef(null)
  const flashTimerRef = useRef(null)
  const logFlashTimerRef = useRef(null)

  useEffect(() => () => {
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
    if (logFlashTimerRef.current) clearTimeout(logFlashTimerRef.current)
  }, [])

  function showFlash() {
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
    setSavedFlash(true)
    flashTimerRef.current = setTimeout(() => setSavedFlash(false), 2000)
  }

  function showLogFlash() {
    if (logFlashTimerRef.current) clearTimeout(logFlashTimerRef.current)
    setLogSavedFlash(true)
    logFlashTimerRef.current = setTimeout(() => setLogSavedFlash(false), 1000)
  }

  function handleSetLogMethod(m) {
    setLogMethod(m)
    try { localStorage.setItem('lastLogMethod', m) } catch {}
  }

  const EDITABLE_FIELDS = [
    'name','stage','phone','email','company','business_type',
    'next_action','next_action_due','next_action_time','notes','temperature',
    'potential_revenue','proposal_value','source','website','pain_point',
    'current_solution','objection'
  ]
  const isDirty = useMemo(() => EDITABLE_FIELDS.some(k => {
    const a = form[k] == null ? '' : String(form[k])
    const b = client[k] == null ? '' : String(client[k])
    return a !== b
  }), [form, client])

  const hasLog = logWhatHappened.trim().length > 0

  function set(key, val) { setForm(f => ({ ...f, [key]: val })) }

  const wa        = waLink(client.phone)
  const emailLink = client.email ? `mailto:${client.email}` : null

  // Unified save: saves contact fields + log entry (if What happened has text)
  const handleSave = useCallback(async () => {
    // 1. Save contact fields — but only if something actually changed.
    // This matters for offline use: the most common offline action is
    // logging a call on an unedited lead, and that should never be
    // blocked by an unnecessary write of unchanged data.
    //
    // If a field WAS edited and we're offline, this save isn't queued
    // (full-edit offline support is out of scope for now) and will fail —
    // but it's wrapped here so that failure doesn't also swallow the log
    // entry below, which IS offline-safe and shouldn't be lost just
    // because an unrelated field edit couldn't reach the network.
    let fieldSaveFailed = false
    const hasLog = logWhatHappened.trim().length > 0

    // Build postLog updates upfront so we can merge last_contacted_at in
    // and fire everything in parallel rather than sequentially.
    const postUpdates = {}
    if (hasLog) {
      postUpdates.last_contacted_at = new Date().toISOString()
      if (logWhatNext.trim()) postUpdates.next_action = logWhatNext.trim()
      if (logDue) postUpdates.next_action_due = logDue
      if (logDue && logTime) postUpdates.next_action_time = logTime
      else if (logDue && !logTime) postUpdates.next_action_time = null
      if (form.stage === 'lead') postUpdates.stage = 'contacted'
    }

    // Run field save + log insert in parallel — cuts round trips from 4 → 2
    const tasks = []
    if (isDirty) {
      tasks.push(
        onSave({ ...form }).catch(err => { fieldSaveFailed = true })
      )
    }
    if (hasLog) {
      tasks.push(
        onLogContact(client.id, logMethod, logWhatHappened.trim(), logWhatNext.trim() || null)
      )
    }
    if (tasks.length > 0) await Promise.all(tasks)

    // Single client UPDATE for all post-log field changes (stage, next action, last_contacted_at)
    if (hasLog) {
      if (Object.keys(postUpdates).length > 0) {
        setForm(f => ({ ...f, ...postUpdates }))
        await onPostLogUpdate(client.id, postUpdates)
      }
      setLogWhatHappened('')
      setLogWhatNext('')
      setLogDue('')
      setLogTime('')
      setRightTab('History')
      showLogFlash()
    }

    showFlash()

    if (fieldSaveFailed) {
      setSaveWarning("Field changes couldn't be saved (offline) — but the call log was saved. Reopen this lead once you're back online to retry the field edit.")
    } else {
      onClose()
    }
  }, [form, isDirty, logWhatHappened, logWhatNext, logDue, logTime, logMethod, onSave, onPostLogUpdate, onLogContact, onClose, client])

  useEffect(() => {
    function handleKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); handleSave() }
      if (e.key === 'Escape') {
        if (isDirty || hasLog) { if (window.confirm('You have unsaved changes. Close anyway?')) onClose() }
        else onClose()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [handleSave, isDirty, hasLog, onClose])

  function handleBackdropClick(e) {
    if (e.target !== e.currentTarget) return
    if (isDirty || hasLog) { if (window.confirm('You have unsaved changes. Close anyway?')) onClose() }
    else onClose()
  }

  function handleAIApply({ whatHappened, whatNext, dueDate, stage, temperature, painPoint }) {
    setLogWhatHappened(whatHappened || '')
    setLogWhatNext(whatNext || '')
    setLogDue(dueDate || '')
    setShowSmartDump(false)
    if (stage)       set('stage', stage)
    if (temperature) set('temperature', temperature)
    if (painPoint)   set('pain_point', painPoint)
    setRightTab('Log')
  }

  function renderLogEntry(log) {
    let whatHappened, whatNext
    if (log.note_what_happened != null) {
      whatHappened = log.note_what_happened
      whatNext     = log.note_what_next
    } else if (log.note) {
      const parts  = log.note.split('\n→ Next: ')
      whatHappened = parts[0]
      whatNext     = parts[1] || null
    }
    return (
      <div key={log.id} className="history-item">
        <div className="history-method">{log.method}</div>
        {whatHappened && <div className="history-note">{whatHappened}</div>}
        {whatNext && <div className="history-next-action">→ {whatNext}</div>}
        <div className="history-time">{formatDateTime(log.contacted_at)}</div>
      </div>
    )
  }

  // Save button label changes based on what will happen
  const saveLabel = saving
    ? 'Saving...'
    : hasLog
      ? 'Save + Log'
      : 'Save'

  return (
    <div className="overlay" onClick={handleBackdropClick}>
      <div className="modal modal-lg">

        {/* Header */}
        <div className="detail-header">
          <div>
            <div className="modal-title" style={{ margin: 0 }}>{client.name}</div>
            {client.company && <div className="detail-company">{client.company}</div>}
          </div>
          <div className="detail-header-actions">
            {wa && (
              <button
                className="btn btn-whatsapp btn-sm"
                onClick={e => { e.stopPropagation(); window.open(wa, 'whatsapp') }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                WhatsApp
              </button>
            )}
            {emailLink && (
              <a href={emailLink} className="btn btn-email btn-sm" onClick={e => e.stopPropagation()}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="4" width="20" height="16" rx="2"/>
                  <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
                </svg>
                Email
              </a>
            )}
          </div>
        </div>

        {/* Two-column grid */}
        <div className="detail-grid detail-grid-wide">

          {/* Left: fields */}
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
                {form.phone && (
                  <a
                    href={`tel:${form.phone.replace(/\s/g, '')}`}
                    style={{ display: 'block', fontSize: 13, color: 'var(--text2)', marginTop: 4, textDecoration: 'none', letterSpacing: '0.5px' }}
                  >
                    📞 {formatPhoneDisplay(form.phone)}
                  </a>
                )}
              </div>
              <div className="field">
                <label>Email</label>
                <input value={form.email || ''} onChange={e => set('email', e.target.value)} placeholder="Email address" />
              </div>
            </div>

            {/* Additional contacts — other people at this company you may speak to */}
            <LeadContactsSection clientId={client.id} />

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

            <div className="section-label">Strategy</div>
            {form.stage === 'proposal' && (
              <div className="field">
                <label>Proposal value (₹)</label>
                <input
                  type="number"
                  value={form.proposal_value || ''}
                  onChange={e => set('proposal_value', e.target.value ? Number(e.target.value) : null)}
                  placeholder="Amount quoted in proposal"
                />
              </div>
            )}
            <div className="field">
              <label>Pain point</label>
              <input value={form.pain_point || ''} onChange={e => set('pain_point', e.target.value)} placeholder="What problem are they trying to solve?" />
            </div>
            <div className="field">
              <label>Current solution</label>
              <input value={form.current_solution || ''} onChange={e => set('current_solution', e.target.value)} placeholder="What CRM / tool are they using now?" />
            </div>
            <div className="field">
              <label>Main objection</label>
              <input value={form.objection || ''} onChange={e => set('objection', e.target.value)} placeholder="Price too high, needs approval, etc." />
            </div>

            <div className="section-label">Notes</div>
            <div className="field">
              <textarea value={form.notes || ''} onChange={e => set('notes', e.target.value)} placeholder="Context, observations, address, city, anything relevant..." rows={4} />
            </div>
          </div>

          {/* Right: tabbed panel */}
          <div className="detail-history detail-history-wide" style={{ position: 'relative' }}>

            {/* Log saved flash */}
            {logSavedFlash && (
              <div style={{
                position: 'absolute', top: 8, left: 0, right: 0,
                background: 'var(--success)', color: '#fff',
                fontSize: 12, fontWeight: 600, textAlign: 'center',
                padding: '6px', borderRadius: 6, zIndex: 10,
                animation: 'fadeOut 1s forwards',
              }}>
                ✓ Logged
              </div>
            )}

            {/* Field-save-failed warning — persists until dismissed, since it's
                important enough that it shouldn't auto-fade like the success flash */}
            {saveWarning && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: 'var(--warning-bg)', color: 'var(--warning)',
                fontSize: 12, fontWeight: 600,
                padding: '8px 10px', borderRadius: 6, marginBottom: 10,
              }}>
                <span style={{ flex: 1 }}>⚠ {saveWarning}</span>
                <button onClick={() => setSaveWarning(null)} style={{ background: 'none', border: 'none', color: 'var(--warning)', cursor: 'pointer', fontWeight: 700 }}>×</button>
              </div>
            )}

            {/* Tab bar */}
            {(() => {
              const tabs = ['Log', 'History', 'Discovery', ...(client.stage === 'active' ? ['Client'] : [])]
              return (
                <div style={{ display: 'flex', gap: 2, marginBottom: 12, background: 'var(--bg-light)', borderRadius: 8, padding: 3, flexShrink: 0 }}>
                  {tabs.map(tab => (
                    <button
                      key={tab}
                      onClick={() => setRightTab(tab)}
                      style={{
                        flex: 1, padding: '5px 0', fontSize: 12, fontWeight: 600,
                        border: 'none', borderRadius: 6, cursor: 'pointer',
                        background: rightTab === tab ? 'var(--bg-white)' : 'transparent',
                        color: rightTab === tab ? 'var(--primary)' : 'var(--text-light)',
                        boxShadow: rightTab === tab ? 'var(--shadow-sm)' : 'none',
                        transition: 'all 0.15s',
                      }}
                    >
                      {tab === 'Discovery' ? '📋 Discovery' : tab}
                      {tab === 'History' && contactLogs.length > 0 && (
                        <span style={{
                          marginLeft: 4, fontSize: 10, background: 'var(--border-light)',
                      color: 'var(--text-muted)', borderRadius: 10, padding: '0 5px',
                    }}>
                      {contactLogs.length}
                    </span>
                  )}
                </button>
              ))}
            </div>
              )
            })()}

            {/* Tab: Log */}
            {rightTab === 'Log' && (
              <div style={{ overflowY: 'auto', flex: 1, minHeight: 0, paddingRight: 2 }}>
                {(form.next_action || form.next_action_due) && (
                  <div className="next-action-summary" style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 3, fontWeight: 500 }}>NEXT ACTION</div>
                    {form.next_action && <div style={{ fontSize: 13, color: 'var(--text1)' }}>{form.next_action}</div>}
                    {form.next_action_due && (
                      <div style={{ fontSize: 12, color: form.next_action_due < todayStr() ? 'var(--danger)' : 'var(--text2)', marginTop: 2 }}>
                        Due: {new Date(form.next_action_due + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        {form.next_action_time && <span style={{ marginLeft: 6, fontWeight: 600 }}>@ {form.next_action_time}</span>}
                      </div>
                    )}
                  </div>
                )}

                {/* Read-only view of tasks attached to this lead — created/managed from the Tasks tab */}
                {tasks.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4, fontWeight: 500 }}>OPEN TASKS</div>
                    {tasks.map(t => {
                      const info = TASK_TYPES.find(tt => tt.key === t.task_type) || TASK_TYPES[TASK_TYPES.length - 1]
                      return (
                        <div key={t.id} style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          fontSize: 12, padding: '5px 8px', marginBottom: 4,
                          background: 'var(--bg-light)', borderRadius: 6,
                        }}>
                          <span>{info.emoji}</span>
                          <span style={{ flex: 1 }}>
                            {info.label}{t.note ? ` — ${t.note}` : ''}
                          </span>
                          <span style={{ color: 'var(--text-muted)' }}>
                            {new Date(t.due_date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                            {t.due_time && ` @ ${t.due_time}`}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                  <button
                    onClick={() => setShowSmartDump(false)}
                    style={{
                      flex: 1, padding: '6px 0', fontSize: 12, fontWeight: 600,
                      border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer',
                      background: !showSmartDump ? 'var(--primary)' : 'transparent',
                      color: !showSmartDump ? '#fff' : 'var(--text-light)',
                    }}
                  >
                    Manual log
                  </button>
                  <button
                    onClick={() => setShowSmartDump(true)}
                    style={{
                      flex: 1, padding: '6px 0', fontSize: 12, fontWeight: 600,
                      border: '1px solid var(--primary)', borderRadius: 6, cursor: 'pointer',
                      background: showSmartDump ? 'var(--primary)' : 'transparent',
                      color: showSmartDump ? '#fff' : 'var(--primary)',
                    }}
                  >
                    ✦ AI parse
                  </button>
                </div>

                {showSmartDump && (
                  <SmartNoteDumper
                    client={client}
                    contactLogs={contactLogs}
                    onApply={handleAIApply}
                  />
                )}

                {!showSmartDump && (
                  <div className="log-form log-form-rich">
                    <div className="log-method-row">
                      {LOG_METHODS.map(m => (
                        <button
                          key={m}
                          className={`log-method-btn ${logMethod === m ? 'active' : ''}`}
                          onClick={() => handleSetLogMethod(m)}
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
                      />
                    </div>

                    <div className="field">
                      <label style={{ fontSize: 12, color: 'var(--text2)' }}>What happens next?</label>
                      <input
                        value={logWhatNext}
                        onChange={e => setLogWhatNext(e.target.value)}
                        placeholder="Specific next step..."
                      />
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
                        Updates the card's next action when saved
                      </div>
                    </div>

                    <div className="field">
                      <label style={{ fontSize: 12, color: 'var(--text2)' }}>Due date</label>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                        <button className={`quick-date-btn ${logDue === quickDate(0) ? 'active' : ''}`} onClick={() => setLogDue(quickDate(0))}>Today</button>
                        <button className={`quick-date-btn ${logDue === quickDate(1) ? 'active' : ''}`} onClick={() => setLogDue(quickDate(1))}>Tomorrow</button>
                        <button className={`quick-date-btn ${logDue === quickDate(7) ? 'active' : ''}`} onClick={() => setLogDue(quickDate(7))}>+7 days</button>
                        <input type="date" value={logDue} onChange={e => setLogDue(e.target.value)} style={{ flex: 1, minWidth: 120 }} />
                        {logDue && (
                          <input
                            type="time"
                            value={logTime}
                            onChange={e => setLogTime(e.target.value)}
                            title="Optional call time — leave blank for anytime"
                            style={{ fontSize: 12, padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 'var(--radius-xs)', fontFamily: 'var(--font)', minWidth: 100 }}
                          />
                        )}
                        {logTime && <button onClick={() => setLogTime('')} title="Clear time" style={{ fontSize: 11, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0 }}>✕</button>}
                      </div>
                      {logDue && !logTime && (
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>Time is optional — leave blank for anytime</div>
                      )}
                    </div>

                    {/* No separate Save Log button — the footer Save handles everything */}
                    {hasLog && (
                      <div style={{ fontSize: 11, color: 'var(--primary)', marginTop: 6, fontWeight: 500 }}>
                        ↓ Click Save to save fields + log this interaction
                      </div>
                    )}
                  </div>
                )}

                {showSmartDump && logWhatHappened && (
                  <div className="log-form log-form-rich" style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--primary)', marginBottom: 8 }}>
                      ✦ AI-filled — review and save
                    </div>
                    <div className="log-method-row">
                      {LOG_METHODS.map(m => (
                        <button key={m} className={`log-method-btn ${logMethod === m ? 'active' : ''}`} onClick={() => setLogMethod(m)}>{m}</button>
                      ))}
                    </div>
                    <div className="field" style={{ marginTop: 8 }}>
                      <label style={{ fontSize: 12, color: 'var(--text2)' }}>What happened?</label>
                      <textarea value={logWhatHappened} onChange={e => setLogWhatHappened(e.target.value)} rows={3} />
                    </div>
                    <div className="field">
                      <label style={{ fontSize: 12, color: 'var(--text2)' }}>What happens next?</label>
                      <input value={logWhatNext} onChange={e => setLogWhatNext(e.target.value)} />
                    </div>
                    <div className="field">
                      <label style={{ fontSize: 12, color: 'var(--text2)' }}>Due date</label>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                        <button className={`quick-date-btn ${logDue === quickDate(0) ? 'active' : ''}`} onClick={() => setLogDue(quickDate(0))}>Today</button>
                        <button className={`quick-date-btn ${logDue === quickDate(1) ? 'active' : ''}`} onClick={() => setLogDue(quickDate(1))}>Tomorrow</button>
                        <button className={`quick-date-btn ${logDue === quickDate(7) ? 'active' : ''}`} onClick={() => setLogDue(quickDate(7))}>+7 days</button>
                        <input type="date" value={logDue} onChange={e => setLogDue(e.target.value)} style={{ flex: 1, minWidth: 120 }} />
                        {logDue && (
                          <input
                            type="time"
                            value={logTime}
                            onChange={e => setLogTime(e.target.value)}
                            title="Optional call time — leave blank for anytime"
                            style={{ fontSize: 12, padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 'var(--radius-xs)', fontFamily: 'var(--font)', minWidth: 100 }}
                          />
                        )}
                        {logTime && <button onClick={() => setLogTime('')} title="Clear time" style={{ fontSize: 11, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0 }}>✕</button>}
                      </div>
                      {logDue && !logTime && (
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>Time is optional — leave blank for anytime</div>
                      )}
                    </div>
                    {hasLog && (
                      <div style={{ fontSize: 11, color: 'var(--primary)', marginTop: 6, fontWeight: 500 }}>
                        ↓ Click Save to save fields + log this interaction
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Tab: History */}
            {rightTab === 'History' && (
              <div className="history-list">
                {contactLogs.length === 0 ? (
                  <div className="empty-history">No contact history yet</div>
                ) : (
                  contactLogs.map(log => renderLogEntry(log))
                )}
              </div>
            )}

            {/* Tab: Discovery */}
            {rightTab === 'Discovery' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto', paddingRight: 2 }}>
                {form.discovery_completed_at ? (
                  <div style={{ fontSize: 11, color: 'var(--success)', fontWeight: 600, background: '#f0fdf4', borderRadius: 6, padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: 4, alignSelf: 'flex-start' }}>
                    ✓ Discovery completed {new Date(form.discovery_completed_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                  </div>
                ) : (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>Fill this during or right after the first call</div>
                )}

                {[
                  { key: 'discovery_team_size', label: 'Sales Team Size', opts: [['just_me','Just me'],['2_5','2–5 people'],['5_10','5–10 people'],['10_plus','10+ people']] },
                  { key: 'discovery_monthly_leads', label: 'Monthly Leads Volume', opts: [['lt_20','Less than 20'],['20_50','20–50'],['50_100','50–100'],['100_plus','100+']] },
                  { key: 'discovery_current_tool', label: 'Current Tool', opts: [['nothing','Nothing / Memory'],['whatsapp','WhatsApp only'],['excel','Excel / Sheets'],['other_crm','Another CRM'],['mix','Mix of tools']] },
                ].map(({ key, label, opts }) => (
                  <div key={key}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</label>
                    <select value={form[key] || ''} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                      style={{ width: '100%', marginTop: 4, padding: '7px 10px', borderRadius: 7, border: '1.5px solid var(--border)', fontSize: 13, background: 'var(--bg-white)', color: 'var(--text)' }}>
                      <option value=''>Select...</option>
                      {opts.map(([val, lbl]) => <option key={val} value={val}>{lbl}</option>)}
                    </select>
                  </div>
                ))}

                {[
                  { key: 'discovery_lost_deals', label: 'Lost Deal Due to Missed Follow-up?', opts: [['yes','Yes'],['no','No'],['not_sure','Not sure']] },
                  { key: 'discovery_decision_maker', label: 'Are They the Decision Maker?', opts: [['yes','Yes'],['no','No'],['partially','Partially']] },
                  { key: 'discovery_switch_openness', label: 'Open to Switching?', opts: [['hot','🔥 Hot'],['warm','🌤 Warm'],['cold','❄️ Cold']] },
                ].map(({ key, label, opts }) => (
                  <div key={key}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</label>
                    <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                      {opts.map(([val, lbl]) => (
                        <button key={val} onClick={() => setForm(f => ({ ...f, [key]: val }))}
                          style={{ flex: 1, padding: '7px 0', borderRadius: 7, border: '1.5px solid', fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
                            borderColor: form[key] === val ? 'var(--primary)' : 'var(--border)',
                            background: form[key] === val ? 'var(--primary)' : 'var(--bg-white)',
                            color: form[key] === val ? '#fff' : 'var(--text-light)' }}>
                          {lbl}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}

                <button
                  onClick={() => setForm(f => ({ ...f, discovery_completed_at: f.discovery_completed_at ? null : new Date().toISOString() }))}
                  style={{ marginTop: 4, padding: '9px 0', borderRadius: 8, border: '1.5px solid', fontSize: 13, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s',
                    borderColor: form.discovery_completed_at ? 'var(--border)' : 'var(--primary)',
                    background: form.discovery_completed_at ? 'var(--bg-light)' : 'var(--primary)',
                    color: form.discovery_completed_at ? 'var(--text-muted)' : '#fff' }}>
                  {form.discovery_completed_at ? 'Undo — Mark Incomplete' : '✓ Mark Discovery Complete'}
                </button>
              </div>
            )}

            {rightTab === 'Client' && (
              <ClientTab client={client} />
            )}
          </div>
        </div>

        {/* Footer — single Save button handles everything */}
        <div className="modal-actions">
          <button className="btn btn-danger btn-sm" onClick={() => onDelete(client.id)} disabled={saving}>
            Delete
          </button>
          <div className="spacer" />
          <span style={{ fontSize: 12, color: 'var(--success)', opacity: savedFlash ? 1 : 0, transition: 'opacity 0.3s' }}>
            ✓ Saved
          </span>
          <button className="btn btn-secondary" onClick={() => {
            if (isDirty || hasLog) { if (window.confirm('You have unsaved changes. Close anyway?')) onClose() }
            else onClose()
          }}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saveLabel} <span style={{ opacity: 0.6, fontSize: 11 }}>⌘S</span>
          </button>
        </div>
      </div>
    </div>
  )
}
