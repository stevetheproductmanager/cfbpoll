import React, { useState, useEffect } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../../store/AuthContext.jsx'
import { useFavorites } from '../../store/FavoritesContext.jsx'
import { TeamLogo } from '../../hooks/useTeamLogos.jsx'
import Badges, { computeBadges } from '../../components/Badges.jsx'

const BALLOT_KEY = 'pollposition_ballot'

// A personalized dashboard combining what's otherwise scattered across the
// site: favorite teams' movement, this week's ballot status, accuracy trend,
// and saved custom polls — all from endpoints that already exist.
export default function ForYou() {
  const { user, authHeaders } = useAuth()
  const { favorites } = useFavorites()
  const [weekInfo, setWeekInfo] = useState(null)
  const [consensus, setConsensus] = useState(null)
  const [myBallotSubmitted, setMyBallotSubmitted] = useState(null)
  const [leaderboard, setLeaderboard] = useState(null)
  const [myCustomPolls, setMyCustomPolls] = useState([])

  useEffect(() => {
    if (!user) return
    fetch('/api/weeks').then(r => r.json()).then(setWeekInfo).catch(() => {})
    fetch('/api/ballots/leaderboard').then(r => r.json()).then(setLeaderboard).catch(() => {})
    fetch('/api/custom-polls/mine', { headers: authHeaders() }).then(r => r.json()).then(d => setMyCustomPolls(d.polls || [])).catch(() => {})
  }, [user, authHeaders])

  useEffect(() => {
    const week = weekInfo?.current?.week
    if (!week) return
    fetch(`/api/ballots/consensus?week=${week}`).then(r => r.json()).then(setConsensus).catch(() => {})
    fetch(`/api/ballots?week=${week}`).then(r => r.json()).then(ballots => {
      const arr = Array.isArray(ballots) ? ballots : ballots.ballots || []
      setMyBallotSubmitted(arr.some(b => b.userId === user?.id))
    }).catch(() => {})
  }, [weekInfo, user])

  if (!user) return <Navigate to="/login" replace />

  const rankMap = new Map((consensus?.rankings || []).map(t => [t.team, t]))
  const voterStats = leaderboard?.voters?.find(v => v.userId === user.id)
  const accuracyPct = voterStats ? Math.round((voterStats.avgAlignment / 25) * 100) : null
  const badges = computeBadges({ voterStats: voterStats ? { ...voterStats, accuracyPct } : null, weeks: [] })

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 24px 80px' }}>
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <h1 style={{
          fontSize: 30, fontWeight: 900, letterSpacing: '-0.02em', marginBottom: 4,
          background: 'linear-gradient(135deg, var(--brand), var(--accent))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
        }}>⭐ For You</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Welcome back, {user.name}.</p>
        <Badges badges={badges} />
      </div>

      {/* Ballot status */}
      <div className="card" style={{ marginTop: 0, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 32 }}>{myBallotSubmitted ? '✅' : '🗳️'}</div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>
            {myBallotSubmitted === null ? 'Checking your ballot…' : myBallotSubmitted ? `Week ${weekInfo?.current?.week} ballot submitted` : `You haven't voted for Week ${weekInfo?.current?.week || ''} yet`}
          </div>
          {weekInfo?.current?.deadline && (
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              Deadline: {new Date(weekInfo.current.deadline).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            </div>
          )}
        </div>
        <Link to="/ballot" className="btn btn-primary" style={{ textDecoration: 'none', fontSize: 13 }}>
          {myBallotSubmitted ? 'Edit Ballot' : 'Submit Ballot'}
        </Link>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
        {/* Your teams */}
        <div className="card" style={{ marginTop: 0 }}>
          <h3 style={{ marginBottom: 10 }}>★ Your Teams</h3>
          {favorites.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {favorites.map(team => {
                const t = rankMap.get(team)
                return (
                  <Link key={team} to={`/team/${encodeURIComponent(team)}`} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'inherit', textDecoration: 'none' }}>
                    <TeamLogo name={team} size={20} />
                    <span style={{ fontWeight: 600, flex: 1 }}>{team}</span>
                    {t ? (
                      <>
                        <span style={{ fontWeight: 700, color: 'var(--brand2)' }}>#{t.rank}</span>
                        {t.movement != null && t.movement !== 0 && (
                          <span style={{ fontSize: 11, fontWeight: 700, color: t.movement > 0 ? 'var(--ok)' : 'var(--err)' }}>
                            {t.movement > 0 ? '▲' : '▼'}{Math.abs(t.movement)}
                          </span>
                        )}
                      </>
                    ) : <span style={{ fontSize: 11, color: 'var(--muted)' }}>Unranked</span>}
                  </Link>
                )
              })}
            </div>
          ) : <p style={{ fontSize: 12, color: 'var(--muted)' }}>Star teams on their team page to track them here.</p>}
        </div>

        {/* Your accuracy */}
        <div className="card" style={{ marginTop: 0 }}>
          <h3 style={{ marginBottom: 10 }}>🎯 Your Accuracy</h3>
          {voterStats ? (
            <>
              <div style={{ display: 'flex', gap: 16, marginBottom: 8 }}>
                <div><div style={{ fontSize: 24, fontWeight: 800, color: 'var(--brand2)' }}>{accuracyPct}%</div><div style={{ fontSize: 11, color: 'var(--muted)' }}>vs consensus</div></div>
                <div><div style={{ fontSize: 24, fontWeight: 800 }}>#{voterStats.rank}</div><div style={{ fontSize: 11, color: 'var(--muted)' }}>leaderboard</div></div>
              </div>
              <Link to={`/history/${user.id}`} style={{ fontSize: 12, color: 'var(--brand2)' }}>View full history →</Link>
            </>
          ) : <p style={{ fontSize: 12, color: 'var(--muted)' }}>Vote a few weeks to build your accuracy stats.</p>}
        </div>

        {/* Your custom polls */}
        <div className="card" style={{ marginTop: 0 }}>
          <h3 style={{ marginBottom: 10 }}>⚙️ Your Computer Polls</h3>
          {myCustomPolls.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {myCustomPolls.slice(0, 4).map(p => (
                <Link key={p._id} to={`/custom-poll/${p._id}`} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'inherit', textDecoration: 'none' }}>
                  <span style={{ fontWeight: 600 }}>{p.name}{p.published && ' 📡'}</span>
                  <span style={{ color: 'var(--muted)' }}>#1 {p.rankings?.[0]?.team || '—'}</span>
                </Link>
              ))}
            </div>
          ) : <p style={{ fontSize: 12, color: 'var(--muted)' }}>You haven't built one yet.</p>}
          <Link to="/custom-poll" className="btn btn-ghost" style={{ fontSize: 11, marginTop: 10, display: 'inline-block', textDecoration: 'none' }}>
            {myCustomPolls.length ? 'Manage polls' : 'Build your first poll'} →
          </Link>
        </div>
      </div>
    </div>
  )
}
