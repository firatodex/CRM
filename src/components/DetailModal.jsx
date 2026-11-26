import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { ALL_STAGES, TEMPERATURES, SOURCES, TASK_TYPES } from '../stages'
import { waLink, formatDateTime, todayStr, formatPhoneDisplay, samePhone } from '../utils'
import LeadIntelligencePanel, { SmartNoteDumper } from './LeadIntelligencePanel'
import ClientTab from './ClientTab'
import { supabase } from '../supabase'
import { loadTerritory, GUJARAT_DISTRICTS } from '../territoryData'

// ── Phone numbers for a lead: the main number plus other contact people ──────
// Every number gets the same row layout (name · role · number · remove), so the
// columns line up. The last dialed number gets a green edge and one caption below.
const NUMBER_GRID = { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 118px 22px 16px', alignItems: 'center', columnGap: 10 }
const cellInput = { width: '100%', minWidth: 0, border: 'none', background: 'transparent', fontFamily: 'var(--font)', padding: 0 }

// Copies the bare 10-digit number (no spaces / +91) so it pastes cleanly anywhere.
function CopyNumber({ phone }) {
  const [copied, setCopied] = useState(false)
  if (!phone) return <span />
  const copy = async (e) => {
    e.stopPropagation()
    let d = phone.replace(/\D/g, '')
    if (d.length === 12 && d.startsWith('91')) d = d.slice(2)
    else if (d.length === 11 && d.startsWith('0')) d = d.slice(1)
    try { await navigator.clipboard.writeText(d) } catch {
      const t = document.createElement('textarea'); t.value = d; document.body.appendChild(t); t.select()
      document.execCommand('copy'); t.remove()
    }
    setCopied(true); setTimeout(() => setCopied(false), 1200)
  }
  return (
    <button type="button" onClick={copy} title={copied ? 'Copied' : 'Copy number'} aria-label="Copy number"
      style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: copied ? '#16a34a' : 'var(--text-muted)' }}>
      {copied ? (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
      ) : (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
      )}
    </button>
  )
}

function NumberRow({ name, role, phone, dialedLast, onDial, onRemove, editable, onEdit }) {
  return (
    <div style={{
      ...NUMBER_GRID, padding: '7px 10px', borderRadius: 6, marginBottom: 4,
      background: 'var(--bg-light)', border: '1px solid var(--border-light)',
      borderLeft: `3px solid ${dialedLast ? '#16a34a' : 'var(--border-light)'}`,
    }}>
      <div style={{ minWidth: 0, lineHeight: 1.3 }}>
        {editable ? (
          <input value={name} onChange={e => onEdit('name', e.target.value)} placeholder="Name"
            style={{ ...cellInput, display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-dark)' }} />
        ) : (
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-dark)' }}>{name}</div>
        )}
        {editable ? (
          <input value={role} onChange={e => onEdit('designation', e.target.value)} placeholder="Add role"
            style={{ ...cellInput, display: 'block', fontSize: 11, color: 'var(--text-muted)' }} />
        ) : (
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{role}</div>
        )}
      </div>
      {phone ? (
        <a href={`tel:${phone.replace(/\s/g, '')}`} onClick={e => { e.stopPropagation(); onDial?.(phone) }}
          title="Tap to call"
          style={{ fontSize: 13, color: 'var(--primary)', textDecoration: 'none', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', letterSpacing: '0.3px' }}>
          📞 {formatPhoneDisplay(phone)}
        </a>
      ) : editable ? (
        <input value="" onChange={e => onEdit('phone', e.target.value)} placeholder="Phone"
          style={{ ...cellInput, fontSize: 13, color: 'var(--text-body)' }} />
      ) : <span />}
      <CopyNumber phone={phone} />
      {onRemove ? (
        <button onClick={onRemove} title="Remove"
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, padding: 0 }}>×</button>
      ) : <span />}
    </div>
  )
}

