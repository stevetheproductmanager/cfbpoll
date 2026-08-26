import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Trophy, ArrowLeft } from 'lucide-react'

// Scores every published custom poll against actual completed games this
// season — a ranked team is "predicted" to beat an unranked one, and the
// higher-ranked team is predicted to beat the lower-ranked one — so the
// granular tuning in the builder has a real scoreboard, not just vibes.
export default function CustomPollLeaderboard() {
  const [data, setData] = useState(null)
  const [expanded, setExpanded] = useState(null)

  useEffect(() => {
    fetch('/api/custom-polls/leaderboard').then(r => r.json()).then(setData).catch(() => setData({ polls: [] }))
  }, [])

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px 24px 80px' }}>
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <h1 style={{ fontSize: 30, fontWeight: 900, letterSpacing: '-0.02em', marginBottom: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}><Trophy size={26} /> Custom Poll Accuracy</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, maxWidth: 560, margin: '0 auto' }}>
          Every published computer poll, graded against this season's actual game results — how often did its Top 25 correctly predict the winner?
        </p>
        <Link to="/custom-poll" style={{ fontSize: 12, color: 'var(--brand2)', textDecoration: 'none', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}><ArrowLeft size={12} /> Back to builder</Link>
      </div>

      {!data ? (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>Loading…</div>
      ) : data.polls.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>
          No graded polls yet — publish a computer poll and check back once some games have been played this season.
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {data.polls.map((p, i) => {
            const isOpen = expanded === p.pollId
            return (
              <div key={p.pollId} style={{ borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}>
                <div
                  onClick={() => setExpanded(isOpen ? null : p.pollId)}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', cursor: 'pointer' }}
                >
                  <span style={{ fontWeight: 800, fontSize: 15, color: 'var(--brand2)', minWidth: 24, textAlign: 'right' }}>{i + 1}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>by {p.userName} · {p.correct}/{p.total} predictions correct</div>
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--brand2)' }}>{p.accuracyPct}%</div>
                </div>
                {isOpen && (
                  <div style={{ padding: '0 16px 12px 52px', display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {p.weekDetail.map(w => (
                      <div key={w.week} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--muted)' }}>
                        <span>Week {w.week}</span>
                        <span>{w.correct}/{w.total} ({w.pct}%)</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
