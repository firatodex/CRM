import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

export default function CustomerHealthDashboard() {
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState('all')
  const [selectedCustomer, setSelectedCustomer] = useState(null)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const { data: clients, error: clientsError } = await supabase
        .from('clients')
        .select('id, company, phone, last_contacted_at')
        .eq('stage', 'active')
        .order('company')

      if (clientsError) throw clientsError

      const { data: health, error: healthError } = await supabase
        .from('customer_health')
        .select('*')

      if (healthError) throw healthError

      const healthMap = {}
      health.forEach(h => {
        healthMap[h.client_id] = h
      })

      const clientsWithHealth = clients.map(client => {
        const h = healthMap[client.id]
        const daysSinceContact = client.last_contacted_at 
          ? Math.ceil((new Date() - new Date(client.last_contacted_at)) / (1000 * 60 * 60 * 24))
          : 999

        const engagementScore = daysSinceContact > 30 ? 25 : daysSinceContact > 14 ? 50 : daysSinceContact > 7 ? 75 : 100
        const deliveryScore = h?.delivery_score || 50
        const paymentScore = h?.payment_score || 50
        const usageScore = h?.usage_score || 50
        const satisfactionScore = h?.satisfaction_score || 50

        const overallScore = Math.round(
          (engagementScore + deliveryScore + paymentScore + usageScore + satisfactionScore) / 5
        )

        const healthStatus = overallScore >= 75 ? 'green' : overallScore >= 50 ? 'yellow' : 'red'

        return {
          ...client,
          health: {
            ...h,
            overallScore,
            healthStatus,
            engagementScore,
            deliveryScore,
            paymentScore,
            usageScore,
            satisfactionScore,
            daysSinceContact
          }
        }
      })

      setCustomers(clientsWithHealth)
    } catch (err) {
      console.error('Error loading data:', err)
      alert('Failed to load customer health: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const filteredCustomers = customers.filter(c => {
    if (filter === 'all') return true
    return c.health.healthStatus === filter
  })

  const healthCounts = {
    all: customers.length,
    green: customers.filter(c => c.health.healthStatus === 'green').length,
    yellow: customers.filter(c => c.health.healthStatus === 'yellow').length,
    red: customers.filter(c => c.health.healthStatus === 'red').length
  }

  const healthPercentage = {
    green: healthCounts.all > 0 ? Math.round((healthCounts.green / healthCounts.all) * 100) : 0,
    yellow: healthCounts.all > 0 ? Math.round((healthCounts.yellow / healthCounts.all) * 100) : 0,
    red: healthCounts.all > 0 ? Math.round((healthCounts.red / healthCounts.all) * 100) : 0
  }

  function getRiskLevel(score) {
    if (score >= 75) return { status: 'Healthy', color: '#10b981', icon: '✓' }
    if (score >= 50) return { status: 'At Risk', color: '#f59e0b', icon: '⚠' }
    return { status: 'Critical', color: '#ef4444', icon: '✕' }
  }

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: '700', margin: 0 }}>Customer Health</h1>
        <p style={{ color: '#666', margin: '8px 0 0 0' }}>Monitor customer satisfaction, engagement, and at-risk accounts</p>
      </div>

      <div style={{
        background: 'white',
        borderRadius: '8px',
        border: '1px solid #e5e7eb',
        padding: '24px',
        marginBottom: '24px'
      }}>
        <div style={{ marginBottom: '20px' }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: '600' }}>Overall Health</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '20px' }}>
            <div>
              <div style={{ fontSize: '32px', fontWeight: '700', color: '#10b981', marginBottom: '8px' }}>
                {healthCounts.green}
              </div>
              <div style={{ fontSize: '12px', color: '#666', textTransform: 'uppercase', fontWeight: '600' }}>Healthy</div>
              <div style={{ fontSize: '13px', color: '#10b981', fontWeight: '600', marginTop: '4px' }}>
                {healthPercentage.green}%
              </div>
            </div>
            <div>
              <div style={{ fontSize: '32px', fontWeight: '700', color: '#f59e0b', marginBottom: '8px' }}>
                {healthCounts.yellow}
              </div>
              <div style={{ fontSize: '12px', color: '#666', textTransform: 'uppercase', fontWeight: '600' }}>At Risk</div>
              <div style={{ fontSize: '13px', color: '#f59e0b', fontWeight: '600', marginTop: '4px' }}>
                {healthPercentage.yellow}%
              </div>
            </div>
            <div>
              <div style={{ fontSize: '32px', fontWeight: '700', color: '#ef4444', marginBottom: '8px' }}>
                {healthCounts.red}
              </div>
              <div style={{ fontSize: '12px', color: '#666', textTransform: 'uppercase', fontWeight: '600' }}>Critical</div>
              <div style={{ fontSize: '13px', color: '#ef4444', fontWeight: '600', marginTop: '4px' }}>
                {healthPercentage.red}%
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', height: '20px', borderRadius: '10px', overflow: 'hidden' }}>
            <div style={{ flex: healthPercentage.green, background: '#10b981' }} />
            <div style={{ flex: healthPercentage.yellow, background: '#f59e0b' }} />
            <div style={{ flex: healthPercentage.red, background: '#ef4444' }} />
          </div>
        </div>
      </div>

      <div style={{ marginBottom: '24px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {['all', 'green', 'yellow', 'red'].map(status => (
          <button
            key={status}
            onClick={() => setFilter(status)}
            style={{
              padding: '8px 16px',
              border: filter === status ? 'none' : '1px solid #ddd',
              background: filter === status
                ? status === 'all' ? '#333' : status === 'green' ? '#10b981' : status === 'yellow' ? '#f59e0b' : '#ef4444'
                : 'white',
              color: filter === status ? 'white' : '#333',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '13px',
              textTransform: 'capitalize'
            }}
          >
            {status === 'all' ? `All (${healthCounts.all})` : `${status} (${healthCounts[status]})`}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>Loading...</div>
      ) : filteredCustomers.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', background: 'white', borderRadius: '8px', color: '#666' }}>
          No customers in this health category
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '12px' }}>
          {filteredCustomers.map(customer => {
            const risk = getRiskLevel(customer.health.overallScore)
            return (
              <div
                key={customer.id}
                onClick={() => setSelectedCustomer(customer)}
                style={{
                  background: 'white',
                  borderRadius: '8px',
                  border: `1px solid ${risk.color}`,
                  borderLeftWidth: '4px',
                  padding: '16px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'}
                onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700' }}>{customer.company}</h3>
                    <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#666' }}>
                      Last contact: {customer.health.daysSinceContact} days ago
                    </p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{
                      fontSize: '32px',
                      fontWeight: '700',
                      color: risk.color,
                      lineHeight: '1'
                    }}>
                      {customer.health.overallScore}
                    </div>
                    <div style={{ fontSize: '11px', color: risk.color, fontWeight: '600', marginTop: '4px' }}>
                      {risk.status}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px', fontSize: '11px' }}>
                  <div style={{ background: '#f3f4f6', padding: '8px', borderRadius: '4px', textAlign: 'center' }}>
                    <div style={{ fontWeight: '600', marginBottom: '4px' }}>{customer.health.deliveryScore}</div>
                    <div style={{ color: '#666', fontSize: '10px' }}>Delivery</div>
                  </div>
                  <div style={{ background: '#f3f4f6', padding: '8px', borderRadius: '4px', textAlign: 'center' }}>
                    <div style={{ fontWeight: '600', marginBottom: '4px' }}>{customer.health.engagementScore}</div>
                    <div style={{ color: '#666', fontSize: '10px' }}>Engagement</div>
                  </div>
                  <div style={{ background: '#f3f4f6', padding: '8px', borderRadius: '4px', textAlign: 'center' }}>
                    <div style={{ fontWeight: '600', marginBottom: '4px' }}>{customer.health.paymentScore}</div>
                    <div style={{ color: '#666', fontSize: '10px' }}>Payment</div>
                  </div>
                  <div style={{ background: '#f3f4f6', padding: '8px', borderRadius: '4px', textAlign: 'center' }}>
                    <div style={{ fontWeight: '600', marginBottom: '4px' }}>{customer.health.usageScore}</div>
                    <div style={{ color: '#666', fontSize: '10px' }}>Usage</div>
                  </div>
                  <div style={{ background: '#f3f4f6', padding: '8px', borderRadius: '4px', textAlign: 'center' }}>
                    <div style={{ fontWeight: '600', marginBottom: '4px' }}>{customer.health.satisfactionScore}</div>
                    <div style={{ color: '#666', fontSize: '10px' }}>Satisfaction</div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {selectedCustomer && (
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
            <h2 style={{ marginTop: 0, marginBottom: '8px' }}>{selectedCustomer.company}</h2>
            <p style={{ color: '#666', marginBottom: '24px' }}>Health Score: {selectedCustomer.health.overallScore}/100</p>

            <div style={{ background: '#f9fafb', padding: '16px', borderRadius: '8px', marginBottom: '24px' }}>
              <h3 style={{ margin: '0 0 16px 0', fontSize: '14px', fontWeight: '600' }}>Score Breakdown</h3>
              {[
                { label: 'Delivery', score: selectedCustomer.health.deliveryScore, desc: 'Is implementation on track?' },
                { label: 'Engagement', score: selectedCustomer.health.engagementScore, desc: 'How recent is last contact?' },
                { label: 'Payment', score: selectedCustomer.health.paymentScore, desc: 'Are invoices paid on time?' },
                { label: 'Usage', score: selectedCustomer.health.usageScore, desc: 'Is customer using product?' },
                { label: 'Satisfaction', score: selectedCustomer.health.satisfactionScore, desc: 'Customer feedback score' }
              ].map((item, i) => (
                <div key={i} style={{ marginBottom: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <div>
                      <div style={{ fontWeight: '600', fontSize: '13px' }}>{item.label}</div>
                      <div style={{ fontSize: '12px', color: '#666' }}>{item.desc}</div>
                    </div>
                    <div style={{ fontSize: '18px', fontWeight: '700' }}>{item.score}</div>
                  </div>
                  <div style={{ height: '4px', background: '#e5e7eb', borderRadius: '2px', overflow: 'hidden' }}>
                    <div style={{
                      width: `${item.score}%`,
                      height: '100%',
                      background: item.score >= 75 ? '#10b981' : item.score >= 50 ? '#f59e0b' : '#ef4444'
                    }} />
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setSelectedCustomer(null)}
                style={{
                  padding: '10px 20px',
                  border: '1px solid #ddd',
                  background: 'white',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: '600'
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
