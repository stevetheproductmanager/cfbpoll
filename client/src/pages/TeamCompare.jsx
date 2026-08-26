import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useRankings } from '../store/RankingsContext.jsx'
import ConfBadge from '../components/ConfBadge.jsx'
import { X, ArrowDown } from 'lucide-react'

const clamp = (v, lo=0, hi=1) => Math.max(lo, Math.min(hi, v))
const fmt1 = n => n == null ? '—' : Number(n).toFixed(1)
const fmt3 = n => n == null ? '—' : Number(n).toFixed(3)

const PTS_PER_SCORE = 70
const HOME_PTS = 3

function predictProb(scoreA, scoreB, venue = 'neutral') {
  let a = Number(scoreA) || 0, b = Number(scoreB) || 0
  let spread = (a - b) * PTS_PER_SCORE
  if (venue === 'homeA') spread += HOME_PTS
  if (venue === 'homeB') spread -= HOME_PTS
  const pA = 1 / (1 + Math.exp(-spread / 7))
  return { pA, pB: 1 - pA, spread }
}

function projectScore(off, def, oppOff, oppDef, spread) {
  const avg = 27
  const rawA = ((off ?? avg) * 0.6 + (oppDef ?? avg) * 0.4)
  const rawB = ((oppOff ?? avg) * 0.6 + (def ?? avg) * 0.4)
  const mid = (rawA + rawB) / 2
  return { a: Math.max(7, Math.round(mid + spread / 2)), b: Math.max(7, Math.round(mid - spread / 2)) }
}

function perGame(total, games) {
  return (Number(total) || 0) / (games?.length || 1)
}

function toTeamIndex(rows) {
  const m = new Map()
  for (const t of rows || []) { const n = t.name || t.school; if (n) m.set(n.toLowerCase(), t) }
  return m
}

async function fetchMatchup({ team1, team2, year }) {
  const res = await fetch('/api/teams/compare', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ team1, team2, year })
  })
  if (!res.ok) throw new Error(`matchup HTTP ${res.status}`)
  return res.json()
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
        transition: 'border-color 150ms ease',
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
          <button onClick={() => { onChange(''); setQ(''); }} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 8, margin: -8, lineHeight: 1, display: 'inline-flex' }} title="Clear"><X size={14} /></button>
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

function TraitRow({ label, a, b, better = 'high', fmt = x => x, tip }) {
  const aNum = a == null ? null : Number(a)
  const bNum = b == null ? null : Number(b)
  const aWin = aNum != null && bNum != null && (better === 'high' ? aNum > bNum : aNum < bNum)
  const bWin = aNum != null && bNum != null && !aWin && aNum !== bNum
  const av = a == null ? '—' : fmt(aNum)
  const bv = b == null ? '—' : fmt(bNum)
  const na = (better === 'high') ? (aNum ?? 0) : (aNum != null ? 1 / Math.max(aNum, 1e-6) : 0)
  const nb = (better === 'high') ? (bNum ?? 0) : (bNum != null ? 1 / Math.max(bNum, 1e-6) : 0)
  const total = na + nb || 1
  const leftPct = Math.round((na / total) * 100)

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 1fr', gap: 10, alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }} title={tip}>
        {label}{better === 'low' && <ArrowDown size={10} style={{ marginLeft: 4, color: 'var(--muted)', verticalAlign: -1 }} />}
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: aWin ? 'var(--ok)' : 'var(--text)' }}>{av}</div>
        <div style={{ height: 4, borderRadius: 4, background: 'var(--border)', marginTop: 4, overflow: 'hidden' }}>
          <div style={{ width: `${leftPct}%`, height: '100%', background: aWin ? 'var(--ok)' : 'var(--brand)', borderRadius: 4, transition: 'width .4s ease' }} />
        </div>
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: bWin ? 'var(--ok)' : 'var(--text)' }}>{bv}</div>
        <div style={{ height: 4, borderRadius: 4, background: 'var(--border)', marginTop: 4, overflow: 'hidden' }}>
          <div style={{ width: `${100 - leftPct}%`, height: '100%', background: bWin ? 'var(--ok)' : 'var(--brand)', borderRadius: 4, transition: 'width .4s ease' }} />
        </div>
      </div>
    </div>
  )
}

