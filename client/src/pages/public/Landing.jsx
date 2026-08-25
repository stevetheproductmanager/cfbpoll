import React, { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../store/AuthContext.jsx'
import { useFavorites } from '../../store/FavoritesContext.jsx'
import { TeamLogo } from '../../hooks/useTeamLogos.jsx'
import DarkHorseTracker from '../../components/DarkHorseTracker.jsx'

const FEATURES = [
  { icon: '🗳️', title: 'Your Ballot, Your Voice', desc: 'Rank your Top 25 each week. Drag, drop, done. Your vote actually counts.', to: '/ballot' },
  { icon: '📊', title: 'Live Consensus', desc: 'See how the community ranks every team in real time. Watch the rankings shift as votes pour in.', to: '/rankings' },
  { icon: '🏆', title: 'Voter Leaderboard', desc: 'See who nails the consensus and who goes bold. Your accuracy is tracked all season.', to: '/leaderboard' },
  { icon: '📈', title: 'Visual Poll', desc: 'Explore the rankings as tiers, cards, or bubbles. Track movement week over week.', to: '/visual' },
  { icon: '⚙️', title: 'Build a Computer Poll', desc: 'Design your own ranking algorithm with sliders, compute a live Top 25, and save it as your own poll.', to: '/custom-poll' },
  { icon: '🎬', title: 'Weekly Reveal', desc: 'Watch this week\'s Top 25 count down from #25 to #1, reveal-show style.', to: '/reveal' },
  { icon: '⚔️', title: 'Team Comparison', desc: 'Pick two teams and compare rank, record, and recent results side by side.', to: '/compare' },
  { icon: '🏈', title: 'Weekly Game Picks', desc: 'Pick winners for this week\'s games — a lighter, more frequent way to play.', to: '/picks' },
  { icon: '🏆', title: 'CFP Projection', desc: 'A 12-team bracket projected live off the current Top 25.', to: '/cfp-projection' },
  { icon: '🎖️', title: 'Heisman Straw Poll', desc: 'Vote for the best player in the country, ranked by real season stats.', to: '/heisman' },
]

function LiveCountdown({ deadline }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id) }, [])
  if (!deadline) return null
  const diff = new Date(deadline).getTime() - now
  if (diff <= 0) return null
  const days = Math.floor(diff / 86400000)
  const hrs = Math.floor((diff % 86400000) / 3600000)
  const mins = Math.floor((diff % 3600000) / 60000)
  const secs = Math.floor((diff % 60000) / 1000)
  const urgent = diff < 86400000
  return (
    <span style={{ fontSize: 13, fontWeight: 700, color: urgent ? 'var(--err)' : 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
      {days > 0 ? `${days}d ` : ''}{String(hrs).padStart(2, '0')}:{String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
    </span>
  )
}

function YourTeamsPanel() {
  const { user } = useAuth()
  const { favorites } = useFavorites()
  const [consensus, setConsensus] = useState(null)

  useEffect(() => {
    if (!favorites.length) return
    fetch('/api/weeks').then(r => r.json()).then(w => {
      const week = w.current?.week
      if (!week) return
      fetch(`/api/ballots/consensus?week=${week}`).then(r => r.json()).then(setConsensus).catch(() => {})
    }).catch(() => {})
  }, [favorites.length])

  const rankMap = useMemo(() => {
    const m = new Map()
    ;(consensus?.rankings || []).forEach(t => m.set(t.team, t))
    return m
  }, [consensus])

  if (!user || !favorites.length) return null

  return (
    <div style={{ maxWidth: 800, margin: '0 auto 32px', padding: '0 24px' }}>
      <div className="card" style={{ marginTop: 0 }}>
        <h3 style={{ marginBottom: 10, fontSize: 15 }}>★ Your Teams</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {favorites.map(team => {
            const t = rankMap.get(team)
            return (
              <div key={team} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                <TeamLogo name={team} size={22} />
                <span style={{ fontWeight: 600, flex: 1 }}>{team}</span>
                {t ? (
                  <>
                    <span style={{ fontWeight: 700, color: 'var(--brand2)' }}>#{t.rank}</span>
                    {t.movement !== null && t.movement !== 0 && (
                      <span style={{ fontSize: 11, fontWeight: 700, color: t.movement > 0 ? 'var(--ok)' : 'var(--err)' }}>
                        {t.movement > 0 ? '▲' : '▼'}{Math.abs(t.movement)}
                      </span>
                    )}
                  </>
                ) : <span style={{ fontSize: 12, color: 'var(--muted)' }}>Unranked</span>}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function BiggestMovers() {
  const [consensus, setConsensus] = useState(null)

  useEffect(() => {
    fetch('/api/weeks').then(r => r.json()).then(w => {
      const week = w.current?.week
      if (!week) return
      fetch(`/api/ballots/consensus?week=${week}`).then(r => r.json()).then(setConsensus).catch(() => {})
    }).catch(() => {})
  }, [])

  const movers = useMemo(() => {
    const rankings = consensus?.rankings || []
    return rankings.filter(t => t.movement).sort((a, b) => Math.abs(b.movement) - Math.abs(a.movement)).slice(0, 5)
  }, [consensus])

  if (!movers.length) return null

  return (
    <div style={{ maxWidth: 800, margin: '0 auto 32px', padding: '0 24px' }}>
      <div className="card" style={{ marginTop: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <h3 style={{ fontSize: 15, margin: 0 }}>📈 Biggest Movers — Week {consensus.week}</h3>
          <Link to="/rankings" style={{ fontSize: 12, fontWeight: 600 }}>See all →</Link>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {movers.map(t => (
            <div key={t.team} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
              <span style={{ fontWeight: 800, color: 'var(--brand2)', minWidth: 24, textAlign: 'right' }}>#{t.rank}</span>
              <TeamLogo name={t.team} size={22} />
              <span style={{ fontWeight: 600, flex: 1 }}>{t.team}</span>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>was #{t.prevRank}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: t.movement > 0 ? 'var(--ok)' : 'var(--err)' }}>
                {t.movement > 0 ? '▲' : '▼'}{Math.abs(t.movement)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function DashboardCard({ dashboard }) {
  if (!dashboard) return null

  return (
    <div style={{ maxWidth: 800, margin: '0 auto 48px', padding: '0 24px' }}>
      <div className="card" style={{ marginTop: 0, padding: 0, overflow: 'hidden' }}>
        {/* Status bar */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12,
          padding: '16px 24px', borderBottom: '1px solid var(--border)',
          background: dashboard.isOpen ? 'var(--brand-glow)' : 'var(--err-muted)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              width: 8, height: 8, borderRadius: 99,
              background: dashboard.isOpen ? 'var(--ok)' : 'var(--err)',
              boxShadow: dashboard.isOpen ? '0 0 8px var(--ok)' : 'none',
            }} />
            <span style={{ fontWeight: 700, fontSize: 15 }}>
              Week {dashboard.week} {dashboard.isOpen ? '— Voting Open' : '— Voting Closed'}
            </span>
          </div>
          {dashboard.deadline && dashboard.isOpen && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                Due {new Date(dashboard.deadline).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
              </span>
              <LiveCountdown deadline={dashboard.deadline} />
            </div>
          )}
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          {/* Stats */}
          <div style={{ display: 'flex', gap: 24 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--brand2)' }}>{dashboard.ballotCount}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Ballots This Week</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--brand2)' }}>{dashboard.totalVoters}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total Voters</div>
            </div>
          </div>

          {/* Top 5 preview */}
          {dashboard.top5.length > 0 && (
            <div style={{ flex: 1, minWidth: 240 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
                Current Top 5
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {dashboard.top5.map((t, i) => (
                  <div key={t.team} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                    <span style={{ fontWeight: 800, color: 'var(--brand2)', minWidth: 20, textAlign: 'right' }}>{i + 1}</span>
                    <TeamLogo name={t.team} size={20} />
                    <span style={{ fontWeight: 600 }}>{t.team}</span>
                    <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 'auto' }}>{t.points} pts</span>
                  </div>
                ))}
              </div>
              <Link to="/rankings" style={{ fontSize: 12, fontWeight: 600, marginTop: 8, display: 'inline-block' }}>
                View full rankings →
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function Landing() {
  const { user } = useAuth()
  const [dashboard, setDashboard] = useState(null)

  useEffect(() => {
    fetch('/api/dashboard').then(r => r.json()).then(setDashboard).catch(() => {})
  }, [])

  return (
    <div style={{ minHeight: '100vh' }}>
      {/* Hero */}
      <div style={{
        textAlign: 'center', padding: '80px 24px 48px',
        background: 'radial-gradient(ellipse at 50% 0%, var(--brand-glow-strong) 0%, transparent 70%)',
      }}>
        <div style={{ fontSize: 64, marginBottom: 16, filter: 'drop-shadow(0 4px 24px rgba(77, 142, 255, 0.4))' }}>🏈</div>
        <h1 style={{
          fontSize: 'clamp(36px, 6vw, 56px)', fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1.1, marginBottom: 12,
        }}>
          <span style={{ background: 'linear-gradient(135deg, var(--brand), var(--accent))', WebkitBackgroundClip: 'text',  backgroundClip: 'text' }}>
            Poll Position
          </span>
        </h1>
        <p style={{ fontSize: 'clamp(16px, 2.5vw, 20px)', color: 'var(--text-secondary)', maxWidth: 560, margin: '0 auto 40px', lineHeight: 1.6 }}>
          The people's college football poll. Rank your Top 25, see how the world votes, and finally settle the argument.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          {user ? (
            <>
              <Link to="/ballot" className="btn btn-primary" style={{ padding: '12px 32px', fontSize: 16, fontWeight: 700, borderRadius: 12, textDecoration: 'none' }}>
                Submit Your Ballot
              </Link>
              <Link to="/for-you" className="btn" style={{ padding: '12px 24px', fontSize: 16, borderRadius: 12, textDecoration: 'none' }}>
                ⭐ For You
              </Link>
            </>
          ) : (
            <Link to="/login" className="btn btn-primary" style={{ padding: '12px 32px', fontSize: 16, fontWeight: 700, borderRadius: 12, textDecoration: 'none' }}>
              Get Started — It's Free
            </Link>
          )}
          <Link to="/rankings" className="btn" style={{ padding: '12px 24px', fontSize: 16, borderRadius: 12, textDecoration: 'none' }}>
            View Rankings
          </Link>
        </div>
      </div>

      {/* Live dashboard */}
      <DashboardCard dashboard={dashboard} />
      <YourTeamsPanel />
      <BiggestMovers />
      <DarkHorseTracker />

      {/* Features */}
      <div style={{
        maxWidth: 1000, margin: '0 auto', padding: '0 24px 80px',
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16,
      }}>
        {FEATURES.map(f => (
          <Link key={f.title} to={f.to} className="card" style={{ textAlign: 'center', marginTop: 0, textDecoration: 'none', color: 'inherit' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>{f.icon}</div>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>{f.title}</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.5 }}>{f.desc}</p>
          </Link>
        ))}
      </div>

      {/* CTA */}
      <div style={{
        textAlign: 'center', padding: '60px 24px',
        borderTop: '1px solid var(--border)',
        background: 'radial-gradient(ellipse at 50% 100%, var(--accent-glow) 0%, transparent 70%)',
      }}>
        <h2 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 8 }}>Ready to have your say?</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 24 }}>Join fans ranking college football every week.</p>
        {!user && (
          <Link to="/login" className="btn btn-primary" style={{ padding: '12px 32px', fontSize: 16, fontWeight: 700, borderRadius: 12, textDecoration: 'none' }}>
            Sign Up Free
          </Link>
        )}
      </div>

      {/* Footer */}
      <footer style={{ textAlign: 'center', padding: '24px', color: 'var(--muted)', fontSize: 12, borderTop: '1px solid var(--border)' }}>
        Poll Position — Not affiliated with the AP, CFP, or NCAA. Just fans who care too much.
      </footer>
    </div>
  )
}
