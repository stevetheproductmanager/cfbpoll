import React from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../store/AuthContext.jsx'
import { useRankings } from '../store/RankingsContext.jsx'
import ThemeToggle from './ThemeToggle.jsx'

function DataIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}

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
    ],
  },
  {
    key: 'explore', label: 'Explore',
    tabs: [
      { key: 'compare', label: 'Compare' },
      { key: 'h2h', label: 'Head-to-Head' },
    ],
  },
  {
    key: 'editorial', label: 'Editorial',
    tabs: [
      { key: 'narrative', label: 'Narrative Top 25' },
      { key: 'awards', label: 'Player Awards' },
    ],
  },
  {
    key: 'poll', label: 'Poll',
    tabs: [
      { key: 'pollmanager', label: 'Manage Poll' },
    ],
  },
  {
    key: 'site', label: 'Site Admin',
    tabs: [
      { key: 'users', label: 'Users' },
      { key: 'ballotmod', label: 'Ballots' },
      { key: 'sitesettings', label: 'Settings' },
    ],
  },
]

export default function AdminHeader({ showData, onToggleData, subTab, onTabClick }) {
  const { hasData } = useRankings()
  const { logout } = useAuth()

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
            <button
              className={`btn ${showData ? 'btn-primary' : 'btn-ghost'}`}
              onClick={onToggleData}
              title="Data Download"
              style={{ padding: '5px 10px', fontSize: 13 }}
            >
              <DataIcon />
              <span>Data</span>
            </button>
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

      {!showData && (
        <div className="nav-strip" style={{ display: 'flex' }}>
          <div className="nav-strip-inner" style={{ display: 'flex', alignItems: 'center' }}>
            {ADMIN_NAV.map(g => (
              <div key={g.key} className="nav-group" style={{ display: 'flex', alignItems: 'center' }}>
                <span className="nav-group-label">{g.label}</span>
                {g.tabs.map(t => (
                  <div
                    key={t.key}
                    className={`tab${subTab === t.key ? ' active' : ''}`}
                    onClick={() => onTabClick(g.key, t.key)}
                  >
                    {t.label}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
