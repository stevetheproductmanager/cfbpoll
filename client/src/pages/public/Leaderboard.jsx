import React, { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../store/AuthContext.jsx'

function MedalIcon({ rank }) {
  if (rank === 1) return <span style={{ fontSize: 22 }}>🥇</span>
  if (rank === 2) return <span style={{ fontSize: 22 }}>🥈</span>
  if (rank === 3) return <span style={{ fontSize: 22 }}>🥉</span>
  return <span style={{ fontWeight: 800, fontSize: 16, color: 'var(--muted)', minWidth: 28, textAlign: 'center' }}>#{rank}</span>
}

function StatBar({ value, max, color = 'var(--brand)' }) {
  const pct = max ? (value / max) * 100 : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 8, background: 'var(--panel-2)', borderRadius: 99, overflow: 'hidden', border: '1px solid var(--border)' }}>
        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 99, background: color, transition: 'width 400ms ease' }} />
      </div>
      <span style={{ fontSize: 13, fontWeight: 700, minWidth: 40, textAlign: 'right' }}>{value}</span>
    </div>
  )
}

export default function Leaderboard() {
  const { user } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [expandedVoter, setExpandedVoter] = useState(null)

  useEffect(() => {
    fetch('/api/ballots/leaderboard').then(r => r.json()).then(d => { setData(d); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  const maxScore = useMemo(() => data?.voters?.[0]?.score || 1, [data])
  const maxAlignment = useMemo(() => Math.max(...(data?.voters || []).map(v => v.avgAlignment), 1), [data])

  if (loading) return <div style={{ textAlign: 'center', padding: 80, color: 'var(--muted)' }}>Loading leaderboard...</div>

  if (!data?.voters?.length) {
    return (
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px 24px 80px', textAlign: 'center' }}>
        <h1 style={{ fontSize: 32, fontWeight: 900, marginBottom: 8, background: 'linear-gradient(135deg, var(--brand), var(--accent))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
          Voter Leaderboard
        </h1>
        <div className="card" style={{ padding: '60px 24px' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🏆</div>
          <h2>No voters yet</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Submit ballots and the leaderboard will populate.</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 24px 80px' }}>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <h1 style={{
          fontSize: 32, fontWeight: 900, letterSpacing: '-0.02em', marginBottom: 4,
          background: 'linear-gradient(135deg, var(--brand), var(--accent))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
        }}>Voter Leaderboard</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
          {data.voters.length} voters across {data.weeks.length} week{data.weeks.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Scoring explanation */}
      <div className="card" style={{ marginTop: 0, marginBottom: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, fontSize: 12, color: 'var(--text-secondary)' }}>
          <div><strong style={{ color: 'var(--brand2)' }}>Alignment</strong> — how close your ballot matches consensus (25 pts per exact match, fewer as you diverge)</div>
          <div><strong style={{ color: 'var(--warn)' }}>Bold Picks</strong> — teams ranked 8+ spots from consensus or not in the Top 25 at all. Bonus points for conviction.</div>
          <div><strong style={{ color: 'var(--ok)' }}>Exact Matches</strong> — teams you ranked at the exact same position as consensus</div>
        </div>
      </div>

      {/* Podium for top 3 */}
      {data.voters.length >= 3 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginBottom: 20, alignItems: 'flex-end' }}>
          {[1, 0, 2].map(idx => {
            const v = data.voters[idx]
            if (!v) return null
            const isFirst = idx === 0
            return (
              <div key={v.userId} style={{
                textAlign: 'center', padding: '16px 20px',
                background: isFirst ? 'var(--brand-glow-strong)' : 'var(--panel-2)',
                border: `1px solid ${isFirst ? 'var(--border-accent)' : 'var(--border)'}`,
                borderRadius: 14, minWidth: 140,
                transform: isFirst ? 'scale(1.05)' : 'none',
              }}>
                <MedalIcon rank={v.rank} />
                <div style={{ fontWeight: 700, fontSize: 15, marginTop: 6 }}>{v.userName}</div>
                <div style={{ fontSize: 28, fontWeight: 900, color: 'var(--brand2)', marginTop: 4 }}>{v.score}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>{v.weeksVoted} week{v.weeksVoted !== 1 ? 's' : ''}</div>
              </div>
            )
          })}
        </div>
      )}

      {/* Full table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <th style={{ width: 50, textAlign: 'center' }}>Rank</th>
            <th style={{ textAlign: 'left' }}>Voter</th>
            <th style={{ textAlign: 'center', width: 50 }}>Wks</th>
            <th style={{ textAlign: 'left', width: 180 }}>Score</th>
            <th style={{ textAlign: 'center', width: 70 }}>Align</th>
            <th style={{ textAlign: 'center', width: 60 }}>Bold</th>
            <th style={{ textAlign: 'center', width: 60 }}>Exact</th>
          </tr></thead>
          <tbody>
            {data.voters.map((v, i) => {
              const isMe = user?.id === v.userId
              const isExpanded = expandedVoter === v.userId
              return (
                <React.Fragment key={v.userId}>
                  <tr
                    onClick={() => setExpandedVoter(prev => prev === v.userId ? null : v.userId)}
                    style={{
                      borderTop: i === 0 ? 'none' : '1px solid var(--border)',
                      cursor: 'pointer',
                      background: isMe ? 'var(--brand-glow)' : 'transparent',
                    }}
                  >
                    <td style={{ textAlign: 'center' }}><MedalIcon rank={v.rank} /></td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{
                          width: 30, height: 30, borderRadius: 99, background: 'var(--brand-glow)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 13, fontWeight: 700, color: 'var(--brand2)',
                        }}>
                          {v.userName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <span style={{ fontWeight: 600, fontSize: 14 }}>{v.userName}</span>
                          {isMe && <span className="badge" style={{ marginLeft: 6, fontSize: 9, padding: '1px 6px' }}>YOU</span>}
                        </div>
                      </div>
                    </td>
                    <td style={{ textAlign: 'center', fontSize: 13 }}>{v.weeksVoted}</td>
                    <td><StatBar value={v.score} max={maxScore} /></td>
                    <td style={{ textAlign: 'center', fontWeight: 600, fontSize: 14 }}>{v.avgAlignment}</td>
                    <td style={{ textAlign: 'center', fontWeight: 600, fontSize: 14, color: 'var(--warn)' }}>{v.totalBold}</td>
                    <td style={{ textAlign: 'center', fontWeight: 600, fontSize: 14, color: 'var(--ok)' }}>{v.totalExact}</td>
                  </tr>
                  {isExpanded && (
                    <tr><td colSpan={7} style={{ padding: '8px 16px 16px', background: 'var(--panel-2)' }}>
                      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>Week-by-week breakdown</div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {v.weekDetail.map(w => (
                          <div key={w.week} className="kpi" style={{ padding: '8px 12px', minWidth: 80 }}>
                            <div className="kpi-label">Week {w.week}</div>
                            <div style={{ fontSize: 14, fontWeight: 700 }}>{w.alignment}</div>
                            <div style={{ fontSize: 10, color: 'var(--muted)' }}>{w.exact} exact · {w.bold} bold</div>
                          </div>
                        ))}
                      </div>
                      <div style={{ marginTop: 8 }}>
                        <Link to={`/history/${v.userId}`} style={{ fontSize: 12 }}>View full ballot history →</Link>
                      </div>
                    </td></tr>
                  )}
                </React.Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
