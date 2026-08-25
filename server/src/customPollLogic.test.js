// Unit tests for the pure validation/grading helpers behind the backtest and
// leaderboard routes. Run with: node --test src/customPollLogic.test.js
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeWeights, sanitizeAdvanced, isValidSeason, scoreBacktest, gradePollAgainstGames, DEFAULT_ADVANCED } from './customPollLogic.js';

describe('isValidSeason', () => {
  test('accepts a normal season', () => {
    assert.equal(isValidSeason(2025), true);
  });
  test('rejects NaN (e.g. missing/non-numeric body.season)', () => {
    assert.equal(isValidSeason(Number(undefined)), false);
    assert.equal(isValidSeason(Number('not-a-year')), false);
  });
  test('rejects non-integers', () => {
    assert.equal(isValidSeason(2025.5), false);
  });
  test('rejects out-of-range values', () => {
    assert.equal(isValidSeason(0), false);
    assert.equal(isValidSeason(-2025), false);
    assert.equal(isValidSeason(1999), false);
    assert.equal(isValidSeason(2101), false);
    assert.equal(isValidSeason(Infinity), false);
  });
});

describe('sanitizeWeights', () => {
  test('returns null when every weight is zero/missing', () => {
    assert.equal(sanitizeWeights({}), null);
    assert.equal(sanitizeWeights(null), null);
    assert.equal(sanitizeWeights(undefined), null);
  });
  test('clamps values into [0, 1]', () => {
    const out = sanitizeWeights({ efficiency: 5, results: -3, sos: 0.4 });
    assert.equal(out.efficiency, 1);
    assert.equal(out.results, 0);
    assert.equal(out.sos, 0.4);
  });
  test('ignores unknown keys and defaults missing ones to 0', () => {
    const out = sanitizeWeights({ efficiency: 0.5, notARealKey: 99 });
    assert.equal(out.notARealKey, undefined);
    assert.equal(out.conference, 0);
  });
  test('non-numeric / NaN input for a key defaults to 0 rather than throwing', () => {
    const out = sanitizeWeights({ efficiency: 'banana', results: 0.5 });
    assert.equal(out.efficiency, 0);
    assert.equal(out.results, 0.5);
  });
});

describe('sanitizeAdvanced', () => {
  test('missing/invalid input falls back to DEFAULT_ADVANCED entirely', () => {
    assert.deepEqual(sanitizeAdvanced(null), DEFAULT_ADVANCED);
    assert.deepEqual(sanitizeAdvanced({}), DEFAULT_ADVANCED);
    assert.deepEqual(sanitizeAdvanced(undefined), DEFAULT_ADVANCED);
  });
  test('clamps out-of-range knob values into [0, 100]', () => {
    const out = sanitizeAdvanced({ movWeight: 500, sosBlend: -20 });
    assert.equal(out.movWeight, 100);
    assert.equal(out.sosBlend, 0);
  });
  test('a single non-numeric knob falls back to just that default, others pass through', () => {
    const out = sanitizeAdvanced({ movWeight: 'oops', recencyDecay: 80 });
    assert.equal(out.movWeight, DEFAULT_ADVANCED.movWeight);
    assert.equal(out.recencyDecay, 80);
  });
});

describe('scoreBacktest', () => {
  const apTop25 = ['Team A', 'Team B', 'Team C'];
  test('perfect match scores 100 closeness with all exact matches', () => {
    const custom = [{ team: 'Team A', rank: 1 }, { team: 'Team B', rank: 2 }, { team: 'Team C', rank: 3 }];
    const r = scoreBacktest(apTop25, custom);
    assert.equal(r.closeness, 100);
    assert.equal(r.exactMatches, 3);
    assert.equal(r.overlap, 3);
    assert.equal(r.avgRankDiff, 0);
  });
  test('a team missing from the custom ranking is penalized the max (24)', () => {
    const custom = [{ team: 'Team A', rank: 1 }, { team: 'Team B', rank: 2 }]; // Team C absent
    const r = scoreBacktest(apTop25, custom);
    assert.equal(r.overlap, 2);
    const teamC = r.perTeam.find(t => t.team === 'Team C');
    assert.equal(teamC.customRank, null);
    assert.equal(teamC.diff, null);
  });
  test('empty apTop25 yields null closeness rather than dividing by zero', () => {
    const r = scoreBacktest([], [{ team: 'Team A', rank: 1 }]);
    assert.equal(r.closeness, null);
  });
});

describe('gradePollAgainstGames', () => {
  const rankings = [{ team: 'Alpha', rank: 1 }, { team: 'Beta', rank: 5 }];
  test('higher-ranked team is predicted to beat lower-ranked team', () => {
    const games = [{ week: 1, home: 'Alpha', away: 'Beta', winner: 'Alpha' }];
    const r = gradePollAgainstGames(rankings, games);
    assert.equal(r.correct, 1);
    assert.equal(r.total, 1);
    assert.equal(r.accuracyPct, 100);
  });
  test('ranked team predicted to beat an unranked opponent', () => {
    const games = [{ week: 1, home: 'Gamma', away: 'Alpha', winner: 'Gamma' }]; // upset
    const r = gradePollAgainstGames(rankings, games);
    assert.equal(r.correct, 0);
    assert.equal(r.total, 1);
  });
  test('games between two unranked teams are skipped entirely', () => {
    const games = [{ week: 1, home: 'Gamma', away: 'Delta', winner: 'Gamma' }];
    const r = gradePollAgainstGames(rankings, games);
    assert.equal(r.total, 0);
    assert.equal(r.accuracyPct, null);
  });
  test('groups results by week for weekDetail', () => {
    const games = [
      { week: 1, home: 'Alpha', away: 'Beta', winner: 'Alpha' },
      { week: 2, home: 'Alpha', away: 'Beta', winner: 'Beta' },
    ];
    const r = gradePollAgainstGames(rankings, games);
    assert.equal(r.weekDetail.length, 2);
    assert.equal(r.weekDetail[0].correct, 1);
    assert.equal(r.weekDetail[1].correct, 0);
  });
  test('handles an empty/missing rankings array without throwing', () => {
    const games = [{ week: 1, home: 'Alpha', away: 'Beta', winner: 'Alpha' }];
    const r = gradePollAgainstGames(null, games);
    assert.equal(r.total, 0);
  });
});
