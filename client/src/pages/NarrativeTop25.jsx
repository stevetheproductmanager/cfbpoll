// src/views/NarrativeCardsTop25.jsx

import React, { useEffect, useMemo, useState, useCallback } from 'react'
import { useRankings } from '../store/RankingsContext.jsx'
import ConfBadge from '../components/ConfBadge.jsx'
import TeamLogo from '../components/TeamLogo.jsx'
import { Drawer, useWeeklyRankings } from './Rankings.jsx'

const fmt2 = (n) =>
  n == null ? '—' : (typeof n === 'number' ? n.toFixed(2) : Number(n).toFixed(2))
const fmt1 = (n) =>
  n == null ? '—' : Number(n).toFixed(1)
const fmt3 = (n) =>
  n == null ? '—' : (typeof n === 'number' ? n.toFixed(3) : Number(n).toFixed(3))

/** Narrative importance for a single game, from the winner's POV. */
function computeNarrativeWeight({ winnerRank, loserRank, margin, isRoad, isNeutral }) {
  let w = 1

  // Beat a good team
  if (loserRank <= 5) w += 2.4
  else if (loserRank <= 10) w += 2.0
  else if (loserRank <= 25) w += 1.5
  else if (loserRank <= 50) w += 1.0

  // Upset: worse-ranked team beating a better-ranked team
  if (winnerRank > loserRank && loserRank < 200) w += 0.5

  // Margin of victory
  if (margin >= 28) w += 0.8
  else if (margin >= 21) w += 0.6
  else if (margin >= 14) w += 0.3

  // Environment
  if (isRoad) w += 0.5
  if (isNeutral) w += 0.2

  return Number(w.toFixed(2))
}

/**
 * Given Rankings rows (same structure as Rankings / TeamCompare),
 * compute narrative wins/losses + synthetic narrativeScore for each team.
 */
function buildNarrativeRows(rows) {
  if (!Array.isArray(rows)) return []

  const rankMap = new Map()
  rows.forEach((t) => {
    if (t?.name) rankMap.set(t.name, t.rank ?? 999)
  })

  return rows.map((team) => {
    const teamRank = rankMap.get(team.name) ?? 999
    const games = team.games || []

    const wins = []
    const losses = []

    for (const g of games) {
      const opp = g.opp
      if (!opp) continue

      const oppRank = rankMap.get(opp) ?? 999
      const teamScore = Number(g.for) || 0
      const oppScore = Number(g.against) || 0
      if (teamScore === oppScore) continue // ignore ties

      const margin = Math.abs(teamScore - oppScore)
      const loc = g.neutral ? 'N' : g.home ? 'H' : 'A'
      const week = g.week ?? null
      const scoreStr = `${teamScore}-${oppScore}`

      const isWin = teamScore > oppScore

      if (isWin) {
        // narrative value from *this* team's perspective
        const weight = computeNarrativeWeight({
          winnerRank: teamRank,
          loserRank: oppRank,
          margin,
          isRoad: loc === 'A',
          isNeutral: loc === 'N',
        })
        wins.push({
          opp,
          oppRank,
          week,
          loc,
          score: scoreStr,
          margin,
          weight,
        })
      } else {
        // For losses, weight the game from the opponent's perspective (how big a win it was),
        // but we use it as a "loudness" of the loss.
        const weight = computeNarrativeWeight({
          winnerRank: oppRank,
          loserRank: teamRank,
          margin,
          isRoad: loc === 'H', // if we were home, they were on the road
          isNeutral: loc === 'N',
        })
        losses.push({
          opp,
          oppRank,
          week,
          loc,
          score: scoreStr,
          margin,
          weight,
        })
      }
    }

    wins.sort((a, b) => b.weight - a.weight)
    losses.sort((a, b) => b.weight - a.weight)

    const bestWin = wins[0] || null
    const secondWin = wins[1] || null
    const thirdWin = wins[2] || null
    const worstLoss = losses[0] || null

    // Simple synthetic "narrativeScore":
    //   big wins stack up, loudest loss dings you a bit.
    let winScore = 0
    if (bestWin) winScore += bestWin.weight * 1.0
    if (secondWin) winScore += secondWin.weight * 0.7
    if (thirdWin) winScore += thirdWin.weight * 0.4

    const lossPenalty = worstLoss ? worstLoss.weight * 0.6 : 0
    const narrativeScore = Number((winScore - lossPenalty).toFixed(2))

    return {
      ...team,
      narrativeScore,
      narrativeWins: wins,
      narrativeLosses: losses,
      narrativeBestWin: bestWin,
      narrativeSecondWin: secondWin,
      narrativeThirdWin: thirdWin,
      narrativeWorstLoss: worstLoss,
    }
  })
}

