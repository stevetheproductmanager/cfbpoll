import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'

export default function GlobalSearch() {
  const [q, setQ] = useState('')
  const [results, setResults] = useState(null)
  const [open, setOpen] = useState(false)
  const boxRef = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (q.trim().length < 2) { setResults(null); return }
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q.trim())}`).then(r => r.json()).then(setResults).catch(() => {})
    }, 200)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => {
    const onClick = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const go = (path) => { setOpen(false); setQ(''); setResults(null); navigate(path) }

  const hasResults = results && (results.teams?.length || results.voters?.length)

  return (
    <div ref={boxRef} style={{ position: 'relative', minWidth: 0 }}>
      <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }} />
      <input
        className="input"
        placeholder="Search teams or voters…"
        value={q}
        onChange={e => { setQ(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        style={{ fontSize: 12, padding: '6px 10px 6px 28px', width: 180 }}
      />
      {open && q.trim().length >= 2 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 4, width: 260, zIndex: 50,
          background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 10,
          boxShadow: '0 8px 24px rgba(0,0,0,0.25)', maxHeight: 340, overflowY: 'auto',
        }}>
          {!hasResults ? (
            <div style={{ padding: '12px 14px', fontSize: 12, color: 'var(--muted)' }}>No matches for "{q}"</div>
          ) : (
            <>
              {results.teams?.length > 0 && (
                <div>
                  <div style={{ padding: '6px 12px', fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>Teams</div>
                  {results.teams.map(t => (
                    <div key={t.name} onClick={() => go(`/team/${encodeURIComponent(t.name)}`)}
                      style={{ padding: '8px 14px', fontSize: 13, cursor: 'pointer' }}
                      onMouseDown={e => e.preventDefault()}>
                      <span style={{ fontWeight: 600 }}>{t.name}</span>
                      <span style={{ color: 'var(--muted)', fontSize: 11, marginLeft: 6 }}>{t.conference}</span>
                    </div>
                  ))}
                </div>
              )}
              {results.voters?.length > 0 && (
                <div>
                  <div style={{ padding: '6px 12px', fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>Voters</div>
                  {results.voters.map(v => (
                    <div key={v.userId} onClick={() => go(`/history/${v.userId}`)}
                      style={{ padding: '8px 14px', fontSize: 13, cursor: 'pointer' }}
                      onMouseDown={e => e.preventDefault()}>
                      {v.userName}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
