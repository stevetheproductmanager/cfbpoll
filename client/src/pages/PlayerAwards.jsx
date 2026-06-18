import React, { useEffect, useMemo, useState } from 'react';
import { useRankings } from '../store/RankingsContext.jsx';

function safeNumber(v) {
  return typeof v === 'number' && !Number.isNaN(v) ? v : 0;
}

function isOffensePosition(pos = '') {
  const p = pos.toUpperCase();
  return ['QB', 'RB', 'FB', 'HB', 'TB', 'WR', 'TE', 'H', 'SB', 'SLOT'].some(code =>
    p.startsWith(code)
  );
}

function isDefensePosition(pos = '') {
  const p = pos.toUpperCase();
  return [
    'DL',
    'DE',
    'DT',
    'NT',
    'LB',
    'MLB',
    'OLB',
    'ILB',
    'CB',
    'S',
    'SS',
    'FS',
    'DB',
  ].some(code => p.startsWith(code));
}

function isSpecialTeams(pos = '') {
  const p = pos.toUpperCase();
  return ['K', 'P', 'LS', 'PK'].some(code => p === code || p.startsWith(code));
}

// ---- SCORING: BASE (RAW STATS → SCORE) -------------------------------------

function computeOffensiveScore(p) {
  const passYds = safeNumber(p.passingYards);
  const rushYds = safeNumber(p.rushingYards);
  const recYds = safeNumber(p.receivingYards);

  const passTD = safeNumber(p.passingTD);
  const rushTD = safeNumber(p.rushingTD);
  const recTD = safeNumber(p.receivingTD);

  const ints = safeNumber(p.passingINT);

  const yards = passYds + rushYds + recYds;
  const tds = passTD + rushTD + recTD;

  // Yards + TDs, lightly penalize INTs
  return yards + 20 * tds - 15 * ints;
}

function computeDefensiveScore(p) {
  const tackles = safeNumber(p.tacklesTotal || p.tacklesSolo);
  const tfl = safeNumber(p.tacklesForLoss);
  const sacks = safeNumber(p.sacks);
  const ints = safeNumber(p.interceptions);
  const pd = safeNumber(p.passesDefended);
  const ff = safeNumber(p.forcedFumbles);
  const fr = safeNumber(p.fumblesRecovered);

  return (
    tackles +
    3 * (tfl + sacks) +
    4 * ints +
    2 * pd +
    3 * ff +
    2 * fr
  );
}

function computeSpecialTeamsScore(p) {
  // Simple punting/return metric
  const punting =
    safeNumber(p.puntingYards) +
    50 * safeNumber(p.puntingYPP) +
    5 * safeNumber(p.puntingInside20) -
    5 * safeNumber(p.puntingTouchbacks);

  const returns =
    safeNumber(p.kickReturnYards) + 30 * safeNumber(p.kickReturnTD);

  return punting + returns;
}

// ---- AGGREGATION: RAW ROWS → ONE ROW PER PLAYER/TEAM/POS -------------------

