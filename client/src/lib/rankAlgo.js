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

/** Results: binary win/loss with capped MOV, venue weight, FCS adjustments.
 * `adv` (advanced tuning): movWeight 0-100 (default 50 → 0.28 coefficient),
 * locationBonus 0-100 (default 50 → 1x scale), badLossPenalty 0-100 (default 50 → 1x scale). */
function computeResults(team, teamsMapRef, adv = {}){
  const movCoef = adv.movWeight != null ? 0.56 * (adv.movWeight / 100) : 0.28;
  const locScale = adv.locationBonus != null ? adv.locationBonus / 50 : 1;
  const lossScale = adv.badLossPenalty != null ? adv.badLossPenalty / 50 : 1;
  let sum = 0, w = 0, l = 0;
  for (const g of team.games) {
    const mov = capMov(g.for - g.against);
    const win = g.for > g.against ? 1 : 0;
    const lw = locWeight(!!g.home, !!g.away, g.neutral, !!win, locScale);

    const opp = teamsMapRef.get(g.opp);
    const { winMul, lossMul } = vsClassWeight(opp, lossScale);
    const base = win ? (1.30 * winMul) : (-1.20 * lossMul);
    const gameScore = base + (mov / 24) * movCoef;
    sum += gameScore * lw;

    if (win) w++; else l++;
  }
  team.w = w; team.l = l;
  return team.games.length ? (sum / team.games.length) : 0;
}

/** Re-score results weighting each game by opponent quality (call after SOS converges). */
function adjustResultsByOppQuality(teamsMap, adv = {}) {
  const movCoef = adv.movWeight != null ? 0.56 * (adv.movWeight / 100) : 0.28;
  const locScale = adv.locationBonus != null ? adv.locationBonus / 50 : 1;
  const lossScale = adv.badLossPenalty != null ? adv.badLossPenalty / 50 : 1;
  for (const t of teamsMap.values()) {
    if (!t.games.length) continue;
    let sum = 0;
    for (const g of t.games) {
      const mov = capMov(g.for - g.against);
      const win = g.for > g.against;
      const lw = locWeight(!!g.home, !!g.away, g.neutral, win, locScale);
      const opp = teamsMap.get(g.opp);
      const { winMul, lossMul } = vsClassWeight(opp, lossScale);
      const base = win ? (1.30 * winMul) : (-1.20 * lossMul);
      const gameScore = base + (mov / 24) * movCoef;

      const oppWinPct = opp ? (opp.w / Math.max(1, opp.w + opp.l)) : 0.5;
      const oppMul = win
        ? (0.80 + 0.40 * oppWinPct)   // beating .500 = 1.0x, beating .750 = 1.10x, beating .250 = 0.90x
        : (0.80 + 0.40 * (1 - oppWinPct)); // losing to .750 = 0.90x (less harsh), losing to .250 = 1.10x (more harsh)

      sum += gameScore * lw * oppMul;
    }
    t.results = sum / t.games.length;
  }
}

/** Momentum: compare recent-half performance to first-half performance.
 * `adv.recencyDecay` 0-100 (default 50 → 0.15 coefficient) controls how much
 * a trending-up/down team is rewarded/punished vs. its season-long form. */
function computeMomentum(teamsMap, adv = {}) {
  const momCoef = adv.recencyDecay != null ? 0.30 * (adv.recencyDecay / 100) : 0.15;
  const momClamp = 0.06 * (momCoef / 0.15);
  for (const t of teamsMap.values()) {
    const gp = t.games.length;
    if (gp < 4) { t.momentum = 0; continue; }
    const sorted = [...t.games].sort((a, b) => (a.week || 1) - (b.week || 1));
    const mid = Math.floor(gp / 2);
    const score = (games) => {
      let s = 0;
      for (const g of games) {
        const mov = capMov(g.for - g.against);
        s += (g.for > g.against ? 1 : -1) + mov / 48;
      }
      return s / games.length;
    };
    const early = score(sorted.slice(0, mid));
    const recent = score(sorted.slice(mid));
    t.momentum = clamp((recent - early) * momCoef, -momClamp, momClamp);
  }
}