function WinProbBar({ pA, nameA, nameB, logoA, logoB }) {
  const pctA = Math.round(clamp(pA) * 100)
  return (
    <div style={{ padding: '20px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {logoA && <img src={logoA} alt="" style={{ width: 28, height: 28, objectFit: 'contain' }} />}
          <span style={{ fontWeight: 700, fontSize: 15 }}>{nameA}</span>
          <span style={{ fontWeight: 800, fontSize: 18, color: pctA >= 50 ? 'var(--ok)' : 'var(--text-secondary)' }}>{pctA}%</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 800, fontSize: 18, color: pctA < 50 ? 'var(--ok)' : 'var(--text-secondary)' }}>{100 - pctA}%</span>
          <span style={{ fontWeight: 700, fontSize: 15 }}>{nameB}</span>
          {logoB && <img src={logoB} alt="" style={{ width: 28, height: 28, objectFit: 'contain' }} />}
        </div>
      </div>
      <div style={{ height: 12, borderRadius: 8, background: 'var(--border)', overflow: 'hidden', display: 'flex' }}>
        <div style={{ width: `${pctA}%`, height: '100%', background: 'linear-gradient(90deg, var(--brand), var(--brand2))', borderRadius: '8px 0 0 8px', transition: 'width .5s ease' }} />
        <div style={{ flex: 1, height: '100%', background: 'var(--panel-2)' }} />
      </div>
    </div>
  )
}

