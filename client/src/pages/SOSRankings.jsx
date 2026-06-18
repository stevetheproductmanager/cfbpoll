import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { useRankings } from '../store/RankingsContext.jsx'
import { confColor } from '../lib/confColors'
import ConfBadge from '../components/ConfBadge.jsx'
import { useTheme } from '../theme/ThemeProvider.jsx'
import TeamLogo from '../components/TeamLogo.jsx'

const fmt = (n, d = 3) => (typeof n === 'number' ? n : 0).toFixed(d)
const fmt0 = (n) => (typeof n === 'number' ? Math.round(n) : 0)

function Bars({ items }) {
  const maxAbs = Math.max(...items.map(i => Math.abs(i.maxAbs ?? i.value ?? 0)), 1)
  return (
    <div className="bars">
      {items.map((it) => {
        const v = Number(it.value || 0)
        const w = Math.min(100, Math.abs(v) / maxAbs * 100)
        const pos = v >= 0
        return (
          <div key={it.label} className="bar-row" title={it.hint || `${it.label}: ${fmt(v)}`}>
            <div className="bar-label">{it.label}</div>
            <div className="bar-track">
              <div className={`bar-fill ${pos ? 'pos' : 'neg'}`} style={{ width: `${w}%` }} />
            </div>
            <div className="bar-val">{fmt(v, 3)}</div>
          </div>
        )
      })}
    </div>
  )
}

function GameTable({ team, rankMap, teamMap }) {
  const rows = (team?.games || []).map(g => {
    const oppObj = teamMap.get(g.opp)
    const oppConf = oppObj?.conference || 'Unknown'
    const oppRank = rankMap.get(g.opp) || '—'
    const loc = g.neutral ? 'N' : (g.home ? 'H' : 'A')
    const win = g.for > g.against
    return { opp: g.opp, oppConf, oppRank, loc, score: `${g.for}-${g.against}`, wl: win ? 'W' : 'L', week: g.week || 0 }
  }).sort((a, b) => a.week - b.week)

  if (!rows.length) return <div className="small">No games played.</div>

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ textAlign: 'left' }}>
            <th style={{ padding: '6px' }}>Week</th>
            <th style={{ padding: '6px' }}>Opponent</th>
            <th style={{ padding: '6px' }}>Conf</th>
            <th style={{ padding: '6px' }}>Opp Rank</th>
            <th style={{ padding: '6px' }}>H/A/N</th>
            <th style={{ padding: '6px' }}>Score</th>
            <th style={{ padding: '6px' }}>W/L</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
              <td style={{ padding: '6px' }}>{r.week}</td>
              <td style={{ padding: '6px' }}>{r.opp}</td>
              <td style={{ padding: '6px' }}>
                <span className="badge" style={{ borderLeft: `8px solid ${confColor(r.oppConf)}` }}>{r.oppConf}</span>
              </td>
              <td style={{ padding: '6px' }}>{r.oppRank}</td>
              <td style={{ padding: '6px' }}>{r.loc}</td>
              <td style={{ padding: '6px' }}>{r.score}</td>
              <td style={{ padding: '6px', fontWeight: 700, color: r.wl === 'W' ? 'var(--ok)' : 'var(--err)' }}>{r.wl}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Drawer({ open, team, onClose, onPrev, onNext, rankMap, teamMap }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.()
      if (e.key === 'ArrowLeft') onPrev?.()
      if (e.key === 'ArrowRight') onNext?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose, onPrev, onNext])

  if (!open || !team) return null

  const {
    name, conference, rank, w, l, results, sos, quality, rec,
    score, top10Wins, top25Wins, top50Wins, pf, pa, offRank, defRank
  } = team

  const bars = [
    { label: 'Results', value: results, hint: 'Win/Loss + MOV + venue (per-game)' },
    { label: 'SOS', value: sos, hint: 'Iterative strength + opponents\' win%' },
    { label: 'Quality', value: quality, hint: 'Top-10/25/50 wins; bad losses debits (per-game)' },
    { label: 'Recency', value: rec || 0, hint: 'Recent games weigh slightly more' },
  ]

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="drawer">
        <div className="drawer-header">
          <button className="nav-btn" onClick={onPrev} title="Previous (←)">←</button>
          <div className="drawer-title">
            <div className="drawer-rank">#{rank}</div>
            <div className="drawer-name">{name}</div>
            <span className="badge" style={{ borderLeft: `8px solid ${confColor(conference)}` }} title={conference}>
              {conference}
            </span>
          </div>
          <button className="nav-btn" onClick={onNext} title="Next (→)">→</button>
        </div>

        <div className="drawer-body">
          <div className="drawer-kpis">
            <div className="kpi"><div className="kpi-label">Record</div><div className="kpi-val">{w}-{l}</div></div>
            <div className="kpi"><div className="kpi-label">Score</div><div className="kpi-val">{fmt(score, 3)}</div></div>
            <div className="kpi"><div className="kpi-label">Top 10 W</div><div className="kpi-val">{top10Wins || 0}</div></div>
            <div className="kpi"><div className="kpi-label">Top 25 W</div><div className="kpi-val">{top25Wins || 0}</div></div>
            <div className="kpi"><div className="kpi-label">Top 50 W</div><div className="kpi-val">{top50Wins || 0}</div></div>
            <div className="kpi"><div className="kpi-label">PF</div><div className="kpi-val">{fmt0(pf)}</div></div>
            <div className="kpi"><div className="kpi-label">PA</div><div className="kpi-val">{fmt0(pa)}</div></div>
            <div className="kpi"><div className="kpi-label">Off Rank</div><div className="kpi-val">{offRank || '—'}</div></div>
            <div className="kpi"><div className="kpi-label">Def Rank</div><div className="kpi-val">{defRank || '—'}</div></div>
          </div>

          <div className="drawer-section">
            <h3 style={{ margin: '8px 0 6px' }}>How this score is built</h3>
            <Bars items={bars} />
          </div>

          <div className="drawer-section">
            <h3 style={{ margin: '12px 0 6px' }}>Games</h3>
            <GameTable team={team} rankMap={rankMap} teamMap={teamMap} />
          </div>

          <div className="drawer-section">
            <div className="row" style={{ gap: 6 }}>
              <button className="btn" onClick={onClose}>Close</button>
            </div>
          </div>
        </div>
      </aside>
    </>
  )
}

