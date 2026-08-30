import { useState } from 'react'
import { supabase } from '../supabase'
import { stakeholderMappingSchema } from '../schemas/salesProcessSchemas'

const ROLES = [
  { key: 'economic_buyer', label: 'Economic buyer', color: '#8b5cf6' },
  { key: 'technical_buyer', label: 'Technical buyer', color: '#3b82f6' },
  { key: 'user_champion', label: 'User champion', color: '#10b981' },
  { key: 'influencer', label: 'Influencer', color: '#f59e0b' },
  { key: 'coach', label: 'Coach', color: '#ec4899' },
]

const roleColor = key => ROLES.find(r => r.key === key)?.color || '#999'
const roleLabel = key => ROLES.find(r => r.key === key)?.label || key

// Records every decision-maker on a deal, a visual influence diagram, and
// a single "internal champion" selector. Persists to clients.internal_champion_name
// / internal_champion_identified (per-deal stakeholder detail lives in
// the JSON blob passed to onSaved — wire to a dedicated table if this
// needs to be queried independently later).
export default function StakeholderMappingForm({ client, onSaved }) {
  const [stakeholders, setStakeholders] = useState(client?.stakeholders || [
    { name: '', title: '', role: 'economic_buyer', contact_method: '', last_contact: '' },
  ])
  const [championIndex, setChampionIndex] = useState(
    stakeholders.findIndex(s => s.name && s.name === client?.internal_champion_name)
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function updateStakeholder(idx, patch) {
    setStakeholders(stakeholders.map((s, i) => (i === idx ? { ...s, ...patch } : s)))
  }

  function addStakeholder() {
    setStakeholders([...stakeholders, { name: '', title: '', role: 'influencer', contact_method: '', last_contact: '' }])
  }

  function removeStakeholder(idx) {
    setStakeholders(stakeholders.filter((_, i) => i !== idx))
    if (championIndex === idx) setChampionIndex(-1)
  }

  async function save() {
    setError('')
    const result = stakeholderMappingSchema.safeParse({
      stakeholders,
      internal_champion_name: championIndex >= 0 ? stakeholders[championIndex]?.name : null,
      internal_champion_identified: championIndex >= 0,
    })
    if (!result.success) {
      setError(result.error.issues[0]?.message || 'Invalid stakeholder data')
      return
    }

    setSaving(true)
    try {
      const { error: updateError } = await supabase
        .from('clients')
        .update({
          internal_champion_name: result.data.internal_champion_name,
          internal_champion_identified: result.data.internal_champion_identified,
          primary_contact_role: championIndex >= 0 ? stakeholders[championIndex]?.role : client?.primary_contact_role,
        })
        .eq('id', client.id)
      if (updateError) throw updateError
      onSaved?.(result.data)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ background: 'white', borderRadius: '8px', border: '1px solid #e5e7eb', padding: '20px' }}>
      <h3 style={{ margin: '0 0 16px 0', fontSize: '15px', fontWeight: '700' }}>Stakeholder Mapping</h3>

      {/* Visual influence diagram: one row per role bucket showing named stakeholders */}
      <div style={{ marginBottom: '20px', padding: '16px', background: '#f9fafb', borderRadius: '8px' }}>
        {ROLES.map(role => {
          const inRole = stakeholders.filter(s => s.role === role.key && s.name)
          return (
            <div key={role.key} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <span style={{ width: '130px', fontSize: '11px', fontWeight: '700', color: role.color, textTransform: 'uppercase' }}>{role.label}</span>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {inRole.length === 0
                  ? <span style={{ fontSize: '12px', color: '#ccc' }}>—</span>
                  : inRole.map((s, i) => (
                      <span key={i} style={{ padding: '4px 10px', borderRadius: '999px', background: role.color + '22', color: role.color, fontSize: '12px', fontWeight: '600' }}>
                        {s.name}
                      </span>
                    ))}
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ display: 'grid', gap: '10px', marginBottom: '16px' }}>
        {stakeholders.map((s, idx) => (
          <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto auto', gap: '8px', alignItems: 'center', padding: '10px', border: '1px solid #eee', borderRadius: '6px' }}>
            <input placeholder="Name" value={s.name} onChange={e => updateStakeholder(idx, { name: e.target.value })} style={inputStyle} />
            <input placeholder="Title" value={s.title} onChange={e => updateStakeholder(idx, { title: e.target.value })} style={inputStyle} />
            <select value={s.role} onChange={e => updateStakeholder(idx, { role: e.target.value })} style={inputStyle}>
              {ROLES.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
            </select>
            <input placeholder="Contact method" value={s.contact_method} onChange={e => updateStakeholder(idx, { contact_method: e.target.value })} style={inputStyle} />
            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', whiteSpace: 'nowrap' }}>
              <input type="radio" name="champion" checked={championIndex === idx} onChange={() => setChampionIndex(idx)} />
              Champion
            </label>
            <button type="button" onClick={() => removeStakeholder(idx)} style={{ border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer', fontSize: '16px' }}>×</button>
          </div>
        ))}
      </div>

      <button type="button" onClick={addStakeholder} style={{ marginBottom: '16px', padding: '8px 14px', border: '1px solid #ddd', background: 'white', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>
        + Add stakeholder
      </button>

      {error && <div style={{ color: '#ef4444', fontSize: '12px', marginBottom: '8px' }}>{error}</div>}

      <div>
        <button onClick={save} disabled={saving} style={{ padding: '10px 16px', border: 'none', background: '#007AFF', color: 'white', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' }}>
          {saving ? 'Saving...' : 'Save stakeholder map'}
        </button>
      </div>
    </div>
  )
}

const inputStyle = { padding: '6px 8px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '12px', width: '100%', boxSizing: 'border-box' }
export { roleColor, roleLabel }