/** Iterative SOS from opponents' results (all teams considered). */
function iterateSOS(teamsMap, loops=5){
  for (const t of teamsMap.values()) t.sosAdj = t.results;
  for (let i = 0; i < loops; i++){
    for (const t of teamsMap.values()) {
      if (!t.games.length){ t.sos_iter = 0; continue; }
      let opp = 0;
      for (const g of t.games) opp += (teamsMap.get(g.opp)?.sosAdj ?? 0);
      t.sos_iter = opp / t.games.length;
    }
    for (const t of teamsMap.values()) t.sosAdj = 0.9 * t.results + 0.1 * (t.sos_iter ?? 0);
  }
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

/** Interim sets (all teams) define Top10/25/50 for résumé logic. */
function buildTopSets(teams){
  const tmp = [...teams].sort((a,b)=> (b.results + b.sos) - (a.results + a.sos));
  return {
    top10: new Set(tmp.slice(0,10).map(t=>t.name)),
    top25: new Set(tmp.slice(0,25).map(t=>t.name)),
    top50: new Set(tmp.slice(0,50).map(t=>t.name))
  };
}

/** Quality résumé: per-game credit/debit with margin scaling and good-loss credit.
 * `adv.badLossPenalty` 0-100 (default 50 → 1x scale) dials the debit for bad losses. */
function computeQuality(teamsMap, sets, adv = {}){
  const { top10, top25, top50 } = sets;
  const lossScale = adv.badLossPenalty != null ? adv.badLossPenalty / 50 : 1;
  for (const t of teamsMap.values()) {
    let q = 0;
    for (const g of t.games) {
      const opp = g.opp;
      const won = g.for > g.against;
      const margin = Math.abs(g.for - g.against);
      if (won) {
        const marginMul = 1.0 + clamp(margin / 28, 0, 1) * 0.35;
        if (top10.has(opp)) q += 0.50 * marginMul;
        else if (top25.has(opp)) q += 0.32 * marginMul;
        else if (top50.has(opp)) q += 0.16 * marginMul;
      } else {
        const closeMul = margin <= 7 ? 0.65 : margin <= 14 ? 0.85 : 1.0;
        if (top10.has(opp)) {
          q += margin <= 7 ? 0.06 : 0;
        } else if (top25.has(opp)) {
          q -= 0.04 * closeMul * lossScale;
        } else if (top50.has(opp)) {
          q -= 0.11 * closeMul * lossScale;
        } else {
          q -= 0.26 * closeMul * lossScale;
        }
      }
    }
    t.quality = safeDiv(q, Math.max(1, t.games.length));
  }
}

/** Opponent-adjusted performance using all opponents. */
function computeOpponentAverages(teamsMap){
  for (const t of teamsMap.values()) {
    let pf=0, pa=0;
    for (const g of t.games){ pf += (g.for||0); pa += (g.against||0); }
    const gp = t.games.length || 1;
    t.pf_pg = pf / gp;
    t.pa_pg = pa / gp;
  }
}
function computePerformanceIndex(teamsMap){
  computeOpponentAverages(teamsMap);
  for (const t of teamsMap.values()){
    let agg = 0;
    for (const g of t.games){
      const opp = teamsMap.get(g.opp);
      const oppPA = opp?.pa_pg ?? null;  // opp's avg points allowed
      const oppPF = opp?.pf_pg ?? null;  // opp's avg points scored
      if (oppPA == null || oppPF == null) continue;

      const offRel = (g.for - oppPA) / 28;  // ~ -1..+1
      const defRel = (oppPF - g.against) / 28;
      const rel = Math.max(-1.2, Math.min(1.2, offRel + defRel));
      agg += rel;
    }
    t.perf = safeDiv(agg, (t.games.length || 1));
  }
}

/** H2H smoothing: nudge scales inversely with score gap — big effect when close, fades when far. */
function applyHeadToHeadNudge(sorted, teamsMap){
  const hasBeaten = new Map();
  for (const t of teamsMap.values()) {
    const wins = new Set();
    for (const g of t.games) {
      if (g.for > g.against) wins.add(g.opp);
    }
    hasBeaten.set(t.name, wins);
  }
  for (let i = 0; i < sorted.length; i++){
    const higher = sorted[i];
    for (let j = i + 1; j < Math.min(sorted.length, i + 8); j++){
      const lower = sorted[j];
      const lowerBeatHigher = hasBeaten.get(lower.name)?.has(higher.name);
      const higherBeatLower = hasBeaten.get(higher.name)?.has(lower.name);
      if (lowerBeatHigher && !higherBeatLower) {
        const gap = higher.score - lower.score;
        const nudge = gap < 0.005 ? 0.008
                    : gap < 0.02  ? 0.006
                    : gap < 0.05  ? 0.004
                    :               0.002;
        lower.score += nudge;
      }
    }
  }
}

/** SP+ prior (optional, fades quickly). Uses team index aliases for robust matching. */
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
    const z = (raw - mean) / std;
    return Math.max(-2.5, Math.min(2.5, z)) / 10;
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

/** Default component weights for the built-in computer poll (must sum to 1). */
export const DEFAULT_WEIGHTS = { efficiency: 0.38, results: 0.25, sos: 0.15, quality: 0.12, momentum: 0.10 };

/** Default "advanced" tuning knobs — 0-100 sliders. Every default reproduces
 * the official site algorithm's fixed constants exactly; a custom poll can
 * override any subset to make the model more/less aggressive in that area. */
export const DEFAULT_ADVANCED = { movWeight: 50, sosBlend: 72, recencyDecay: 50, locationBonus: 50, badLossPenalty: 50 };

/** ---------------- Main ranking (ALL teams internally; filter to FBS at the end) ---------------- **/
export function rankTeams({ teamsRaw = [], gamesRaw = [], spRaw = [], weights = null, advanced = null }) {
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
      perf: 0,
      pf_pg: 0, pa_pg: 0,
      score: 0
    });
  }

  // Attach games: uses all teams; FCS opponents resolve properly.
  attachGames(teamsMap, { byId, byName }, gamesRaw);

  // If no games, return FBS alphabetically (legacy fallback)
  const totalGames = Array.from(teamsMap.values()).reduce((a, t) => a + t.games.length, 0);
  if (totalGames === 0) {
    const flat = Array.from(teamsMap.values()).filter(t => (t.classification || '').toLowerCase() === 'fbs');
    flat.sort((a,b)=> a.name.localeCompare(b.name));
    flat.forEach((t, i)=> { t.rank = i+1; t.score = -0.085; });
    return flat;
  }

  const gamesMean = Array.from(teamsMap.values())
    .reduce((a,x)=> a + x.games.length, 0) / Math.max(1, teamsMap.size);
  const seasonProgress = clamp((gamesMean - 2) / 8, 0, 1);
  
  // Results & SOS
  for (const t of teamsMap.values()) t.results = computeResults(t, teamsMap, adv);
  iterateSOS(teamsMap, 5);
  adjustResultsByOppQuality(teamsMap, adv);
  computeOWP(teamsMap);

  // Combine SOS parts; mild floor for early cupcake slates. sosBlend (0-100,
  // default 72) is the fraction of weight on the iterative (played-schedule)
  // component vs. raw opponents'-win% (OWP) — higher = more "who you played",
  // lower = more "how good their record looks."
  const sosBlendFrac = adv.sosBlend != null ? adv.sosBlend / 100 : 0.72;
  for (const t of teamsMap.values()) {
    const iter = t.sos_iter ?? 0;
    const owpC = (t.owp ?? 0) - 0.5;
    let sos = sosBlendFrac*iter + (1 - sosBlendFrac)*owpC;
    if (sos < -0.15) sos = -0.15 + 0.6*(sos + 0.15);
    t.sos = sos * (1 + 0.06 * seasonProgress);
  }
    {
    const allTeams = Array.from(teamsMap.values());
    const sosSortedAll = [...allTeams].sort((a, b) => b.sos - a.sos); // higher = tougher
    sosSortedAll.forEach((t, i) => { t.sosRankAll = i + 1; });
  }

  // Quality on all opponents
  const sets = buildTopSets(Array.from(teamsMap.values()));
  computeQuality(teamsMap, sets, adv);

  // Opponent-adjusted performance
  computePerformanceIndex(teamsMap);

  // Momentum: recent-half vs first-half performance trend
  computeMomentum(teamsMap, adv);

  // Efficiency percentiles — FBS only so the distribution isn't skewed by FCS teams
  const fbsTeams = Array.from(teamsMap.values()).filter(t => (t.classification || '').toLowerCase() === 'fbs');
  const fbsPF = fbsTeams.map(t => t.pf_pg || 0);
  const fbsPA = fbsTeams.map(t => t.pa_pg || 0);
  const pfPct = toPercentiles(fbsPF, true);
  const paPct = toPercentiles(fbsPA, false);
  fbsTeams.forEach((t, i) => {
    t.offPct = pfPct[i];
    t.defPct = paPct[i];
  });
  // FCS teams get neutral percentiles
  for (const t of teamsMap.values()) {
    if (t.offPct == null) t.offPct = 0.5;
    if (t.defPct == null) t.defPct = 0.5;
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
    const confRaws = fbsTeams.map(t => confAvg.get(t.conference) || 0);
    const confPctArr = toPercentiles(confRaws, true);
    fbsTeams.forEach((t, i) => { t.confPct = confPctArr[i]; });
    for (const t of teamsMap.values()) { if (t.confPct == null) t.confPct = 0.5; }
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

  // First pass scoring for quality second-pass calibration
  const scoreTeam = (t) => {
    const gp = t.games.length;

    const results = t.results;
    const sos     = t.sos;
    const quality = t.quality;
    const perf    = t.perf;
    const mom     = t.momentum || 0;

    const offPct = t.offPct;
    const defPct = t.defPct;
    const effCore = 0.55 * offPct + 0.45 * defPct;
    const rawEfficiency = clamp(effCore, 0, 1);

    const perfBlend = 0.25 + 0.20 * seasonProgress;
    const efficiency = (1 - perfBlend) * rawEfficiency + perfBlend * clamp(perf * 0.5 + 0.5, 0, 1);

    let core =
        wEFF * efficiency +
        wRES * results +
        wSOS * sos +
        wQLT * quality +
        wMOM * clamp(mom + 0.5, 0, 1) +
        wCON * (t.confPct ?? 0.5);

    if (t.l === 0 && gp >= 3) {
      const scale = (1 - Math.exp(-gp / 5));
      const effTilt = 0.7 + 0.3 * efficiency;
      const sosTilt = 0.6 + 0.4 * clamp(sos + 0.5, 0, 1);
      const undefeated = 0.048 * scale * effTilt * sosTilt;
      core += Math.min(0.06, undefeated);
    }

    if (t.l >= 1 && gp <= 6) {
      const factor = (7 - gp) / 7;
      core -= 0.006 * t.l * factor;
    }

    const sp = prior.get(t.name) ?? 0;
    const priorW = Math.max(0, Math.min(0.08, 0.12 - 0.02 * gp));

    return (1 - priorW) * core + priorW * sp;
  };

  // First pass: score all teams
  for (const t of teamsMap.values()) t.score = scoreTeam(t);

  // Second pass: rebuild top sets from first-pass scores, recompute quality, rescore
  const allByScore = [...teamsMap.values()].sort((a, b) => b.score - a.score);
  const sets2 = {
    top10: new Set(allByScore.slice(0, 10).map(t => t.name)),
    top25: new Set(allByScore.slice(0, 25).map(t => t.name)),
    top50: new Set(allByScore.slice(0, 50).map(t => t.name)),
  };
  computeQuality(teamsMap, sets2, adv);
  for (const t of teamsMap.values()) t.score = scoreTeam(t);


  // Sort all for consistency, apply tiny H2H smoothing, resort
  let rankedAll = Array.from(teamsMap.values());
  rankedAll.sort((a,b)=> b.score - a.score);
  applyHeadToHeadNudge(rankedAll, teamsMap);
  rankedAll.sort((a,b)=> b.score - a.score);

  // Final output = FBS only
  const rankedFBS = rankedAll.filter(t => (t.classification || '').toLowerCase() === 'fbs');
  rankedFBS.forEach((t, i)=> t.rank = i+1);
    {
    const sosSortedFBS = [...rankedFBS].sort((a, b) => b.sos - a.sos); // higher = tougher
    const nameToFbsSosRank = new Map(sosSortedFBS.map((t, i) => [t.name, i + 1]));
    rankedFBS.forEach(t => { t.sosRank = nameToFbsSosRank.get(t.name) || null; });
  }
  return rankedFBS;
}
