import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../store/AuthContext.jsx'
import { useToast } from '../../store/ToastContext.jsx'
import { TeamLogo } from '../../hooks/useTeamLogos.jsx'

export default function Heisman() {
  const { user, authHeaders } = useAuth()
  const toast = useToast()
  const [candidates, setCandidates] = useState(null)
  const [error, setError] = useState(null)
  const [results, setResults] = useState(null)
  const [myVote, setMyVote] = useState(null)
  const [voting, setVoting] = useState(false)

  useEffect(() => {
    fetch('/api/awards/heisman/candidates').then(r => r.json()).then(d => {
      if (d.error) setError(d.error); else setCandidates(d.candidates)
    }).catch(() => setError('Could not load candidates'))
    fetch('/api/awards/heisman/results').then(r => r.json()).then(setResults).catch(() => {})
  }, [])

  const vote = async (playerName, team) => {
    if (!user) { toast.info('Sign in to vote'); return }
    setVoting(true)
    try {
      const r = await fetch('/api/awards/heisman/vote', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ playerName, team }),
      })
      const d = await r.json()
      if (!r.ok) { toast.error(d.error || 'Could not vote'); setVoting(false); return }
      setMyVote(playerName)
      toast.success(`Voted for ${playerName}`)
      fetch('/api/awards/heisman/results').then(r => r.json()).then(setResults).catch(() => {})
    } catch { toast.error('Could not reach server') }
    setVoting(false)
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px 24px 80px' }}>
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <h1 style={{ fontSize: 30, fontWeight: 900, letterSpacing: '-0.02em', marginBottom: 4 }}>🏈 Heisman Straw Poll</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Candidates ranked by real season stats — cast your (non-official) vote for the nation's best player.</p>
      </div>

      {error ? (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>{error}</div>
      ) : !candidates ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>Loading candidates...</div>
      ) : (
        <div className="card" style={{ marginTop: 0, marginBottom: 12 }}>
          <h3 style={{ marginBottom: 10 }}>Top Candidates (by season production)</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {candidates.map((c, i) => (
              <div key={`${c.player}-${c.team}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 10, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 800, fontSize: 14, color: 'var(--brand2)', minWidth: 20 }}>{i + 1}</span>
                <TeamLogo name={c.team} size={26} />
                <div style={{ flex: 1, minWidth: 140 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{c.player}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>{c.team} · {c.position || 'Offense'}</div>
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'right' }}>
                  {c.passingYards > 0 && <div>{Math.round(c.passingYards)} pass yds, {c.passingTD} TD</div>}
                  {c.rushingYards > 0 && <div>{Math.round(c.rushingYards)} rush yds, {c.rushingTD} TD</div>}
                  {c.receivingYards > 0 && <div>{Math.round(c.receivingYards)} rec yds, {c.receivingTD} TD</div>}
                </div>
                <button
                  className={myVote === c.player ? 'btn btn-primary' : 'btn btn-ghost'}
                  onClick={() => vote(c.player, c.team)} disabled={voting}
                  style={{ fontSize: 11, padding: '5px 10px' }}
                >{myVote === c.player ? '✓ Voted' : 'Vote'}</button>
              </div>
            ))}
          </div>
          {!user && <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10 }}><Link to="/login" style={{ color: 'var(--brand2)' }}>Sign in</Link> to cast your vote.</p>}
        </div>
      )}

      {results?.results?.length > 0 && (
        <div className="card" style={{ marginTop: 0 }}>
          <h3 style={{ marginBottom: 10 }}>Straw Poll Results — {results.totalVotes} vote{results.totalVotes === 1 ? '' : 's'}</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {results.results.slice(0, 10).map((r, i) => {
              const pct = results.totalVotes ? Math.round((r.votes / results.totalVotes) * 100) : 0
              return (
                <div key={`${r.playerName}-${r.team}`}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 2 }}>
                    <span><strong>{i + 1}.</strong> {r.playerName} <span style={{ color: 'var(--muted)' }}>({r.team})</span></span>
                    <span style={{ fontWeight: 700 }}>{r.votes} votes · {pct}%</span>
                  </div>
                  <div style={{ height: 6, background: 'var(--panel-2)', borderRadius: 99, overflow: 'hidden', border: '1px solid var(--border)' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: 'var(--brand)' }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
