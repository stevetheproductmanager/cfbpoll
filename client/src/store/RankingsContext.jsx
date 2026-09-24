import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react'
import { rankTeams } from '../lib/rankAlgo'
import { getManifest, getCachedManifest } from './dataState'
import { CURRENT_SEASON } from '../lib/season.js'

const RankingsContext = createContext(null)

function enrichTeams(ranked) {
  const rMap = new Map(ranked.map(t => [t.name, t.rank]))
  for (const t of ranked) {
    let pf = 0, pa = 0, t10 = 0, t25 = 0, t50 = 0
    for (const g of (t.games || [])) {
      pf += (g.for || 0)
      pa += (g.against || 0)
      const oppRank = rMap.get(g.opp) || 999
      const win = (g.for || 0) > (g.against || 0)
      if (win) {
        if (oppRank <= 10) t10++
        if (oppRank <= 25) t25++
        if (oppRank <= 50) t50++
      }
    }
    t.pf = pf; t.pa = pa
    t.top10Wins = t10; t.top25Wins = t25; t.top50Wins = t50
  }

  const withUsage = ranked.map(t => {
    const gp = (t.games || []).length || 1
    return { name: t.name, off: t.pf / gp, def: t.pa / gp }
  })
  const offPos = new Map([...withUsage].sort((a, b) => b.off - a.off).map((t, i) => [t.name, i + 1]))
  const defPos = new Map([...withUsage].sort((a, b) => a.def - b.def).map((t, i) => [t.name, i + 1]))
  for (const t of ranked) {
    t.offRank = offPos.get(t.name)
    t.defRank = defPos.get(t.name)
  }

  const sosOrder = [...ranked].sort((a, b) => (b.sos ?? 0) - (a.sos ?? 0))
  const sosPos = new Map(sosOrder.map((t, i) => [t.name, i + 1]))
  for (const t of ranked) {
    t.sosRank = sosPos.get(t.name) ?? null
  }

  return ranked
}

export function RankingsProvider({ children }) {
  const [year, setYear] = useState(CURRENT_SEASON)
  const [refreshKey, setRefreshKey] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [rankings, setRankings] = useState([])
  const [manifest, setManifest] = useState(getCachedManifest())
  const [teamsRaw, setTeamsRaw] = useState([])
  const [gamesRaw, setGamesRaw] = useState([])
  const [spRaw, setSpRaw] = useState([])

  const hasData = !!(manifest?.files?.length > 0)
  const forceRefresh = useCallback(() => setRefreshKey(k => k + 1), [])

  const refreshManifest = useCallback(async (y) => {
    try {
      const m = await getManifest(Number(y || year))
      setManifest(m)
      return m
    } catch {
      return null
    }
  }, [year])

  useEffect(() => {
    let cancelled = false
    async function run() {
      setLoading(true); setError(null)
      try {
        const m = await getManifest(Number(year))
        if (cancelled) return
        setManifest(m)

        if (!m?.files?.length) {
          setRankings([])
          setTeamsRaw([])
          setGamesRaw([])
          setSpRaw([])
          setLoading(false)
          return
        }

        const teamsPromise = fetch(`/data/${year}/teams.json`).then(async r => {
          if (r.ok) return r.json()
          const r2 = await fetch(`/data/${year}/teams-fbs.json`)
          if (!r2.ok) throw new Error(`No teams data for ${year}`)
          return r2.json()
        })
        const gamesPromise = fetch(`/data/${year}/games-regular.json`)
          .then(r => { if (!r.ok) throw new Error(`No games data for ${year}`); return r.json() })
        const spPromise = fetch(`/data/${year}/sp-ratings.json`)
          .then(r => r.ok ? r.json() : [])

        const [teams, games, sp] = await Promise.all([teamsPromise, gamesPromise, spPromise])
        if (cancelled) return

        setTeamsRaw(teams)
        setGamesRaw(games)
        setSpRaw(sp)

        let ranked = rankTeams({ teamsRaw: teams, gamesRaw: games, spRaw: sp })

        for (const t of ranked) {
          const gp = (t.games || []).length
          if (gp >= 3 && t.l === 0) t.score += 0.01
          if (t.l >= 2 && gp <= 5) t.score -= 0.01
        }
        ranked.sort((a, b) => b.score - a.score)
        ranked.forEach((t, i) => (t.rank = i + 1))
        ranked = enrichTeams(ranked)

        const lm = new Map()
        for (const t of teams || []) {
          const primary = Array.isArray(t.logos) && t.logos.length ? t.logos[0] : null
          if (t.school) lm.set(t.school, primary)
          if (t.abbreviation) lm.set(t.abbreviation, primary)
          if (Array.isArray(t.alternateNames)) t.alternateNames.forEach(n => lm.set(n, primary))
        }
        for (const t of ranked) {
          t.logo = lm.get(t.name) || null
        }

        if (!cancelled) setRankings(ranked)
      } catch (e) {
        if (!cancelled) setError(String(e.message || e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => { cancelled = true }
  }, [year, refreshKey])

  const rankMap = useMemo(() => {
    const m = new Map()
    rankings.forEach(t => m.set(t.name, t.rank))
    return m
  }, [rankings])

  const teamMap = useMemo(() => {
    const m = new Map()
    rankings.forEach(t => m.set(t.name, t))
    return m
  }, [rankings])

  const value = useMemo(() => ({
    year, setYear,
    loading, error,
    rankings, rankMap, teamMap,
    manifest, hasData,
    teamsRaw, gamesRaw, spRaw,
    refreshManifest,
    forceRefresh,
  }), [year, loading, error, rankings, rankMap, teamMap, manifest, hasData, teamsRaw, gamesRaw, spRaw, refreshManifest, forceRefresh])

  return (
    <RankingsContext.Provider value={value}>
      {children}
    </RankingsContext.Provider>
  )
}

export function useRankings() {
  const ctx = useContext(RankingsContext)
  if (!ctx) throw new Error('useRankings must be inside RankingsProvider')
  return ctx
}
