import React from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../store/AuthContext.jsx'
import { useRankings } from '../store/RankingsContext.jsx'
import ThemeToggle from './ThemeToggle.jsx'

function YearPicker() {
  const { year, setYear } = useRankings()
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Season</label>
      <input
        className="input"
        type="number"
        value={year}
        onChange={e => setYear(Number(e.target.value) || 2025)}
        style={{ width: 80, padding: '5px 8px', fontSize: 13 }}
      />
    </div>
  )
}

const ADMIN_NAV = [
  {
    key: 'rankings', label: 'Rankings',
    tabs: [
      { key: 'overall', label: 'Overall' },
      { key: 'weekbyweek', label: 'Week by Week' },
      { key: 'sos', label: 'SOS' },
      { key: 'conference', label: 'Conference' },
      { key: 'compare', label: 'Compare' },
      { key: 'h2h', label: 'Head-to-Head' },
      { key: 'narrative', label: 'Narrative Top 25' },
      { key: 'awards', label: 'Player Awards' },
    ],
  },
  {
    key: 'poll', label: 'Poll Management',
    tabs: [
      { key: 'weekmgmt', label: 'Week Management' },
      { key: 'mockvoters', label: 'Mock Voters' },
      { key: 'scheduleddownload', label: 'Scheduled Data Download' },
      { key: 'emailnotifications', label: 'Email Notifications' },
    ],
  },
  {
    key: 'site', label: 'Site Admin',
    tabs: [
      { key: 'users', label: 'Users' },
      { key: 'ballotmod', label: 'Ballots' },
      { key: 'sitesettings', label: 'Settings' },
      { key: 'data', label: 'Data' },
    ],
  },
]

export default function AdminHeader({ group, subTab, onTabClick }) {
  const { hasData } = useRankings()
  const { logout } = useAuth()
  const activeGroup = ADMIN_NAV.find(g => g.key === group) || ADMIN_NAV[0]

  return (
    <>
      <div className="topbar" style={{ display: 'flex' }}>
        <div className="topbar-inner" style={{ display: 'flex', alignItems: 'center', flexWrap: 'nowrap' }}>
          <div className="brand" style={{ display: 'flex', alignItems: 'center' }}>
            <span style={{ fontSize: 22 }}>🏈</span>
            <span>Poll Position <span className="brand-accent">Admin</span></span>
          </div>
          <div className="topbar-actions" style={{ display: 'flex', alignItems: 'center' }}>
            {hasData && <YearPicker />}
            <ThemeToggle />
            <Link to="/" className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 10px', textDecoration: 'none' }}>
              ← Public Site
            </Link>
            <button className="btn btn-ghost" onClick={logout} style={{ fontSize: 12, padding: '4px 10px' }}>
              Sign Out
            </button>
          </div>
        </div>
      </div>

      <div className="nav-strip" style={{ display: 'flex' }}>
        <div className="nav-strip-inner" style={{ display: 'flex', alignItems: 'center' }}>
          {ADMIN_NAV.map(g => (
            <div
              key={g.key}
              className={`tab${group === g.key ? ' active' : ''}`}
              onClick={() => onTabClick(g.key, g.tabs[0].key)}
            >
              {g.label}
            </div>
          ))}
        </div>
      </div>

      <div className="nav-strip sub-strip" style={{ display: 'flex' }}>
        <div className="nav-strip-inner" style={{ display: 'flex', alignItems: 'center' }}>
          {activeGroup.tabs.map(t => (
            <div
              key={t.key}
              className={`tab sub-tab${subTab === t.key ? ' active' : ''}`}
              onClick={() => onTabClick(activeGroup.key, t.key)}
            >
              {t.label}
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
