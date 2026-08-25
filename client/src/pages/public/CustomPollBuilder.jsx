import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../store/AuthContext.jsx'
import { useToast } from '../../store/ToastContext.jsx'
import { TeamLogo } from '../../hooks/useTeamLogos.jsx'
import ShareButton from '../../components/ShareButton.jsx'

const DEFAULT_WEIGHTS = { efficiency: 38, results: 25, sos: 15, quality: 12, momentum: 10 }

const METRICS = [
  { key: 'efficiency', label: 'Efficiency', color: 'var(--brand)', desc: 'Scoring offense & defense, points per game relative to the field.' },
  { key: 'results', label: 'Results', color: 'var(--ok)', desc: 'Win/loss record, margin of victory, and where games were played.' },
  { key: 'sos', label: 'Strength of Schedule', color: 'var(--warn)', desc: "How tough the team's opponents have been, iterated across the whole season." },
  { key: 'quality', label: 'Résumé Quality', color: 'var(--accent)', desc: 'Credit for beating good teams, penalties for bad losses.' },
  { key: 'momentum', label: 'Momentum', color: 'var(--err)', desc: 'Whether the team is trending up or down over its last few games.' },
]

function Slider({ metric, value, onChange, pct }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <label style={{ fontWeight: 700, fontSize: 14 }}>{metric.label}</label>
        <span style={{ fontWeight: 800, fontSize: 15, color: metric.color }}>{pct}%</span>
      </div>
      <input
        type="range" min={0} max={100} value={value}
        onChange={e => onChange(metric.key, Number(e.target.value))}
        style={{ width: '100%', accentColor: metric.color }}
      />
      <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{metric.desc}</p>
    </div>
  )
}

function WeightBar({ weights }) {
  const total = Object.values(weights).reduce((a, b) => a + b, 0) || 1
  return (
    <div style={{ display: 'flex', height: 10, borderRadius: 99, overflow: 'hidden', border: '1px solid var(--border)', marginBottom: 16 }}>
      {METRICS.map(m => (
        <div key={m.key} title={`${m.label}: ${Math.round((weights[m.key] / total) * 100)}%`}
          style={{ width: `${(weights[m.key] / total) * 100}%`, background: m.color }} />
      ))}
    </div>
  )
}

