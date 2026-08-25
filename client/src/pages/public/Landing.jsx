import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../store/AuthContext.jsx'
import { TeamLogo } from '../../hooks/useTeamLogos.jsx'

const FEATURES = [
  { icon: '🗳️', title: 'Your Ballot, Your Voice', desc: 'Rank your Top 25 each week. Drag, drop, done. Your vote actually counts.', to: '/ballot' },
  { icon: '📊', title: 'Live Consensus', desc: 'See how the community ranks every team in real time. Watch the rankings shift as votes pour in.', to: '/rankings' },
  { icon: '🏆', title: 'Voter Leaderboard', desc: 'See who nails the consensus and who goes bold. Your accuracy is tracked all season.', to: '/leaderboard' },
  { icon: '📈', title: 'Visual Poll', desc: 'Explore the rankings as tiers, cards, or bubbles. Track movement week over week.', to: '/visual' },
]

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
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              Due {new Date(dashboard.deadline).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            </span>
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
            <Link to="/ballot" className="btn btn-primary" style={{ padding: '12px 32px', fontSize: 16, fontWeight: 700, borderRadius: 12, textDecoration: 'none' }}>
              Submit Your Ballot
            </Link>
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
