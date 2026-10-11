// client/src/lib/rankAlgo.js
// Uses teams.json (ALL teams: FBS + FCS). Rankings return only FBS teams,
// but all opponents (including FCS) are counted in W-L/Results/SOS/Quality/etc.

function val(o, keys, d = undefined) {
  for (const k of keys) {
    if (o && Object.prototype.hasOwnProperty.call(o, k) && o[k] != null) return o[k];
  }
  return d;
}
function capMov(m){ const cap = 24; return Math.max(-cap, Math.min(cap, m)) }
function gameWeek(g){ return val(g, ['week','game_week','gameWeek'], 1) }
function isNeutral(g){ return !!val(g, ['neutral_site','neutral','isNeutral'], false) }
// `bonusScale` lets a custom poll dial the home/road effect up or down —
// 1.0 (default) reproduces the site's official multipliers exactly.
function locWeight(isHome, isAway, neutral, won, bonusScale = 1){
  if (neutral) return 1.0;
  if (isHome) return 1 + (won ? -0.04 : 0.08) * bonusScale;  // home wins discounted, home losses hurt more
  if (isAway) return 1 + (won ? 0.07 : -0.07) * bonusScale;  // road wins rewarded, road losses forgiven
  return 1.0;
}
// `lossPenaltyScale` dials how harshly a bad loss (incl. to FCS) is punished —
// 1.0 (default) reproduces the site's official multipliers exactly.
function vsClassWeight(opp, lossPenaltyScale = 1) {
  const cls = (opp?.classification || '').toLowerCase();
  if (cls === 'fcs') return { winMul: 0.75, lossMul: 1 + 0.30 * lossPenaltyScale }; // less credit to FCS wins, harsher loss
  return { winMul: 1.00, lossMul: 1.00 };
}

function safeDiv(a,b){ return b ? (a/b) : 0 }
function pickTeamName(t) {
  return (val(t, ['school','team','name','displayName','teamName'], '') || '').trim();
}

function clamp(v, lo = -1e9, hi = 1e9) { return Math.max(lo, Math.min(hi, v)); }


/** Index from teams.json (ALL teams). */
export function buildTeamsIndex(teamsRaw = []) {
  const byId = new Map();
  const byName = new Map();
  const meta = new Map(); // canonical -> { name, conference, classification }

  for (const t of teamsRaw) {
    const id = val(t, ['id','teamId','schoolId','cfbd_id'], null);
    const canonical = pickTeamName(t);
    if (!canonical) continue;

    const classification = (t.classification || t.division || t.subdivision || '').toString().toLowerCase() || 'unknown';
    const conference = t.conference || t.conf || t.conference_abbreviation || 'Unknown';

    meta.set(canonical, { name: canonical, conference, classification });

    if (id != null) byId.set(String(id), canonical);

    const aliases = new Set();
    ['school','team','name','displayName','abbreviation','alt_name1','alt_name2','alt_name3','mascot']
      .forEach(k => { const v = (t?.[k] || '').toString().trim(); if (v) aliases.add(v); });
    for (const a of aliases) byName.set(a.toLowerCase(), canonical);
  }
  return { byId, byName, meta };
}

function parseGames(gamesRaw = []) {
  const out = [];
  for (const g of gamesRaw) {
    const homeId = val(g, ['home_id','homeId','homeTeamId','homeTeamID'], null);
    const awayId = val(g, ['away_id','awayId','awayTeamId','awayTeamID'], null);
    const homeName = val(g, ['home','homeTeam','home_team','team_home','team1','homeSchool','home_school'], null);
    const awayName = val(g, ['away','awayTeam','away_team','team_away','team2','awaySchool','away_school'], null);
    const hp = val(g, ['home_points','homePoints','points_home','home_score','score1'], null);
    const ap = val(g, ['away_points','awayPoints','points_away','away_score','score2'], null);
    if (hp == null || ap == null || isNaN(+hp) || isNaN(+ap)) continue;

    out.push({
      homeId: homeId != null ? String(homeId) : null,
      awayId: awayId != null ? String(awayId) : null,
      homeName: homeName != null ? String(homeName).trim() : null,
      awayName: awayName != null ? String(awayName).trim() : null,
      hp: +hp, ap: +ap,
      week: gameWeek(g),
      neutral: isNeutral(g),
    });
  }
  return out;
}

