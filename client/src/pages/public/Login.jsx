import React, { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../store/AuthContext.jsx'

const GOOGLE_CLIENT_ID = '777524528673-bf8delse7vq1veai5obmh5auup72jgjr.apps.googleusercontent.com'

export default function Login() {
  const { user, loading, completeGoogleLogin } = useAuth()
  const navigate = useNavigate()
  const googleBtnRef = useRef(null)

  useEffect(() => {
    if (user) {
      navigate(user.role === 'admin' ? '/admin' : '/ballot', { replace: true })
    }
  }, [user, navigate])

  // Render the Google Sign-In button once GSI script is loaded
  useEffect(() => {
    if (user || loading) return

    function renderButton() {
      if (!window.google?.accounts?.id || !googleBtnRef.current) return
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: completeGoogleLogin,
      })
      window.google.accounts.id.renderButton(googleBtnRef.current, {
        theme: 'outline',
        size: 'large',
        width: 320,
        text: 'continue_with',
        shape: 'pill',
      })
    }

    // GSI might already be loaded or might still be loading
    if (window.google?.accounts?.id) {
      renderButton()
    } else {
      const interval = setInterval(() => {
        if (window.google?.accounts?.id) {
          clearInterval(interval)
          renderButton()
        }
      }, 100)
      return () => clearInterval(interval)
    }
  }, [user, loading])

  // Sign-in is handled by AuthContext.completeGoogleLogin (updates state, no reload).
  // The useEffect above navigates once `user` is set, routing admins to /admin.

  if (loading) return <div style={{ textAlign: 'center', padding: 80, color: 'var(--muted)' }}>Loading...</div>
  if (user) return null

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      background: 'radial-gradient(ellipse at 50% 30%, var(--brand-glow-strong) 0%, transparent 60%)',
    }}>
      <div className="card" style={{ maxWidth: 400, width: '100%', textAlign: 'center', marginTop: 0 }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🏈</div>
        <h1 style={{
          fontSize: 28, fontWeight: 900, letterSpacing: '-0.02em', marginBottom: 4,
          background: 'linear-gradient(135deg, var(--brand), var(--accent))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
        }}>Poll Position</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 32 }}>Sign in to submit your Top 25 ballot</p>

        {/* Google Sign-In button renders here */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
          <div ref={googleBtnRef} />
        </div>

        <p style={{ color: 'var(--muted)', fontSize: 11, marginTop: 24 }}>
          By signing in, you agree to rank teams based on vibes, gut feelings, and entirely too many hours watching football.
        </p>
      </div>
    </div>
  )
}
