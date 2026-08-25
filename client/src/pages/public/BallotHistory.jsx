import React, { useEffect, useState, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useAuth } from '../../store/AuthContext.jsx'
import { TeamLogo } from '../../hooks/useTeamLogos.jsx'
import ShareButton from '../../components/ShareButton.jsx'
import Badges, { computeBadges } from '../../components/Badges.jsx'

// Consecutive weeks voted, counting backward from the most recent week that
// had any ballots at all — a missed latest week breaks the streak.
function computeStreak(weekDetail, allWeeks) {
  if (!weekDetail?.length || !allWeeks?.length) return 0
  const voted = new Set(weekDetail.map(w => w.week))
  const weekNums = allWeeks.map(w => w.week).sort((a, b) => b - a)
  let streak = 0
  for (const wk of weekNums) {
    if (voted.has(wk)) streak++
    else break
  }
  return streak
}

function MovementBadge({ movement }) {
  if (!movement) return <span style={{ fontSize: 11, color: 'var(--muted)' }}>—</span>
  const up = movement > 0
  return (
    <span style={{
      fontSize: 11, fontWeight: 700,
      color: up ? 'var(--ok)' : 'var(--err)',
      display: 'inline-flex', alignItems: 'center', gap: 2,
    }}>
      {up ? '▲' : '▼'}{Math.abs(movement)}
    </span>
  )
}