export default function TeamCompare() {
  const { rankings: rows, teamsRaw, year } = useRankings()

  const teamsIdx = useMemo(() => {
    if (!teamsRaw?.length) return []
    return teamsRaw.filter(t => (t.classification || '').toLowerCase() === 'fbs')
  }, [teamsRaw])

  const [team1, setTeam1] = useState('')
  const [team2, setTeam2] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [matchup, setMatchup] = useState(null)
  const [venue, setVenue] = useState('neutral')

  const rowsIndex = useMemo(() => toTeamIndex(rows || []), [rows])
  const A = useMemo(() => rowsIndex.get(String(team1 || '').toLowerCase()), [rowsIndex, team1])
  const B = useMemo(() => rowsIndex.get(String(team2 || '').toLowerCase()), [rowsIndex, team2])

  useEffect(() => {
    if (!rows?.length) return
    if (!team1) setTeam1(rows[0]?.name || '')
    if (!team2) setTeam2(rows[1]?.name || '')
  }, [rows])

  const { pA, pB, spread } = useMemo(() => {
    if (!A || !B) return { pA: 0.5, pB: 0.5, spread: 0 }
    return predictProb(A.score || 0, B.score || 0, venue)
  }, [A, B, venue])

  const inSeason = useMemo(() => {
    if (!A || !B) return { h2h: [], common: [] }
    const aG = A.games || [], bG = B.games || []
    const h2h = aG.filter(g => g.opp === B.name).map(g => ({
      week: g.week ?? 0, scoreA: g.for ?? 0, scoreB: g.against ?? 0,
      wlA: (g.for ?? 0) > (g.against ?? 0) ? 'W' : 'L',
      loc: g.neutral ? 'N' : (g.home ? 'H' : 'A'),
    })).sort((x, y) => x.week - y.week)
    const oppA = new Set(aG.map(g => g.opp))
    const common = [...new Set(bG.map(g => g.opp).filter(o => oppA.has(o)))].map(opp => {
      const ga = aG.find(g => g.opp === opp), gb = bG.find(g => g.opp === opp)
      return { opp, a: ga ? { wl: ga.for > ga.against ? 'W' : 'L', score: `${ga.for}-${ga.against}` } : null, b: gb ? { wl: gb.for > gb.against ? 'W' : 'L', score: `${gb.for}-${gb.against}` } : null }
    })
    return { h2h, common }
  }, [A, B])

  const stats = useMemo(() => {
    if (!A || !B) return null
    const proj = projectScore(perGame(A.pf, A.games), perGame(A.pa, A.games), perGame(B.pf, B.games), perGame(B.pa, B.games), spread)
    return { projA: proj.a, projB: proj.b }
  }, [A, B, spread])

  useEffect(() => {
    if (!team1 || !team2) { setMatchup(null); return }
    let cancelled = false
    setBusy(true); setErr(null); setMatchup(null)
    fetchMatchup({ team1, team2, year: Number(year) })
      .then(m => { if (!cancelled) setMatchup(m) })
      .catch(e => { if (!cancelled) setErr(e.message) })
      .finally(() => { if (!cancelled) setBusy(false) })
    return () => { cancelled = true }
  }, [team1, team2, year])

  const favored = pA >= pB ? A : B
  const favoredName = favored?.name || '—'

  return (
    <div>
      {/* Picker row */}
      <div className="card" style={{ overflow: 'visible', position: 'relative', zIndex: 10 }}>
        <h2>Team Comparison</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4, marginBottom: 16 }}>
          Select two teams to predict a head-to-head matchup based on season performance.
        </p>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <TeamPicker label="Team A" value={team1} onChange={setTeam1} teams={teamsIdx} />
          <div style={{ display: 'flex', alignItems: 'center', padding: '0 4px', color: 'var(--muted)', fontWeight: 700, fontSize: 18, paddingBottom: 8 }}>vs</div>
          <TeamPicker label="Team B" value={team2} onChange={setTeam2} teams={teamsIdx} />

          <div style={{ flex: '0 0 auto' }}>
            <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)', marginBottom: 4, display: 'block' }}>Venue</label>
            <select className="input" value={venue} onChange={e => setVenue(e.target.value)} style={{ width: 160 }}>
              <option value="neutral">Neutral Site</option>
              <option value="homeA">Home: {team1 || 'Team A'}</option>
              <option value="homeB">Home: {team2 || 'Team B'}</option>
            </select>
          </div>

          {busy && <span style={{ fontSize: 12, color: 'var(--muted)', alignSelf: 'center' }}>Loading series...</span>}
        </div>

        {err && <div style={{ marginTop: 12 }}><span className="badge err">Error</span> {err}</div>}
      </div>

      {/* Prediction hero */}
      {A && B && (
        <div className="card" style={{ marginTop: 12 }}>
          <WinProbBar pA={pA} nameA={A.name} nameB={B.name} logoA={A.logo} logoB={B.logo} />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
            <div className="kpi">
              <div className="kpi-label">Favored</div>
              <div className="kpi-val" style={{ fontSize: 16 }}>{favoredName}</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Spread</div>
              <div className="kpi-val" style={{ fontSize: 16 }}>{favoredName} by {Math.abs(spread).toFixed(1)}</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Projected Score</div>
              <div className="kpi-val" style={{ fontSize: 16 }}>
                {stats ? `${stats.projA} – ${stats.projB}` : `${A.name} vs ${B.name}`}
              </div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Rankings</div>
              <div className="kpi-val" style={{ fontSize: 16 }}>#{A.rank} vs #{B.rank}</div>
            </div>
          </div>
        </div>
      )}

      {/* Stat comparison */}
      {A && B && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: 12, marginTop: 12 }}>
          <div className="card">
            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 1fr', gap: 10, marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)' }}>Stat</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {A.logo && <img src={A.logo} alt="" style={{ width: 16, height: 16, objectFit: 'contain' }} />}
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>{A.name}</span>
                <ConfBadge conference={A.conference} size={14} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {B.logo && <img src={B.logo} alt="" style={{ width: 16, height: 16, objectFit: 'contain' }} />}
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>{B.name}</span>
                <ConfBadge conference={B.conference} size={14} />
              </div>
            </div>

            <TraitRow label="Score" a={A.score} b={B.score} better="high" fmt={fmt3} tip="Overall ranking score" />
            <TraitRow label="Results" a={A.results} b={B.results} better="high" fmt={fmt3} tip="Win/loss quality" />
            <TraitRow label="SOS" a={A.sos} b={B.sos} better="high" fmt={fmt3} tip="Strength of Schedule" />
            <TraitRow label="Quality" a={A.quality} b={B.quality} better="high" fmt={fmt3} tip="Quality wins metric" />
            <TraitRow label="Off Rank" a={A.offRank} b={B.offRank} better="low" fmt={x => x} tip="Offensive ranking" />
            <TraitRow label="Def Rank" a={A.defRank} b={B.defRank} better="low" fmt={x => x} tip="Defensive ranking" />
            <TraitRow label="PF / G" a={perGame(A.pf, A.games)} b={perGame(B.pf, B.games)} better="high" fmt={fmt1} />
            <TraitRow label="PA / G" a={perGame(A.pa, A.games)} b={perGame(B.pa, B.games)} better="low" fmt={fmt1} />
            <TraitRow label="Top 10 W" a={A.top10Wins} b={B.top10Wins} better="high" fmt={x => x} />
            <TraitRow label="Top 25 W" a={A.top25Wins} b={B.top25Wins} better="high" fmt={x => x} />
            <TraitRow label="Top 50 W" a={A.top50Wins} b={B.top50Wins} better="high" fmt={x => x} />
            <TraitRow label="Momentum" a={A.rec || 0} b={B.rec || 0} better="high" fmt={fmt3} tip="Recent-half vs first-half trend" />
          </div>

          {/* H2H & Common Opponents */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="card" style={{ flex: 1 }}>
              <h3 style={{ marginBottom: 8 }}>This Season H2H</h3>
              {inSeason.h2h.length ? (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr>
                    <th style={{ padding: '6px 8px', textAlign: 'left' }}>Wk</th>
                    <th style={{ padding: '6px 8px', textAlign: 'left' }}>Loc</th>
                    <th style={{ padding: '6px 8px', textAlign: 'left' }}>{A.name}</th>
                    <th style={{ padding: '6px 8px', textAlign: 'left' }}>{B.name}</th>
                    <th style={{ padding: '6px 8px', textAlign: 'left' }}>Result</th>
                  </tr></thead>
                  <tbody>{inSeason.h2h.map((g, i) => (
                    <tr key={i}>
                      <td style={{ padding: '6px 8px' }}>{g.week}</td>
                      <td style={{ padding: '6px 8px' }}>{g.loc}</td>
                      <td style={{ padding: '6px 8px', fontWeight: g.wlA === 'W' ? 700 : 400, color: g.wlA === 'W' ? 'var(--ok)' : 'var(--err)' }}>{g.scoreA}</td>
                      <td style={{ padding: '6px 8px', fontWeight: g.wlA === 'L' ? 700 : 400, color: g.wlA === 'L' ? 'var(--ok)' : 'var(--err)' }}>{g.scoreB}</td>
                      <td style={{ padding: '6px 8px' }}><span className={`badge ${g.wlA === 'W' ? 'ok' : 'err'}`}>{g.wlA}</span></td>
                    </tr>
                  ))}</tbody>
                </table>
              ) : <div style={{ color: 'var(--muted)', fontSize: 13 }}>No head-to-head this season</div>}
            </div>

            <div className="card" style={{ flex: 1 }}>
              <h3 style={{ marginBottom: 8 }}>Common Opponents</h3>
              {inSeason.common.length ? (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr>
                    <th style={{ padding: '6px 8px', textAlign: 'left' }}>Opponent</th>
                    <th style={{ padding: '6px 8px', textAlign: 'left' }}>{A.name}</th>
                    <th style={{ padding: '6px 8px', textAlign: 'left' }}>{B.name}</th>
                  </tr></thead>
                  <tbody>{inSeason.common.map((r, i) => (
                    <tr key={i}>
                      <td style={{ padding: '6px 8px', fontSize: 13 }}>{r.opp}</td>
                      <td style={{ padding: '6px 8px' }}>
                        {r.a ? <><span className={`badge ${r.a.wl === 'W' ? 'ok' : 'err'}`} style={{ marginRight: 4 }}>{r.a.wl}</span><span style={{ fontSize: 12 }}>{r.a.score}</span></> : '—'}
                      </td>
                      <td style={{ padding: '6px 8px' }}>
                        {r.b ? <><span className={`badge ${r.b.wl === 'W' ? 'ok' : 'err'}`} style={{ marginRight: 4 }}>{r.b.wl}</span><span style={{ fontSize: 12 }}>{r.b.score}</span></> : '—'}
                      </td>
                    </tr>
                  ))}</tbody>
                </table>
              ) : <div style={{ color: 'var(--muted)', fontSize: 13 }}>No common opponents yet</div>}
            </div>
          </div>
        </div>
      )}

      {/* All-time series */}
      {matchup?.ok && matchup.data?.games?.length > 0 && (
        <div className="card" style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <h3 style={{ margin: 0 }}>All-Time Series</h3>
            <span className="badge">{matchup.data.team1} {matchup.data.team1Wins} – {matchup.data.team2Wins} {matchup.data.team2}</span>
            {matchup.data.ties > 0 && <span className="badge">{matchup.data.ties} ties</span>}
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                <th style={{ padding: '6px 8px', textAlign: 'left' }}>Year</th>
                <th style={{ padding: '6px 8px', textAlign: 'left' }}>Date</th>
                <th style={{ padding: '6px 8px', textAlign: 'left' }}>Site</th>
                <th style={{ padding: '6px 8px', textAlign: 'left' }}>Score</th>
                <th style={{ padding: '6px 8px', textAlign: 'left' }}>Winner</th>
              </tr></thead>
              <tbody>
                {matchup.data.games.slice().sort((a, b) => b.season - a.season).map((g, i) => (
                  <tr key={i}>
                    <td style={{ padding: '6px 8px', fontSize: 13 }}>{g.season}</td>
                    <td style={{ padding: '6px 8px', fontSize: 13 }}>{new Date(g.date).toLocaleDateString()}</td>
                    <td style={{ padding: '6px 8px', fontSize: 13 }}>{g.neutralSite ? 'Neutral' : (g.venue || '—')}</td>
                    <td style={{ padding: '6px 8px', fontSize: 13, fontWeight: 600 }}>
                      {g.homeScore != null ? `${g.homeTeam} ${g.homeScore} – ${g.awayScore} ${g.awayTeam}` : '—'}
                    </td>
                    <td style={{ padding: '6px 8px', fontSize: 13, fontWeight: 600, color: 'var(--ok)' }}>{g.winner || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
