import { describe, it, expect } from 'vitest';
import { rankTeams, DEFAULT_WEIGHTS, DEFAULT_ADVANCED } from './rankAlgo.js';

// ---- Deterministic synthetic season, big enough for SOS/quality tiering to
// mean something (12 FBS teams + 1 FCS cupcake), built with a seeded PRNG so
// the fixture never changes between runs. ----
function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CONFS = ['Alpha', 'Beta'];
const TEAM_NAMES = Array.from({ length: 12 }, (_, i) => `Team${i + 1}`);
// Fixed "strength" per team so higher-strength teams tend to win — gives the
// fixture a real hierarchy instead of pure noise.
const STRENGTH = { Team1: 9, Team2: 8, Team3: 8, Team4: 7, Team5: 7, Team6: 6, Team7: 6, Team8: 5, Team9: 5, Team10: 4, Team11: 3, Team12: 2 };

function buildFixture() {
  const rng = mulberry32(42);
  const teamsRaw = TEAM_NAMES.map((name, i) => ({
    school: name, conference: CONFS[i % 2], classification: 'fbs',
  }));
  teamsRaw.push({ school: 'Cupcake FCS', conference: 'FCS Conf', classification: 'fcs' });

  const gamesRaw = [];
  let week = 1;
  // Round-robin-ish: each team plays 5 games across weeks 1-5 against a
  // shuffled slate, plus Team1/Team2 each get one blowout over the FCS team.
  for (let w = 1; w <= 5; w++) {
    const shuffled = [...TEAM_NAMES].sort(() => rng() - 0.5);
    for (let i = 0; i + 1 < shuffled.length; i += 2) {
      const home = shuffled[i], away = shuffled[i + 1];
      const sHome = STRENGTH[home] + (rng() * 6 - 3) + 1; // small home boost
      const sAway = STRENGTH[away] + (rng() * 6 - 3);
      const homeWins = sHome >= sAway;
      const margin = Math.max(1, Math.round(Math.abs(sHome - sAway) * 3 + rng() * 10));
      const loserScore = 10 + Math.round(rng() * 10);
      gamesRaw.push({
        home, away, week: w,
        home_points: homeWins ? loserScore + margin : loserScore,
        away_points: homeWins ? loserScore : loserScore + margin,
      });
    }
  }
  gamesRaw.push({ home: 'Team1', away: 'Cupcake FCS', week: 1, home_points: 56, away_points: 3 });
  gamesRaw.push({ home: 'Team2', away: 'Cupcake FCS', week: 2, home_points: 49, away_points: 0 });

  return { teamsRaw, gamesRaw };
}

const { teamsRaw, gamesRaw } = buildFixture();

describe('rankTeams — official (default) output', () => {
  it('only returns FBS teams, ranked 1..N with no gaps', () => {
    const ranked = rankTeams({ teamsRaw, gamesRaw });
    expect(ranked.every(t => t.classification === 'fbs')).toBe(true);
    expect(ranked.map(t => t.rank)).toEqual(Array.from({ length: ranked.length }, (_, i) => i + 1));
    expect(ranked.find(t => t.name === 'Cupcake FCS')).toBeUndefined();
  });

  it('is a deterministic snapshot for this fixture (catches unintended algorithm drift)', () => {
    const ranked = rankTeams({ teamsRaw, gamesRaw });
    // Top-3 order is the load-bearing assertion here — if a refactor changes
    // this without an intentional algorithm change, something broke.
    expect(ranked.slice(0, 3).map(t => t.name)).toEqual(['Team1', 'Team2', 'Team3']);
  });

  it('advanced=null and advanced=DEFAULT_ADVANCED produce byte-identical scores', () => {
    const a = rankTeams({ teamsRaw, gamesRaw, weights: null, advanced: null });
    const b = rankTeams({ teamsRaw, gamesRaw, weights: null, advanced: DEFAULT_ADVANCED });
    expect(b.map(t => t.score)).toEqual(a.map(t => t.score));
    expect(b.map(t => t.name)).toEqual(a.map(t => t.name));
  });

  it('an explicit weights object matching DEFAULT_WEIGHTS reproduces the official ranking exactly', () => {
    const official = rankTeams({ teamsRaw, gamesRaw, weights: null });
    const explicit = rankTeams({ teamsRaw, gamesRaw, weights: DEFAULT_WEIGHTS });
    expect(explicit.map(t => t.score)).toEqual(official.map(t => t.score));
  });

  it('a "conference" weight of 0 (the implicit default) never affects the score', () => {
    const withoutKey = rankTeams({ teamsRaw, gamesRaw, weights: { ...DEFAULT_WEIGHTS } });
    const withZeroKey = rankTeams({ teamsRaw, gamesRaw, weights: { ...DEFAULT_WEIGHTS, conference: 0 } });
    expect(withZeroKey.map(t => t.score)).toEqual(withoutKey.map(t => t.score));
  });
});

