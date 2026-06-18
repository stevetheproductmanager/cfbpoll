import React, { useEffect, useMemo, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useRankings } from '../store/RankingsContext.jsx'
import { confColor } from '../lib/confColors'
import ConfBadge from '../components/ConfBadge.jsx'

const toNum = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }
const isFiniteNum = (v) => Number.isFinite(Number(v))
const fmt = (v, d=3) => { const n = Number(v); return Number.isFinite(n) ? n.toFixed(d) : (0).toFixed(d) }
const fmtOrDash = (v, d=2) => { const n = Number(v); return Number.isFinite(n) ? n.toFixed(d) : '—' }
const pct = (num, den) => (den > 0 ? (num / den) : NaN)

function median(arr) {
  const xs = arr.filter(Number.isFinite).slice().sort((a,b)=>a-b)
  if (!xs.length) return NaN
  const mid = Math.floor(xs.length/2)
  return xs.length % 2 ? xs[mid] : (xs[mid-1] + xs[mid]) / 2
}
function stdev(arr) {
  const xs = arr.filter(Number.isFinite)
  const n = xs.length; if (!n) return NaN
  const mean = xs.reduce((s,x)=>s+x,0)/n
  const v = xs.reduce((s,x)=> s + Math.pow(x-mean,2), 0) / n
  return Math.sqrt(v)
}
const countIf = (list, fn) => { let c=0; for (const x of list) if (fn(x)) c++; return c }

function getTeamResults(t){
  const r = [t?.results, t?.result, t?.baseline].find(isFiniteNum)
  if (isFiniteNum(r)) return Number(r)
  const w = toNum(t?.w), l = toNum(t?.l)
  const gp = w + l
  return gp > 0 ? (w / gp) : 0
}

function avgOf(list, pick){
  let sum = 0, cnt = 0
  for (const x of list){ const v = pick(x); if (Number.isFinite(v)){ sum += v; cnt++ } }
  return cnt ? (sum / cnt) : NaN
}

function aggregateConferences(teams) {
  const byConf = new Map()
  for (const t of teams) {
    const key = t?.conference || 'Unknown'
    if (!byConf.has(key)) byConf.set(key, [])
    byConf.get(key).push(t)
  }

  const rows = []
  for (const [conference, list] of byConf.entries()) {
    list.sort((a,b)=> toNum(b?.score) - toNum(a?.score))

    const count = list.length
    const sumW = list.reduce((s,t)=> s + toNum(t?.w), 0)
    const sumL = list.reduce((s,t)=> s + toNum(t?.l), 0)
    const gamesTotal = sumW + sumL

    const avgScore    = avgOf(list, t => toNum(t?.score))
    const medianScore = median(list.map(t => toNum(t?.score)))
    const avgResult   = avgOf(list, t => getTeamResults(t))
    const avgSOS      = avgOf(list, t => toNum(t?.sos))
    const avgQuality  = avgOf(list, t => toNum(t?.quality))
    const avgRank     = avgOf(list, t => isFiniteNum(t?.rank) ? Number(t.rank) : NaN)
    const avgOffRank  = avgOf(list, t => isFiniteNum(t?.offRank) ? Number(t.offRank) : NaN)
    const avgDefRank  = avgOf(list, t => isFiniteNum(t?.defRank) ? Number(t.defRank) : NaN)
    const winPct = pct(sumW, gamesTotal)
    const top25Teams = countIf(list, t => isFiniteNum(t?.rank) && Number(t.rank) <= 25)
    const scoreStdev = stdev(list.map(t => toNum(t?.score)))

    let hiRank = NaN, lowRank = NaN
    for (const t of list){
      if (isFiniteNum(t?.rank)){
        const rk = Number(t?.rank)
        if (!Number.isFinite(hiRank) || rk < hiRank) hiRank = rk
        if (!Number.isFinite(lowRank) || rk > lowRank) lowRank = rk
      }
    }

    rows.push({
      conference, teams: list, count,
      sumW, sumL, gamesTotal, winPct, avgRank,
      hiRank: Number.isFinite(hiRank) ? hiRank : null,
      lowRank: Number.isFinite(lowRank) ? lowRank : null,
      avgScore, medianScore, avgResult, avgSOS, avgQuality,
      avgOffRank, avgDefRank, top25Teams, scoreStdev,
      confScore: avgScore,
    })
  }

  rows.sort((a,b)=> (toNum(b.confScore) - toNum(a.confScore)))
  rows.forEach((r, i)=> r.rank = i+1)
  return rows
}