export function attachGames(teamsMap, index, gamesRaw) {
  const games = parseGames(gamesRaw);
  const { byId, byName } = index;

  for (const g of games) {
    let h = null, a = null;
    if (g.homeId && byId.has(g.homeId)) h = byId.get(g.homeId);
    if (g.awayId && byId.has(g.awayId)) a = byId.get(g.awayId);
    if (!h && g.homeName) h = byName.get(g.homeName.toLowerCase()) || g.homeName;
    if (!a && g.awayName) a = byName.get(g.awayName.toLowerCase()) || g.awayName;

    const home = teamsMap.get(h);
    const away = teamsMap.get(a);
    if (!home || !away) continue; // teams.json should contain both; if not, skip quietly

    home.games.push({ opp: away.name, for: g.hp, against: g.ap, week: g.week, neutral: g.neutral, home: true });
    away.games.push({ opp: home.name, for: g.ap, against: g.hp, week: g.week, neutral: g.neutral, away: true });
  }
}

/** ---------------- Scoring components ---------------- **/

// Final score = SCORE_SCALE × (weighted sum of per-component z-scores). The
// scale keeps scores near their historical range (TeamCompare maps 1.0 score
// ≈ 70 pts of spread), so 1 z-unit of overall strength ≈ 10 pts.
const SCORE_SCALE = 0.15;
const HFA = 2.5;              // home-field advantage in points, removed from perf
const MARGIN_SOFT_CAP = 28;   // margin beyond this counts only 25% in perf
const PERF_PRIOR_GAMES = 1;   // shrinks thin early-season ratings toward average

/** Recency weight per game: 0.5^(weeksAgo / halfLife). `adv.recencyDecay`
 * 0-100 (default 50 → 6-week half-life; 100 → 3 weeks; 0 → no decay). */
function makeRecency(teamsMap, adv = {}) {
  let latest = 1;
  for (const t of teamsMap.values()) for (const g of t.games) latest = Math.max(latest, g.week || 1);
  const r = adv.recencyDecay != null ? adv.recencyDecay : 50;
  const halfLife = r > 0 ? 300 / r : Infinity;
  return (g) => Number.isFinite(halfLife) ? Math.pow(0.5, (latest - (g.week || 1)) / halfLife) : 1;
}

/** Game points with home-field removed and blowout margins softened. */
function adjustedPoints(g) {
  let pf = g.for, pa = g.against;
  if (!g.neutral) {
    const h = g.home ? HFA / 2 : g.away ? -HFA / 2 : 0;
    pf -= h; pa += h;
  }
  const m = pf - pa, am = Math.abs(m);
  if (am > MARGIN_SOFT_CAP) {
    const cut = Math.sign(m) * (am - MARGIN_SOFT_CAP) * 0.75 / 2;
    pf -= cut; pa += cut;
  }
  return { pf, pa };
}

function computeOpponentAverages(teamsMap){
  for (const t of teamsMap.values()) {
    let pf=0, pa=0;
    for (const g of t.games){ pf += (g.for||0); pa += (g.against||0); }
    const gp = t.games.length || 1;
    t.pf_pg = pf / gp;
    t.pa_pg = pa / gp;
  }
}

/** Iterative, opponent-adjusted offense/defense ratings (SRS-style) on
 * HFA-adjusted, blowout-softened, recency-weighted points. Ratings are
 * re-centred each pass so they can't drift, and shrunk toward 0 by
 * PERF_PRIOR_GAMES so a 2-game sample can't produce an extreme rating.
 * Sets t.offAdj / t.defAdj (pts vs average), t.rating (net) and t.perf. */