export default function BallotHistory() {
  const { userId } = useParams()
  const { user } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selectedWeek, setSelectedWeek] = useState(null)
  const [leaderboard, setLeaderboard] = useState(null)

  const targetId = userId || user?.id
  const isMe = user?.id === targetId

  useEffect(() => {
    if (!targetId) { setLoading(false); return }
    fetch(`/api/ballots/history/${targetId}`).then(r => r.json()).then(d => {
      setData(d)
      if (d.weeks?.length) setSelectedWeek(d.weeks[d.weeks.length - 1].week)
      setLoading(false)
    }).catch(() => setLoading(false))
    fetch('/api/ballots/leaderboard').then(r => r.json()).then(setLeaderboard).catch(() => {})
  }, [targetId])

  const voterStats = useMemo(() => {
    const v = leaderboard?.voters?.find(v => v.userId === targetId)
    if (!v) return null
    const streak = computeStreak(v.weekDetail, leaderboard.weeks)
    const accuracyPct = Math.round((v.avgAlignment / 25) * 100)
    return { ...v, streak, accuracyPct }
  }, [leaderboard, targetId])

  const weekData = useMemo(() => data?.weeks?.find(w => w.week === selectedWeek), [data, selectedWeek])

  if (loading) return <div style={{ textAlign: 'center', padding: 80, color: 'var(--muted)' }}>Loading history...</div>

  if (!targetId) {
    return (
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px 24px 80px', textAlign: 'center' }}>
        <h1 style={{ fontSize: 28, fontWeight: 900, marginBottom: 8 }}>Ballot History</h1>
        <div className="card" style={{ padding: '40px 24px' }}>
          <p style={{ color: 'var(--text-secondary)' }}>Sign in to see your ballot history.</p>
          <Link to="/login" className="btn btn-primary" style={{ marginTop: 12, display: 'inline-block' }}>Sign In</Link>
        </div>
      </div>
    )
  }

  if (!data?.weeks?.length) {
    return (
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px 24px 80px', textAlign: 'center' }}>
        <h1 style={{ fontSize: 28, fontWeight: 900, marginBottom: 8 }}>
          {isMe ? 'Your' : `${data?.userName || 'Voter'}'s`} Ballot History
        </h1>
        <div className="card" style={{ padding: '40px 24px' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
          <p style={{ color: 'var(--text-secondary)' }}>No ballots submitted yet.</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 24px 80px' }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <h1 style={{
          fontSize: 32, fontWeight: 900, letterSpacing: '-0.02em', marginBottom: 4,
          background: 'linear-gradient(135deg, var(--brand), var(--accent))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
        }}>{isMe ? 'Your' : `${data.userName}'s`} Ballot History</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
          {data.weeks.length} week{data.weeks.length !== 1 ? 's' : ''} of picks
          {voterStats?.streak >= 3 && <span style={{ marginLeft: 8, color: 'var(--warn)', fontWeight: 700 }}>🔥 {voterStats.streak}-week streak</span>}
        </p>
        <Badges badges={computeBadges({ voterStats, weeks: data.weeks })} />
      </div>

      {/* Back to leaderboard + share */}
      <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Link to="/leaderboard" style={{ fontSize: 13, color: 'var(--brand2)' }}>← Back to Leaderboard</Link>
        <ShareButton title={`${data.userName}'s Ballot History`} text={`Check out ${isMe ? 'my' : `${data.userName}'s`} Top 25 ballots on Poll Position`} />
      </div>

      {/* KPI tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8, marginBottom: 16 }}>
        <div className="kpi"><div className="kpi-label">Weeks Voted</div><div className="kpi-value">{data.weeks.length}</div></div>
        {voterStats && (
          <>
            <div className="kpi"><div className="kpi-label">Accuracy vs Consensus</div><div className="kpi-value">{voterStats.accuracyPct}%</div></div>
            <div className="kpi"><div className="kpi-label">Leaderboard Rank</div><div className="kpi-value">#{voterStats.rank}</div></div>
          </>
        )}
        <div className="kpi"><div className="kpi-label">Unique Teams</div><div className="kpi-value">{new Set(data.weeks.flatMap(w => w.picks.map(p => p.team))).size}</div></div>
        <div className="kpi"><div className="kpi-label">Most Consistent</div><div className="kpi-value" style={{ fontSize: 14 }}>{getMostConsistent(data.weeks)}</div></div>
        <div className="kpi"><div className="kpi-label">Biggest Mover</div><div className="kpi-value" style={{ fontSize: 14 }}>{getBiggestMover(data.weeks)}</div></div>
      </div>

      {/* Week tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {data.weeks.map(w => (
          <button key={w.week} className={`tab${selectedWeek === w.week ? ' active' : ''}`}
            onClick={() => setSelectedWeek(w.week)}>
            Week {w.week}
          </button>
        ))}
      </div>

      {/* Week detail */}
      {weekData && (
        <div className="card" style={{ marginTop: 0, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0 }}>Week {weekData.week} Ballot {weekData.ballotType === 'computer' && <span style={{ fontSize: 11, marginLeft: 6 }} title="Computer ballot">🖥️</span>}</h3>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>{weekData.picks.length} teams</span>
          </div>
          {weekData.note && (
            <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', background: 'var(--panel-2)', fontSize: 13, fontStyle: 'italic', color: 'var(--text-secondary)' }}>
              "{weekData.note}"
            </div>
          )}
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={{ width: 50, textAlign: 'center' }}>Rank</th>
              <th style={{ textAlign: 'left' }}>Team</th>
              <th style={{ textAlign: 'center', width: 90 }}>vs Prev Week</th>
              <th style={{ textAlign: 'center', width: 90 }}>vs Consensus</th>
            </tr></thead>
            <tbody>
              {weekData.picks.map((pick, i) => {
                const isBold = weekData.confidence?.[pick.team] === 'bold'
                const consensusDiff = pick.consensusRank ? pick.rank - pick.consensusRank : null
                return (
                  <tr key={pick.team} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ textAlign: 'center', fontWeight: 800, fontSize: 14, color: 'var(--brand2)' }}>{i + 1}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <TeamLogo name={pick.team} size={24} />
                        <span style={{ fontWeight: 600, fontSize: 14 }}>{pick.team}</span>
                        {pick.isNew && <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--ok)', background: 'var(--ok-muted)', padding: '1px 5px', borderRadius: 4 }}>NEW</span>}
                        {isBold && <span title="Marked as a bold/confident pick" style={{ fontSize: 9, fontWeight: 700, color: 'var(--warn)', background: 'var(--warn-muted, rgba(230,180,40,0.15))', padding: '1px 5px', borderRadius: 4 }}>🔥 BOLD</span>}
                      </div>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {pick.movement !== null ? <MovementBadge movement={pick.movement} /> : <span style={{ fontSize: 11, color: 'var(--muted)' }}>—</span>}
                    </td>
                    <td style={{ textAlign: 'center', fontSize: 12 }}>
                      {pick.consensusRank ? (
                        <span style={{ color: consensusDiff === 0 ? 'var(--muted)' : consensusDiff > 0 ? 'var(--err)' : 'var(--ok)' }}>
                          #{pick.consensusRank}{consensusDiff ? ` (${consensusDiff > 0 ? '+' : ''}${consensusDiff})` : ''}
                        </span>
                      ) : <span style={{ color: 'var(--muted)' }}>NR</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {/* Dropped teams */}
          {weekData.dropped?.length > 0 && (
            <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', background: 'var(--panel-2)' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--err)', marginBottom: 6 }}>Dropped from ballot:</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {weekData.dropped.map(t => (
                  <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', background: 'var(--err-muted)', borderRadius: 6, fontSize: 12 }}>
                    <TeamLogo name={t} size={16} />
                    <span style={{ color: 'var(--err)' }}>{t}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Week-over-week timeline */}
      {data.weeks.length > 1 && (
        <div className="card" style={{ marginTop: 12 }}>
          <h3 style={{ marginBottom: 12 }}>Pick Consistency</h3>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
            Teams that appeared on every ballot
          </div>
          {(() => {
            const allWeeks = data.weeks.map(w => new Set(w.picks.map(p => p.team)))
            const consistent = data.weeks[0].picks.map(p => p.team).filter(t => allWeeks.every(s => s.has(t)))
            if (!consistent.length) return <div style={{ color: 'var(--muted)', fontSize: 13 }}>No team appeared on every ballot.</div>
            return (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {consistent.map(t => (
                  <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: 'var(--ok-muted)', borderRadius: 8, border: '1px solid var(--ok)' }}>
                    <TeamLogo name={t} size={20} />
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{t}</span>
                  </div>
                ))}
              </div>
            )
          })()}
        </div>
      )}
    </div>
  )
}

function getMostConsistent(weeks) {
  if (weeks.length < 2) return '—'
  const allWeeks = weeks.map(w => new Set(w.picks.map(p => p.team)))
  const consistent = weeks[0].picks.map(p => p.team).filter(t => allWeeks.every(s => s.has(t)))
  return consistent[0] || '—'
}

function getBiggestMover(weeks) {
  if (weeks.length < 2) return '—'
  const last = weeks[weeks.length - 1]
  let biggest = null, biggestDiff = 0
  for (const pick of last.picks) {
    if (pick.movement == null) continue
    const diff = Math.abs(pick.movement)
    if (diff > biggestDiff) { biggestDiff = diff; biggest = pick.team }
  }
  return biggest || '—'
}