function aggregateSeasonStats(rawRows) {
  const map = {};

  for (const row of rawRows) {
    const name = row.player || row.name || 'Unknown';
    const team = row.team || row.school || 'Unknown';
    const position = row.position || 'UNK';
    const season = row.season;

    const keyBase = row.playerId || row.id || `${name}::${team}::${position}`;
    const key = `${keyBase}::${season ?? ''}`;

    if (!map[key]) {
      map[key] = {
        id: row.playerId || row.id,
        player: name,
        name,
        team,
        position,
        season,
        conference: row.conference,

        // OFFENSE
        passingYards: 0,
        passingTD: 0,
        passingINT: 0,

        rushingYards: 0,
        rushingTD: 0,
        rushingCarries: 0,

        receivingYards: 0,
        receivingTD: 0,
        receptions: 0,
        receivingYPR: 0,

        // DEFENSE
        tacklesTotal: 0,
        tacklesSolo: 0,
        tacklesForLoss: 0,
        sacks: 0,
        passesDefended: 0,
        interceptions: 0,
        interceptionYards: 0,

        forcedFumbles: 0,
        fumblesRecovered: 0,

        // SPECIAL TEAMS
        puntingYards: 0,
        puntingYPP: 0,
        punts: 0,
        puntingInside20: 0,
        puntingTouchbacks: 0,
        puntingLong: 0,

        kickReturnYards: 0,
        kickReturns: 0,
        kickReturnTD: 0,
        kickReturnAvg: 0,
      };
    }

    const agg = map[key];

    const categoryRaw = row.category || '';
    const statTypeRaw = row.statType || '';

    const category = categoryRaw.toLowerCase().replace(/\s+/g, ''); // "punting", "defensive", "kickreturns"
    const statType = statTypeRaw.toUpperCase().replace(/\s+/g, ''); // "YDS", "INT", "IN20", ...

    const value = parseFloat(row.stat);
    if (Number.isNaN(value)) continue;

    // --- OFFENSE ---
    if (category === 'passing') {
      if (statType === 'YDS') agg.passingYards += value;
      if (statType === 'TD' || statType === 'TDS') agg.passingTD += value;
      if (statType === 'INT') agg.passingINT += value;
    } else if (category === 'rushing') {
      if (statType === 'YDS') agg.rushingYards += value;
      if (statType === 'TD' || statType === 'TDS') agg.rushingTD += value;
      if (statType === 'CAR' || statType === 'ATT') agg.rushingCarries += value;
    } else if (category === 'receiving') {
      if (statType === 'YDS') agg.receivingYards += value;
      if (statType === 'TD' || statType === 'TDS') agg.receivingTD += value;
      if (statType === 'REC' || statType === 'RECEPTIONS') agg.receptions += value;
      if (statType === 'YPR') agg.receivingYPR = value; // avg, not sum
    }

    // --- DEFENSE & INTs ---
    else if (category === 'defensive' || category === 'defense') {
      if (statType === 'TOT') agg.tacklesTotal += value;
      if (statType === 'SOLO') agg.tacklesSolo += value;
      if (statType === 'TFL') agg.tacklesForLoss += value;
      if (statType === 'SACKS' || statType === 'SK') agg.sacks += value;
      if (statType === 'PD' || statType === 'PDEF') agg.passesDefended += value;
      if (statType === 'INT' || statType === 'INTS') agg.interceptions += value;
      if (statType === 'FF') agg.forcedFumbles += value;
      if (statType === 'FR') agg.fumblesRecovered += value;
    } else if (category === 'interceptions') {
      if (statType === 'INT') agg.interceptions += value;
      if (statType === 'YDS') agg.interceptionYards += value;
    }

    // --- SPECIAL TEAMS: Punting ---
    else if (category === 'punting') {
      if (statType === 'YDS') agg.puntingYards += value;
      if (statType === 'NO') agg.punts += value;
      if (statType === 'YPP') agg.puntingYPP = value;
      if (statType === 'IN20') agg.puntingInside20 += value;
      if (statType === 'TB') agg.puntingTouchbacks += value;
      if (statType === 'LONG') {
        agg.puntingLong = Math.max(agg.puntingLong, value);
      }
    }

    // --- SPECIAL TEAMS: Kick Returns ---
    else if (category === 'kickreturns' || category === 'kickreturn') {
      if (statType === 'YDS') agg.kickReturnYards += value;
      if (statType === 'NO') agg.kickReturns += value;
      if (statType === 'TD' || statType === 'TDS') agg.kickReturnTD += value;
      if (statType === 'AVG') agg.kickReturnAvg = value;
    }

    // Other categories can be added as needed
  }

  return Object.values(map);
}

// ---- TEAMS / FBS FILTER -----------------------------------------------------

function extractFbsTeamNames(teamsJson) {
  const rows = Array.isArray(teamsJson)
    ? teamsJson
    : teamsJson.data || teamsJson.teams || [];

  const names = new Set();

  for (const t of rows) {
    const classification = String(
      t.classification ??
        t.division ??
        t.subdivision ??
        t.level ??
        ''
    ).toLowerCase();

    const isFbs =
      classification === 'fbs' ||
      classification.includes('fbs') ||
      t.isFbs === true ||
      t.is_fbs === true;

    if (!isFbs) continue;

    const school = t.school || t.team || t.name;
    if (!school) continue;

    names.add(school.toLowerCase());
  }

  return names;
}