function computePerformanceIndex(teamsMap, recW, loops = 15){
  computeOpponentAverages(teamsMap);
  const withGames = Array.from(teamsMap.values()).filter(t => t.games.length);
  for (const t of teamsMap.values()) { t.offAdj = 0; t.defAdj = 0; t.rating = 0; t.perf = 0; }
  if (!withGames.length) return;

  const leagueAvgPF = withGames.reduce((a, t) => a + t.pf_pg, 0) / withGames.length;
  const off = new Map(withGames.map(t => [t.name, t.pf_pg - leagueAvgPF]));
  const def = new Map(withGames.map(t => [t.name, leagueAvgPF - t.pa_pg]));

  for (let iter = 0; iter < loops; iter++) {
    const nextOff = new Map(), nextDef = new Map();
    let offMean = 0, defMean = 0;
    for (const t of withGames) {
      let offSum = 0, defSum = 0, wSum = 0;
      for (const g of t.games) {
        const w = recW(g);
        const { pf, pa } = adjustedPoints(g);
        const oppDef = def.get(g.opp) ?? 0;
        const oppOff = off.get(g.opp) ?? 0;
        offSum += w * (pf - (leagueAvgPF - oppDef));   // scored above what opp's defense usually allows
        defSum += w * ((leagueAvgPF + oppOff) - pa);   // held below what opp's offense usually scores
        wSum += w;
      }
      const o = offSum / (wSum + PERF_PRIOR_GAMES), d = defSum / (wSum + PERF_PRIOR_GAMES);
      nextOff.set(t.name, o); nextDef.set(t.name, d);
      offMean += o; defMean += d;
    }
    offMean /= withGames.length; defMean /= withGames.length;
    for (const t of withGames) {
      off.set(t.name, nextOff.get(t.name) - offMean);
      def.set(t.name, nextDef.get(t.name) - defMean);
    }
  }

  for (const t of withGames) {
    t.offAdj = off.get(t.name);
    t.defAdj = def.get(t.name);
    t.rating = t.offAdj + t.defAdj;
    t.ptsAvg = leagueAvgPF;   // league scoring baseline the off/def ratings are relative to
    // Soft saturation (no hard cap) so elite teams stay distinguishable.
    t.perf = Math.tanh(t.rating / 35);
  }
}

/** Percentile (0..1) of every team's opponent-adjusted rating, all teams. */
function ratingPercentiles(teamsMap) {
  const withGames = Array.from(teamsMap.values()).filter(t => t.games.length);
  const pct = toPercentiles(withGames.map(t => t.rating), true);
  return new Map(withGames.map((t, i) => [t.name, pct[i]]));
}

/** Results: win/loss with capped MOV, venue weight, FCS adjustments, scaled
 * by opponent strength (rating percentile, not raw win%). Season-long — every
 * game counts the same; recency lives in perf and momentum.
 * `adv` (advanced tuning): movWeight 0-100 (default 50 → 0.28 coefficient),
 * locationBonus 0-100 (default 50 → 1x scale), badLossPenalty 0-100 (default 50 → 1x scale). */
function computeResults(team, teamsMapRef, adv, oppPct){
  const movCoef = adv.movWeight != null ? 0.56 * (adv.movWeight / 100) : 0.28;
  const locScale = adv.locationBonus != null ? adv.locationBonus / 50 : 1;
  const lossScale = adv.badLossPenalty != null ? adv.badLossPenalty / 50 : 1;
  let sum = 0, wSum = 0, w = 0, l = 0;
  for (const g of team.games) {
    const mov = capMov(g.for - g.against);
    const win = g.for > g.against;
    const lw = locWeight(!!g.home, !!g.away, g.neutral, win, locScale);

    const opp = teamsMapRef.get(g.opp);
    const { winMul, lossMul } = vsClassWeight(opp, lossScale);
    const base = win ? (1.30 * winMul) : (-1.20 * lossMul);
    const gameScore = base + (mov / 24) * movCoef;

    const s = oppPct.get(g.opp) ?? 0.5;
    const oppMul = win ? (0.80 + 0.40 * s) : (0.80 + 0.40 * (1 - s));

    sum += gameScore * lw * oppMul;
    wSum += 1;

    if (win) w++; else l++;
  }
  team.w = w; team.l = l;
  team.results = wSum ? sum / wSum : 0;
}

