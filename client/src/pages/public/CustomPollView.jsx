import React, { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { TeamLogo } from '../../hooks/useTeamLogos.jsx'
import ShareButton from '../../components/ShareButton.jsx'
import { ArrowLeftRight, Shuffle, ArrowRight } from 'lucide-react'

const METRIC_LABELS = { efficiency: 'Efficiency', results: 'Results', sos: 'SOS', quality: 'Résumé Quality', momentum: 'Momentum', conference: 'Conf. Strength' }
const METRIC_COLORS = { efficiency: 'var(--brand)', results: 'var(--ok)', sos: 'var(--warn)', quality: 'var(--accent)', momentum: 'var(--err)', conference: '#a78bfa' }

export default function CustomPollView() {
  const { id } = useParams()
  const [poll, setPoll] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch(`/api/custom-polls/${id}`).then(r => r.json()).then(d => {
      if (d.error) setError(d.error); else setPoll(d.poll)
      setLoading(false)
    }).catch(() => { setError('Could not load poll'); setLoading(false) })
  }, [id])

  if (loading) return <div style={{ textAlign: 'center', padding: 80, color: 'var(--muted)' }}>Loading poll...</div>
  if (error || !poll) {
    return (
      <div style={{ maxWidth: 600, margin: '0 auto', padding: '24px 24px 80px', textAlign: 'center' }}>
        <div className="card"><p style={{ color: 'var(--text-secondary)' }}>{error || 'Poll not found'}</p></div>
      </div>
    )
  }

  const total = Object.values(poll.weights || {}).reduce((a, b) => a + b, 0) || 1

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: '24px 24px 80px' }}>
      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Custom Computer Poll</div>
        <h1 style={{ fontSize: 30, fontWeight: 900, marginBottom: 4 }}>{poll.name}</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
          by {poll.userName} · {poll.season} season
          {poll.published && <span title="Auto-submits as its owner's Computer ballot each week" style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, color: 'var(--brand2)', background: 'var(--brand-glow)', padding: '1px 6px', borderRadius: 6 }}>LIVE</span>}
        </p>
      </div>

      <div className="card" style={{ marginTop: 0, marginBottom: 12 }}>
        <div style={{ display: 'flex', height: 10, borderRadius: 99, overflow: 'hidden', border: '1px solid var(--border)', marginBottom: 10 }}>
          {Object.entries(poll.weights || {}).map(([k, v]) => (
            <div key={k} title={`${METRIC_LABELS[k]}: ${Math.round((v / total) * 100)}%`} style={{ width: `${(v / total) * 100}%`, background: METRIC_COLORS[k] }} />
          ))}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: 12 }}>
          {Object.entries(poll.weights || {}).map(([k, v]) => (
            <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: 99, background: METRIC_COLORS[k] }} />
              {METRIC_LABELS[k]} {Math.round((v / total) * 100)}%
            </span>
          ))}
        </div>
        <div style={{ marginTop: 10, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Link to={`/custom-poll/diff?a=${poll._id}`} className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 10px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}><ArrowLeftRight size={12} /> Compare</Link>
          <Link to={`/custom-poll?remix=${poll._id}`} className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 10px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Shuffle size={12} /> Remix</Link>
          <ShareButton title={poll.name} text={`Check out this custom computer poll "${poll.name}" on Poll Position`} />
        </div>
      </div>

      <div className="card" style={{ marginTop: 0, padding: 0, overflow: 'hidden' }}>
        {(poll.rankings || []).map((t, i) => {
          const delta = t.officialRank != null ? t.officialRank - t.rank : null
          return (
            <div key={t.team} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 16px', borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}>
              <span style={{ fontWeight: 800, fontSize: 14, color: 'var(--brand2)', minWidth: 24, textAlign: 'right' }}>{t.rank}</span>
              <TeamLogo name={t.team} size={26} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{t.team}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>{t.record} · {t.conference}</div>
              </div>
              {delta != null && delta !== 0 && (
                <span title={`Official computer model ranks this team #${t.officialRank}`} style={{
                  fontSize: 11, fontWeight: 700, padding: '1px 6px', borderRadius: 6,
                  color: delta > 0 ? 'var(--ok)' : 'var(--err)',
                  background: delta > 0 ? 'var(--ok-muted, rgba(46,204,113,0.12))' : 'var(--err-muted)',
                }}>{delta > 0 ? '▲' : '▼'}{Math.abs(delta)}</span>
              )}
            </div>
          )
        })}
      </div>

      <div style={{ textAlign: 'center', marginTop: 16 }}>
        <Link to="/custom-poll" style={{ fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 4 }}>Build your own computer poll <ArrowRight size={13} /></Link>
      </div>
    </div>
  )
}