function Bars({ items }) {
  const vals = items.map(i => Number(i?.value ?? 0)).filter(Number.isFinite)
  const maxAbs = Math.max(1, ...vals.map(Math.abs))
  return (
    <div className="bars">
      {items.map((it) => {
        const v = Number(it?.value ?? 0)
        const vSafe = Number.isFinite(v) ? v : 0
        const w = Math.min(100, Math.abs(vSafe) / maxAbs * 100)
        const pos = vSafe >= 0
        return (
          <div key={it.label} className="bar-row" title={it.hint || `${it.label}: ${fmt(vSafe)}`}>
            <div className="bar-label">{it.label}</div>
            <div className="bar-track">
              <div className={`bar-fill ${pos ? 'pos' : 'neg'}`} style={{ width: `${w}%` }} />
            </div>
            <div className="bar-val">{fmt(vSafe,3)}</div>
          </div>
        )
      })}
    </div>
  )
}

function CopyButton({ payload }) {
  const [ok, setOk] = useState(false)
  return (
    <button className="btn" onClick={async (e) => {
      e.stopPropagation()
      await navigator.clipboard.writeText(payload)
      setOk(true); setTimeout(() => setOk(false), 1200)
    }} title="Copy summary" style={{ width: '4.5em', display: 'inline-flex', justifyContent: 'center', alignItems: 'center' }}>
      {ok ? '✓' : 'Copy'}
    </button>
  )
}

