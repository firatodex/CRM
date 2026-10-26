import { useState, useEffect } from 'react'
import { listLeadContacts, insertLeadContact, updateLeadContact, deleteLeadContact } from '../api/leadContacts'
import { formatPhoneDisplay } from '../utils'

export default function LeadContactsSection({ clientId }) {
  const [contacts, setContacts] = useState([])
  const [adding, setAdding]     = useState(false)
  const [newContact, setNewContact] = useState({ name: '', designation: '', phone: '' })

  useEffect(() => {
    listLeadContacts(clientId).then(({ data }) => setContacts(data || []))
  }, [clientId])

  async function addContact() {
    if (!newContact.name.trim()) return
    const { data } = await insertLeadContact({
      client_id: clientId,
      name: newContact.name.trim(),
      designation: newContact.designation.trim() || null,
      phone: newContact.phone.trim() || null,
    })
    if (data) setContacts(prev => [...prev, data])
    setNewContact({ name: '', designation: '', phone: '' })
    setAdding(false)
  }

  async function deleteContact(id) {
    await deleteLeadContact(id)
    setContacts(prev => prev.filter(c => c.id !== id))
  }

  async function updateContact(id, field, value) {
    await updateLeadContact(id, { [field]: value })
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
