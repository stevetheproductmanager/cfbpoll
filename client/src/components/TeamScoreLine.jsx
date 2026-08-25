import React from 'react'
import { Link } from 'react-router-dom'
import { TeamLogo } from '../hooks/useTeamLogos.jsx'

// Shared "logo + team name + score" row — the same visual building block for
// a single team's line in a matchup, used anywhere a game result or schedule
// entry is shown (Schedule, Team Page results, Game Picks) so logo size,
// name weight, and score typography stay identical across the site instead
// of each page rolling its own layout.
export default function TeamScoreLine({ team, logoSize = 20, bold, score, linkToTeam = true, afterName }) {
  const nameEl = linkToTeam
    ? <Link to={`/team/${encodeURIComponent(team)}`} style={{ color: 'inherit', textDecoration: 'none', fontWeight: bold ? 800 : 500 }}>{team}</Link>
    : <span style={{ fontWeight: bold ? 800 : 500 }}>{team}</span>
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <TeamLogo name={team} size={logoSize} />
      {nameEl}
      {afterName}
      {score != null && <span style={{ marginLeft: 'auto', fontWeight: 700, fontSize: 13 }}>{score}</span>}
    </div>
  )
}
