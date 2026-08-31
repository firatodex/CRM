import { useState, useEffect, useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { supabase } from '../supabase'
import { formatCurrency } from '../utils'
import { forecastEntrySchema } from '../schemas/salesProcessSchemas'

function currentPeriodMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// Monthly forecast entry + forecast-vs-actual chart + open deals list.
export default function ForecastDashboard() {
  const [logs, setLogs] = useState([])
  const [openDeals, setOpenDeals] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ period_month: currentPeriodMonth(), forecasted_revenue: '', forecasted_wins: '' })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const { data: logRows, error: logsError } = await supabase
        .from('forecast_log')
        .select('*')
        .order('period_month')
      if (logsError) throw logsError

      const { data: dealRows, error: dealsError } = await supabase
        .from('deals')
        .select('*')
        .not('forecast_status', 'in', '("closed_won","closed_lost")')
        .order('created_at', { ascending: false })
      if (dealsError) throw dealsError

      setLogs(logRows || [])
      setOpenDeals(dealRows || [])
    } catch (err) {
      console.error('Error loading forecast data:', err)
    } finally {
      setLoading(false)
    }
  }

  const chartData = useMemo(
    () => logs.map(l => ({
      period: l.period_month,
      Forecasted: l.forecasted_revenue,
      Actual: l.actual_revenue,
    })),
    [logs]
  )

  async function submitForecast() {
    setError('')
    const result = forecastEntrySchema.safeParse({
      period_month: form.period_month,
      forecasted_revenue: Number(form.forecasted_revenue) || 0,
      forecasted_wins: Number(form.forecasted_wins) || 0,
    })
    if (!result.success) {
      setError(result.error.issues[0]?.message || 'Invalid forecast entry')
      return
    }

    setSaving(true)
    try {
      const { data, error: upsertError } = await supabase
        .from('forecast_log')
        .upsert({ ...result.data }, { onConflict: 'period_month' })
        .select()
      if (upsertError) throw upsertError
      await loadData()
      setForm({ period_month: currentPeriodMonth(), forecasted_revenue: '', forecasted_wins: '' })
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  function dealProbability(deal) {
    if (deal.forecast_status === 'on_track') return 70
    if (deal.forecast_status === 'at_risk') return 30
    return 50
  }

  if (loading) return <div style={{ padding: '24px', color: '#666' }}>Loading forecast...</div>

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: '700', margin: 0 }}>Forecast</h1>
        <p style={{ color: '#666', margin: '8px 0 0 0' }}>Monthly forecast vs. actual revenue and wins</p>
      </div>

      <div style={{ background: 'white', borderRadius: '8px', border: '1px solid #e5e7eb', padding: '20px', marginBottom: '20px' }}>
        <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '700' }}>Add / update this month's forecast</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '10px', alignItems: 'end' }}>
          <div>
            <label style={labelStyle}>Period (YYYY-MM)</label>
            <input value={form.period_month} onChange={e => setForm({ ...form, period_month: e.target.value })} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Forecasted revenue</label>
            <input type="number" value={form.forecasted_revenue} onChange={e => setForm({ ...form, forecasted_revenue: e.target.value })} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Forecasted wins</label>
            <input type="number" value={form.forecasted_wins} onChange={e => setForm({ ...form, forecasted_wins: e.target.value })} style={inputStyle} />
          </div>
          <button onClick={submitForecast} disabled={saving} style={{ padding: '10px 16px', border: 'none', background: '#007AFF', color: 'white', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' }}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
        {error && <div style={{ color: '#ef4444', fontSize: '12px', marginTop: '8px' }}>{error}</div>}
      </div>

      <div style={{ background: 'white', borderRadius: '8px', border: '1px solid #e5e7eb', padding: '20px', marginBottom: '20px' }}>
        <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '700' }}>Forecast accuracy</h3>
        {chartData.length === 0 ? (
          <div style={{ color: '#999', fontSize: '13px' }}>No forecast history yet.</div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="period" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={v => formatCurrency(v)} />
              <Line type="monotone" dataKey="Forecasted" stroke="#8b5cf6" strokeWidth={2} />
              <Line type="monotone" dataKey="Actual" stroke="#10b981" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        )}
        <div style={{ display: 'grid', gap: '6px', marginTop: '12px' }}>
          {logs.map(l => (
            <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#666' }}>
              <span>{l.period_month}</span>
              <span>{l.forecast_accuracy_pct != null ? `${l.forecast_accuracy_pct}% accurate` : 'Not finalized'}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ background: 'white', borderRadius: '8px', border: '1px solid #e5e7eb', padding: '20px' }}>
        <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '700' }}>Open deals ({openDeals.length})</h3>
        {openDeals.length === 0 ? (
          <div style={{ color: '#999', fontSize: '13px' }}>No open deals.</div>
        ) : (
          <div style={{ display: 'grid', gap: '8px' }}>
            {openDeals.map(deal => (
              <div key={deal.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', border: '1px solid #eee', borderRadius: '6px', fontSize: '13px' }}>
                <span>{deal.company || deal.client_id}</span>
                <span style={{ color: '#666' }}>{formatCurrency(deal.deal_value)}</span>
                <span style={{ fontWeight: '700', color: dealProbability(deal) >= 60 ? '#10b981' : dealProbability(deal) >= 40 ? '#f59e0b' : '#ef4444' }}>
                  {dealProbability(deal)}% likely
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const labelStyle = { display: 'block', fontSize: '11px', color: '#666', fontWeight: '600', marginBottom: '4px', textTransform: 'uppercase' }
const inputStyle = { width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }
