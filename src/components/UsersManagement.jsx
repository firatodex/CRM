import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'

export default function UsersManagement() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editingUser, setEditingUser] = useState(null)
  const [formData, setFormData] = useState({
    email: '',
    name: '',
    phone: '',
    role: 'viewer',
    department: ''
  })

  useEffect(() => {
    loadUsers()
  }, [])

  async function loadUsers() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .order('created_at', { ascending: false })
      
      if (error) throw error
      setUsers(data || [])
    } catch (err) {
      console.error('Error loading users:', err)
      alert('Failed to load users: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  async function saveUser() {
    if (!formData.email || !formData.name) {
      alert('Email and name are required')
      return
    }

    try {
      if (editingUser) {
        const { error } = await supabase
          .from('users')
          .update(formData)
          .eq('id', editingUser.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('users')
          .insert([formData])
        if (error) throw error
      }
      
      setShowModal(false)
      setFormData({ email: '', name: '', phone: '', role: 'viewer', department: '' })
      setEditingUser(null)
      loadUsers()
    } catch (err) {
      console.error('Error saving user:', err)
      alert('Failed to save user: ' + err.message)
    }
  }

  function openEdit(user) {
    setEditingUser(user)
    setFormData({
      email: user.email,
      name: user.name,
      phone: user.phone || '',
      role: user.role,
      department: user.department || ''
    })
    setShowModal(true)
  }

  function openNew() {
    setEditingUser(null)
    setFormData({ email: '', name: '', phone: '', role: 'viewer', department: '' })
    setShowModal(true)
  }

  async function deactivateUser(userId) {
    if (!window.confirm('Deactivate this user?')) return
    try {
      const { error } = await supabase
        .from('users')
        .update({ is_active: false })
        .eq('id', userId)
      if (error) throw error
      loadUsers()
    } catch (err) {
      console.error('Error deactivating user:', err)
      alert('Failed to deactivate user: ' + err.message)
    }
  }

  const roleColors = {
    admin: '#e11d48',
    sales: '#2563eb',
    delivery: '#7c3aed',
    support: '#059669',
    viewer: '#6b7280'
  }

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: '700', margin: 0 }}>Team Members</h1>
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
          + Add Member
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>Loading...</div>
      ) : users.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>No users yet</div>
      ) : (
        <div style={{ background: 'white', borderRadius: '8px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f3f4f6', borderBottom: '1px solid #e5e7eb' }}>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600', fontSize: '12px', color: '#666', textTransform: 'uppercase' }}>Name</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600', fontSize: '12px', color: '#666', textTransform: 'uppercase' }}>Email</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600', fontSize: '12px', color: '#666', textTransform: 'uppercase' }}>Role</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600', fontSize: '12px', color: '#666', textTransform: 'uppercase' }}>Department</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600', fontSize: '12px', color: '#666', textTransform: 'uppercase' }}>Status</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600', fontSize: '12px', color: '#666', textTransform: 'uppercase' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(user => (
                <tr key={user.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: '12px 16px', fontWeight: '600' }}>{user.name}</td>
                  <td style={{ padding: '12px 16px', fontSize: '13px', color: '#666' }}>{user.email}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{
                      display: 'inline-block',
                      background: roleColors[user.role],
                      color: 'white',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: '600',
                      textTransform: 'uppercase'
                    }}>
                      {user.role}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '13px', color: '#666' }}>{user.department || '—'}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{
                      display: 'inline-block',
                      background: user.is_active ? '#d1fae5' : '#fee2e2',
                      color: user.is_active ? '#065f46' : '#991b1b',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: '600'
                    }}>
                      {user.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '13px' }}>
                    <button
                      onClick={() => openEdit(user)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#2563eb',
                        cursor: 'pointer',
                        marginRight: '12px',
                        fontWeight: '600'
                      }}
                    >
                      Edit
                    </button>
                    {user.is_active && (
                      <button
                        onClick={() => deactivateUser(user.id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#ef4444',
                          cursor: 'pointer',
                          fontWeight: '600'
                        }}
                      >
                        Deactivate
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
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
            maxWidth: '500px',
            boxShadow: '0 20px 25px rgba(0,0,0,0.15)'
          }}>
            <h2 style={{ marginTop: 0, marginBottom: '20px' }}>
              {editingUser ? 'Edit Team Member' : 'Add Team Member'}
            </h2>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600' }}>Name *</label>
              <input
                type="text"
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
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

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600' }}>Email *</label>
              <input
                type="email"
                value={formData.email}
                onChange={e => setFormData({ ...formData, email: e.target.value })}
                disabled={!!editingUser}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #ddd',
                  borderRadius: '6px',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                  background: editingUser ? '#f3f4f6' : 'white'
                }}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600' }}>Phone</label>
              <input
                type="tel"
                value={formData.phone}
                onChange={e => setFormData({ ...formData, phone: e.target.value })}
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

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600' }}>Role *</label>
              <select
                value={formData.role}
                onChange={e => setFormData({ ...formData, role: e.target.value })}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #ddd',
                  borderRadius: '6px',
                  fontSize: '14px',
                  boxSizing: 'border-box'
                }}
              >
                <option value="admin">Admin (Full Access)</option>
                <option value="sales">Sales (Deals & Clients)</option>
                <option value="delivery">Delivery (Implementation)</option>
                <option value="support">Support (Customer Issues)</option>
                <option value="viewer">Viewer (Read Only)</option>
              </select>
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600' }}>Department</label>
              <input
                type="text"
                value={formData.department}
                onChange={e => setFormData({ ...formData, department: e.target.value })}
                placeholder="e.g., Sales, Operations, Support"
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

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowModal(false)}
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
                onClick={saveUser}
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