export default function CustomPollBuilder() {
  const { user, authHeaders } = useAuth()
  const toast = useToast()
  const [weights, setWeights] = useState(DEFAULT_WEIGHTS)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [mine, setMine] = useState([])

  const loadMine = useCallback(() => {
    if (!user) return
    fetch('/api/custom-polls/mine', { headers: authHeaders() }).then(r => r.json()).then(d => setMine(d.polls || [])).catch(() => {})
  }, [user, authHeaders])

  useEffect(() => { loadMine() }, [loadMine])

  const total = useMemo(() => Object.values(weights).reduce((a, b) => a + b, 0) || 1, [weights])
  const pct = useMemo(() => {
    const out = {}
    METRICS.forEach(m => { out[m.key] = Math.round((weights[m.key] / total) * 100) })
    return out
  }, [weights, total])

  const setWeight = (key, value) => setWeights(prev => ({ ...prev, [key]: value }))

  const compute = async () => {
    if (Object.values(weights).every(v => v === 0)) { toast.error('At least one metric must be above 0'); return }
    setLoading(true)
    try {
      const r = await fetch('/api/custom-polls/preview', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ season: 2025, weights }),
      })
      const d = await r.json()
      if (!r.ok) { toast.error(d.error || 'Could not compute rankings'); setLoading(false); return }
      setResult(d)
    } catch { toast.error('Could not reach server') }
    setLoading(false)
  }

  const save = async () => {
    if (!name.trim()) { toast.error('Give your poll a name'); return }
    setSaving(true)
    try {
      const r = await fetch('/api/custom-polls', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ season: 2025, name: name.trim(), weights }),
      })
      const d = await r.json()
      if (!r.ok) { toast.error(d.error || 'Could not save poll'); setSaving(false); return }
      toast.success(`Saved "${name.trim()}"`)
      setName('')
      loadMine()
    } catch { toast.error('Could not reach server') }
    setSaving(false)
  }

  const deletePoll = async (id) => {
    try {
      const r = await fetch(`/api/custom-polls/${id}`, { method: 'DELETE', headers: authHeaders() })
      if (!r.ok) { toast.error('Could not delete'); return }
      toast.info('Poll deleted')
      loadMine()
    } catch { toast.error('Could not reach server') }
  }

  if (!user) {
    return (
      <div style={{ maxWidth: 700, margin: '0 auto', padding: '24px 24px 80px', textAlign: 'center' }}>
        <h1 style={{ fontSize: 28, fontWeight: 900, marginBottom: 8 }}>Build Your Own Computer Poll</h1>
        <div className="card" style={{ padding: '40px 24px' }}>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 12 }}>Sign in to design and save a custom ranking algorithm.</p>
          <Link to="/login" className="btn btn-primary" style={{ textDecoration: 'none' }}>Sign In</Link>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 24px 80px' }}>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <h1 style={{
          fontSize: 32, fontWeight: 900, letterSpacing: '-0.02em', marginBottom: 4,
          background: 'linear-gradient(135deg, var(--brand), var(--accent))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
        }}>Custom Computer Poll</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, maxWidth: 640, margin: '0 auto' }}>
          Design your own ranking algorithm. Drag the sliders to weight what matters to you, compute a live Top 25 off this season's real data, then save it as your own poll.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 20, alignItems: 'start' }} className="ballot-grid">
        {/* Sliders */}
        <div className="card" style={{ marginTop: 0 }}>
          <h3 style={{ marginBottom: 4 }}>Weight Your Metrics</h3>
          <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>Values are automatically normalized to 100%.</p>
          <WeightBar weights={weights} />
          {METRICS.map(m => (
            <Slider key={m.key} metric={m} value={weights[m.key]} onChange={setWeight} pct={pct[m.key]} />
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button className="btn btn-primary" onClick={compute} disabled={loading} style={{ flex: 1 }}>
              {loading ? 'Computing…' : '⚙️ Compute Rankings'}
            </button>
            <button className="btn btn-ghost" onClick={() => setWeights(DEFAULT_WEIGHTS)} style={{ fontSize: 12 }}>Reset</button>
          </div>

          {result && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <h4 style={{ marginBottom: 8, fontSize: 13 }}>Save This Poll</h4>
              <input className="input" style={{ width: '100%', marginBottom: 8 }} placeholder={`Name your poll (e.g. "Steve's Ballot-o-Matic")`}
                value={name} onChange={e => setName(e.target.value)} maxLength={60} />
              <button className="btn btn-primary" onClick={save} disabled={saving} style={{ width: '100%' }}>
                {saving ? 'Saving…' : '💾 Save My Poll'}
              </button>
            </div>
          )}
        </div>

        {/* Results */}
        <div>
          {result ? (
            <div className="card" style={{ marginTop: 0, padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0 }}>Your Computer Top 25</h3>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>2025 season data</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {result.rankings.map((t, i) => (
                  <div key={t.team} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 16px', borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}>
                    <span style={{ fontWeight: 800, fontSize: 14, color: 'var(--brand2)', minWidth: 24, textAlign: 'right' }}>{t.rank}</span>
                    <TeamLogo name={t.team} size={26} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{t.team}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{t.record} · {t.conference}</div>
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace' }}>{t.score}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="card" style={{ marginTop: 0, textAlign: 'center', padding: '60px 24px', color: 'var(--muted)' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>⚙️</div>
              Set your weights and click Compute to see your Top 25.
            </div>
          )}

          {/* Saved polls */}
          {mine.length > 0 && (
            <div className="card" style={{ marginTop: 16 }}>
              <h3 style={{ marginBottom: 10 }}>My Saved Polls</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {mine.map(p => (
                  <div key={p._id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 10, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 140 }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>#1 {p.rankings?.[0]?.team || '—'} · saved {new Date(p.updatedAt).toLocaleDateString()}</div>
                    </div>
                    <Link to={`/custom-poll/${p._id}`} className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 10px', textDecoration: 'none' }}>View</Link>
                    <ShareButton title={p.name} text={`Check out my custom computer poll "${p.name}" on Poll Position`} url={`${window.location.origin}/custom-poll/${p._id}`} />
                    <button className="btn btn-ghost" onClick={() => deletePoll(p._id)} style={{ fontSize: 11, padding: '4px 10px', color: 'var(--err)' }}>Delete</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
