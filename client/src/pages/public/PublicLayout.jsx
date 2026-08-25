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

export default function PublicLayout() {
  return (
    <>
      <PublicHeader />
      <AnnouncementBanner />
      <LogoProvider>
        <Outlet />
      </LogoProvider>
      <footer style={{ textAlign: 'center', padding: '20px 16px 32px', fontSize: 12, color: 'var(--muted)' }}>
        <Link to="/legal" style={{ color: 'var(--muted)' }}>Terms &amp; Privacy</Link>
      </footer>
    </>
  )
}