export default function SOSRankings() {
  const { theme } = useTheme()
  const { rankings: rows, loading, error, rankMap, teamMap } = useRankings()

  const [open, setOpen] = useState(false)
  const [idx, setIdx] = useState(0)

  const sosRows = useMemo(() => {
    return [...rows].sort((a, b) => (a.sosRank ?? 1e9) - (b.sosRank ?? 1e9))
  }, [rows])

  const current = sosRows[idx]

  const onPrev = useCallback(() => setIdx(i => (i <= 0 ? sosRows.length - 1 : i - 1)), [sosRows.length])
  const onNext = useCallback(() => setIdx(i => (i >= sosRows.length - 1 ? 0 : i + 1)), [sosRows.length])

  const note = useMemo(() => {
    if (rows.length && rows.every(t => (t.w || 0) + (t.l || 0) === 0))
      return 'No games were attached to teams.'
    return null
  }, [rows])

  return (
    <div className="card">
      <h2>SOS Rankings</h2>

      {error && <div className="progress"><span className="badge err">Error</span> {error}</div>}
      {note && <div className="progress"><span className="badge warn">Note</span> {note}</div>}
      {loading && <div className="progress">Building SOS rankings…</div>}

      {!loading && !error && (
        <div style={{ overflowX: 'auto', marginTop: 12 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left' }}>
                <th style={{ padding: '8px' }}>#</th>
                <th style={{ padding: '8px' }}>Team</th>
                <th style={{ padding: '8px' }}>Conf</th>
                <th style={{ padding: '8px' }}>W-L</th>
                <th style={{ padding: '8px' }}>Results</th>
                <th style={{ padding: '8px' }}>Overall Rank</th>
                <th style={{ padding: '8px' }}>SOS</th>
                <th style={{ padding: '8px' }}>Quality</th>
                <th style={{ padding: '8px' }}>Recency</th>
                <th style={{ padding: '8px' }}>Top 10 W</th>
                <th style={{ padding: '8px' }}>Top 25 W</th>
                <th style={{ padding: '8px' }}>Top 50 W</th>
                <th style={{ padding: '8px' }}>PF</th>
                <th style={{ padding: '8px' }}>PA</th>
                <th style={{ padding: '8px' }}>Off Rk</th>
                <th style={{ padding: '8px' }}>Def Rk</th>
                <th style={{ padding: '8px' }}>Score</th>
              </tr>
            </thead>
            <tbody>
              {sosRows.map((t, i) => (
                <tr
                  key={t.name}
                  style={{ borderTop: '1px solid var(--border)', cursor: 'pointer' }}
                  onClick={() => { setIdx(i); setOpen(true) }}
                >
                  <td style={{ padding: '8px' }}>{t.sosRank ?? '—'}</td>
                  <td style={{ padding: '8px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    {t.logo && <TeamLogo src={t.logo} alt={`${t.name} logo`} size={24} />}
                    <span>{t.name}</span>
                  </td>
                  <td style={{ padding: '8px' }}>
                    <ConfBadge conference={t.conference} />
                  </td>
                  <td style={{ padding: '8px' }}>{t.w}-{t.l}</td>
                  <td style={{ padding: '8px' }}>{fmt(t.results)}</td>
                  <td style={{ padding: '8px' }}>{t.rank}</td>
                  <td style={{ padding: '8px' }}>{fmt(t.sos)}</td>
                  <td style={{ padding: '8px' }}>{fmt(t.quality)}</td>
                  <td style={{ padding: '8px' }}>{fmt(t.rec || 0)}</td>
                  <td style={{ padding: '8px' }}>{t.top10Wins || 0}</td>
                  <td style={{ padding: '8px' }}>{t.top25Wins || 0}</td>
                  <td style={{ padding: '8px' }}>{t.top50Wins || 0}</td>
                  <td style={{ padding: '8px' }}>{fmt0(t.pf)}</td>
                  <td style={{ padding: '8px' }}>{fmt0(t.pa)}</td>
                  <td style={{ padding: '8px' }}>{t.offRank || '—'}</td>
                  <td style={{ padding: '8px' }}>{t.defRank || '—'}</td>
                  <td style={{ padding: '8px', fontWeight: 700 }}>{fmt(t.score, 3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Drawer
        open={open}
        team={current}
        onClose={() => setOpen(false)}
        onPrev={onPrev}
        onNext={onNext}
        rankMap={rankMap}
        teamMap={teamMap}
      />
    </div>
  )
}