// ---- HEISMAN: POSITION-RELATIVE Z-SCORES ------------------------------------

function meanAndStd(players, key) {
  if (!players.length) return { mean: 0, std: 0 };
  const vals = players.map(p => safeNumber(p[key]));
  const mean =
    vals.reduce((sum, v) => sum + v, 0) / vals.length;
  const variance =
    vals.reduce((sum, v) => sum + (v - mean) * (v - mean), 0) /
    vals.length;
  const std = Math.sqrt(variance);
  return { mean, std };
}

// Annotate players with offScore/defScore/stScore + heismanScore
function annotateHeismanScores(players) {
  // 1) Base scores
  const withBase = players.map(p => {
    const offScore = computeOffensiveScore(p);
    const defScore = computeDefensiveScore(p);
    const stScore = computeSpecialTeamsScore(p);
    return { ...p, offScore, defScore, stScore };
  });

  // 2) Means/stds by role (offense/defense/ST) using primary-role players
  const offensePlayers = withBase.filter(p => isOffensePosition(p.position));
  const defensePlayers = withBase.filter(p => isDefensePosition(p.position));
  const stPlayers = withBase.filter(p => isSpecialTeams(p.position));

  const { mean: offMean, std: offStd } = meanAndStd(offensePlayers, 'offScore');
  const { mean: defMean, std: defStd } = meanAndStd(defensePlayers, 'defScore');
  const { mean: stMean, std: stStd } = meanAndStd(stPlayers, 'stScore');

  // Helper to compute z-score safely
  const z = (val, mean, std) =>
    std > 0 ? (safeNumber(val) - mean) / std : 0;

  // 3) Per-player Heisman score
  return withBase.map(p => {
    const pos = (p.position || '').toUpperCase();
    const offZ = offensePlayers.length ? z(p.offScore, offMean, offStd) : 0;
    const defZ = defensePlayers.length ? z(p.defScore, defMean, defStd) : 0;
    const stZ = stPlayers.length ? z(p.stScore, stMean, stStd) : 0;

    // Primary role
    let primaryRole = 'off';
    if (isDefensePosition(pos)) primaryRole = 'def';
    else if (isSpecialTeams(pos)) primaryRole = 'st';

    let primaryZ = 0;
    if (primaryRole === 'off') primaryZ = offZ;
    if (primaryRole === 'def') primaryZ = defZ;
    if (primaryRole === 'st') primaryZ = stZ;

    // Secondary impact: credit positive z-scores in other phases
    const secondaryZs = [];
    if (primaryRole !== 'off') secondaryZs.push(offZ);
    if (primaryRole !== 'def') secondaryZs.push(defZ);
    if (primaryRole !== 'st') secondaryZs.push(stZ);

    const bestSecondary =
      secondaryZs.length > 0
        ? Math.max(...secondaryZs.map(v => Math.max(0, v)))
        : 0;
    const secondBestSecondary =
      secondaryZs.length > 1
        ? secondaryZs
            .map(v => Math.max(0, v))
            .sort((a, b) => b - a)[1] || 0
        : 0;

    // Base Heisman = primary dominance + a bit of multi-phase impact
    let heisman = primaryZ + 0.3 * bestSecondary + 0.2 * secondBestSecondary;

    // Positional weighting to avoid all-QB lists:
    let roleWeight = 1;
    if (pos.startsWith('QB')) {
      roleWeight = 0.9; // slightly nerf QBs
    } else if (
      ['RB', 'HB', 'TB', 'WR', 'TE', 'SLOT'].some(code =>
        pos.startsWith(code)
      )
    ) {
      roleWeight = 1.05; // slight boost for skill
    } else if (isDefensePosition(pos)) {
      roleWeight = 1.1; // bigger boost for defenders
    }

    const heismanScore = roleWeight * heisman;

    return { ...p, offZ, defZ, stZ, heismanScore };
  });
}

// ---- DYNAMIC POSITION COLUMNS ----------------------------------------------

