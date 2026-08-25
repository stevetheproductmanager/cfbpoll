import React, { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../store/AuthContext.jsx'
import { useToast } from '../store/ToastContext.jsx'

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

// Flat discussion thread for a team page — no nesting, keeps it simple.
export default function TeamComments({ team }) {
  const { user, authHeaders } = useAuth()
  const toast = useToast()
  const [comments, setComments] = useState([])
  const [text, setText] = useState('')
  const [posting, setPosting] = useState(false)

  const load = useCallback(() => {
    fetch(`/api/comments?team=${encodeURIComponent(team)}`).then(r => r.json()).then(d => setComments(d.comments || [])).catch(() => {})
  }, [team])

  useEffect(() => { load() }, [load])

  const post = async () => {
    if (!text.trim()) return
    setPosting(true)
    try {
      const r = await fetch('/api/comments', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ team, text: text.trim() }),
      })
      const d = await r.json()
      if (!r.ok) { toast.error(d.error || 'Could not post'); setPosting(false); return }
      setText('')
      load()
    } catch { toast.error('Could not reach server') }
    setPosting(false)
  }

  const remove = async (id) => {
    try {
      const r = await fetch(`/api/comments/${id}`, { method: 'DELETE', headers: authHeaders() })
      if (!r.ok) { toast.error('Could not delete'); return }
      load()
    } catch { toast.error('Could not reach server') }
  }

  return (
    <div className="card" style={{ marginTop: 0 }}>
      <h3 style={{ marginBottom: 10 }}>💬 Discussion</h3>
      {user ? (
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <input
            className="input" style={{ flex: 1 }} maxLength={500}
            placeholder={`Say something about ${team}...`}
            value={text} onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') post() }}
          />
          <button className="btn btn-primary" onClick={post} disabled={posting || !text.trim()} style={{ fontSize: 13 }}>Post</button>
        </div>
      ) : (
        <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14 }}>
          <Link to="/login" style={{ color: 'var(--brand2)' }}>Sign in</Link> to join the discussion.
        </p>
      )}
      {comments.length === 0 ? (
        <p style={{ color: 'var(--muted)', fontSize: 13 }}>No comments yet — be the first.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {comments.map(c => (
            <div key={c._id} style={{ padding: '8px 10px', background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}>
                <Link to={`/history/${c.userId}`} style={{ fontWeight: 700, fontSize: 12, color: 'var(--brand2)' }}>{c.userName}</Link>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>{timeAgo(c.createdAt)}</span>
                  {user && (user.id === c.userId || user.role === 'admin') && (
                    <button onClick={() => remove(c._id)} style={{ fontSize: 11, color: 'var(--err)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Delete</button>
                  )}
                </div>
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.5 }}>{c.text}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