/** OWP: opponents' win% excluding games against this team (proper RPI-style). */
function computeOWP(teamsMap){
  for (const t of teamsMap.values()) {
    if (!t.games.length){ t.owp = 0; continue }
    let sum = 0;
    for (const g of t.games) {
      const opp = teamsMap.get(g.opp);
      if (!opp || !opp.games.length) { sum += 0.5; continue; }
      let oppW = 0, oppG = 0;
      for (const og of opp.games) {
        if (og.opp === t.name) continue;
        oppG++;
        if (og.for > og.against) oppW++;
      }
      sum += oppG ? (oppW / oppG) : 0.5;
    }
    t.owp = sum / t.games.length;
  }
}

/** SOS: average opponent-adjusted rating of opponents played (already
 * corrected for who THEY played, so an unbeaten FCS or weak-league team no
 * longer looks like a strong opponent), blended with OWP. sosBlend (0-100,
 * default 72) is the fraction on the rating component vs. raw OWP. */
function computeSOS(teamsMap, adv = {}) {
  computeOWP(teamsMap);
  const blend = adv.sosBlend != null ? adv.sosBlend / 100 : 0.72;
  for (const t of teamsMap.values()) {
    if (!t.games.length) { t.sos_iter = 0; t.sos = 0; continue; }
    let opp = 0;
    for (const g of t.games) opp += teamsMap.get(g.opp)?.rating ?? 0;
    t.sos_iter = (opp / t.games.length) / 50;   // ~same spread as OWP - 0.5
    let sos = blend * t.sos_iter + (1 - blend) * ((t.owp ?? 0) - 0.5);
    if (sos < -0.15) sos = -0.15 + 0.6 * (sos + 0.15); // mild floor for cupcake slates
    t.sos = sos;
  }
}

function interp(points, x) {
  if (x <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i];
    if (x <= x1) {
      const [x0, y0] = points[i - 1];
      return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
    }
  }
  return points[points.length - 1][1];
}
// Continuous credit/debit by opponent FBS rank (no cliffs at 10/25/50).
const WIN_CREDIT = [[1, 0.55], [10, 0.45], [25, 0.30], [50, 0.15], [80, 0.03], [100, 0]];
const LOSS_DEBIT = [[10, 0], [25, -0.04], [50, -0.11], [80, -0.20], [110, -0.26]];
const NON_FBS_RANK = 200;

/** Quality résumé: per-game credit/debit by opponent FBS rank, with margin
 * scaling; a loss never adds credit. Non-FBS opponents never count as quality wins.
 * `adv.badLossPenalty` 0-100 (default 50 → 1x scale) dials the debit for bad losses. */
function computeQuality(teamsMap, rankOf, adv = {}){
  const lossScale = adv.badLossPenalty != null ? adv.badLossPenalty / 50 : 1;
  for (const t of teamsMap.values()) {
    let q = 0;
    for (const g of t.games) {
      const r = rankOf.get(g.opp) ?? NON_FBS_RANK;
      const margin = Math.abs(g.for - g.against);
      if (g.for > g.against) {
        q += interp(WIN_CREDIT, r) * (1.0 + clamp(margin / 28, 0, 1) * 0.35);
      } else {
        const closeMul = margin <= 7 ? 0.65 : margin <= 14 ? 0.85 : 1.0;
        q += interp(LOSS_DEBIT, r) * closeMul * lossScale;
      }
    }
    t.quality = safeDiv(q, Math.max(1, t.games.length));
  }
}

function fbsRankMap(fbsTeams, key) {
  const sorted = [...fbsTeams].sort((a, b) => b[key] - a[key]);
  return new Map(sorted.map((t, i) => [t.name, i + 1]));
}

/** Momentum: recency-weighted (2-week half-life) opponent-adjusted
 * performance vs. the team's season average, shrunk for small samples so one
 * game can't swing it hard. `adv.recencyDecay` 0-100 (default 50 → 1x) scales it. */
