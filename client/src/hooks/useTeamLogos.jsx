import { useState, useEffect, createContext, useContext } from 'react'

const LogoContext = createContext({})

export function LogoProvider({ children }) {
  const [logos, setLogos] = useState({})
  useEffect(() => {
    fetch('/api/teams/logos')
      .then(r => r.json())
      .then(setLogos)
      .catch(() => {})
  }, [])
  return <LogoContext.Provider value={logos}>{children}</LogoContext.Provider>
}

export function useTeamLogos() {
  return useContext(LogoContext)
}

export function TeamLogo({ name, size = 28, logos: logosOverride }) {
  const ctx = useContext(LogoContext)
  const logos = logosOverride || ctx
  const src = logos[name]
  if (!src) return <div style={{ width: size, height: size, borderRadius: 4, background: 'var(--panel-2)', flexShrink: 0 }} />
  return <img src={src} alt="" style={{ width: size, height: size, objectFit: 'contain', flexShrink: 0 }} onError={e => { e.target.style.display = 'none' }} />
}
