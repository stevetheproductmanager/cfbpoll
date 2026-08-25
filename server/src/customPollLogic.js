// Pure, side-effect-free helpers backing the custom-poll routes (preview,
// backtest, leaderboard). Kept separate from index.js so they can be unit
// tested without an Express server or a Mongo connection.

export const DEFAULT_ADVANCED = { movWeight: 50, sosBlend: 72, recencyDecay: 50, locationBonus: 50, badLossPenalty: 50 };

// A poll's weights must add to at least one usable (>0) component, and every
// individual value is clamped into [0, 1] so a malformed/huge input can't
// skew computeCustomRanking's normalization or blow up the response.
export function sanitizeWeights(w) {
  const keys = ['efficiency', 'results', 'sos', 'quality', 'momentum', 'conference'];
  const out = {};
  for (const k of keys) out[k] = Math.max(0, Math.min(1, Number(w?.[k]) || 0));
  if (Object.values(out).every(v => v === 0)) return null;
  return out;
}

// Advanced tuning knobs are all optional 0-100 sliders; anything missing/invalid
// falls back to the neutral default that reproduces the official algorithm.
export function sanitizeAdvanced(a) {
  const out = {};
  for (const k of Object.keys(DEFAULT_ADVANCED)) {
    const v = Number(a?.[k]);
    out[k] = Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : DEFAULT_ADVANCED[k];
  }
  return out;
}

// Seasons live 2000-2100 in practice (CFBD data doesn't predate 2000, and this
// gives decades of headroom) — rejects garbage like negative numbers, NaN,
// non-integers, or absurdly large values before they ever reach a DB query.
export function isValidSeason(n) {
  return Number.isInteger(n) && n >= 2000 && n <= 2100;
}

// Scores a candidate ranking against the real final AP Top 25 for a backtest.
// Exported so the route handler is just: fetch data -> call this -> respond.
export function scoreBacktest(apTop25, customRankings) {
  const apRankByTeam = new Map(apTop25.map((team, i) => [team, i + 1]));
  const customRankByTeam = new Map(customRankings.map(t => [t.team, t.rank]));
  const allTeams = new Set([...apRankByTeam.keys(), ...customRankByTeam.keys()]);
  const perTeam = [...allTeams].map(team => {
    const apRank = apRankByTeam.get(team) ?? null;
    const customRank = customRankByTeam.get(team) ?? null;
    const diff = apRank != null && customRank != null ? Math.abs(apRank - customRank) : null;
    return { team, apRank, customRank, diff };
  }).sort((a, b) => (a.apRank ?? 99) - (b.apRank ?? 99));

  const both = perTeam.filter(t => t.diff != null);
  const overlap = both.length;
  const exactMatches = both.filter(t => t.diff === 0).length;
  const avgRankDiff = both.length ? +(both.reduce((a, t) => a + t.diff, 0) / both.length).toFixed(2) : null;

  const maxPossible = apTop25.length * 24;
  const totalDiff = apTop25.reduce((sum, team) => {
    const c = customRankByTeam.get(team);
    const apRank = apRankByTeam.get(team);
    return sum + (c != null ? Math.min(24, Math.abs(apRank - c)) : 24);
  }, 0);
  const closeness = maxPossible ? Math.round((1 - totalDiff / maxPossible) * 100) : null;

  return { overlap, exactMatches, avgRankDiff, closeness, perTeam };
}

// Grades one published poll's static Top-25 snapshot against a season's
// completed games — used by the accuracy leaderboard.
export function gradePollAgainstGames(rankings, games) {
  const rankByTeam = new Map((rankings || []).map(t => [t.team, t.rank]));
  const weekMap = new Map();
  let correct = 0, total = 0;
  for (const g of games) {
    const rh = rankByTeam.get(g.home) ?? null;
    const ra = rankByTeam.get(g.away) ?? null;
    if (rh == null && ra == null) continue;
    const predictedWinner = rh == null ? g.away : ra == null ? g.home : (rh < ra ? g.home : g.away);
    const wasCorrect = predictedWinner === g.winner;
    total++; if (wasCorrect) correct++;
    const wk = weekMap.get(g.week) || { correct: 0, total: 0 };
    wk.total++; if (wasCorrect) wk.correct++;
    weekMap.set(g.week, wk);
  }
  const weekDetail = [...weekMap.entries()].sort((a, b) => a[0] - b[0])
    .map(([week, w]) => ({ week, correct: w.correct, total: w.total, pct: w.total ? +((w.correct / w.total) * 100).toFixed(0) : 0 }));
  return { correct, total, accuracyPct: total ? +((correct / total) * 100).toFixed(1) : null, weekDetail };
}
