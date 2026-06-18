import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useRankings } from '../store/RankingsContext.jsx'
import ConfBadge from '../components/ConfBadge.jsx'

const fmt2 = n => n == null ? '—' : Number(n).toFixed(2)
const fmt3 = n => n == null ? '—' : Number(n).toFixed(3)

function computeNarrativeWeight({ winnerRank, loserRank, margin, isRoad, isNeutral }) {
  let w = 1
  if (loserRank <= 10) w += 2.0
  else if (loserRank <= 25) w += 1.5
  else if (loserRank <= 50) w += 1.0
  if (winnerRank > loserRank && loserRank < 200) w += 0.5
  if (margin >= 21) w += 0.6
  else if (margin >= 14) w += 0.3
  if (isRoad) w += 0.4
  if (isNeutral) w += 0.2
  return Number(w.toFixed(2))
}

function buildNarrativeEdges(rows) {
  const rankByName = new Map()
  rows.forEach(t => rankByName.set(t.name, t.rank ?? 999))
  const edges = [], seen = new Set()
  for (const t of rows || []) {
    for (const g of t.games || []) {
      const aName = t.name, bName = g.opp
      if (!aName || !bName) continue
      const aScore = g.for ?? 0, bScore = g.against ?? 0
      if (!Number.isFinite(aScore) || !Number.isFinite(bScore)) continue
      const isAWin = aScore > bScore
      const winner = isAWin ? aName : bName, loser = isAWin ? bName : aName
      const key = [winner, loser, g.week ?? 'na', Math.max(aScore, bScore), Math.min(aScore, bScore)].join('|')
      if (seen.has(key)) continue
      seen.add(key)
      const winnerRank = rankByName.get(winner) ?? 999, loserRank = rankByName.get(loser) ?? 999
      const margin = Math.abs(aScore - bScore)
      const isNeutral = !!g.neutral, isHome = !!g.home && !g.neutral
      const isRoad = !g.home && !g.neutral && isAWin === (winner === aName)
      edges.push({ id: edges.length, winner, loser, winnerRank, loserRank, margin, week: g.week ?? null, neutral: isNeutral, winnerHome: isHome && winner === aName, winnerRoad: isRoad, score: `${aScore}-${bScore}`, weight: computeNarrativeWeight({ winnerRank, loserRank, margin, isRoad, isNeutral }) })
    }
  }
  return edges
}

function findNarrativePath(edges, start, end, maxHops = 4) {
  if (!start || !end || start === end) return null
  const adj = new Map()
  for (const e of edges) { if (!adj.has(e.winner)) adj.set(e.winner, []); adj.get(e.winner).push(e.loser) }
  const queue = [{ team: start, depth: 0 }], prev = new Map([[start, null]])
  while (queue.length) {
    const { team, depth } = queue.shift()
    if (depth >= maxHops) continue
    for (const n of (adj.get(team) || [])) {
      if (prev.has(n)) continue
      prev.set(n, team)
      if (n === end) {
        const seq = [end]; let cur = end
        while (prev.get(cur) != null) { cur = prev.get(cur); seq.push(cur) }
        seq.reverse()
        return { teams: seq, steps: seq.slice(0, -1).map((w, i) => { const l = seq[i + 1]; return { from: w, to: l, game: edges.filter(e => e.winner === w && e.loser === l).sort((a, b) => b.weight - a.weight)[0] || null } }) }
      }
      queue.push({ team: n, depth: depth + 1 })
    }
  }
  return null
}

function toTeamIndex(rows) {
  const m = new Map()
  for (const t of rows || []) { if (t.name) m.set(t.name.toLowerCase(), t) }
  return m
}