function LeadContactsSection({ clientId, mainPhone, onContactsChange, lastDialed, lastDialedLabel, onDial }) {
  const [contacts, setContacts] = useState([])
  const [adding, setAdding]     = useState(false)
  const [newContact, setNewContact] = useState({ name: '', designation: '', phone: '' })

  useEffect(() => {
    supabase.from('lead_contacts').select('*')
      .eq('client_id', clientId).order('created_at')
      .then(({ data }) => setContacts(data || []))
  }, [clientId])

  useEffect(() => { onContactsChange?.(contacts) }, [contacts]) // eslint-disable-line react-hooks/exhaustive-deps

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

  const isLast = phone => !!lastDialed && !!phone && samePhone(lastDialed.dialed_phone, phone)
  const addInput = { width: '100%', minWidth: 0, fontSize: 12, padding: '5px 7px', border: '1px solid var(--border)', borderRadius: 4, fontFamily: 'var(--font)' }

  return (
    <div style={{ marginBottom: 10, width: '100%' }}>
      {mainPhone && (
        <NumberRow name="Main number" role="Primary" phone={mainPhone} dialedLast={isLast(mainPhone)} onDial={onDial} />
      )}
      {contacts.map(c => (
        <NumberRow key={c.id} editable name={c.name} role={c.designation || ''} phone={c.phone}
          dialedLast={isLast(c.phone)} onDial={onDial}
          onEdit={(field, value) => updateContact(c.id, field, value)}
          onRemove={() => deleteContact(c.id)} />
      ))}
      {lastDialed && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', margin: '2px 0 6px 2px' }}>
          <span style={{ color: '#16a34a', fontWeight: 700 }}>▍</span>Last dialed: {lastDialedLabel} · {formatDateTime(lastDialed.contacted_at)}
        </div>
      )}
      {adding ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 1fr) minmax(0, 1.2fr) auto', columnGap: 6, alignItems: 'center', paddingBottom: 4 }}>
          <input autoFocus value={newContact.name} onChange={e => setNewContact(p => ({ ...p, name: e.target.value }))} placeholder="Name *" style={addInput} />
          <input value={newContact.designation} onChange={e => setNewContact(p => ({ ...p, designation: e.target.value }))} placeholder="Role" style={addInput} />
          <input value={newContact.phone} onChange={e => setNewContact(p => ({ ...p, phone: e.target.value }))} placeholder="Phone" style={addInput}
            onKeyDown={e => { if (e.key === 'Enter') addContact(); if (e.key === 'Escape') setAdding(false) }} />
          <div style={{ display: 'flex', gap: 4 }}>
            <button className="btn btn-primary btn-sm" onClick={addContact}>Add</button>
            <button onClick={() => setAdding(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14 }}>×</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)}
          style={{ fontSize: 12, color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0' }}>
          + Add contact person
        </button>
      )}
    </div>
  )
}