function computeMomentum(teamsMap, adv = {}) {
  const coef = adv.recencyDecay != null ? adv.recencyDecay / 50 : 1;
  for (const t of teamsMap.values()) {
    const gp = t.games.length;
    if (gp < 4) { t.momentum = 0; continue; }
    const sorted = [...t.games].sort((a, b) => (a.week || 1) - (b.week || 1));
    const resid = sorted.map(g => {
      const { pf, pa } = adjustedPoints(g);
      return (pf - pa) - (t.rating - (teamsMap.get(g.opp)?.rating ?? 0));
    });
    const lastWeek = sorted[gp - 1].week || 1;
    let rSum = 0, wSum = 0;
    sorted.forEach((g, i) => {
      const w = Math.pow(0.5, (lastWeek - (g.week || 1)) / 2);
      rSum += w * resid[i]; wSum += w;
    });
    const recent = rSum / wSum;
    const season = resid.reduce((a, b) => a + b, 0) / gp;
    const shrink = gp / (gp + 4);
    t.momentum = clamp(((recent - season) / 28) * shrink, -1, 1) * coef;
  }
}

/** H2H smoothing: nudge scales inversely with score gap — big effect when
 * close, fades when far. Computed from a snapshot so order doesn't matter. */
function applyHeadToHeadNudge(sorted, teamsMap){
  const hasBeaten = new Map();
  for (const t of teamsMap.values()) {
    const wins = new Set();
    for (const g of t.games) if (g.for > g.against) wins.add(g.opp);
    hasBeaten.set(t.name, wins);
  }
  const bump = new Map();
  for (let i = 0; i < sorted.length; i++){
    const higher = sorted[i];
    for (let j = i + 1; j < Math.min(sorted.length, i + 8); j++){
      const lower = sorted[j];
      const lowerBeatHigher = hasBeaten.get(lower.name)?.has(higher.name);
      const higherBeatLower = hasBeaten.get(higher.name)?.has(lower.name);
      if (lowerBeatHigher && !higherBeatLower) {
        const gz = (higher.score - lower.score) / SCORE_SCALE;
        const nudge = gz < 0.025 ? 0.04 : gz < 0.1 ? 0.03 : gz < 0.25 ? 0.02 : 0.01;
        bump.set(lower.name, (bump.get(lower.name) || 0) + nudge * SCORE_SCALE);
      }
    }
  }
  for (const t of sorted) t.score += bump.get(t.name) || 0;
}

/** H2H ordering: if a lower team beat a higher one (and didn't also lose to
 * it) and the two are within H2H_SWAP_Z z-units, the winner moves just above
 * the loser. A few passes settle chains; true cycles are left as scored. */
const H2H_SWAP_Z = 0.4;
function applyHeadToHeadOrder(sorted, teamsMap) {
  const beat = (a, b) => (teamsMap.get(a.name)?.games || []).some(g => g.opp === b.name && g.for > g.against);
  for (let pass = 0; pass < 3; pass++) {
    let changed = false;
    for (let i = 0; i < sorted.length && !changed; i++) {
      const higher = sorted[i];
      for (let j = i + 1; j < Math.min(sorted.length, i + 12); j++) {
        const lower = sorted[j];
        if (higher.score - lower.score >= H2H_SWAP_Z * SCORE_SCALE) break;
        if (beat(lower, higher) && !beat(higher, lower)) {
          lower.score = higher.score + 1e-4;
          sorted.sort((a, b) => b.score - a.score);
          changed = true;
          break;
        }
      }
    }
    if (!changed) break;
  }
}

/** No rise after a loss: a team that lost in the latest week can't end up
 * ranked higher than it was the week before. It's moved back down to its
 * previous rank (everyone it passed shifts up one). Repeats until stable,
 * since moving one team can lift another loser past its old spot. */
function applyNoRiseAfterLoss(sorted, prevRanks, lastWeek) {
  const lostLast = (t) => t.games.some(g => (g.week || 1) === lastWeek && g.for < g.against);
  for (let guard = 0; guard < 200; guard++) {
    let moved = false;
    for (let i = 0; i < sorted.length; i++) {
      const t = sorted[i];
      const pr = prevRanks.get(t.name);
      if (pr == null || i + 1 >= pr || !lostLast(t)) continue;
      const target = Math.min(pr - 1, sorted.length - 1);
      sorted.splice(i, 1);
      sorted.splice(target, 0, t);
      t.score = Math.min(t.score, sorted[target - 1].score) - 1e-6; // keep scores in rank order
      moved = true;
      break;
    }
    if (!moved) break;
  }
}