describe('rankTeams — advanced tuning knobs', () => {
  it('conference weight pulls a team toward its conference-mates\' strength', () => {
    const noConf = rankTeams({ teamsRaw, gamesRaw, weights: { ...DEFAULT_WEIGHTS, conference: 0 } });
    const heavyConf = rankTeams({ teamsRaw, gamesRaw, weights: { efficiency: 0, results: 0, sos: 0, quality: 0, momentum: 0, conference: 1 } });
    // Every FBS team should carry a defined confPct-driven score under a pure-conference weighting.
    expect(heavyConf.length).toBe(noConf.length);
    expect(heavyConf.every(t => Number.isFinite(t.score))).toBe(true);
    // Conference weight must actually move scores relative to the no-conference baseline.
    const changed = heavyConf.some((t, i) => t.name !== noConf[i]?.name || Math.abs(t.score - (noConf.find(x => x.name === t.name)?.score ?? 0)) > 1e-6);
    expect(changed).toBe(true);
  });

  it('movWeight=0 removes margin-of-victory sensitivity; movWeight=100 restores it', () => {
    const flat = rankTeams({ teamsRaw, gamesRaw, advanced: { ...DEFAULT_ADVANCED, movWeight: 0 } });
    const full = rankTeams({ teamsRaw, gamesRaw, advanced: { ...DEFAULT_ADVANCED, movWeight: 100 } });
    const t1flat = flat.find(t => t.name === 'Team1');
    const t1full = full.find(t => t.name === 'Team1');
    expect(t1full.results).not.toBeCloseTo(t1flat.results, 5);
  });

  it('locationBonus=0 makes home/road multiplier a no-op', () => {
    const off = rankTeams({ teamsRaw, gamesRaw, advanced: { ...DEFAULT_ADVANCED, locationBonus: 0 } });
    const on = rankTeams({ teamsRaw, gamesRaw, advanced: { ...DEFAULT_ADVANCED, locationBonus: 100 } });
    const diffs = off.map((t, i) => Math.abs(t.results - (on.find(x => x.name === t.name)?.results ?? 0)));
    expect(diffs.some(d => d > 1e-6)).toBe(true);
  });

  it('badLossPenalty scales the quality debit for a loss to a weaker opponent', () => {
    const lenient = rankTeams({ teamsRaw, gamesRaw, advanced: { ...DEFAULT_ADVANCED, badLossPenalty: 0 } });
    const harsh = rankTeams({ teamsRaw, gamesRaw, advanced: { ...DEFAULT_ADVANCED, badLossPenalty: 100 } });
    // Some team with at least one loss should have a strictly lower quality score under harsher penalty.
    const anyStricter = lenient.some(t => {
      const h = harsh.find(x => x.name === t.name);
      return h && h.quality < t.quality - 1e-9;
    });
    expect(anyStricter).toBe(true);
  });

  it('recencyDecay changes momentum magnitude', () => {
    const flat = rankTeams({ teamsRaw, gamesRaw, advanced: { ...DEFAULT_ADVANCED, recencyDecay: 0 } });
    const full = rankTeams({ teamsRaw, gamesRaw, advanced: { ...DEFAULT_ADVANCED, recencyDecay: 100 } });
    const diffs = flat.map((t, i) => Math.abs(t.momentum - (full.find(x => x.name === t.name)?.momentum ?? 0)));
    expect(diffs.some(d => d > 1e-6)).toBe(true);
  });

  it('sosBlend changes the computed SOS value', () => {
    const owpOnly = rankTeams({ teamsRaw, gamesRaw, advanced: { ...DEFAULT_ADVANCED, sosBlend: 0 } });
    const playedOnly = rankTeams({ teamsRaw, gamesRaw, advanced: { ...DEFAULT_ADVANCED, sosBlend: 100 } });
    const diffs = owpOnly.map((t, i) => Math.abs(t.sos - (playedOnly.find(x => x.name === t.name)?.sos ?? 0)));
    expect(diffs.some(d => d > 1e-6)).toBe(true);
  });
});
