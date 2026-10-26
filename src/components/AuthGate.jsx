import { useEffect, useState } from 'react'
import { getSession, onAuthChange } from '../api/auth'
import Login from './Login'

export default function AuthGate({ children }) {
  const [session, setSession] = useState(undefined) // undefined = loading

  useEffect(() => {
    getSession().then(({ data }) => setSession(data.session))

    const { data: listener } = onAuthChange((_event, session) => {
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

  if (!session) {
    return <Login />
  }

  return children
}