/** Each week's final ranks in order up to (not including) `lastWeek`, with
 * the no-rise rule applied week by week — i.e. last week as it was shown. */
function previousWeekRanks(args, lastWeek) {
  const weeks = [...new Set(parseGames(args.gamesRaw).map(g => g.week || 1))].filter(w => w < lastWeek).sort((a, b) => a - b);
  let prev = null;
  for (const wk of weeks) {
    const ranked = rankTeams({ ...args, gamesRaw: args.gamesRaw.filter(g => gameWeek(g) <= wk), prevRanks: prev });
    prev = new Map(ranked.map(t => [t.name, t.rank]));
  }
  return prev;
}

/** SP+ prior (optional, fades quickly) as a clamped z-score. */
function indexSP(spRaw = [], teamIndex = null) {
  const map = new Map();
  for (const r of spRaw) {
    const name = (r.team || r.school || r.name || '').toString().trim();
    const rating = Number(r.rating ?? r.sp ?? r.overall) || 0;
    if (!name) continue;
    const canonical = teamIndex?.byName?.get(name.toLowerCase()) || name;
    map.set(canonical, rating);
  }
  const vals = Array.from(map.values());
  if (!vals.length) return { get: () => null };
  const mean = vals.reduce((a,b)=>a+b,0)/vals.length;
  const std = Math.sqrt(vals.reduce((a,b)=>a+(b-mean)*(b-mean),0)/vals.length) || 1;
  const get = (canonicalName) => {
    if (!canonicalName) return null;
    const raw = map.get(canonicalName) ?? null;
    if (raw == null) return null;
    return Math.max(-2.5, Math.min(2.5, (raw - mean) / std));
  };
  return { get };
}

/** Percentiles via rank map — O(n log n) instead of O(n²). */
function toPercentiles(arr, higherIsBetter=true){
  const n = arr.length || 1;
  const indexed = arr.map((v, i) => ({ v, i }));
  indexed.sort((a, b) => a.v - b.v);
  const result = new Array(n);
  for (let r = 0; r < n; r++) {
    const p = r / (n - 1 || 1);
    result[indexed[r].i] = higherIsBetter ? p : (1 - p);
  }
  return result;
}

/** z-score function fitted on `teams` (0 for a constant component). */
function zScorer(teams, get) {
  const vals = teams.map(get);
  const n = vals.length || 1;
  const mean = vals.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
  return (x) => sd > 1e-9 ? (x - mean) / sd : 0;
}

/** Default component weights for the built-in computer poll (must sum to 1).
 * Components are z-scored before weighting, so these are the real mix. */
export const DEFAULT_WEIGHTS = { efficiency: 0.42, results: 0.30, sos: 0.10, quality: 0.14, momentum: 0.04 };

/** Default "advanced" tuning knobs — 0-100 sliders. Every default reproduces
 * the official site algorithm's fixed constants exactly; a custom poll can
 * override any subset to make the model more/less aggressive in that area. */
export const DEFAULT_ADVANCED = { movWeight: 50, sosBlend: 72, recencyDecay: 50, locationBonus: 50, badLossPenalty: 50 };

/** ---------------- Main ranking (ALL teams internally; filter to FBS at the end) ---------------- **/
/** `prevRanks` (optional): Map of team → last week's final rank, used by the
 * no-rise-after-a-loss rule. Omit it and it's computed from `gamesRaw`; pass
 * null to skip the rule; callers walking weeks in order can pass the previous
 * week's result to avoid recomputing the chain. */
