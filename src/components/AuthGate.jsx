import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import Login from './Login'
import SetPassword from './SetPassword'

export default function AuthGate({ children }) {
  const [session, setSession] = useState(undefined) // undefined = loading
  // Opened from a password-reset email link
  const [recovering, setRecovering] = useState(() => /type=recovery/.test(window.location.hash))

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true)
      setSession(session)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  if (session === undefined) {
    return (
      <div className="login-wrap">
        <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading…</div>
      </div>
    )
  }

  if (recovering && session) {
    return <SetPassword onDone={() => setRecovering(false)} />
  }

  if (!session) {
    return <Login />
  }

  return children
}
