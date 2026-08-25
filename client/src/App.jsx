import React, { useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom'
import { AuthProvider, useAuth } from './store/AuthContext.jsx'
import { RankingsProvider, useRankings } from './store/RankingsContext.jsx'
import { ToastProvider } from './store/ToastContext.jsx'

// Public pages
import PublicLayout from './pages/public/PublicLayout.jsx'
import Landing from './pages/public/Landing.jsx'
import Login from './pages/public/Login.jsx'
import MyBallot from './pages/public/MyBallot.jsx'
import PublicRankings from './pages/public/PublicRankings.jsx'
import Leaderboard from './pages/public/Leaderboard.jsx'
import VisualPoll from './pages/public/VisualPoll.jsx'
import BallotHistory from './pages/public/BallotHistory.jsx'
import Legal from './pages/public/Legal.jsx'

// Admin pages
import DataDownload from './pages/DataDownload.jsx'
import Rankings from './pages/Rankings.jsx'
import SOSRankings from './pages/SOSRankings.jsx'
import ConferenceRankings from './pages/ConferenceRankings.jsx'
import TeamCompare from './pages/TeamCompare.jsx'
import Head2Headv2 from './pages/Head2Headv2.jsx'
import NarrativeTop25 from './pages/NarrativeTop25.jsx'
import PlayerAwards from './pages/PlayerAwards.jsx'
import WeekByWeek from './pages/WeekByWeek.jsx'
import WeekManagement from './pages/WeekManagement.jsx'
import MockVoters from './pages/MockVoters.jsx'
import ScheduledDownload from './pages/ScheduledDownload.jsx'
import EmailNotifications from './pages/EmailNotifications.jsx'
import AdminUsers from './pages/AdminUsers.jsx'
import AdminBallots from './pages/AdminBallots.jsx'
import AdminSettings from './pages/AdminSettings.jsx'
import AdminHeader from './components/AdminHeader.jsx'

/* ==============================
   Admin Shell (back-office)
   ============================== */

function DataGate() {
  const { hasData, loading } = useRankings()
  if (loading || hasData) return null
  return (
    <div className="welcome-gate">
      <div style={{ fontSize: 56, marginBottom: 16, filter: 'drop-shadow(0 4px 12px rgba(77, 142, 255, 0.3))' }}>🏈</div>
      <h2>CFB Computer Rankings</h2>
      <p>Download season data to get started. This pulls teams, games, and ratings from the College Football Data API and stores them locally.</p>
      <DataDownload />
    </div>
  )
}

// These subtabs manage the site itself and don't need CFBD season data loaded.
const NO_DATA_GATE_TABS = ['weekmgmt', 'mockvoters', 'scheduleddownload', 'emailnotifications', 'users', 'ballotmod', 'sitesettings', 'data']

function AdminContent() {
  const { hasData, loading } = useRankings()
  const [group, setGroup] = useState('rankings')
  const [subTab, setSubTab] = useState('overall')

  const handleTabClick = (groupKey, tabKey) => {
    setGroup(groupKey)
    setSubTab(tabKey)
  }

  const renderPage = () => {
    switch (subTab) {
      case 'overall': return <Rankings />
      case 'weekbyweek': return <WeekByWeek />
      case 'sos': return <SOSRankings />
      case 'conference': return <ConferenceRankings />
      case 'compare': return <TeamCompare />
      case 'h2h': return <Head2Headv2 />
      case 'narrative': return <NarrativeTop25 />
      case 'awards': return <PlayerAwards />
      case 'weekmgmt': return <WeekManagement />
      case 'mockvoters': return <MockVoters />
      case 'scheduleddownload': return <ScheduledDownload />
      case 'emailnotifications': return <EmailNotifications />
      case 'users': return <AdminUsers />
      case 'ballotmod': return <AdminBallots />
      case 'sitesettings': return <AdminSettings />
      case 'data': return <DataDownload />
      default: return <Rankings />
    }
  }

  return (
    <>
      <AdminHeader
        group={group}
        subTab={subTab}
        onTabClick={handleTabClick}
      />

      <div className="container">
        {NO_DATA_GATE_TABS.includes(subTab) ? renderPage() : !hasData && !loading ? <DataGate /> : hasData ? renderPage() : null}
      </div>
    </>
  )
}

function AdminRoute() {
  const { user, isAdmin } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (!isAdmin) return <Navigate to="/" replace />
  return (
    <RankingsProvider>
      <AdminContent />
    </RankingsProvider>
  )
}

/* ==============================
   Root Router
   ============================== */

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
      <BrowserRouter>
        <Routes>
          {/* Public */}
          <Route element={<PublicLayout />}>
            <Route index element={<Landing />} />
            <Route path="rankings" element={<PublicRankings />} />
            <Route path="ballot" element={<MyBallot />} />
            <Route path="leaderboard" element={<Leaderboard />} />
            <Route path="visual" element={<VisualPoll />} />
            <Route path="history/:userId" element={<BallotHistory />} />
            <Route path="history" element={<BallotHistory />} />
            <Route path="login" element={<Login />} />
            <Route path="legal" element={<Legal />} />
          </Route>

          {/* Admin */}
          <Route path="admin/*" element={<AdminRoute />} />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  )
}
