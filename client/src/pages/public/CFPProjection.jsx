import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { TeamLogo } from '../../hooks/useTeamLogos.jsx'
import { Trophy, ArrowLeft } from 'lucide-react'

export default function CFPProjection() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch('/api/cfp-projection').then(r => r.json()).then(d => {
      if (d.error) setError(d.error); else setData(d)
    }).catch(() => setError('Could not load projection'))
  }, [])

  if (error) return <div style={{ maxWidth: 600, margin: '0 auto', padding: '24px 24px 80px', textAlign: 'center' }}><div className="card">{error}</div></div>
  if (!data) return <div style={{ textAlign: 'center', padding: 80, color: 'var(--muted)' }}>Loading projection...</div>

  const byes = data.bracket.filter(t => t.byeWeek)
  const firstRound = data.bracket.filter(t => !t.byeWeek)

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px 24px 80px' }}>
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <h1 style={{ fontSize: 30, fontWeight: 900, letterSpacing: '-0.02em', marginBottom: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}><Trophy size={26} /> CFP Projection</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>A 12-team bracket projected off this week's Top 25 — {data.note}</p>
        <Link to="/rankings" style={{ fontSize: 12, color: 'var(--brand2)', display: 'inline-flex', alignItems: 'center', gap: 4 }}><ArrowLeft size={12} /> Back to Rankings</Link>
      </div>

      <div className="card" style={{ marginTop: 0, marginBottom: 12 }}>
        <h3 style={{ marginBottom: 4 }}>Byes — Seeds 1–4</h3>
        <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>Top 4 conference "champions" (best-ranked team in each conference) skip the first round.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8 }}>
          {byes.map(t => (
            <div key={t.team} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px', background: 'var(--brand-glow-strong)', border: '1px solid var(--border-accent)', borderRadius: 10 }}>
              <span style={{ fontWeight: 900, fontSize: 18, color: 'var(--brand2)' }}>{t.seed}</span>
              <TeamLogo name={t.team} size={28} />
              <div>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{t.team}</div>
                <div style={{ fontSize: 10, color: 'var(--muted)' }}>Rank #{t.rank} · {t.conference}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginTop: 0 }}>
        <h3 style={{ marginBottom: 4 }}>First Round — Seeds 5–12</h3>
        <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>Remaining conference champs + at-large teams by rank.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {firstRound.map(t => (
            <div key={t.team} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 8 }}>
              <span style={{ fontWeight: 800, fontSize: 15, color: 'var(--brand2)', minWidth: 22 }}>{t.seed}</span>
              <TeamLogo name={t.team} size={24} />
              <div style={{ flex: 1 }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{t.team}</span>
                {t.isChamp && <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--ok)', background: 'var(--ok-muted)', padding: '1px 5px', borderRadius: 4, marginLeft: 6 }}>CHAMP</span>}
              </div>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>Rank #{t.rank} · {t.conference}</span>
            </div>
          ))}
        </div>
      </div>

      <p style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center', marginTop: 16 }}>
        Note: this is a simplified projection for fun — the real CFP committee weighs conference title games and other factors this doesn't model.
      </p>
    </div>
  )
}