function Drawer({ open, row, onClose, onPrev, onNext }) {
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

  useEffect(() => {
    if (!open) return
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open || !row) return null

  const {
    conference, rank, teams, count,
    sumW, sumL, winPct,
    avgScore, medianScore, avgResult, avgSOS, avgQuality,
    avgRank, avgOffRank, avgDefRank,
    top25Teams, scoreStdev
  } = row

  const bars = [
    { label: 'Avg Score', value: avgScore },
    { label: 'Median Score', value: medianScore },
    { label: 'Avg SOS', value: avgSOS },
    { label: 'Avg Quality', value: avgQuality },
    { label: 'Avg Results', value: avgResult },
    { label: 'Avg Off Rk (lower=better)', value: -avgOffRank, hint: 'Inverted for visualization' },
    { label: 'Avg Def Rk (lower=better)', value: -avgDefRank, hint: 'Inverted for visualization' },
  ]

  return createPortal(
    <>
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal-container" onClick={onClose}>
        <div className="modal-panel" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <button className="nav-btn" onClick={onPrev} title="Previous (←)">←</button>
            <div className="drawer-title">
              <div className="drawer-rank">#{rank}</div>
              <div className="drawer-name">{conference}</div>
              <ConfBadge conference={conference} size={24} />
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <button className="nav-btn" onClick={onNext} title="Next (→)">→</button>
              <button className="nav-btn" onClick={onClose} title="Close (Esc)">✕</button>
            </div>
          </div>

          <div className="modal-body">
          <div className="drawer-kpis">
            <div className="kpi"><div className="kpi-label">Teams</div><div className="kpi-val">{count}</div></div>
            <div className="kpi"><div className="kpi-label">W-L</div><div className="kpi-val">{sumW}-{sumL}</div></div>
            <div className="kpi"><div className="kpi-label">Win %</div><div className="kpi-val">{Number.isFinite(winPct) ? (winPct*100).toFixed(1)+'%' : '—'}</div></div>
            <div className="kpi"><div className="kpi-label">Avg Rank</div><div className="kpi-val">{fmtOrDash(avgRank,2)}</div></div>
            <div className="kpi"><div className="kpi-label">Avg Score</div><div className="kpi-val">{fmt(avgScore,3)}</div></div>
            <div className="kpi"><div className="kpi-label">Median Score</div><div className="kpi-val">{fmtOrDash(medianScore,3)}</div></div>
            <div className="kpi"><div className="kpi-label">Avg SOS</div><div className="kpi-val">{fmt(avgSOS,3)}</div></div>
            <div className="kpi"><div className="kpi-label">Avg Quality</div><div className="kpi-val">{fmt(avgQuality,3)}</div></div>
            <div className="kpi"><div className="kpi-label">Avg Results</div><div className="kpi-val">{fmt(avgResult,3)}</div></div>
            <div className="kpi"><div className="kpi-label">Avg Off Rk</div><div className="kpi-val">{fmtOrDash(avgOffRank,1)}</div></div>
            <div className="kpi"><div className="kpi-label">Avg Def Rk</div><div className="kpi-val">{fmtOrDash(avgDefRank,1)}</div></div>
            <div className="kpi"><div className="kpi-label">Top-25</div><div className="kpi-val">{top25Teams ?? 0}</div></div>
            <div className="kpi"><div className="kpi-label">Score σ</div><div className="kpi-val">{fmtOrDash(scoreStdev,3)}</div></div>
          </div>

          <div className="drawer-section">
            <h3 style={{ margin: '8px 0 6px' }}>Why this conference ranks here</h3>
            <Bars items={bars} />
            <div className="small" style={{ marginTop: 6 }}>
              Ranking = average of each team's <strong>Score</strong> in the conference.
            </div>
          </div>

          <div className="drawer-section">
            <h3 style={{ margin: '12px 0 6px' }}>Teams in {conference}</h3>
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead>
                  <tr style={{ textAlign:'left' }}>
                    <th style={{ padding:'6px' }}>#</th>
                    <th style={{ padding:'6px' }}>Logo</th>
                    <th style={{ padding:'6px' }}>Team</th>
                    <th style={{ padding:'6px' }}>W-L</th>
                    <th style={{ padding:'6px' }}>Results</th>
                    <th style={{ padding:'6px' }}>SOS</th>
                    <th style={{ padding:'6px' }}>Quality</th>
                    <th style={{ padding:'6px' }}>Score</th>
                  </tr>
                </thead>
                <tbody>
                  {teams.map(t => {
                    const w = toNum(t?.w), l = toNum(t?.l)
                    const resultsVal = getTeamResults(t)
                    const logo = t?.logo || (Array.isArray(t?.logos) && t.logos.length ? t.logos[0] : null)
                    return (
                      <tr key={t?.name || `${w}-${l}-${toNum(t?.score)}`} style={{ borderTop:'1px solid var(--border)' }}>
                        <td style={{ padding:'6px' }}>{isFiniteNum(t?.rank) ? Number(t.rank) : ''}</td>
                        <td style={{ padding:'6px' }}>
                          {logo ? <img src={logo} alt={`${t?.name || 'team'} logo`} style={{ width: 28, height: 28, objectFit:'contain' }} /> : '—'}
                        </td>
                        <td style={{ padding:'6px' }}>{t?.name ?? '—'}</td>
                        <td style={{ padding:'6px' }}>{w}-{l}</td>
                        <td style={{ padding:'6px' }}>{fmt(resultsVal)}</td>
                        <td style={{ padding:'6px' }}>{fmt(toNum(t?.sos))}</td>
                        <td style={{ padding:'6px' }}>{fmt(toNum(t?.quality))}</td>
                        <td style={{ padding:'6px', fontWeight:700 }}>{fmt(toNum(t?.score))}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="drawer-section">
            <div className="row" style={{ gap: 6 }}>
              <CopyButton payload={
                `#${rank} ${conference} — W-L ${sumW}-${sumL} (Win ${Number.isFinite(winPct)?(winPct*100).toFixed(1)+'%':'—'}) | ` +
                `Avg Rank ${fmtOrDash(avgRank,2)} | Avg ${fmt(avgScore,3)} / Med ${fmtOrDash(medianScore,3)} | ` +
                `SOS ${fmt(avgSOS,3)} | Qual ${fmt(avgQuality,3)} | Res ${fmt(avgResult,3)} | ` +
                `OffRk ${fmtOrDash(avgOffRank,1)} | DefRk ${fmtOrDash(avgDefRank,1)} | ` +
                `Top-25 ${top25Teams ?? 0} | σ ${fmtOrDash(scoreStdev,3)}`
              }/>
              <button className="btn" onClick={onClose}>Close</button>
            </div>
          </div>
          </div>
        </div>
      </div>
    </>,
    document.body
  )
}

export default function ConferenceRankings(){
  const { rankings, loading, error } = useRankings()

  const [open, setOpen] = useState(false)
  const [idx, setIdx] = useState(0)
  const confRows = useMemo(()=> aggregateConferences(rankings), [rankings])
  const current = confRows[idx]

  const openAt = useCallback((i) => { setIdx(i); setOpen(true) }, [])
  const onPrev = useCallback(() => setIdx(i => (i <= 0 ? confRows.length - 1 : i - 1)), [confRows.length])
  const onNext = useCallback(() => setIdx(i => (i >= confRows.length - 1 ? 0 : i + 1)), [confRows.length])

  return (
    <div className="card">
      <h2>Conference Rankings</h2>
      <p className="small" style={{ marginTop: 4 }}>
        Ranked by the average team <strong>Score</strong> per conference.
      </p>

      {error && <div className="progress"><span className="badge err">Error</span> {error}</div>}
      {loading && <div className="progress">Building conference rankings…</div>}

      {!loading && !error && (
        <div style={{ overflowX:'auto', marginTop: 12 }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ textAlign:'left' }}>
                <th style={{ padding:'8px' }}>#</th>
                <th style={{ padding:'8px' }}>Conference</th>
                <th style={{ padding:'8px' }}>Teams</th>
                <th style={{ padding:'8px' }}>W-L</th>
                <th style={{ padding:'8px' }}>Win %</th>
                <th style={{ padding:'8px' }}>Hi / Low</th>
                <th style={{ padding:'8px' }}>Avg Rank</th>
                <th style={{ padding:'8px' }}>Avg Score</th>
                <th style={{ padding:'8px' }}>Median Score</th>
                <th style={{ padding:'8px' }}>Avg SOS</th>
                <th style={{ padding:'8px' }}>Avg Quality</th>
                <th style={{ padding:'8px' }}>Avg Results</th>
                <th style={{ padding:'8px' }}>Avg Off Rk</th>
                <th style={{ padding:'8px' }}>Avg Def Rk</th>
                <th style={{ padding:'8px' }}>Top-25</th>
                <th style={{ padding:'8px' }}>Score σ</th>
                <th style={{ padding:'8px' }}></th>
              </tr>
            </thead>
            <tbody>
              {confRows.map((r, i) => {
                const hiLow = (r.hiRank && r.lowRank) ? `${r.hiRank} / ${r.lowRank}` : '—'
                const payload =
                  `#${r.rank} ${r.conference} — W-L ${r.sumW}-${r.sumL} (Win ${Number.isFinite(r.winPct)?(r.winPct*100).toFixed(1)+'%':'—'}) | ` +
                  `Hi/Low ${hiLow} | Avg Rank ${fmtOrDash(r.avgRank,2)} | ` +
                  `Avg ${fmt(r.avgScore)} / Med ${fmtOrDash(r.medianScore,3)} | ` +
                  `SOS ${fmt(r.avgSOS)} | Quality ${fmt(r.avgQuality)} | Results ${fmt(r.avgResult)} | ` +
                  `OffRk ${fmtOrDash(r.avgOffRank,1)} | DefRk ${fmtOrDash(r.avgDefRank,1)} | ` +
                  `Top-25 ${r.top25Teams ?? 0} | σ ${fmtOrDash(r.scoreStdev,3)}`
                return (
                  <tr key={r.conference} style={{ borderTop:'1px solid var(--border)', cursor:'pointer' }} onClick={()=>openAt(i)}>
                    <td style={{ padding:'8px' }}>{r.rank}</td>
                    <td style={{ padding:'8px' }}>
                      <ConfBadge conference={r.conference} />
                    </td>
                    <td style={{ padding:'8px' }}>{r.count}</td>
                    <td style={{ padding:'8px' }}>{r.sumW}-{r.sumL}</td>
                    <td style={{ padding:'8px' }}>{Number.isFinite(r.winPct) ? (r.winPct*100).toFixed(1) + '%' : '—'}</td>
                    <td style={{ padding:'8px' }}>{hiLow}</td>
                    <td style={{ padding:'8px' }}>{fmtOrDash(r.avgRank,2)}</td>
                    <td style={{ padding:'8px' }}>{fmt(r.avgScore)}</td>
                    <td style={{ padding:'8px' }}>{fmtOrDash(r.medianScore,3)}</td>
                    <td style={{ padding:'8px' }}>{fmt(r.avgSOS)}</td>
                    <td style={{ padding:'8px' }}>{fmt(r.avgQuality)}</td>
                    <td style={{ padding:'8px' }}>{fmt(r.avgResult)}</td>
                    <td style={{ padding:'8px' }}>{fmtOrDash(r.avgOffRank,1)}</td>
                    <td style={{ padding:'8px' }}>{fmtOrDash(r.avgDefRank,1)}</td>
                    <td style={{ padding:'8px' }}>{r.top25Teams ?? 0}</td>
                    <td style={{ padding:'8px' }}>{fmtOrDash(r.scoreStdev,3)}</td>
                    <td style={{ padding:'8px' }}><CopyButton payload={payload} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <Drawer open={open} row={current} onClose={()=>setOpen(false)} onPrev={onPrev} onNext={onNext} />
    </div>
  )
}
