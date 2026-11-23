import { useState } from 'react'
import { supabase } from '../supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [forgot, setForgot] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    if (forgot) {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin })
      if (error) setError(error.message); else setSent(true)
      setLoading(false)
      return
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
    setLoading(false)
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={handleSubmit}>
        <h1 className="login-title">Dyzen Solar Technologies</h1>
        <p className="login-subtitle">{forgot ? 'Get a link to set a new password' : 'Sign in to continue'}</p>

        <label className="login-label">Email</label>
        <input
          className="login-input"
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          autoComplete="username"
          required
        />

        {!forgot && (<>
          <label className="login-label">Password</label>
          <input
            className="login-input"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </>)}

        {error && <div className="login-error">{error}</div>}

        {sent && <div style={{ fontSize: 13, color: '#16a34a', margin: '4px 0 10px' }}>Check your email for the reset link. It can take a minute; look in Spam too.</div>}

        {!sent && (
          <button className="btn btn-primary login-btn" type="submit" disabled={loading}>
            {forgot ? (loading ? 'Sending…' : 'Send reset link') : (loading ? 'Signing in…' : 'Sign in')}
          </button>
        )}

        <button type="button" onClick={() => { setForgot(f => !f); setError(null); setSent(false) }}
          style={{ display: 'block', margin: '12px auto 0', background: 'none', border: 'none', color: 'var(--primary)', fontSize: 13, cursor: 'pointer' }}>
          {forgot ? '← Back to sign in' : 'Forgot password?'}
        </button>
      </form>
    </div>
  )
}
