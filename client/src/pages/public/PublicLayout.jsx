import React, { useState, useEffect } from 'react'
import { Outlet, Link } from 'react-router-dom'
import { LogoProvider } from '../../hooks/useTeamLogos.jsx'
import PublicHeader from '../../components/PublicHeader.jsx'

function AnnouncementBanner() {
  const [banner, setBanner] = useState('')
  useEffect(() => {
    fetch('/api/settings').then(r => r.json()).then(d => setBanner(d.announcementBanner || '')).catch(() => {})
  }, [])
  if (!banner) return null
  return (
    <div style={{
      background: 'var(--brand-glow)', borderBottom: '1px solid var(--border)',
      padding: '8px 16px', textAlign: 'center', fontSize: 13, fontWeight: 600, color: 'var(--brand2)',
    }}>
      {banner}
    </div>
  )
}

function MaintenanceNotice({ message }) {
  return (
    <div style={{ minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 24, gap: 12 }}>
      <div style={{ fontSize: 48 }}>🏈</div>
      <h2 style={{ margin: 0 }}>Down for Maintenance</h2>
      <p style={{ color: 'var(--text-secondary)', maxWidth: 420 }}>{message || "We're making some updates. Please check back shortly."}</p>
    </div>
  )
}

export default function PublicLayout() {
  const [settings, setSettings] = useState(null)
  useEffect(() => {
    fetch('/api/settings').then(r => r.json()).then(setSettings).catch(() => setSettings({}))
  }, [])

  return (
    <>
      <PublicHeader />
      <AnnouncementBanner />
      {settings?.maintenanceMode ? (
        <MaintenanceNotice message={settings.maintenanceMessage} />
      ) : (
        <LogoProvider>
          <Outlet />
        </LogoProvider>
      )}
      <footer style={{ textAlign: 'center', padding: '20px 16px 32px', fontSize: 12, color: 'var(--muted)' }}>
        <Link to="/legal" style={{ color: 'var(--muted)' }}>Terms &amp; Privacy</Link>
      </footer>
    </>
  )
}