function getPositionColumns(posRaw) {
  const pos = (posRaw || '').toUpperCase();

  // Quarterbacks
  if (pos.startsWith('QB')) {
    return [
      { header: 'Pass Yds', align: 'right', value: p => p.passingYards },
      { header: 'Pass TD', align: 'right', value: p => p.passingTD },
      { header: 'INT', align: 'right', value: p => p.passingINT },
      { header: 'Rush Yds', align: 'right', value: p => p.rushingYards },
    ];
  }

  // Backs
  if (['RB', 'FB', 'HB', 'TB'].some(code => pos.startsWith(code))) {
    return [
      { header: 'Rush Yds', align: 'right', value: p => p.rushingYards },
      { header: 'Rush TD', align: 'right', value: p => p.rushingTD },
      { header: 'Carries', align: 'right', value: p => p.rushingCarries },
      { header: 'Rec Yds', align: 'right', value: p => p.receivingYards },
    ];
  }

  // Receivers / TEs
  if (['WR', 'TE', 'SLOT'].some(code => pos.startsWith(code))) {
    return [
      { header: 'Rec Yds', align: 'right', value: p => p.receivingYards },
      { header: 'Rec TD', align: 'right', value: p => p.receivingTD },
      { header: 'Receptions', align: 'right', value: p => p.receptions },
      { header: 'Yds/Rec', align: 'right', value: p => p.receivingYPR },
    ];
  }

  // Defense
  if (isDefensePosition(pos)) {
    return [
      { header: 'TOT', align: 'right', value: p => p.tacklesTotal },
      { header: 'SOLO', align: 'right', value: p => p.tacklesSolo },
      { header: 'TFL', align: 'right', value: p => p.tacklesForLoss },
      { header: 'Sacks', align: 'right', value: p => p.sacks },
      { header: 'INT', align: 'right', value: p => p.interceptions },
    ];
  }

  // Punter
  if (pos === 'P') {
    return [
      { header: 'Punts', align: 'right', value: p => p.punts },
      { header: 'Yards', align: 'right', value: p => p.puntingYards },
      { header: 'YPP', align: 'right', value: p => p.puntingYPP },
      { header: 'In 20', align: 'right', value: p => p.puntingInside20 },
      { header: 'Long', align: 'right', value: p => p.puntingLong },
    ];
  }

  // Generic fallback
  return [
    { header: 'Pass Yds', align: 'right', value: p => p.passingYards },
    { header: 'Rush Yds', align: 'right', value: p => p.rushingYards },
    { header: 'Rec Yds', align: 'right', value: p => p.receivingYards },
    { header: 'TOT Tkls', align: 'right', value: p => p.tacklesTotal },
  ];
}

// ---- COMPONENT --------------------------------------------------------------