function TeamPicker({ label, value, onChange, teams }) {
  const [q, setQ] = useState(value || '')
  const [open, setOpen] = useState(false)
  const box = useRef(null)
  useEffect(() => setQ(value || ''), [value])
  useEffect(() => {
    const h = e => { if (box.current && !box.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return teams.slice(0, 250)
    return teams.filter(t =>
      t.school?.toLowerCase().includes(s) ||
      t.mascot?.toLowerCase().includes(s) ||
      t.abbreviation?.toLowerCase() === s ||
      (t.alternateNames || []).some(n => String(n).toLowerCase().includes(s))
    ).slice(0, 250)
  }, [q, teams])

  const selected = useMemo(() => teams.find(t => t.school === value), [teams, value])

  return (
    <div ref={box} style={{ position: 'relative', flex: '1 1 240px', minWidth: 240 }}>
      <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)', marginBottom: 4, display: 'block' }}>{label}</label>
      <div style={{
        display: 'flex', gap: 8, alignItems: 'center',
        background: 'var(--panel-2)', border: '1px solid var(--border-strong)', borderRadius: 10, padding: '8px 12px',
      }}>
        {selected?.logos?.[0] && <img src={selected.logos[0]} alt="" style={{ width: 22, height: 22, objectFit: 'contain' }} />}
        <input
          className="input"
          style={{ background: 'transparent', border: 0, padding: 0, width: '100%', outline: 'none' }}
          placeholder="Search teams..."
          value={q}
          onFocus={() => { setOpen(true); setQ('') }}
          onChange={e => { setQ(e.target.value); if (!open) setOpen(true) }}
          onKeyDown={e => { if (e.key === 'Enter' && filtered[0]) { onChange(filtered[0].school); setQ(filtered[0].school); setOpen(false) } }}
        />
        {value && (
          <button onClick={() => { onChange(''); setQ('') }} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: '0 2px', fontSize: 16, lineHeight: 1 }} title="Clear">✕</button>
        )}
      </div>
      {open && (
        <div style={{
          position: 'absolute', zIndex: 1000, top: '100%', left: 0, right: 0, marginTop: 4,
          maxHeight: 320, overflowY: 'auto',
          background: 'var(--panel-solid)', border: '1px solid var(--border-strong)', borderRadius: 12,
          boxShadow: '0 12px 40px rgba(0,0,0,0.4)',
        }}>
          {filtered.map(t => (
            <div key={t.id}
              onClick={() => { onChange(t.school); setQ(t.school); setOpen(false) }}
              style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 12px', cursor: 'pointer', transition: 'background 100ms' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--brand-glow)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              {t.logos?.[0] && <img src={t.logos[0]} alt="" style={{ width: 22, height: 22, objectFit: 'contain' }} />}
              <div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{t.school}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>{t.conference} · {t.mascot}</div>
              </div>
            </div>
          ))}
          {!filtered.length && <div style={{ padding: 12, color: 'var(--muted)', fontSize: 13 }}>No matches</div>}
        </div>
      )}
    </div>
  )
}

