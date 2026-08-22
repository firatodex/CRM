import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

export default function DeliveryTracker() {
  const [implementations, setImplementations] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedImpl, setSelectedImpl] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({
    deal_id: '',
    client_id: '',
    assigned_to: '',
    planned_start_date: '',
    planned_end_date: '',
    status: 'not_started',
    completion_percentage: 0
  })
  const [users, setUsers] = useState([])
  const [deals, setDeals] = useState([])

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [{ data: impls }, { data: usersData }, { data: dealsData }] = await Promise.all([
        supabase.from('implementations').select('*, deals(company, deal_value), clients(company)').order('created_at', { ascending: false }),
        supabase.from('users').select('id, name').eq('is_active', true).order('name'),
        supabase.from('deals').select('id, company, stage, client_id').eq('stage', 'active').order('created_at', { ascending: false })
      ])

      setImplementations(impls || [])
      setUsers(usersData || [])
      setDeals(dealsData || [])
    } catch (err) {
      console.error('Error loading data:', err)
      alert('Failed to load data: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleSave() {
    if (!formData.deal_id || !formData.assigned_to || !formData.planned_end_date) {
      alert('Please fill in all required fields')
      return
    }

    try {
      const dealData = deals.find(d => d.id === formData.deal_id)
      const dataToSave = {
        ...formData,
        client_id: dealData?.client_id
      }

      if (selectedImpl) {
        const { error } = await supabase
          .from('implementations')
          .update(dataToSave)
          .eq('id', selectedImpl.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('implementations')
          .insert([dataToSave])
        if (error) throw error
      }

      setShowForm(false)
      setSelectedImpl(null)
      resetForm()
      loadData()
    } catch (err) {
      console.error('Error saving:', err)
      alert('Failed to save: ' + err.message)
    }
  }

  function resetForm() {
    setFormData({
      deal_id: '',
      client_id: '',
      assigned_to: '',
      planned_start_date: '',
      planned_end_date: '',
      status: 'not_started',
      completion_percentage: 0
    })
  }

  function openNew() {
    setSelectedImpl(null)
    resetForm()
    setShowForm(true)
  }

  function openEdit(impl) {
    setSelectedImpl(impl)
    setFormData({
      deal_id: impl.deal_id,
      client_id: impl.client_id,
      assigned_to: impl.assigned_to,
      planned_start_date: impl.planned_start_date || '',
      planned_end_date: impl.planned_end_date || '',
      status: impl.status,
      completion_percentage: impl.completion_percentage
    })
    setShowForm(true)
  }

  const statusColors = {
    'not_started': '#9ca3af',
    'in_progress': '#3b82f6',
    'on_track': '#10b981',
    'at_risk': '#f59e0b',
    'blocked': '#ef4444',
    'delivered': '#8b5cf6',
    'accepted': '#14b8a6'
  }

  const getOwnerName = (userId) => {
    const user = users.find(u => u.id === userId)
    return user?.name || 'Unassigned'
  }

  const getDaysUntilDue = (date) => {
    if (!date) return null
    const due = new Date(date)
    const today = new Date()
    return Math.ceil((due - today) / (1000 * 60 * 60 * 24))
  }

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: '700', margin: 0 }}>Implementation Tracker</h1>
          <p style={{ color: '#666', margin: '8px 0 0 0' }}>Track delivery progress for all active deals</p>
        </div>
        <button 
          onClick={openNew}
          style={{
            background: '#C2622D',
            color: 'white',
            border: 'none',
            padding: '10px 16px',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: '600'
          }}
        >
          + New Implementation
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        {['on_track', 'at_risk', 'blocked', 'delivered'].map(status => {
          const count = implementations.filter(i => i.status === status).length
          return (
            <div key={status} style={{
              background: 'white',
              border: `1px solid #e5e7eb`,
              borderRadius: '8px',
              padding: '16px',
              textAlign: 'center'
            }}>
              <div style={{
                fontSize: '24px',
                fontWeight: '700',
                color: statusColors[status],
                marginBottom: '8px'
              }}>
                {count}
              </div>
              <div style={{ fontSize: '12px', color: '#666', textTransform: 'uppercase', fontWeight: '600' }}>
                {status.replace(/_/g, ' ')}
              </div>
            </div>
          )
        })}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>Loading...</div>
      ) : implementations.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', background: 'white', borderRadius: '8px', color: '#666' }}>
          No implementations yet. Create one to start tracking delivery.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '16px' }}>
          {implementations.map(impl => {
            const daysUntilDue = getDaysUntilDue(impl.planned_end_date)
            return (
              <div key={impl.id} style={{
                background: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '16px',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'}
              onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
              onClick={() => openEdit(impl)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700' }}>
                      {impl.deals?.company || 'Unknown Deal'}
                    </h3>
                    <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#666' }}>
                      {impl.clients?.company}
                    </p>
                  </div>
                  <span style={{
                    display: 'inline-block',
                    background: statusColors[impl.status],
                    color: 'white',
                    padding: '6px 12px',
                    borderRadius: '20px',
                    fontSize: '12px',
                    fontWeight: '600'
                  }}>
                    {impl.status.replace(/_/g, ' ')}
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '12px' }}>
                  <div>
                    <div style={{ fontSize: '11px', color: '#999', textTransform: 'uppercase', fontWeight: '600' }}>Assigned To</div>
                    <div style={{ fontSize: '14px', fontWeight: '600', marginTop: '4px' }}>{getOwnerName(impl.assigned_to)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: '#999', textTransform: 'uppercase', fontWeight: '600' }}>Due Date</div>
                    <div style={{ fontSize: '14px', fontWeight: '600', marginTop: '4px', color: daysUntilDue < 0 ? '#ef4444' : daysUntilDue < 7 ? '#f59e0b' : '#10b981' }}>
                      {impl.planned_end_date ? new Date(impl.planned_end_date).toLocaleDateString('en-US', { month: 'short', day: '2-digit' }) : '—'}
                      {daysUntilDue !== null && (
                        <span style={{ fontSize: '12px', marginLeft: '8px', color: '#666' }}>
                          ({daysUntilDue} days)
                        </span>
                      )}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: '#999', textTransform: 'uppercase', fontWeight: '600' }}>Progress</div>
                    <div style={{ fontSize: '14px', fontWeight: '600', marginTop: '4px' }}>{impl.completion_percentage}%</div>
                  </div>
                </div>

                <div style={{
                  width: '100%',
                  height: '6px',
                  background: '#e5e7eb',
                  borderRadius: '3px',
                  overflow: 'hidden'
                }}>
                  <div style={{
                    width: `${impl.completion_percentage}%`,
                    height: '100%',
                    background: impl.completion_percentage === 100 ? '#10b981' : '#3b82f6',
                    transition: 'width 0.3s ease'
                  }} />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showForm && (
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
          zIndex: 1000,
          overflowY: 'auto'
        }}>
          <div style={{
            background: 'white',
            borderRadius: '8px',
            padding: '24px',
            width: '90%',
            maxWidth: '600px',
            my: '24px',
            boxShadow: '0 20px 25px rgba(0,0,0,0.15)'
          }}>
            <h2 style={{ marginTop: 0, marginBottom: '20px' }}>
              {selectedImpl ? 'Edit Implementation' : 'Create Implementation'}
            </h2>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600' }}>Deal *</label>
              <select
                value={formData.deal_id}
                onChange={e => setFormData({ ...formData, deal_id: e.target.value })}
                disabled={!!selectedImpl}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #ddd',
                  borderRadius: '6px',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                  background: selectedImpl ? '#f3f4f6' : 'white'
                }}
              >
                <option value="">Select deal...</option>
                {deals.map(deal => (
                  <option key={deal.id} value={deal.id}>{deal.company}</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600' }}>Assigned To *</label>
              <select
                value={formData.assigned_to}
                onChange={e => setFormData({ ...formData, assigned_to: e.target.value })}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #ddd',
                  borderRadius: '6px',
                  fontSize: '14px',
                  boxSizing: 'border-box'
                }}
              >
                <option value="">Select team member...</option>
                {users.map(user => (
                  <option key={user.id} value={user.id}>{user.name}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600' }}>Start Date</label>
                <input
                  type="date"
                  value={formData.planned_start_date}
                  onChange={e => setFormData({ ...formData, planned_start_date: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #ddd',
                    borderRadius: '6px',
                    fontSize: '14px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600' }}>End Date *</label>
                <input
                  type="date"
                  value={formData.planned_end_date}
                  onChange={e => setFormData({ ...formData, planned_end_date: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #ddd',
                    borderRadius: '6px',
                    fontSize: '14px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600' }}>Status</label>
              <select
                value={formData.status}
                onChange={e => setFormData({ ...formData, status: e.target.value })}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #ddd',
                  borderRadius: '6px',
                  fontSize: '14px',
                  boxSizing: 'border-box'
                }}
              >
                <option value="not_started">Not Started</option>
                <option value="in_progress">In Progress</option>
                <option value="on_track">On Track</option>
                <option value="at_risk">At Risk</option>
                <option value="blocked">Blocked</option>
                <option value="delivered">Delivered</option>
                <option value="accepted">Accepted</option>
              </select>
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600' }}>
                Progress: {formData.completion_percentage}%
              </label>
              <input
                type="range"
                min="0"
                max="100"
                value={formData.completion_percentage}
                onChange={e => setFormData({ ...formData, completion_percentage: parseInt(e.target.value) })}
                style={{ width: '100%' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowForm(false)}
                style={{
                  padding: '10px 16px',
                  border: '1px solid #ddd',
                  background: 'white',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: '600'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                style={{
                  padding: '10px 16px',
                  background: '#C2622D',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: '600'
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
