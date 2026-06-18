import React, { useState } from 'react'
import { RankingsProvider, useRankings } from './store/RankingsContext.jsx'
import DataDownload from './pages/DataDownload.jsx'
import Rankings from './pages/Rankings.jsx'
import SOSRankings from './pages/SOSRankings.jsx'
import ConferenceRankings from './pages/ConferenceRankings.jsx'
import TeamCompare from './pages/TeamCompare.jsx'
import Head2Headv2 from './pages/Head2Headv2.jsx'
import NarrativeTop25 from './pages/NarrativeTop25.jsx'
import PlayerAwards from './pages/PlayerAwards.jsx'
import WeekByWeek from './pages/WeekByWeek.jsx'
import ThemeToggle from './components/ThemeToggle.jsx'

const NAV_GROUPS = [
  {
    key: 'rankings',
    label: 'Rankings',
    tabs: [
      { key: 'overall', label: 'Overall' },
      { key: 'weekbyweek', label: 'Week by Week' },
      { key: 'sos', label: 'SOS' },
      { key: 'conference', label: 'Conference' },
    ],
  },
  {
    key: 'explore',
    label: 'Explore',
    tabs: [
      { key: 'compare', label: 'Compare' },
      { key: 'h2h', label: 'Head-to-Head' },
    ],
  },
  {
    key: 'editorial',
    label: 'Editorial',
    tabs: [
      { key: 'narrative', label: 'Narrative Top 25' },
      { key: 'awards', label: 'Player Awards' },
    ],
  },
]

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

function DataGate() {
  const { hasData, loading } = useRankings()
  if (loading || hasData) return null

  return (
    <div className="welcome-gate">
      <div style={{ fontSize: 56, marginBottom: 16, filter: 'drop-shadow(0 4px 12px rgba(77, 142, 255, 0.3))' }}>🏈</div>
      <h2>CFB Computer Rankings</h2>
      <p>
        Download season data to get started. This pulls teams, games, and ratings
        from the College Football Data API and stores them locally.
      </p>
      <DataDownload />
    </div>
  )
}

function AppContent() {
  const { hasData, loading, year } = useRankings()
  const [group, setGroup] = useState('rankings')
  const [subTab, setSubTab] = useState('overall')
  const [showData, setShowData] = useState(false)

  const activeGroup = NAV_GROUPS.find(g => g.key === group) || NAV_GROUPS[0]

  const handleTabClick = (groupKey, tabKey) => {
    setGroup(groupKey)
    setSubTab(tabKey)
    setShowData(false)
  }

  const renderPage = () => {
    if (showData) return <DataDownload />
    switch (subTab) {
      case 'overall': return <Rankings />
      case 'weekbyweek': return <WeekByWeek />
      case 'sos': return <SOSRankings />
      case 'conference': return <ConferenceRankings />
      case 'compare': return <TeamCompare />
      case 'h2h': return <Head2Headv2 />
      case 'narrative': return <NarrativeTop25 />
      case 'awards': return <PlayerAwards />
      default: return <Rankings />
    }
  }

  return (
    <>
      {/* ---- Sticky Top Bar ---- */}
      <div className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <span style={{ fontSize: 22 }}>🏈</span>
            <span>CFB <span className="brand-accent">Computer Rankings</span></span>
          </div>
          <div className="topbar-actions">
            {hasData && <YearPicker />}
            <button
              className={`btn ${showData ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setShowData(s => !s)}
              title="Data Download"
              style={{ padding: '5px 10px', fontSize: 13 }}
            >
              <DataIcon />
              <span>Data</span>
            </button>
            <ThemeToggle />
          </div>
        </div>
      </div>

      {/* ---- Nav Strip ---- */}
      {hasData && !showData && (
        <div className="nav-strip">
          <div className="nav-strip-inner">
            {NAV_GROUPS.map(g => (
              <div key={g.key} className="nav-group">
                <span className="nav-group-label">{g.label}</span>
                {g.tabs.map(t => (
                  <div
                    key={t.key}
                    className={`tab${subTab === t.key ? ' active' : ''}`}
                    onClick={() => handleTabClick(g.key, t.key)}
                  >
                    {t.label}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ---- Content ---- */}
      <div className="container">
        {!hasData && !loading ? (
          <DataGate />
        ) : hasData ? (
          renderPage()
        ) : null}
      </div>
    </>
  )
}

export default function App() {
  return (
    <RankingsProvider>
      <AppContent />
    </RankingsProvider>
  )
}