export default function PlayerAwards() {
  const { year } = useRankings();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [players, setPlayers] = useState([]); // aggregated, FBS, scored
  const [selectedPosition, setSelectedPosition] = useState('');
  const [fbsTeamCount, setFbsTeamCount] = useState(null);

  const loadSeason = async y => {
    setBusy(true);
    setErr(null);
    try {
      // Load stats + teams in parallel
      const [statsRes, teamsRes] = await Promise.all([
        fetch(`/data/${y}/stats-player-season.json`),
        fetch(`/data/${y}/teams.json`).catch(() => null),
      ]);

      if (!statsRes.ok) {
        throw new Error(`HTTP ${statsRes.status} loading stats-player-season.json`);
      }

      const statsJson = await statsRes.json();
      const rawRows = Array.isArray(statsJson) ? statsJson : statsJson.data || [];
      const aggregated = aggregateSeasonStats(rawRows);

      let fbsNames = null;
      if (teamsRes && teamsRes.ok) {
        const teamsJson = await teamsRes.json();
        fbsNames = extractFbsTeamNames(teamsJson);
        setFbsTeamCount(fbsNames.size || 0);
      } else {
        setFbsTeamCount(null);
      }

      const fbsOnly =
        fbsNames && fbsNames.size
          ? aggregated.filter(p =>
              fbsNames.has((p.team || '').toLowerCase())
            )
          : aggregated;

      const scored = annotateHeismanScores(fbsOnly);

      setPlayers(scored);

      const positions = Array.from(
        new Set(
          scored
            .map(p => p.position)
            .filter(Boolean)
        )
      ).sort();

      if (positions.length > 0) {
        setSelectedPosition(prev =>
          prev && positions.includes(prev) ? prev : positions[0]
        );
      } else {
        setSelectedPosition('');
      }
    } catch (e) {
      setErr(String(e.message || e));
      setPlayers([]);
      setSelectedPosition('');
      setFbsTeamCount(null);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    loadSeason(year);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);

  const uniquePositions = useMemo(() => {
    return Array.from(
      new Set(
        players
          .map(p => p.position)
          .filter(Boolean)
      )
    ).sort();
  }, [players]);

  const positionColumns = useMemo(
    () => getPositionColumns(selectedPosition),
    [selectedPosition]
  );

  const topByPosition = useMemo(() => {
    if (!selectedPosition) return [];
    const pos = selectedPosition.toUpperCase();

    const posPlayers = players.filter(
      p => (p.position || '').toUpperCase() === pos
    );

    const withScore = posPlayers.map(p => {
      let positionScore = 0;
      if (isSpecialTeams(p.position)) {
        positionScore = p.stScore ?? computeSpecialTeamsScore(p);
      } else if (isOffensePosition(p.position)) {
        positionScore = p.offScore ?? computeOffensiveScore(p);
      } else if (isDefensePosition(p.position)) {
        positionScore = p.defScore ?? computeDefensiveScore(p);
      } else {
        positionScore = p.heismanScore ?? 0;
      }
      return { ...p, positionScore };
    });

    return withScore.sort((a, b) => b.positionScore - a.positionScore).slice(0, 10);
  }, [players, selectedPosition]);

  const offensiveMVP = useMemo(() => {
    const offense = players.filter(p => isOffensePosition(p.position));
    if (!offense.length) return null;
    return [...offense].sort((a, b) => (b.offScore ?? 0) - (a.offScore ?? 0))[0];
  }, [players]);

  const defensiveMVP = useMemo(() => {
    const defense = players.filter(p => isDefensePosition(p.position));
    if (!defense.length) return null;
    return [...defense].sort((a, b) => (b.defScore ?? 0) - (a.defScore ?? 0))[0];
  }, [players]);

  const heismanTop10 = useMemo(() => {
    const candidates = players.filter(p => !isSpecialTeams(p.position));
    return [...candidates]
      .sort((a, b) => (b.heismanScore ?? 0) - (a.heismanScore ?? 0))
      .slice(0, 25);
  }, [players]);

  return (
    <div className="card">
      <h2>Player Awards & Leaders (FBS Only)</h2>
      <p className="small">
        Uses <code className="inline">stats-player-season.json</code> and{' '}
        <code className="inline">teams.json</code> to calculate FBS-only
        position leaders, MVPs, and a position-adjusted Heisman-style top 10.
      </p>

      <div className="row" style={{ marginTop: 10, alignItems: 'center' }}>
        <label className="small">Season: {year}</label>
        {busy && <span className="badge">Loading…</span>}
        {!busy && players.length > 0 && (
          <span className="badge ok">
            {players.length.toLocaleString()} FBS player seasons
          </span>
        )}
        {fbsTeamCount != null && (
          <span className="badge">
            FBS teams: {fbsTeamCount}
          </span>
        )}
      </div>

      {err && (
        <div className="progress" style={{ marginTop: 10 }}>
          <span className="badge err">Error</span> {err}
        </div>
      )}

      {!busy && !err && players.length === 0 && (
        <div className="progress small" style={{ marginTop: 10 }}>
          No FBS player stats found for {year}. Make sure{' '}
          <code className="inline">
            server/data/{'{year}'}/stats-player-season.json
          </code>{' '}
          and <code className="inline">teams.json</code> exist and match the
          expected schema.
        </div>
      )}

      {!busy && !err && players.length > 0 && (
        <>
          {/* MVPs */}
          <h3 style={{ marginTop: 20 }}>Season MVPs</h3>
          <div className="row" style={{ gap: 16, flexWrap: 'wrap' }}>
            <div
              className="card"
              style={{ flex: '1 1 260px', padding: 12, marginTop: 0 }}
            >
              <h4>Offensive MVP</h4>
              {offensiveMVP ? (
                <>
                  <div>
                    <strong>{offensiveMVP.player ?? offensiveMVP.name}</strong>{' '}
                    <span className="small">
                      ({offensiveMVP.position} — {offensiveMVP.team})
                    </span>
                  </div>
                  <div className="small">
                    Off Score: {Math.round(offensiveMVP.offScore ?? 0)}
                  </div>
                </>
              ) : (
                <p className="small">No offensive players found.</p>
              )}
            </div>

            <div
              className="card"
              style={{ flex: '1 1 260px', padding: 12, marginTop: 0 }}
            >
              <h4>Defensive MVP</h4>
              {defensiveMVP ? (
                <>
                  <div>
                    <strong>{defensiveMVP.player ?? defensiveMVP.name}</strong>{' '}
                    <span className="small">
                      ({defensiveMVP.position} — {defensiveMVP.team})
                    </span>
                  </div>
                  <div className="small">
                    Def Score: {Math.round(defensiveMVP.defScore ?? 0)}
                  </div>
                </>
              ) : (
                <p className="small">No defensive players found.</p>
              )}
            </div>
          </div>

          {/* Top 10 by position */}
          <h3 style={{ marginTop: 24 }}>Top 10 by Position</h3>
          <div className="row" style={{ marginBottom: 8, gap: 8 }}>
            <label>Position</label>
            <select
              className="input"
              value={selectedPosition}
              onChange={e => setSelectedPosition(e.target.value)}
              style={{ maxWidth: 160 }}
            >
              {uniquePositions.map(pos => (
                <option key={pos} value={pos}>
                  {pos}
                </option>
              ))}
            </select>
          </div>

          {topByPosition.length === 0 ? (
            <p className="small">
              No players found for position{' '}
              <code className="inline">{selectedPosition}</code>.
            </p>
          ) : (
            <table
              className="table"
              style={{
                marginTop: 4,
                width: '100%',
                borderCollapse: 'collapse',
              }}
            >
              <thead>
                <tr>
                  <th align="left">Rank</th>
                  <th align="left">Player</th>
                  <th align="left">Team</th>
                  <th align="right">Pos Score</th>
                  {positionColumns.map(col => (
                    <th key={col.header} align={col.align || 'right'}>
                      {col.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {topByPosition.map((p, idx) => (
                  <tr key={`${p.player || p.name}-${idx}`}>
                    <td>{idx + 1}</td>
                    <td>{p.player ?? p.name}</td>
                    <td>{p.team}</td>
                    <td align="right">
                      {Math.round(p.positionScore ?? 0)}
                    </td>
                    {positionColumns.map(col => {
                      const raw = col.value(p);
                      const val =
                        typeof raw === 'number'
                          ? Number.isInteger(raw)
                            ? raw
                            : raw.toFixed(1)
                          : raw ?? '—';
                      return (
                        <td key={col.header} align={col.align || 'right'}>
                          {val || val === 0 ? val : '—'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Heisman-style Top 10 */}
          <h3 style={{ marginTop: 24 }}>Heisman Top 10 (Position-Adjusted)</h3>
          <p className="small">
            Ranks players by how many standard deviations they are above their
            peers at their primary role, with bonuses for multi-phase impact and
            slight boosts for non-QB positions.
          </p>
          <table
            className="table"
            style={{
              marginTop: 4,
              width: '100%',
              borderCollapse: 'collapse',
            }}
          >
            <thead>
              <tr>
                <th align="left">Rank</th>
                <th align="left">Player</th>
                <th align="left">Team</th>
                <th align="left">Position</th>
                <th align="right">Heisman Score</th>
              </tr>
            </thead>
            <tbody>
              {heismanTop10.map((p, idx) => (
                <tr key={`${p.player || p.name}-heisman-${idx}`}>
                  <td>{idx + 1}</td>
                  <td>{p.player ?? p.name}</td>
                  <td>{p.team}</td>
                  <td>{p.position}</td>
                  <td align="right">
                    {p.heismanScore != null
                      ? p.heismanScore.toFixed(2)
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
