import { useState } from 'react'
import { supabase } from '../supabase'

// Shown after opening a password-reset email link.
export default function SetPassword({ onDone }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    if (password.length < 8) return setError('Use at least 8 characters.')
    if (password !== confirm) return setError('The two passwords don’t match.')
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) return setError(error.message)
    window.history.replaceState(null, '', window.location.pathname)
    onDone()
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={handleSubmit}>
        <h1 className="login-title">Set a new password</h1>
        <p className="login-subtitle">You’ll stay signed in after saving</p>

        <label className="login-label">New password</label>
        <input className="login-input" type="password" value={password} onChange={e => setPassword(e.target.value)}
          autoComplete="new-password" autoFocus required />

        <label className="login-label">Repeat new password</label>
        <input className="login-input" type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
          autoComplete="new-password" required />

        {error && <div className="login-error">{error}</div>}

        <button className="btn btn-primary login-btn" type="submit" disabled={loading}>
          {loading ? 'Saving…' : 'Save password'}
        </button>
      </form>
    </div>
  )
}
