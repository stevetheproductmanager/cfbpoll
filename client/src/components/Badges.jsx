import React from 'react'

// Derives a small set of achievement badges from a voter's leaderboard stats
// + their week-by-week ballot history — purely computed client-side from
// data already being fetched, no extra API calls.
export function computeBadges({ voterStats, weeks }) {
  const badges = []
  if (!voterStats && !weeks?.length) return badges

  if (voterStats?.streak >= 3) badges.push({ icon: '🔥', label: `${voterStats.streak}-Week Streak`, color: 'var(--warn)' })
  if (voterStats?.accuracyPct >= 80) badges.push({ icon: '🎯', label: 'Sharp Shooter', color: 'var(--ok)', title: `${voterStats.accuracyPct}% accuracy vs consensus` })
  if (voterStats?.rank === 1) badges.push({ icon: '👑', label: '#1 on Leaderboard', color: 'var(--brand2)' })
  else if (voterStats?.rank && voterStats.rank <= 10) badges.push({ icon: '🏆', label: 'Top 10 Voter', color: 'var(--brand2)' })

  if (weeks?.length >= 8) badges.push({ icon: '🛡️', label: 'Iron Voter', color: 'var(--muted)', title: `Voted ${weeks.length} weeks` })

  const boldCount = (weeks || []).reduce((n, w) => n + Object.keys(w.confidence || {}).length, 0)
  if (boldCount >= 5) badges.push({ icon: '😤', label: 'Bold Picker', color: 'var(--err)', title: `${boldCount} bold picks made` })

  const hasComputerBallot = (weeks || []).some(w => w.ballotType === 'computer')
  if (hasComputerBallot) badges.push({ icon: '🖥️', label: 'Computer Voter', color: 'var(--brand)' })

  return badges
}

export default function Badges({ badges }) {
  if (!badges?.length) return null
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center', marginTop: 8 }}>
      {badges.map(b => (
        <span key={b.label} title={b.title || b.label} style={{
          display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700,
          color: b.color, background: 'var(--panel-2)', border: '1px solid var(--border)',
          padding: '3px 9px', borderRadius: 99,
        }}>
          <span>{b.icon}</span>{b.label}
        </span>
      ))}
    </div>
  )
}
