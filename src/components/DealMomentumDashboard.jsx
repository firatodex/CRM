import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../supabase'
import { calculateDealMomentumScore, identifyStalledDeals } from '../utils/salesMetrics'
import { formatRelativeTime, formatCurrency, waLink } from '../utils'

const STALLED_THRESHOLD_DAYS = 14

// All deals with momentum score, stalled flag, and one-click intervention
// actions (email / call / offer an in-person meeting).
export default function DealMomentumDashboard() {
  const [deals, setDeals] = useState([])
  const [contactsByClient, setContactsByClient] = useState({})
  const [clientsById, setClientsById] = useState({})
  const [loading, setLoading] = useState(true)
  const [intervening, setIntervening] = useState(null)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const { data: dealRows, error: dealsError } = await supabase
        .from('deals')
        .select('*')
        .order('created_at', { ascending: false })
      if (dealsError) throw dealsError

      const clientIds = [...new Set((dealRows || []).map(d => d.client_id).filter(Boolean))]
      const { data: clientRows, error: clientsError } = clientIds.length
        ? await supabase.from('clients').select('id, company, phone, email').in('id', clientIds)
        : { data: [], error: null }
      if (clientsError) throw clientsError

      const { data: contactRows, error: contactsError } = clientIds.length
        ? await supabase.from('contact_log').select('*').in('client_id', clientIds).order('contacted_at', { ascending: false })
        : { data: [], error: null }
      if (contactsError) throw contactsError

      const contactMap = {}
      for (const c of contactRows || []) {
        if (!contactMap[c.client_id]) contactMap[c.client_id] = []
        contactMap[c.client_id].push(c)
      }
      const clientMap = {}
      for (const c of clientRows || []) clientMap[c.id] = c

      setDeals(dealRows || [])
      setContactsByClient(contactMap)
      setClientsById(clientMap)
    } catch (err) {
      console.error('Error loading deal momentum data:', err)
    } finally {
      setLoading(false)
    }
  }

  const enrichedDeals = useMemo(() => {
    const stalledIds = new Set(identifyStalledDeals(deals, STALLED_THRESHOLD_DAYS).map(d => d.id))
    return deals.map(deal => {
      const contacts = contactsByClient[deal.client_id] || []
      const momentum = calculateDealMomentumScore(deal, contacts)
      const lastContact = contacts[0]
      const daysInStage = Math.floor((Date.now() - new Date(deal.stage_entered_at || deal.created_at).getTime()) / 86400000)
      return {
        ...deal,
        client: clientsById[deal.client_id],
        momentum,
        stalled: stalledIds.has(deal.id),
        daysInStage,
        lastContact,
      }
    })
  }, [deals, contactsByClient, clientsById])

  function statusColor(deal) {
    if (deal.stalled) return '#ef4444'
    if (deal.momentum < 5) return '#f59e0b'
    return '#10b981'
  }

  async function markContacted(deal, method) {
    setIntervening(deal.id)
    try {
      const { error } = await supabase.from('contact_log').insert({
        client_id: deal.client_id,
        method,
        contacted_at: new Date().toISOString(),
        note_what_next: `Intervention on stalled deal via ${method}`,
      })
      if (error) throw error
      await loadData()
    } catch (err) {
      alert('Failed to log intervention: ' + err.message)
    } finally {
      setIntervening(null)
    }
  }

  if (loading) return <div style={{ padding: '24px', color: '#666' }}>Loading deal momentum...</div>

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: '700', margin: 0 }}>Deal Momentum</h1>
        <p style={{ color: '#666', margin: '8px 0 0 0' }}>Days in stage, momentum score, and stalled-deal flags across the pipeline</p>
      </div>

      {enrichedDeals.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', background: 'white', borderRadius: '8px', color: '#666' }}>No deals to show</div>
      ) : (
        <div style={{ display: 'grid', gap: '12px' }}>
          {enrichedDeals.map(deal => (
            <div key={deal.id} style={{ background: 'white', borderRadius: '8px', border: `1px solid ${statusColor(deal)}`, borderLeftWidth: '4px', padding: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '700' }}>{deal.client?.company || deal.company || 'Unknown'}</h3>
                  <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#666' }}>
                    {deal.daysInStage}d in stage · Last activity {deal.lastContact ? formatRelativeTime(deal.lastContact.contacted_at) : 'never'}
                    {deal.deal_value ? ` · ${formatCurrency(deal.deal_value)}` : ''}
                  </p>
                </div>
                {deal.stalled && (
                  <span style={{ fontSize: '11px', fontWeight: '700', color: 'white', background: '#ef4444', padding: '4px 8px', borderRadius: '999px' }}>STALLED</span>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                <div style={{ flex: 1, height: '8px', background: '#e5e7eb', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ width: `${deal.momentum * 10}%`, height: '100%', background: statusColor(deal) }} />
                </div>
                <span style={{ fontSize: '13px', fontWeight: '700', color: statusColor(deal), minWidth: '48px', textAlign: 'right' }}>{deal.momentum}/10</span>
              </div>

              {deal.lastContact?.note_what_next && (
                <div style={{ fontSize: '12px', color: '#666', marginBottom: '10px' }}>Next: {deal.lastContact.note_what_next}</div>
              )}

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  disabled={intervening === deal.id}
                  onClick={() => window.location.href = `mailto:${deal.client?.email || ''}`}
                  style={interventionButtonStyle}
                >
                  ✉️ Email
                </button>
                <button
                  disabled={intervening === deal.id}
                  onClick={() => deal.client?.phone && window.open(waLink(deal.client.phone), '_blank')}
                  style={interventionButtonStyle}
                >
                  💬 WhatsApp
                </button>
                <button
                  disabled={intervening === deal.id}
                  onClick={() => markContacted(deal, 'in_person')}
                  style={interventionButtonStyle}
                >
                  🤝 Offer meeting
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const interventionButtonStyle = { padding: '6px 12px', border: '1px solid #ddd', background: 'white', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }
