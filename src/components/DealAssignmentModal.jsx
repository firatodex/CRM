import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'

export default function DealAssignmentModal({ deal, onClose, onAssign }) {
  const [users, setUsers] = useState([])
  const [selectedDealOwner, setSelectedDealOwner] = useState(deal?.deal_owner_id || '')
  const [selectedDeliveryOwner, setSelectedDeliveryOwner] = useState(deal?.delivery_owner_id || '')
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadUsers()
  }, [])

  async function loadUsers() {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, name, role, department')
        .eq('is_active', true)
        .order('name', { ascending: true })
      
      if (error) throw error
      setUsers(data || [])
    } catch (err) {
      console.error('Error loading users:', err)
    }
  }

  async function handleAssign() {
    if (!selectedDealOwner && !selectedDeliveryOwner) {
      alert('Please select at least one owner')
      return
    }

    setLoading(true)
    try {
      const updates = {}
      
      if (selectedDealOwner && selectedDealOwner !== deal?.deal_owner_id) {
        updates.deal_owner_id = selectedDealOwner
        updates.deal_assigned_at = new Date().toISOString()
      }
      
      if (selectedDeliveryOwner && selectedDeliveryOwner !== deal?.delivery_owner_id) {
        updates.delivery_owner_id = selectedDeliveryOwner
        updates.delivery_assigned_at = new Date().toISOString()
      }

      if (Object.keys(updates).length > 0) {
        const { error } = await supabase
          .from('deals')
          .update(updates)
          .eq('id', deal.id)
        
        if (error) throw error

        if (selectedDealOwner && selectedDealOwner !== deal?.deal_owner_id) {
          await supabase
            .from('deal_ownership_history')
            .insert([{
              deal_id: deal.id,
              previous_owner_id: deal?.deal_owner_id || null,
              new_owner_id: selectedDealOwner,
              change_type: 'deal_owner',
              changed_by: 'admin',
              reason
            }])
        }

        if (selectedDeliveryOwner && selectedDeliveryOwner !== deal?.delivery_owner_id) {
          await supabase
            .from('deal_ownership_history')
            .insert([{
              deal_id: deal.id,
              previous_owner_id: deal?.delivery_owner_id || null,
              new_owner_id: selectedDeliveryOwner,
              change_type: 'delivery_owner',
              changed_by: 'admin',
              reason
            }])
        }
      }

      onAssign && onAssign()
      onClose()
    } catch (err) {
      console.error('Error assigning deal:', err)
      alert('Failed to assign deal: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const getDealOwnerName = (id) => {
    const user = users.find(u => u.id === id)
    return user ? `${user.name} (${user.role})` : 'Unassigned'
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }}>
      <div style={{
        background: 'white',
        borderRadius: '8px',
        padding: '24px',
        width: '90%',
        maxWidth: '600px',
        boxShadow: '0 20px 25px rgba(0,0,0,0.15)'
      }}>
        <h2 style={{ marginTop: 0, marginBottom: '8px' }}>Assign Deal: {deal.company}</h2>
        <p style={{ color: '#666', fontSize: '14px', marginBottom: '24px' }}>
          Assign this deal to team members for accountability and tracking
        </p>

        <div style={{ marginBottom: '20px', padding: '12px', background: '#f0f9ff', borderRadius: '6px', borderLeft: '4px solid #3b82f6' }}>
          <div style={{ fontSize: '13px', color: '#0c4a6e' }}>
            <strong>Deal Value:</strong> ₹{deal.deal_value?.toLocaleString() || 'N/A'}
          </div>
          <div style={{ fontSize: '13px', color: '#0c4a6e' }}>
            <strong>Stage:</strong> {deal.stage}
          </div>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600' }}>
            Deal Owner (Sales Responsibility)
          </label>
          <select
            value={selectedDealOwner}
            onChange={e => setSelectedDealOwner(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 12px',
              border: '1px solid #ddd',
              borderRadius: '6px',
              fontSize: '14px',
              boxSizing: 'border-box'
            }}
          >
            <option value="">Select deal owner...</option>
            {users.filter(u => ['sales', 'admin'].includes(u.role)).map(user => (
              <option key={user.id} value={user.id}>
                {user.name} — {user.department || 'No department'}
              </option>
            ))}
          </select>
          {selectedDealOwner && (
            <div style={{ marginTop: '8px', fontSize: '12px', color: '#666' }}>
              Currently: {getDealOwnerName(selectedDealOwner)}
            </div>
          )}
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600' }}>
            Delivery Owner (Implementation Responsibility)
          </label>
          <select
            value={selectedDeliveryOwner}
            onChange={e => setSelectedDeliveryOwner(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 12px',
              border: '1px solid #ddd',
              borderRadius: '6px',
              fontSize: '14px',
              boxSizing: 'border-box'
            }}
          >
            <option value="">Select delivery owner...</option>
            {users.filter(u => ['delivery', 'admin'].includes(u.role)).map(user => (
              <option key={user.id} value={user.id}>
                {user.name} — {user.department || 'No department'}
              </option>
            ))}
          </select>
          {selectedDeliveryOwner && (
            <div style={{ marginTop: '8px', fontSize: '12px', color: '#666' }}>
              Currently: {getDealOwnerName(selectedDeliveryOwner)}
            </div>
          )}
        </div>

        <div style={{ marginBottom: '24px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600' }}>
            Reason for Assignment (Optional)
          </label>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="e.g., Customer location, expertise match, capacity..."
            style={{
              width: '100%',
              padding: '10px 12px',
              border: '1px solid #ddd',
              borderRadius: '6px',
              fontSize: '14px',
              boxSizing: 'border-box',
              minHeight: '80px',
              fontFamily: 'inherit'
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            disabled={loading}
            style={{
              padding: '10px 20px',
              border: '1px solid #ddd',
              background: 'white',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: '600',
              opacity: loading ? 0.5 : 1
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleAssign}
            disabled={loading}
            style={{
              padding: '10px 20px',
              background: '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: '600',
              opacity: loading ? 0.5 : 1
            }}
          >
            {loading ? 'Assigning...' : 'Assign & Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