// District for the Territory map: blank = taken from PM Surya Ghar portal data.
function DistrictField({ client, value, onChange }) {
  const [territory, setTerritory] = useState(null)
  useEffect(() => { loadTerritory().then(setTerritory).catch(() => {}) }, [])
  const auto = territory?.districtOf?.[client.id]?.how === 'portal' ? territory.districtOf[client.id].district : null
  const district = value || auto
  return (
    <div className="field-row">
      <div className="field">
        <label>District</label>
        <select value={value} onChange={e => onChange(e.target.value)}>
          <option value="">{auto ? `${auto} (from portal)` : 'Not set'}</option>
          {GUJARAT_DISTRICTS.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>
      <div className="field" style={{ justifyContent: 'flex-end' }}>
        {district && territory && (
          <div style={{ fontSize: 12, color: 'var(--text-light)', paddingBottom: 8 }}>
            {(() => {
              const n = Object.entries(territory.districtOf)
                .filter(([id, d]) => id !== client.id && d.district === district && d.stage === 'active').length
              return n > 0
                ? <span><b style={{ color: '#16A34A' }}>{n} active client{n > 1 ? 's' : ''}</b> in {district} · </span>
                : <span>No active clients in {district} yet · </span>
            })()}
            {Number(territory.market[district]?.vendors || 0).toLocaleString('en-IN')} EPCs
          </div>
        )}
      </div>
    </div>
  )
}

// Nearest active clients (km) — names to drop on a call.
function NearbyClients({ client }) {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState(null)
  const [appOnly, setAppOnly] = useState(false)
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    let alive = true
    setRows(null); setError(null)
    supabase.rpc('nearby_clients', { p_client: client.id, p_limit: 8 }).then(({ data, error }) => {
      if (!alive) return
      if (error) setError(error.message); else setRows(data || [])
    })
    return () => { alive = false }
  }, [client.id])

  const isApp = r => r.app_user ?? /crm|opscraft|software|inventory|lms/i.test(r.products || '')
  const list = (rows || []).filter(r => !appOnly || isApp(r)).slice(0, 6)
  const title = c => (c.company || c.name || '').toLowerCase().replace(/\b\w/g, m => m.toUpperCase())
  const km = r => (Number(r.km) < 3 && r.accuracy === 'town') ? 'Same city' : `${r.accuracy === 'town' ? '' : '~'}${r.km} km`
  const pitch = list.slice(0, 3).map(r => `${title(r)} (${r.place})`).join(', ')
  const copyPitch = async () => {
    const text = `EPCs near you like ${pitch} already work with us.`
    try { await navigator.clipboard.writeText(text) } catch { /* ignore */ }
    setCopied(true); setTimeout(() => setCopied(false), 1200)
  }

  if (error) return <div style={{ fontSize: 12, color: 'var(--error)' }}>Couldn’t load nearby clients: {error}</div>
  if (!rows) return <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Finding nearest clients…</div>
  if (rows.length === 0) return (
    <div style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>
      This lead has no location yet. Set its <b>District</b> on the left and save, then reopen.
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto', paddingRight: 2 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 11.5, color: 'var(--text-light)' }}>Nearest Dyzen clients</span>
        <label style={{ fontSize: 11.5, color: 'var(--text-light)', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
          <input type="checkbox" checked={appOnly} onChange={e => setAppOnly(e.target.checked)} style={{ accentColor: 'var(--primary)' }} />
          App users only
        </label>
      </div>

      {list.length > 0 && (
        <div style={{ padding: '10px 12px', background: 'var(--primary-light)', borderRadius: 8, borderLeft: '3px solid var(--primary)' }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--primary)', letterSpacing: '0.5px', textTransform: 'uppercase' }}>Say on the call</div>
          <div style={{ fontSize: 13, color: 'var(--text-dark)', marginTop: 4, lineHeight: 1.45 }}>“EPCs near you like {pitch} already work with us.”</div>
          <button onClick={copyPitch} style={{ marginTop: 6, background: 'none', border: 'none', padding: 0, fontSize: 12, color: copied ? '#16A34A' : 'var(--primary)', cursor: 'pointer', fontWeight: 600 }}>
            {copied ? '✓ Copied' : 'Copy line'}
          </button>
        </div>
      )}
      {list.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No app users found nearby. Untick the filter to see all clients.</div>}

      {list.map((r, i) => (
        <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '22px minmax(0,1fr) auto', gap: 8, alignItems: 'center',
          background: 'var(--bg-white)', border: '1px solid var(--border-light)', borderLeft: `3px solid ${i === 0 ? '#16A34A' : 'var(--border-light)'}`,
          borderRadius: 8, padding: '7px 10px' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textAlign: 'center' }}>{i + 1}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 650, color: 'var(--text-dark)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title(r)}</div>
            <div style={{ fontSize: 11.5, color: 'var(--text-light)', marginTop: 2, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <span>{r.place}{r.won_at && <> · since {new Date(r.won_at).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}</>}</span>
              {isApp(r)
                ? <span style={{ fontSize: 10.5, fontWeight: 700, color: '#16A34A', background: '#E8F9EE', borderRadius: 4, padding: '0 5px' }}>✓ App user</span>
                : <span style={{ fontSize: 10.5, color: 'var(--text-muted)', background: 'var(--bg-light)', borderRadius: 4, padding: '0 5px' }}>{r.products || 'Not marked as app user'}</span>}
            </div>
          </div>
          <span style={{ fontSize: 15, fontWeight: 700, color: i === 0 ? '#16A34A' : 'var(--text-body)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{km(r)}</span>
        </div>
      ))}

      <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>Straight-line distance from town in the PM Surya Ghar address. “~” = district-level estimate.</div>
    </div>
  )
}

const LOG_METHODS = ['Phone call', 'WhatsApp', 'Email', 'In person']

// Which of the lead's numbers was dialed (shown when a lead has more than one number)
function DialedPicker({ numbers, value, onChange }) {
  if (numbers.length < 2) return null
  return (
    <div style={{ marginTop: 10 }}>
      <label style={{ fontSize: 12, color: 'var(--text2)' }}>Number dialed</label>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(numbers.length, 3)}, minmax(0, 1fr))`, gap: 8, marginTop: 6 }}>
        {numbers.map(n => {
          const active = samePhone(value, n.phone)
          return (
            <button key={n.key} type="button" onClick={() => onChange(n.phone)} title={`${n.label} · ${n.phone}`}
              style={{
                textAlign: 'left', padding: '7px 10px', borderRadius: 8, cursor: 'pointer', minWidth: 0,
                border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                background: active ? 'var(--accent)' : 'transparent',
                color: active ? '#fff' : 'var(--text2)', fontFamily: 'var(--font)', transition: 'all 0.15s',
              }}>
              <div style={{ fontSize: 11, opacity: 0.85, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.label}</div>
              <div style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{formatPhoneDisplay(n.phone)}</div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function quickDate(daysFromNow) {
  const d = new Date()
  d.setDate(d.getDate() + daysFromNow)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const RIGHT_TABS = ['Log', 'History', 'Nearby']

function getLastMethod() {
  try { return localStorage.getItem('lastLogMethod') || 'Phone call' } catch { return 'Phone call' }
}

export default function DetailModal({ client, contactLogs, tasks = [], onSave, onPostLogUpdate, onDelete, onLogContact, onClose, saving }) {
  const [form, setForm] = useState({ ...client })
  const [logMethod, setLogMethod] = useState(getLastMethod)
  const [logWhatHappened, setLogWhatHappened] = useState('')
  const [logProgress, setLogProgress] = useState(false)
  const [logWhatNext, setLogWhatNext]         = useState('')
  const [logDue, setLogDue]                   = useState('')
  const [logTime, setLogTime]                  = useState('')
  const [showSmartDump, setShowSmartDump]     = useState(false)
  const [rightTab, setRightTab]               = useState('Log')
  const [savedFlash, setSavedFlash]           = useState(false)
  const [logSavedFlash, setLogSavedFlash]     = useState(false)
  const [saveWarning, setSaveWarning]         = useState(null)
  const [altContacts, setAltContacts]         = useState([])

  // Last number actually dialed for this lead (from the call history)
  const lastDialedLog = useMemo(
    () => [...contactLogs]
      .filter(l => l.dialed_phone)
      .sort((a, b) => String(b.contacted_at).localeCompare(String(a.contacted_at)))[0] || null,
    [contactLogs]
  )
  const dialNumbers = useMemo(() => {
    const list = []
    if (form.phone) list.push({ key: 'main', label: 'Main number', phone: form.phone })
    altContacts.forEach(c => {
      if (c.phone && !list.some(n => samePhone(n.phone, c.phone))) {
        list.push({ key: c.id, label: c.name || c.designation || 'Alternate', phone: c.phone })
      }
    })
    return list
  }, [form.phone, altContacts])
  const [dialedPhone, setDialedPhone] = useState(null)
  // Default to the number dialed last time (if it's still on file), else the main number
  const effectiveDialed = dialedPhone
    || (lastDialedLog && dialNumbers.some(n => samePhone(n.phone, lastDialedLog.dialed_phone)) ? lastDialedLog.dialed_phone : null)
    || form.phone || null
  const lastDialedLabel = lastDialedLog
    ? (dialNumbers.find(n => samePhone(n.phone, lastDialedLog.dialed_phone))?.label || 'removed number')
    : null
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
    'potential_revenue','proposal_value','source','website','pain_point','district',
    'current_solution','objection',
    'discovery_team_size','discovery_monthly_leads','discovery_current_tool',
    'discovery_lost_deals','discovery_decision_maker','discovery_switch_openness',
    'discovery_completed_at'
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
    const hasLog = logWhatHappened.trim().length > 0

    // Build post-log field updates
    const postUpdates = {}
    if (hasLog) {
      postUpdates.last_contacted_at = new Date().toISOString()
      if (logWhatNext.trim()) postUpdates.next_action = logWhatNext.trim()
      if (logDue) postUpdates.next_action_due = logDue
      if (logDue && logTime) postUpdates.next_action_time = logTime
      else if (logDue && !logTime) postUpdates.next_action_time = null
      if (form.stage === 'lead') postUpdates.stage = 'contacted'
    }

    // Merge postUpdates into form so onSave writes everything in ONE DB call.
    // This eliminates the race condition where two separate writes to the same
    // clients row would stomp each other depending on which lands last.
    const mergedForm = hasLog ? { ...form, ...postUpdates } : { ...form }

    // Apply optimistic local update immediately
    if (hasLog) setForm(f => ({ ...f, ...postUpdates }))

    // Run field save + log insert in parallel
    // Field save carries postUpdates merged in so there's only ONE clients write.
    const tasks = []
    if (isDirty || hasLog) tasks.push(onSave(mergedForm))
    if (hasLog) tasks.push(onLogContact(client.id, logMethod, logWhatHappened.trim(), logWhatNext.trim() || null, logProgress,
      logMethod === 'Phone call' ? effectiveDialed : null))

    try {
      await Promise.all(tasks)
    } catch (err) {
      // Surface any error rather than silently dropping it
      console.error('Save failed:', err)
    }

    // Notify parent of post-log updates so it can update local state
    // (stage flip, next action, last_contacted_at) — done AFTER the DB
    // write so the parent refetch doesn't stomp our changes.
    if (hasLog && Object.keys(postUpdates).length > 0) {
      onPostLogUpdate(client.id, postUpdates)
    }

    onClose()
  }, [form, isDirty, logWhatHappened, logWhatNext, logDue, logTime, logMethod, logProgress, effectiveDialed, onSave, onPostLogUpdate, onLogContact, onClose, client])

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
        <div className="history-method">
          {log.method}
          {log.progress && (
            <span
              title="Marked as progress"
              style={{
                marginLeft: 6, fontSize: 10.5, fontWeight: 700, color: '#16a34a',
                background: 'rgba(22,163,74,0.1)', borderRadius: 4, padding: '1px 5px'
              }}
            >
              📈 progress
            </span>
          )}
        </div>
        {log.dialed_phone && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
            📞 {dialNumbers.find(n => samePhone(n.phone, log.dialed_phone))?.label || 'Dialed'} · {formatPhoneDisplay(log.dialed_phone)}
          </div>
        )}
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
              </div>
              <div className="field">
                <label>Email</label>
                <input value={form.email || ''} onChange={e => set('email', e.target.value)} placeholder="Email address" />
              </div>
            </div>

            {/* Additional contacts — other people at this company you may speak to */}
            <LeadContactsSection
              clientId={client.id}
              mainPhone={form.phone}
              onContactsChange={setAltContacts}
              lastDialed={dialNumbers.length > 1 ? lastDialedLog : null}
              lastDialedLabel={lastDialedLabel}
              onDial={setDialedPhone}
            />

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

            <DistrictField client={client} value={form.district || ''} onChange={v => set('district', v)} />

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
              const tabs = ['Log', 'History', 'Nearby', ...(client.stage === 'active' ? ['Client'] : [])]
              
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
                      {tab === 'Nearby' ? '📍 Nearby' : tab}
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
                    <div className="log-method-row" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      {LOG_METHODS.map(m => (
                        <button
                          key={m}
                          className={`log-method-btn ${logMethod === m ? 'active' : ''}`}
                          onClick={() => handleSetLogMethod(m)}
                        >
                          {m}
                        </button>
                      ))}
                      <div
                        onClick={() => setLogProgress(p => !p)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 5, marginLeft: 4,
                          cursor: 'pointer', userSelect: 'none', padding: '3px 0'
                        }}
                      >
                        <div style={{
                          width: 16, height: 16, borderRadius: 4, border: '2px solid',
                          borderColor: logProgress ? '#16a34a' : 'var(--border)',
                          background: logProgress ? '#16a34a' : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                        }}>
                          {logProgress && <span style={{ color: '#fff', fontSize: 11, fontWeight: 900, lineHeight: 1 }}>✓</span>}
                        </div>
                        <span style={{ fontSize: 12.5, fontWeight: 600, color: logProgress ? '#16a34a' : 'var(--text-light)' }}>
                          Progress
                        </span>
                      </div>
                    </div>

                    {logMethod === 'Phone call' && (
                      <DialedPicker numbers={dialNumbers} value={effectiveDialed} onChange={setDialedPhone} />
                    )}

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
                    <div className="log-method-row" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      {LOG_METHODS.map(m => (
                        <button key={m} className={`log-method-btn ${logMethod === m ? 'active' : ''}`} onClick={() => setLogMethod(m)}>{m}</button>
                      ))}
                      <div onClick={() => setLogProgress(p => !p)} style={{ display: 'flex', alignItems: 'center', gap: 5, marginLeft: 4, cursor: 'pointer', userSelect: 'none', padding: '3px 0' }}>
                        <div style={{ width: 16, height: 16, borderRadius: 4, border: '2px solid', borderColor: logProgress ? '#16a34a' : 'var(--border)', background: logProgress ? '#16a34a' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {logProgress && <span style={{ color: '#fff', fontSize: 11, fontWeight: 900, lineHeight: 1 }}>✓</span>}
                        </div>
                        <span style={{ fontSize: 12.5, fontWeight: 600, color: logProgress ? '#16a34a' : 'var(--text-light)' }}>Progress</span>
                      </div>
                    </div>

                    {logMethod === 'Phone call' && (
                      <DialedPicker numbers={dialNumbers} value={effectiveDialed} onChange={setDialedPhone} />
                    )}
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

            {/* Tab: Nearby — nearest active clients, to name on the call */}
            {rightTab === 'Nearby' && <NearbyClients client={client} />}

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
