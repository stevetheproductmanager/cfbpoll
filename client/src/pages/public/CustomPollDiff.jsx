import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../store/AuthContext.jsx'
import { TeamLogo } from '../../hooks/useTeamLogos.jsx'
import { ArrowLeftRight, ArrowLeft } from 'lucide-react'

// Poll-vs-poll diff tool: pick any two saved/published computer polls and see
// exactly where their Top 25s disagree — a natural companion to the gallery
// and to tweaking sliders in the builder.
function PollPicker({ label, polls, value, onChange }) {
  return (
    <div style={{ flex: 1, minWidth: 220 }}>
      <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>{label}</label>
      <select className="input" style={{ width: '100%' }} value={value || ''} onChange={e => onChange(e.target.value)}>
        <option value="">Select a poll…</option>
        {polls.map(p => (
          <option key={p._id} value={p._id}>{p.name} {p.userName ? `— ${p.userName}` : ''}</option>
        ))}
      </select>
    </div>
  )
}

export default function CustomPollDiff() {
  const { user, authHeaders } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [options, setOptions] = useState([]) // mine + gallery, deduped
  const [idA, setIdA] = useState(searchParams.get('a') || '')
  const [idB, setIdB] = useState(searchParams.get('b') || '')
  const [pollA, setPollA] = useState(null)
  const [pollB, setPollB] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const load = async () => {
      const [galleryRes, mineRes] = await Promise.all([
        fetch('/api/custom-polls/gallery').then(r => r.json()).catch(() => ({ polls: [] })),
        user ? fetch('/api/custom-polls/mine', { headers: authHeaders() }).then(r => r.json()).catch(() => ({ polls: [] })) : Promise.resolve({ polls: [] }),
      ])
      const byId = new Map()
      for (const p of [...(mineRes.polls || []), ...(galleryRes.polls || [])]) byId.set(p._id, p)
      setOptions([...byId.values()])
    }
    load()
  }, [user, authHeaders])

  const fetchPoll = useCallback((id, setter) => {
    if (!id) { setter(null); return }
    fetch(`/api/custom-polls/${id}`).then(r => r.json()).then(d => setter(d.poll || null)).catch(() => setter(null))
  }, [])

  useEffect(() => { fetchPoll(idA, setPollA) }, [idA, fetchPoll])
  useEffect(() => { fetchPoll(idB, setPollB) }, [idB, fetchPoll])

  const chooseA = (id) => { setIdA(id); setSearchParams(prev => { const n = new URLSearchParams(prev); id ? n.set('a', id) : n.delete('a'); return n }) }
  const chooseB = (id) => { setIdB(id); setSearchParams(prev => { const n = new URLSearchParams(prev); id ? n.set('b', id) : n.delete('b'); return n }) }

  const rows = useMemo(() => {
    if (!pollA || !pollB) return []
    const rankA = new Map((pollA.rankings || []).map(t => [t.team, t.rank]))
    const rankB = new Map((pollB.rankings || []).map(t => [t.team, t.rank]))
    const allTeams = new Set([...rankA.keys(), ...rankB.keys()])
    const out = [...allTeams].map(team => {
      const a = rankA.get(team) ?? null
      const b = rankB.get(team) ?? null
      const gap = a != null && b != null ? a - b : null // positive = poll B ranks it higher
      return { team, a, b, gap }
    })
    out.sort((x, y) => {
      if (x.gap == null && y.gap == null) return (x.a ?? 99) - (y.a ?? 99)
      if (x.gap == null) return 1
      if (y.gap == null) return -1
      return Math.abs(y.gap) - Math.abs(x.gap)
    })
    return out
  }, [pollA, pollB])

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px 24px 80px' }}>
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <h1 style={{ fontSize: 30, fontWeight: 900, letterSpacing: '-0.02em', marginBottom: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}><ArrowLeftRight size={26} /> Compare Computer Polls</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Pick any two saved or published polls to see exactly where they disagree.</p>
        <Link to="/custom-poll" style={{ fontSize: 12, color: 'var(--brand2)', textDecoration: 'none', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}><ArrowLeft size={12} /> Back to builder</Link>
      </div>

      <div className="card" style={{ marginTop: 0, marginBottom: 16, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <PollPicker label="Poll A" polls={options} value={idA} onChange={chooseA} />
        <PollPicker label="Poll B" polls={options} value={idB} onChange={chooseB} />
      </div>

      {!pollA || !pollB ? (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>
          {options.length === 0 ? 'No polls to compare yet — build and save one first.' : 'Select two polls above to compare.'}
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'flex', padding: '10px 16px', borderBottom: '1px solid var(--border)', fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>
            <span style={{ flex: 1 }}>Team</span>
            <span style={{ width: 70, textAlign: 'center' }}>{pollA.name}</span>
            <span style={{ width: 70, textAlign: 'center' }}>{pollB.name}</span>
            <span style={{ width: 90, textAlign: 'right' }}>Gap</span>
          </div>
          {rows.map((r, i) => (
            <div key={r.team} style={{ display: 'flex', alignItems: 'center', padding: '7px 16px', borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
                <TeamLogo name={r.team} size={22} />
                <span style={{ fontWeight: 600, fontSize: 13 }}>{r.team}</span>
              </div>
              <span style={{ width: 70, textAlign: 'center', fontSize: 13, fontWeight: 700, color: 'var(--brand2)' }}>{r.a ?? '—'}</span>
              <span style={{ width: 70, textAlign: 'center', fontSize: 13, fontWeight: 700, color: 'var(--brand2)' }}>{r.b ?? '—'}</span>
              <span style={{ width: 90, textAlign: 'right', fontSize: 12, fontWeight: 700, color: r.gap == null ? 'var(--muted)' : r.gap === 0 ? 'var(--muted)' : r.gap > 0 ? 'var(--ok)' : 'var(--err)' }}>
                {r.gap == null ? (r.a != null ? 'only in A' : 'only in B') : r.gap === 0 ? 'tied' : `${r.gap > 0 ? 'B +' : 'A +'}${Math.abs(r.gap)}`}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
