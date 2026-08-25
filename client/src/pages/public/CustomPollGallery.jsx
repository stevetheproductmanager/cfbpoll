import React, { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { TeamLogo } from '../../hooks/useTeamLogos.jsx'

const METRIC_LABELS = { efficiency: 'Efficiency', results: 'Results', sos: 'SOS', quality: 'Quality', momentum: 'Momentum' }

// "Computer crowd" aggregate — average rank of each team across every
// published poll, so visitors can see what the community of custom
// algorithms agrees on even without opening any single poll.
function computeCrowd(polls) {
  const totals = new Map()
  for (const p of polls) {
    for (const r of p.rankings || []) {
      const cur = totals.get(r.team) || { sum: 0, n: 0 }
      cur.sum += r.rank; cur.n += 1
      totals.set(r.team, cur)
    }
  }
  return [...totals.entries()]
    .map(([team, { sum, n }]) => ({ team, avgRank: sum / n, appearances: n }))
    .sort((a, b) => a.avgRank - b.avgRank)
    .slice(0, 25)
}

export default function CustomPollGallery() {
  const [polls, setPolls] = useState(null)
  useEffect(() => {
    fetch('/api/custom-polls/gallery').then(r => r.json()).then(d => setPolls(d.polls || [])).catch(() => setPolls([]))
  }, [])

  const crowd = useMemo(() => polls ? computeCrowd(polls) : [], [polls])

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 24px 80px' }}>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 30, fontWeight: 900, letterSpacing: '-0.02em', marginBottom: 4 }}>🖼️ Computer Poll Gallery</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, maxWidth: 620, margin: '0 auto' }}>
          Published custom polls from the community — browse how others weight the model, or remix one as a starting point for your own.
        </p>
        <Link to="/custom-poll" style={{ fontSize: 12, color: 'var(--brand2)', textDecoration: 'none', fontWeight: 600 }}>← Build your own</Link>
      </div>

      {polls === null ? (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>Loading…</div>
      ) : polls.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>
          No published polls yet. Be the first — build one and hit Publish.
        </div>
      ) : (
        <>
          {crowd.length > 0 && (
            <div className="card" style={{ marginBottom: 20 }}>
              <h3 style={{ marginBottom: 4 }}>🧠 The Computer Crowd</h3>
              <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>Average rank across all {polls.length} published poll{polls.length === 1 ? '' : 's'}.</p>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {crowd.slice(0, 10).map((t, i) => (
                  <div key={t.team} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 4px', borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}>
                    <span style={{ fontWeight: 800, fontSize: 13, color: 'var(--brand2)', minWidth: 20, textAlign: 'right' }}>{i + 1}</span>
                    <TeamLogo name={t.team} size={22} />
                    <span style={{ fontWeight: 600, fontSize: 13, flex: 1 }}>{t.team}</span>
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>avg #{t.avgRank.toFixed(1)} · in {t.appearances} poll{t.appearances === 1 ? '' : 's'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
            {polls.map(p => {
              const w = p.weights || {}
              const top = Object.entries(w).sort((a, b) => b[1] - a[1])[0]
              return (
                <div key={p._id} className="card" style={{ margin: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 10 }}>by {p.userName || 'Anonymous'} · updated {new Date(p.updatedAt).toLocaleDateString()}</div>
                  {top && (
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 10 }}>
                      Leans hardest on <span style={{ color: 'var(--brand2)', fontWeight: 700 }}>{METRIC_LABELS[top[0]] || top[0]}</span> ({Math.round(top[1] * 100)}%)
                    </div>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 10 }}>
                    {(p.rankings || []).slice(0, 3).map(t => (
                      <div key={t.team} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                        <span style={{ fontWeight: 700, color: 'var(--brand2)', minWidth: 16 }}>{t.rank}</span>
                        <TeamLogo name={t.team} size={18} /> {t.team}
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Link to={`/custom-poll/${p._id}`} className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 10px', textDecoration: 'none', flex: 1, textAlign: 'center' }}>View Full 25</Link>
                    <Link to={`/custom-poll?remix=${p._id}`} className="btn btn-primary" style={{ fontSize: 11, padding: '4px 10px', textDecoration: 'none', flex: 1, textAlign: 'center' }}>🔀 Remix</Link>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