function describeLoc(loc) {
  if (loc === 'H') return 'home'
  if (loc === 'A') return 'road'
  if (loc === 'N') return 'neutral'
  return ''
}

function formatGameLine(game, isLoss = false) {
  if (!game) return '—'
  const { opp, oppRank, week, score, loc } = game
  const prefix = isLoss ? 'L to' : 'W vs'
  const rk = oppRank && oppRank < 900 ? `#${oppRank} ` : ''
  const wk = week != null ? `Wk ${week}` : ''
  const locLabel = describeLoc(loc)
  const parts = [
    `${prefix} ${rk}${opp}`,
    wk,
    score,
    locLabel ? `(${locLabel})` : '',
  ].filter(Boolean)
  return parts.join(', ')
}

function perGame(total, games = []) {
  const gp = (games || []).length || 1
  const n = Number(total) || 0
  return n / gp
}

function ordinal(n) {
  if (!Number.isFinite(n)) return String(n)
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

/** Build within-group metric ranks (Score, Results, SOS rank, Narrative, Top-25 wins) */
function buildMetricRanks(teams) {
  const res = new Map()
  teams.forEach((t) => res.set(t.name, {}))

  const metrics = [
    { id: 'score', better: 'high' },
    { id: 'results', better: 'high' },
    { id: 'sosRank', better: 'low' }, // lower SOS rank is better
    { id: 'narrativeScore', better: 'high' },
    { id: 'top25Wins', better: 'high' },
  ]

  metrics.forEach(({ id, better }) => {
    const arr = teams.map((t) => {
      let val
      if (id === 'sosRank') {
        val = t.sosRank
      } else {
        val = t[id]
      }
      const num = Number(val)
      return {
        name: t.name,
        value: Number.isFinite(num) ? num : null,
      }
    })

    arr.sort((a, b) => {
      if (a.value == null && b.value == null) return 0
      if (a.value == null) return 1
      if (b.value == null) return -1
      if (better === 'high') return b.value - a.value
      return a.value - b.value
    })

    arr.forEach((item, idx) => {
      const ranks = res.get(item.name) || {}
      ranks[id] = idx + 1
      res.set(item.name, ranks)
    })
  })

  return res
}

/* ------------------ Common opponents helpers ------------------ */

function buildGamesByOpp(team) {
  const map = new Map()
  ;(team?.games || []).forEach((g) => {
    if (!g.opp) return
    if (!map.has(g.opp)) map.set(g.opp, [])
    map.get(g.opp).push(g)
  })
  return map
}

function summarizeGameForTeam(g) {
  const teamScore = Number(g.for) || 0
  const oppScore = Number(g.against) || 0
  const win = teamScore > oppScore
  const loc = g.neutral ? 'N' : g.home ? 'H' : 'A'
  const week = g.week ?? null
  const score = `${teamScore}-${oppScore}`
  return { win, loc, week, score }
}

function buildCommonOpponents(teamA, teamB, maxRows = 5) {
  if (!teamA || !teamB) return []
  const mapA = buildGamesByOpp(teamA)
  const mapB = buildGamesByOpp(teamB)

  const commons = []

  for (const [opp, gamesA] of mapA.entries()) {
    if (!mapB.has(opp)) continue
    const gamesB = mapB.get(opp)
    if (!gamesA.length || !gamesB.length) continue

    const gA = gamesA[0]
    const gB = gamesB[0]

    const summaryA = summarizeGameForTeam(gA)
    const summaryB = summarizeGameForTeam(gB)

    commons.push({
      opp,
      a: summaryA,
      b: summaryB,
    })
  }

  // Sort by week (earliest) and take a few
  commons.sort((x, y) => {
    const wa = x.a.week ?? 999
    const wb = y.a.week ?? 999
    return wa - wb
  })

  return commons.slice(0, maxRows)
}

/* ------------------ Card component for a single team ------------------ */

function TeamNarrativeCard({ team, maxNarrative, metricRanks, groupSize, onOpen }) {
  if (!team) return null

  const {
    name,
    rank,
    conference,
    w,
    l,
    score,
    results,
    sos,
    sosRank,
    quality,
    rec,
    top10Wins,
    top25Wins,
    top50Wins,
    pf,
    pa,
    offRank,
    defRank,
    games,
    logo,
    narrativeScore,
    narrativeWins,
    narrativeLosses,
    narrativeBestWin,
    narrativeSecondWin,
    narrativeThirdWin,
    narrativeWorstLoss,
  } = team

  const gp = (games || []).length || 1
  const pfPer = perGame(pf, games)
  const paPer = perGame(pa, games)

  const barPct = (() => {
    if (!maxNarrative || maxNarrative <= 0) return 10
    const base = Math.max(0, narrativeScore)
    const pct = (base / maxNarrative) * 100
    return Math.max(6, Math.min(100, pct))
  })()

  const topWins = (narrativeWins || []).slice(0, 3)
  const lossProfile = (narrativeLosses || []).slice(0, 2)

  const rel = metricRanks?.get(name) || {}
  const of = (r) => (r != null ? `${ordinal(r)} of ${groupSize}` : null)

  // Compact stat tiles: label / value / within-group context. Replaces the
  // two wrapping badge strips.
  const tiles = [
    { label: 'Score', value: fmt3(score), sub: of(rel.score) },
    { label: 'Results', value: fmt3(results), sub: of(rel.results) },
    { label: 'SOS', value: sosRank != null ? `#${Math.round(sosRank)}` : '—', sub: rel.sosRank != null ? `${ordinal(rel.sosRank)} toughest` : null, tip: `SOS ${fmt3(sos)} (FBS rank; lower = tougher)` },
    { label: 'Quality', value: fmt3(quality), sub: null },
    { label: 'PF / G', value: fmt1(pfPer), sub: offRank != null ? `Off #${offRank}` : null },
    { label: 'PA / G', value: fmt1(paPer), sub: defRank != null ? `Def #${defRank}` : null },
    { label: 'T10/25/50 W', value: `${top10Wins || 0}/${top25Wins || 0}/${top50Wins || 0}`, sub: rel.top25Wins != null ? `T25 ${ordinal(rel.top25Wins)}` : null, tip: 'Wins over Top 10 / Top 25 / Top 50 teams' },
    { label: 'Narrative', value: fmt2(narrativeScore), sub: of(rel.narrativeScore) },
  ]

  const openTeam = onOpen ? () => onOpen(team) : undefined
  const clickable = onOpen ? { cursor: 'pointer' } : null

  const gameTable = (list, emptyText) => list.length ? (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
      <thead>
        <tr className="small" style={{ textAlign: 'left', color: 'var(--muted)' }}>
          <th style={{ padding: '3px 4px' }}>Opponent</th>
          <th style={{ padding: '3px 4px' }}>Rk</th>
          <th style={{ padding: '3px 4px' }}>Wk</th>
          <th style={{ padding: '3px 4px' }}>Loc</th>
          <th style={{ padding: '3px 4px' }}>Score</th>
          <th style={{ padding: '3px 4px', textAlign: 'right' }} title="Narrative weight">Wt</th>
        </tr>
      </thead>
      <tbody>
        {list.map((g, i) => (
          <tr key={`${g.opp}-${g.week}-${i}`} style={{ borderTop: '1px solid var(--border)' }}>
            <td style={{ padding: '3px 4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 110 }} title={g.opp}>{g.opp}</td>
            <td style={{ padding: '3px 4px' }}>{g.oppRank && g.oppRank < 900 ? `#${g.oppRank}` : '—'}</td>
            <td style={{ padding: '3px 4px' }}>{g.week ?? '—'}</td>
            <td style={{ padding: '3px 4px' }}>{g.loc}</td>
            <td style={{ padding: '3px 4px', whiteSpace: 'nowrap' }}>{g.score}</td>
            <td style={{ padding: '3px 4px', textAlign: 'right' }}>{fmt2(g.weight)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  ) : (
    <div className="small" style={{ color: 'var(--muted)' }}>{emptyText}</div>
  )

  return (
    <div
      className="card"
      style={{ borderRadius: 16, padding: 14, display: 'flex', flexDirection: 'column', gap: 10, minHeight: 230 }}
    >
      {/* Header: rank, team (click → team dialog), conf */}
      <div className="row" style={{ alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div className="row" style={{ alignItems: 'center', gap: 10, minWidth: 0 }}>
          <div style={{ fontSize: 22, fontWeight: 700, minWidth: 28, textAlign: 'right' }}>{rank}</div>
          <div
            className="row"
            style={{ alignItems: 'center', gap: 10, minWidth: 0, ...clickable }}
            onClick={openTeam}
            role={onOpen ? 'button' : undefined}
            tabIndex={onOpen ? 0 : undefined}
            onKeyDown={onOpen ? (e) => { if (e.key === 'Enter') openTeam() } : undefined}
            title={onOpen ? `Open ${name} details` : undefined}
          >
            {logo ? <TeamLogo src={logo} alt={name} size={30} /> : <div style={{ width: 30, height: 30 }} />}
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <div style={{ fontWeight: 600, textDecoration: onOpen ? 'underline dotted' : undefined, textUnderlineOffset: 3 }}>{name}</div>
              <div className="small" style={{ color: 'var(--muted)' }}>{w}-{l} • {gp} gms</div>
            </div>
          </div>
        </div>
        <ConfBadge conference={conference} size={24} />
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 4 }}>
        {tiles.map(t => (
          <div
            key={t.label}
            title={t.tip}
            style={{ background: 'var(--panel-2)', borderRadius: 8, padding: '4px 6px', minWidth: 0 }}
          >
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.label}</div>
            <div style={{ fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums', lineHeight: 1.3 }}>{t.value}</div>
            <div style={{ fontSize: 10, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minHeight: 13 }}>{t.sub || ''}</div>
          </div>
        ))}
      </div>

      {/* Narrative bar + headline best win / concern */}
      <div>
        <div style={{ height: 6, borderRadius: 999, background: 'var(--border)', overflow: 'hidden' }} title={`Narrative score ${fmt2(narrativeScore)}`}>
          <div style={{ height: '100%', width: `${barPct}%`, background: 'linear-gradient(90deg, var(--brand) 0%, var(--brand2) 100%)' }} />
        </div>
        <div className="small" style={{ marginTop: 6, color: 'var(--muted)' }}>
          <span style={{ color: 'var(--ok)', fontWeight: 600 }}>Best:</span>{' '}
          {narrativeBestWin ? formatGameLine(narrativeBestWin, false) : 'No high-profile win yet.'}
        </div>
        <div className="small" style={{ marginTop: 2, color: 'var(--muted)' }}>
          <span style={{ color: 'var(--err)', fontWeight: 600 }}>Concern:</span>{' '}
          {narrativeWorstLoss ? formatGameLine(narrativeWorstLoss, true) : 'None yet.'}
        </div>
      </div>

      {/* Signature wins, then loss profile below — full width each */}
      <div>
        <div className="small" style={{ fontWeight: 600, marginBottom: 2 }}>Signature wins</div>
        {gameTable(topWins, 'No notable wins logged yet.')}
      </div>
      <div>
        <div className="small" style={{ fontWeight: 600, marginBottom: 2 }}>Loss profile</div>
        {gameTable(lossProfile, 'No losses on the résumé yet.')}
      </div>
    </div>
  )
}

/* ------------------ Boundary pair comparison table ------------------ */

function BoundaryPairsTable({ pairs }) {
  if (!pairs?.length) return null

  return (
    <div style={{ marginTop: 18 }}>
      <h3 style={{ marginBottom: 4 }}>Boundary comparisons (adjacent teams)</h3>
      <p className="small" style={{ color: 'var(--muted)', marginTop: 0, marginBottom: 6 }}>
        Quick glance at why one team is stacked just ahead of the next: narrative score, schedule
        strength, top-25 wins, and best win at the ranking seam.
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
              <th style={{ padding: '6px 8px' }}>Pair</th>
              <th style={{ padding: '6px 8px' }}>Narrative</th>
              <th style={{ padding: '6px 8px' }}>SOS rank</th>
              <th style={{ padding: '6px 8px' }}>Top 25 W</th>
              <th style={{ padding: '6px 8px' }}>Best win</th>
              <th style={{ padding: '6px 8px' }}>Common opps</th>
            </tr>
          </thead>
          <tbody>
            {pairs.map((p) => {
              const a = p.left
              const b = p.right
              const aBetterNarr = (a?.narrativeScore ?? 0) > (b?.narrativeScore ?? 0)
              const aBetterSOS =
                (a?.sosRank ?? Infinity) < (b?.sosRank ?? Infinity) // lower is tougher
              const aMoreT25 = (a?.top25Wins || 0) > (b?.top25Wins || 0)

              const bestWinA = a?.narrativeBestWin
              const bestWinB = b?.narrativeBestWin

              const bestSnippetA = bestWinA ? formatGameLine(bestWinA, false) : '—'
              const bestSnippetB = bestWinB ? formatGameLine(bestWinB, false) : '—'

              return (
                <tr key={p.key} style={{ borderTop: '1px solid #1b2447' }}>
                  <td style={{ padding: '6px 8px' }}>
                    <div className="small">
                      #{a.rank} {a.name} vs #{b.rank} {b.name}
                    </div>
                  </td>
                  <td style={{ padding: '6px 8px' }}>
                    <div className="row" style={{ gap: 4 }}>
                      <span
                        className={
                          'small' + (aBetterNarr ? ' badge ok' : '')
                        }
                      >
                        {fmt2(a.narrativeScore)}
                      </span>
                      <span className="small" style={{ color: 'var(--muted)' }}>
                        /
                      </span>
                      <span
                        className={
                          'small' + (!aBetterNarr ? ' badge ok' : '')
                        }
                      >
                        {fmt2(b.narrativeScore)}
                      </span>
                    </div>
                  </td>
                  <td style={{ padding: '6px 8px' }}>
                    <div className="row" style={{ gap: 4 }}>
                      <span
                        className={
                          'small' + (aBetterSOS ? ' badge ok' : '')
                        }
                      >
                        #{a.sosRank != null ? Math.round(a.sosRank) : '—'}
                      </span>
                      <span className="small" style={{ color: 'var(--muted)' }}>
                        /
                      </span>
                      <span
                        className={
                          'small' + (!aBetterSOS ? ' badge ok' : '')
                        }
                      >
                        #{b.sosRank != null ? Math.round(b.sosRank) : '—'}
                      </span>
                    </div>
                  </td>
                  <td style={{ padding: '6px 8px' }}>
                    <div className="row" style={{ gap: 4 }}>
                      <span
                        className={
                          'small' + (aMoreT25 ? ' badge ok' : '')
                        }
                      >
                        {a.top25Wins || 0}
                      </span>
                      <span className="small" style={{ color: 'var(--muted)' }}>
                        /
                      </span>
                      <span
                        className={
                          'small' + (!aMoreT25 ? ' badge ok' : '')
                        }
                      >
                        {b.top25Wins || 0}
                      </span>
                    </div>
                  </td>
                  <td style={{ padding: '6px 8px', maxWidth: 280 }}>
                    <div className="small">
                      <b>{a.name}:</b> {bestSnippetA}
                    </div>
                    <div className="small" style={{ marginTop: 2 }}>
                      <b>{b.name}:</b> {bestSnippetB}
                    </div>
                  </td>
                  <td style={{ padding: '6px 8px' }}>
                    <div className="small">{p.commonOppCount || 0}</div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ------------------ Common opponents detail card (for top pair) ------------------ */

function CommonOpponentsCard({ teamA, teamB }) {
  if (!teamA || !teamB) return null
  const commons = buildCommonOpponents(teamA, teamB, 6)

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <h3 style={{ marginBottom: 4 }}>
        Common opponents: {teamA.name} vs {teamB.name}
      </h3>
      {commons.length === 0 ? (
        <div className="small" style={{ color: 'var(--muted)' }}>
          These teams have no common opponents in the current dataset.
        </div>
      ) : (
        <>
          <p className="small" style={{ color: 'var(--muted)', marginTop: 0 }}>
            How each team handled the same opponents — the classic &quot;they both played X&quot;
            committee conversation.
          </p>
          <div style={{ overflowX: 'auto', marginTop: 4 }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: 11,
              }}
            >
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
                  <th style={{ padding: '4px 6px' }}>Opponent</th>
                  <th style={{ padding: '4px 6px' }}>{teamA.name}</th>
                  <th style={{ padding: '4px 6px' }}>{teamB.name}</th>
                </tr>
              </thead>
              <tbody>
                {commons.map((row) => {
                  const { opp, a, b } = row
                  const aLabel = [
                    a.win ? 'W' : 'L',
                    a.score,
                    a.week != null ? `Wk ${a.week}` : '',
                    describeLoc(a.loc),
                  ]
                    .filter(Boolean)
                    .join(', ')
                  const bLabel = [
                    b.win ? 'W' : 'L',
                    b.score,
                    b.week != null ? `Wk ${b.week}` : '',
                    describeLoc(b.loc),
                  ]
                    .filter(Boolean)
                    .join(', ')
                  return (
                    <tr key={opp} style={{ borderTop: '1px solid #1b2447' }}>
                      <td style={{ padding: '4px 6px' }}>{opp}</td>
                      <td style={{ padding: '4px 6px' }}>{aLabel}</td>
                      <td style={{ padding: '4px 6px' }}>{bLabel}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

/* ------------------ Main view: top N cards ------------------ */

export default function NarrativeCardsTop25() {
  const { rankings, loading: busy, error: ctxErr, year, rankMap, teamMap } = useRankings()
  const [err, setErr] = useState(null)
  const weekly = useWeeklyRankings(year)
  const [openIdx, setOpenIdx] = useState(null)   // index into topRows for the team dialog
  const [limit, setLimit] = useState(25)

  const rows = useMemo(() => {
    if (!rankings?.length) return null
    return buildNarrativeRows(rankings)
  }, [rankings])

  const onChangeLimit = useCallback((e) => {
    const v = Number(e.target.value)
    if (!Number.isFinite(v)) {
      setLimit(25)
      return
    }
    setLimit(Math.max(5, Math.min(64, v)))
  }, [])

  const topRows = useMemo(() => {
    if (!Array.isArray(rows)) return []
    const lim = Math.max(1, Math.min(64, Number(limit) || 25))
    return [...rows]
      .filter((t) => t.rank != null && t.rank <= lim)
      .sort((a, b) => (a.rank || 999) - (b.rank || 999))
  }, [rows, limit])

  const maxNarrative = useMemo(() => {
    if (!topRows.length) return 1
    return topRows.reduce(
      (m, t) => (t.narrativeScore > m ? t.narrativeScore : m),
      0.1
    )
  }, [topRows])

  const metricRanks = useMemo(
    () => (topRows.length ? buildMetricRanks(topRows) : new Map()),
    [topRows]
  )

  const boundaryPairs = useMemo(() => {
    const pairs = []
    for (let i = 0; i < topRows.length - 1; i++) {
      const left = topRows[i]
      const right = topRows[i + 1]
      if (!left || !right) continue

      const commonOpps = buildCommonOpponents(left, right, 50) // count only
      pairs.push({
        key: `${left.name}-${right.name}`,
        left,
        right,
        commonOppCount: commonOpps.length,
      })
    }
    // Only show first ~10 pairs to keep things manageable
    return pairs.slice(0, 10)
  }, [topRows])

  const topPair = boundaryPairs.length ? boundaryPairs[0] : null

  return (
    <div className="card" style={{ borderRadius: 14 }}>
      <h2 style={{ marginBottom: 4 }}>Narrative Top 25 Cards</h2>
      <p className="small" style={{ color: 'var(--muted)', marginTop: 0 }}>
        One card per team, built from the same Rankings data, but focused on the
        &quot;committee narrative&quot;: signature wins, loss profile, schedule strength,
        within-group metric ranks, and a synthetic narrative score. Boundary rows and
        common-opponent summaries help explain why one team sits just ahead of another.
      </p>

      <div
        className="row"
        style={{
          marginTop: 10,
          gap: 12,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <span className="small">Season {rankings?.length ? rankings[0]?.games?.[0]?.week ? '' : '' : ''}</span>
        <label className="small">
          Show top{' '}
          <input
            className="input"
            type="number"
            min={5}
            max={64}
            value={limit}
            onChange={onChangeLimit}
            style={{ width: 70, marginLeft: 6 }}
          />
        </label>
        {rows && (
          <span className="badge">
            Teams ranked: {rows.length}
          </span>
        )}
      </div>

      {err && (
        <div className="progress" style={{ marginTop: 8 }}>
          <span className="badge err">Error</span> {err}
        </div>
      )}
      {busy && !err && (
        <div className="progress" style={{ marginTop: 8 }}>
          Building narrative cards…
        </div>
      )}

      {!busy && !err && topRows.length > 0 && (
        <>
          <div
            className="narrative-grid"
            style={{
              marginTop: 14,
              display: 'grid',
              gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
              gap: 14,
            }}
          >
            {topRows.map((t) => (
              <TeamNarrativeCard
                key={t.name}
                team={t}
                maxNarrative={maxNarrative}
                metricRanks={metricRanks}
                groupSize={topRows.length}
                onOpen={() => setOpenIdx(topRows.indexOf(t))}
              />
            ))}
          </div>

          <Drawer
            open={openIdx != null}
            team={openIdx != null ? topRows[openIdx] : null}
            onClose={() => setOpenIdx(null)}
            onPrev={() => setOpenIdx(i => (i <= 0 ? topRows.length - 1 : i - 1))}
            onNext={() => setOpenIdx(i => (i >= topRows.length - 1 ? 0 : i + 1))}
            rankMap={rankMap}
            teamMap={teamMap}
            weekly={weekly}
          />

          <BoundaryPairsTable pairs={boundaryPairs} />

          {topPair && (
            <CommonOpponentsCard
              teamA={topPair.left}
              teamB={topPair.right}
            />
          )}
        </>
      )}

      {!busy && !err && !topRows.length && (
        <div
          className="small"
          style={{ marginTop: 12, color: 'var(--muted)' }}
        >
          No rankings data available for {year}. Make sure the season has been
          downloaded on the Data tab.
        </div>
      )}
    </div>
  )
}