function ResumeCard({ team, edges, title }) {
  if (!team) return (
    <div className="card"><h3 style={{ marginBottom: 8 }}>{title}</h3><div style={{ color: 'var(--muted)', fontSize: 13 }}>Select a team</div></div>
  )

  const name = team.name
  const wins = edges.filter(e => e.winner === name).sort((a, b) => b.weight - a.weight).slice(0, 6)
  const losses = edges.filter(e => e.loser === name).sort((a, b) => b.weight - a.weight).slice(0, 4)

  const renderLoc = e => e.neutral ? 'N' : e.winnerHome ? 'H' : e.winnerRoad ? 'A' : '—'

  const GameTable = ({ games, isWins }) => (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead><tr>
        <th style={{ padding: '6px 8px', textAlign: 'left' }}>Opponent</th>
        <th style={{ padding: '6px 8px', textAlign: 'left' }}>Rk</th>
        <th style={{ padding: '6px 8px', textAlign: 'left' }}>Wk</th>
        {isWins && <th style={{ padding: '6px 8px', textAlign: 'left' }}>Loc</th>}
        <th style={{ padding: '6px 8px', textAlign: 'left' }}>Score</th>
        <th style={{ padding: '6px 8px', textAlign: 'right' }}>Wt</th>
      </tr></thead>
      <tbody>{games.map(e => (
        <tr key={e.id}>
          <td style={{ padding: '6px 8px', fontSize: 13 }}>{isWins ? e.loser : e.winner}</td>
          <td style={{ padding: '6px 8px', fontSize: 13 }}>#{isWins ? e.loserRank : e.winnerRank}</td>
          <td style={{ padding: '6px 8px', fontSize: 13 }}>{e.week ?? '—'}</td>
          {isWins && <td style={{ padding: '6px 8px', fontSize: 13 }}>{renderLoc(e)}</td>}
          <td style={{ padding: '6px 8px', fontSize: 13 }}>{e.score}</td>
          <td style={{ padding: '6px 8px', fontSize: 13, textAlign: 'right', fontWeight: 600 }}>{fmt2(e.weight)}</td>
        </tr>
      ))}</tbody>
    </table>
  )

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        {team.logo && <img src={team.logo} alt="" style={{ width: 32, height: 32, objectFit: 'contain' }} />}
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{name}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--muted)', fontSize: 12 }}>
            #{team.rank} · {team.w}-{team.l} <ConfBadge conference={team.conference} size={16} />
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 8, marginBottom: 14 }}>
        <div className="kpi" style={{ padding: 10 }}><div className="kpi-label">Score</div><div className="kpi-val" style={{ fontSize: 15 }}>{fmt3(team.score)}</div></div>
        <div className="kpi" style={{ padding: 10 }}><div className="kpi-label">Results</div><div className="kpi-val" style={{ fontSize: 15 }}>{fmt3(team.results)}</div></div>
        <div className="kpi" style={{ padding: 10 }}><div className="kpi-label">SOS</div><div className="kpi-val" style={{ fontSize: 15 }}>{fmt3(team.sos)}</div></div>
        <div className="kpi" style={{ padding: 10 }}><div className="kpi-label">Quality</div><div className="kpi-val" style={{ fontSize: 15 }}>{fmt3(team.quality)}</div></div>
      </div>

      <h3 style={{ marginBottom: 6 }}>Best Wins</h3>
      {wins.length ? <GameTable games={wins} isWins /> : <div style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 8 }}>No notable wins</div>}

      <h3 style={{ marginTop: 14, marginBottom: 6 }}>Tough Losses</h3>
      {losses.length ? <GameTable games={losses} isWins={false} /> : <div style={{ color: 'var(--muted)', fontSize: 13 }}>No losses on record</div>}
    </div>
  )
}

function ChainStep({ step }) {
  const g = step.game
  if (!g) return <li style={{ padding: '4px 0', fontSize: 13 }}>{step.from} beat {step.to}</li>
  const loc = g.neutral ? 'neutral' : g.winnerHome ? 'home' : g.winnerRoad ? 'road' : ''
  return (
    <li style={{ padding: '4px 0', fontSize: 13, borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontWeight: 600 }}>{g.winner}</span> beat <span style={{ fontWeight: 600 }}>{g.loser}</span>{' '}
      <span style={{ color: 'var(--text-secondary)' }}>{g.score} {loc && `(${loc})`} {g.week != null && `Wk ${g.week}`}</span>
      <span className="badge" style={{ marginLeft: 6, fontSize: 10 }}>{fmt2(g.weight)}</span>
    </li>
  )
}

