import React, { useState, useEffect, useMemo } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { TeamLogo } from '../../hooks/useTeamLogos.jsx'
import { Swords } from 'lucide-react'

function useTeamBundle(name) {
  const [detail, setDetail] = useState(null)
  const [resume, setResume] = useState(null)
  useEffect(() => {
    if (!name) { setDetail(null); setResume(null); return }
    fetch(`/api/ballots/team-detail?team=${encodeURIComponent(name)}`).then(r => r.json()).then(setDetail).catch(() => {})
    fetch('/api/teams/resumes').then(r => r.json()).then(d => setResume(d.teams?.[name] || null)).catch(() => {})
  }, [name])
  return { detail, resume }
}

function TeamColumn({ name, bundle, other }) {
  const { detail, resume } = bundle
  const latest = detail?.rankHistory?.[detail.rankHistory.length - 1]
  const best = useMemo(() => {
    const ranked = (detail?.rankHistory || []).filter(w => w.rank)
    if (!ranked.length) return null
    return ranked.reduce((a, b) => (b.rank < a.rank ? b : a))
  }, [detail])
  const h2h = useMemo(() => (resume?.games || []).find(g => g.opp === other), [resume, other])

  if (!name) return <div className="card" style={{ marginTop: 0, textAlign: 'center', padding: 40, color: 'var(--muted)' }}>Pick a team</div>

  return (
    <div className="card" style={{ marginTop: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <TeamLogo name={name} size={40} />
        <div>
          <Link to={`/team/${encodeURIComponent(name)}`} style={{ fontWeight: 800, fontSize: 18, color: 'inherit', textDecoration: 'none' }}>{name}</Link>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>{resume?.conference || ''}</div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
        <div className="kpi"><div className="kpi-label">Current Rank</div><div style={{ fontSize: 18, fontWeight: 800 }}>{latest?.rank ? `#${latest.rank}` : 'NR'}</div></div>
        <div className="kpi"><div className="kpi-label">Record</div><div style={{ fontSize: 18, fontWeight: 800 }}>{resume?.record || '—'}</div></div>
        <div className="kpi"><div className="kpi-label">Season High</div><div style={{ fontSize: 18, fontWeight: 800 }}>{best ? `#${best.rank}` : '—'}</div></div>
        <div className="kpi"><div className="kpi-label">Voters (this wk)</div><div style={{ fontSize: 18, fontWeight: 800 }}>{detail?.voters?.length ?? '—'}</div></div>
      </div>
      {h2h && (
        <div style={{ padding: '8px 10px', borderRadius: 8, background: h2h.res === 'W' ? 'var(--ok-muted, rgba(46,204,113,0.12))' : 'var(--err-muted)', fontSize: 12, marginBottom: 8 }}>
          Head-to-head: <strong>{h2h.res === 'W' ? 'Won' : 'Lost'}</strong> {h2h.pf}-{h2h.pa} (Week {h2h.week})
        </div>
      )}
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', marginBottom: 6 }}>Last 5 Games</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {(resume?.games || []).slice(-5).reverse().map((g, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', borderRadius: 8, background: 'var(--panel-2)', fontSize: 12 }}>
            <span style={{ width: 16, fontWeight: 800, color: g.res === 'W' ? 'var(--ok)' : 'var(--err)' }}>{g.res}</span>
            <span style={{ flex: 1 }}>{g.home ? 'vs' : '@'} {g.opp}{g.oppRank ? ` (#${g.oppRank})` : ''}</span>
            <span style={{ fontWeight: 600 }}>{g.pf}-{g.pa}</span>
          </div>
        ))}
        {!resume?.games?.length && <p style={{ color: 'var(--muted)', fontSize: 12 }}>No games yet.</p>}
      </div>
    </div>
  )
}

export default function TeamCompare() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [teamList, setTeamList] = useState([])
  const [a, setA] = useState(searchParams.get('a') || '')
  const [b, setB] = useState(searchParams.get('b') || '')

  useEffect(() => {
    fetch('/api/teams/resumes').then(r => r.json()).then(d => {
      setTeamList(Object.keys(d.teams || {}).sort())
    }).catch(() => {})
  }, [])

  useEffect(() => {
    const p = {}
    if (a) p.a = a
    if (b) p.b = b
    setSearchParams(p, { replace: true })
  }, [a, b]) // eslint-disable-line react-hooks/exhaustive-deps

  const bundleA = useTeamBundle(a)
  const bundleB = useTeamBundle(b)

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 24px 80px' }}>
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <h1 style={{ fontSize: 28, fontWeight: 900, letterSpacing: '-0.02em', marginBottom: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}><Swords size={24} /> Team Comparison</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Pick two teams to compare rank, record, and recent results side by side.</p>
      </div>

      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
        <select className="input" value={a} onChange={e => setA(e.target.value)} style={{ minWidth: 200 }}>
          <option value="">Select Team A…</option>
          {teamList.filter(t => t !== b).map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <span style={{ alignSelf: 'center', fontWeight: 800, color: 'var(--muted)' }}>VS</span>
        <select className="input" value={b} onChange={e => setB(e.target.value)} style={{ minWidth: 200 }}>
          <option value="">Select Team B…</option>
          {teamList.filter(t => t !== a).map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }} className="ballot-grid">
        <TeamColumn name={a} bundle={bundleA} other={b} />
        <TeamColumn name={b} bundle={bundleB} other={a} />
      </div>
    </div>
  )
}
