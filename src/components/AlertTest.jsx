import { useEffect, useRef, useState } from 'react'

// One-time test of the alert popup + ring (24 Nov 2026, 1:04 pm IST). Remove after testing.
const TARGET = new Date('2026-11-24T13:04:00+05:30').getTime()
const WINDOW_MS = 15 * 60 * 1000 // if the page is opened late, still ring once within 15 min

let ctx = null
function audio() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)()
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

// Warm marimba-style chime: C6 – E6 – G6 – C7, soft attack, natural decay. Played twice.
export function playChime() {
  const a = audio()
  const notes = [1046.5, 1318.5, 1568.0, 2093.0]
  const master = a.createGain(); master.gain.value = 0.35; master.connect(a.destination)
  ;[0, 1.1].forEach(offset => {
    notes.forEach((f, i) => {
      const t = a.currentTime + offset + i * 0.11
      ;[[1, 1], [4, 0.12], [10, 0.03]].forEach(([mult, amp]) => {
        const o = a.createOscillator(); const g = a.createGain()
        o.type = 'sine'; o.frequency.value = f * mult
        g.gain.setValueAtTime(0, t)
        g.gain.linearRampToValueAtTime(amp, t + 0.006)
        g.gain.exponentialRampToValueAtTime(0.0001, t + (i === 3 ? 1.4 : 0.7) / mult ** 0.3)
        o.connect(g); g.connect(master); o.start(t); o.stop(t + 1.6)
      })
    })
  })
}

export default function AlertTest() {
  const [show, setShow] = useState(false)
  const fired = useRef(false)

  useEffect(() => {
    if (Date.now() > TARGET + WINDOW_MS) return
    const unlock = () => audio()
    window.addEventListener('pointerdown', unlock, { once: true })
    window.addEventListener('keydown', unlock, { once: true })
    const fire = () => {
      if (fired.current) return
      fired.current = true
      setShow(true)
      try { playChime() } catch { /* audio blocked until first click */ }
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('Dyzen CRM', { body: 'Test alert — this is how a reminder will ring.' })
      }
    }
    const wait = Math.max(TARGET - Date.now(), 3000)
    const id = setTimeout(fire, wait)
    return () => { clearTimeout(id); window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock) }
  }, [])

  if (!show) return null
  return (
    <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 10000, width: 320, background: '#fff',
      borderRadius: 10, boxShadow: '0 10px 30px rgba(0,0,0,0.18)', borderLeft: '4px solid var(--primary)',
      padding: '14px 16px', fontFamily: 'var(--font)', animation: 'alertIn .25s ease-out' }}>
      <style>{'@keyframes alertIn{from{transform:translateY(-12px);opacity:0}to{transform:none;opacity:1}}'}</style>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 8 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--primary)', letterSpacing: '0.5px' }}>🔔 REMINDER · 1:04 PM</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-dark)', marginTop: 4 }}>Test alert</div>
          <div style={{ fontSize: 13, color: 'var(--text-body)', marginTop: 2 }}>This is how a call or follow-up reminder will look and sound.</div>
        </div>
        <button onClick={() => setShow(false)} style={{ background: 'none', border: 'none', fontSize: 18, color: 'var(--text-muted)', cursor: 'pointer', lineHeight: 1 }}>×</button>
      </div>
      <button onClick={playChime} className="btn btn-sm" style={{ marginTop: 10, fontSize: 12 }}>▶ Play ring again</button>
    </div>
  )
}