function ChainsCard({ teamA, teamB, edges, maxHops }) {
  const aName = teamA?.name, bName = teamB?.name
  const fwd = useMemo(() => aName && bName ? findNarrativePath(edges, aName, bName, maxHops) : null, [edges, aName, bName, maxHops])
  const rev = useMemo(() => aName && bName ? findNarrativePath(edges, bName, aName, maxHops) : null, [edges, aName, bName, maxHops])

  if (!aName || !bName) return null

  return (
    <div className="card">
      <h3 style={{ marginBottom: 4 }}>Transitive Chains</h3>
      <div style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 12 }}>Shortest "A beat B beat C..." paths within {maxHops} hops</div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>{aName} → {bName}</div>
          {fwd?.steps?.length ? (
            <ol style={{ paddingLeft: 18, margin: 0, listStyle: 'decimal' }}>{fwd.steps.map((s, i) => <ChainStep key={i} step={s} />)}</ol>
          ) : <div style={{ color: 'var(--muted)', fontSize: 13 }}>No chain found</div>}
        </div>
        <div>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>{bName} → {aName}</div>
          {rev?.steps?.length ? (
            <ol style={{ paddingLeft: 18, margin: 0, listStyle: 'decimal' }}>{rev.steps.map((s, i) => <ChainStep key={i} step={s} />)}</ol>
          ) : <div style={{ color: 'var(--muted)', fontSize: 13 }}>No chain found</div>}
        </div>
      </div>
    </div>
  )
}

export default function NarrativeExplorer() {
  const { rankings: rows, teamsRaw, loading, year } = useRankings()

  const teamsIdx = useMemo(() => {
    if (!teamsRaw?.length) return []
    return teamsRaw.filter(t => (t.classification || '').toLowerCase() === 'fbs')
  }, [teamsRaw])

  const [teamAName, setTeamAName] = useState('')
  const [teamBName, setTeamBName] = useState('')
  const [maxHops, setMaxHops] = useState(3)

  const edges = useMemo(() => buildNarrativeEdges(rows || []), [rows])

  useEffect(() => {
    if (rows?.length >= 2) {
      setTeamAName(prev => prev || rows[0].name)
      setTeamBName(prev => prev || rows[1].name)
    }
  }, [rows])

  const rowsIndex = useMemo(() => toTeamIndex(rows || []), [rows])
  const teamA = useMemo(() => rowsIndex.get(String(teamAName || '').toLowerCase()), [rowsIndex, teamAName])
  const teamB = useMemo(() => rowsIndex.get(String(teamBName || '').toLowerCase()), [rowsIndex, teamBName])

  return (
    <div>
      {/* Picker */}
      <div className="card" style={{ overflow: 'visible', position: 'relative', zIndex: 10 }}>
        <h2>Narrative Explorer</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4, marginBottom: 16 }}>
          Best wins, toughest losses, and transitive "A beat B beat C" chains between any two teams.
        </p>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <TeamPicker label="Team A" value={teamAName} onChange={setTeamAName} teams={teamsIdx} />
          <div style={{ display: 'flex', alignItems: 'center', padding: '0 4px', color: 'var(--muted)', fontWeight: 700, fontSize: 18, paddingBottom: 8 }}>vs</div>
          <TeamPicker label="Team B" value={teamBName} onChange={setTeamBName} teams={teamsIdx} />

          <div style={{ flex: '0 0 auto' }}>
            <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)', marginBottom: 4, display: 'block' }}>Max Hops</label>
            <input className="input" type="number" min={1} max={6} value={maxHops} onChange={e => setMaxHops(Math.max(1, Math.min(6, Number(e.target.value) || 3)))} style={{ width: 80 }} />
          </div>
        </div>

        {loading && <div style={{ marginTop: 12, color: 'var(--muted)', fontSize: 13 }}>Building narrative graph...</div>}
      </div>

      {/* Résumés */}
      {!loading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 12, marginTop: 12 }}>
          <ResumeCard team={teamA} edges={edges} title="Team A Résumé" />
          <ResumeCard team={teamB} edges={edges} title="Team B Résumé" />
        </div>
      )}

      {/* Chains */}
      {!loading && <div style={{ marginTop: 12 }}><ChainsCard teamA={teamA} teamB={teamB} edges={edges} maxHops={maxHops} /></div>}
    </div>
  )
}