export function rankTeams({ teamsRaw = [], gamesRaw = [], spRaw = [], weights = null, advanced = null, prevRanks }) {
  const adv = advanced || {};
  const teamsMap = new Map();
  const { meta, byId, byName } = buildTeamsIndex(teamsRaw);

  // Initialize EVERY team from teams.json
  for (const [name, m] of meta.entries()) {
    teamsMap.set(name, {
      name,
      conference: m.conference,
      classification: m.classification, // 'fbs' or 'fcs' (or unknown)
      games: [],
      w: 0, l: 0,
      results: 0, sos_iter: 0, owp: 0, sos: 0,
      quality: 0, momentum: 0,
      perf: 0, rating: 0, offAdj: 0, defAdj: 0,
      pf_pg: 0, pa_pg: 0,
      score: 0
    });
  }

  // Attach games: uses all teams; FCS opponents resolve properly.
  attachGames(teamsMap, { byId, byName }, gamesRaw);

  const allTeams = Array.from(teamsMap.values());
  const played = allTeams.filter(t => t.games.length);

  // If no games, return FBS alphabetically (legacy fallback)
  if (!played.length) {
    const flat = allTeams.filter(t => (t.classification || '').toLowerCase() === 'fbs');
    flat.sort((a,b)=> a.name.localeCompare(b.name));
    flat.forEach((t, i)=> { t.rank = i+1; t.score = -0.085; });
    return flat;
  }

  const gamesMean = played.reduce((a, x) => a + x.games.length, 0) / played.length;
  const seasonProgress = clamp((gamesMean - 2) / 8, 0, 1);
  const recW = makeRecency(teamsMap, adv);

  // Opponent-adjusted ratings first — everything else leans on them.
  computePerformanceIndex(teamsMap, recW);
  const oppPct = ratingPercentiles(teamsMap);

  for (const t of allTeams) computeResults(t, teamsMap, adv, oppPct);
  computeSOS(teamsMap, adv);
  computeMomentum(teamsMap, adv);

  const fbsTeams = allTeams.filter(t => (t.classification || '').toLowerCase() === 'fbs');
  const fbsPlayed = fbsTeams.filter(t => t.games.length);
  const refTeams = fbsPlayed.length ? fbsPlayed : played;

  {
    const sosSortedAll = [...allTeams].sort((a, b) => b.sos - a.sos); // higher = tougher
    sosSortedAll.forEach((t, i) => { t.sosRankAll = i + 1; });
  }

  // Raw (unadjusted) PF/PA percentiles across FBS teams. Games against
  // non-FBS opponents count at NON_FBS_GAME_WEIGHT so a blowout of an FCS team
  // can't dominate the per-game averages.
  const NON_FBS_GAME_WEIGHT = 0.25;
  const weightedPerGame = (t, key) => {
    let sum = 0, w = 0;
    for (const g of t.games) {
      const gw = (teamsMap.get(g.opp)?.classification || '').toLowerCase() === 'fbs' ? 1 : NON_FBS_GAME_WEIGHT;
      sum += gw * g[key]; w += gw;
    }
    return w ? sum / w : 0;
  };
  const pfPct = toPercentiles(fbsTeams.map(t => weightedPerGame(t, 'for')), true);
  const paPct = toPercentiles(fbsTeams.map(t => weightedPerGame(t, 'against')), false);
  fbsTeams.forEach((t, i) => { t.offPct = pfPct[i]; t.defPct = paPct[i]; });
  for (const t of allTeams) {
    if (t.offPct == null) t.offPct = 0.5;
    if (t.defPct == null) t.defPct = 0.5;
  }

  // Efficiency: mostly the opponent-adjusted rating, a little raw PF/PA;
  // the adjusted share grows as the season gives it more games.
  const perfBlend = 0.80 + 0.10 * seasonProgress;
  for (const t of allTeams) {
    const rawEff = clamp(0.55 * t.offPct + 0.45 * t.defPct, 0, 1);
    t.efficiency = (1 - perfBlend) * rawEff + perfBlend * (t.perf * 0.5 + 0.5);
  }

  // Conference strength: each team's conference average SOS, percentile-ranked
  // across FBS. Off by default (only matters when a custom poll assigns the
  // "conference" weight), so it never nudges the official site poll.
  {
    const confAvg = new Map();
    const byConf = new Map();
    for (const t of fbsTeams) {
      if (!byConf.has(t.conference)) byConf.set(t.conference, []);
      byConf.get(t.conference).push(t);
    }
    for (const [conf, arr] of byConf.entries()) {
      confAvg.set(conf, arr.reduce((a, t) => a + t.sos, 0) / (arr.length || 1));
    }
    const confPctArr = toPercentiles(fbsTeams.map(t => confAvg.get(t.conference) || 0), true);
    fbsTeams.forEach((t, i) => { t.confPct = confPctArr[i]; });
    for (const t of allTeams) { if (t.confPct == null) t.confPct = 0.5; }
  }

  // SOS percentile among FBS — scales the unbeaten bonus
  const sosPctMap = new Map();
  {
    const p = toPercentiles(refTeams.map(t => t.sos), true);
    refTeams.forEach((t, i) => sosPctMap.set(t.name, p[i]));
  }

  const prior = indexSP(spRaw, { byName });

  // Component weights — defaults match the site's official computer poll;
  // callers (e.g. user-built custom polls) can override any subset. Whatever
  // is passed is renormalized to sum to 1 so a poll can't cheat its total.
  const wRaw = { ...DEFAULT_WEIGHTS, ...(weights || {}) };
  const wSum = Object.values(wRaw).reduce((a, b) => a + (Number(b) || 0), 0) || 1;
  const wEFF = (wRaw.efficiency || 0) / wSum;
  const wRES = (wRaw.results || 0) / wSum;
  const wSOS = (wRaw.sos || 0) / wSum;
  const wQLT = (wRaw.quality || 0) / wSum;
  const wMOM = (wRaw.momentum || 0) / wSum;
  const wCON = (wRaw.conference || 0) / wSum;

  // Every component is z-scored across FBS teams so the weights mean what
  // they say regardless of each component's native scale.
  const zEFF = zScorer(refTeams, t => t.efficiency);
  const zRES = zScorer(refTeams, t => t.results);
  const zSOS = zScorer(refTeams, t => t.sos);
  const zMOM = zScorer(refTeams, t => t.momentum);
  const zCON = zScorer(refTeams, t => t.confPct);

  const scoreAll = () => {
    const zQLT = zScorer(refTeams, t => t.quality);
    for (const t of allTeams) {
      const gp = t.games.length;
      let core =
          wEFF * zEFF(t.efficiency) +
          wRES * zRES(t.results) +
          wSOS * zSOS(t.sos) +
          wQLT * zQLT(t.quality) +
          wMOM * zMOM(t.momentum) +
          wCON * zCON(t.confPct);

      // Small unbeaten bonus, scaled by schedule strength — results and
      // quality already reward the wins, so this is only a tiebreak-sized tilt.
      if (t.l === 0 && gp >= 3) {
        core += 0.12 * (1 - Math.exp(-gp / 5)) * (sosPctMap.get(t.name) ?? 0.5);
      }

      const sp = prior.get(t.name) ?? 0;
      const priorW = Math.max(0, Math.min(0.08, 0.12 - 0.02 * gp));
      t.score = SCORE_SCALE * ((1 - priorW) * core + priorW * sp);
    }
  };

  // Pass 1: quality vs. opponents ranked by adjusted rating; score.
  computeQuality(teamsMap, fbsRankMap(fbsTeams, 'rating'), adv);
  scoreAll();
  // Pass 2: quality vs. opponents ranked by pass-1 FBS score; rescore.
  computeQuality(teamsMap, fbsRankMap(fbsTeams, 'score'), adv);
  scoreAll();

  // Final output = FBS only, with H2H smoothing
  const rankedFBS = [...fbsTeams].sort((a, b) => b.score - a.score);
  applyHeadToHeadNudge(rankedFBS, teamsMap);
  rankedFBS.sort((a, b) => b.score - a.score);
  applyHeadToHeadOrder(rankedFBS, teamsMap);

  const lastWeek = played.reduce((m, t) => Math.max(m, ...t.games.map(g => g.week || 1)), 0);
  const prev = prevRanks !== undefined ? prevRanks
    : previousWeekRanks({ teamsRaw, gamesRaw, spRaw, weights, advanced }, lastWeek);
  if (prev) applyNoRiseAfterLoss(rankedFBS, prev, lastWeek);

  rankedFBS.forEach((t, i)=> t.rank = i+1);
  {
    const sosSortedFBS = [...rankedFBS].sort((a, b) => b.sos - a.sos); // higher = tougher
    const nameToFbsSosRank = new Map(sosSortedFBS.map((t, i) => [t.name, i + 1]));
    rankedFBS.forEach(t => { t.sosRank = nameToFbsSosRank.get(t.name) || null; });
  }
  return rankedFBS;
}
