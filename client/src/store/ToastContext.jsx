import React, { createContext, useContext, useState, useCallback, useRef } from 'react'
import { CheckCircle2, XCircle, Info } from 'lucide-react'

const ToastContext = createContext()

let toastId = 0

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const timers = useRef({})

  const addToast = useCallback((message, type = 'info', duration = 4000) => {
    const id = ++toastId
    setToasts(prev => [...prev, { id, message, type }])
    timers.current[id] = setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
      delete timers.current[id]
    }, duration)
    return id
  }, [])

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
    if (timers.current[id]) { clearTimeout(timers.current[id]); delete timers.current[id] }
  }, [])

  const toast = useCallback({
    success: (msg) => addToast(msg, 'success'),
    error: (msg) => addToast(msg, 'error', 6000),
    info: (msg) => addToast(msg, 'info'),
  }, [addToast])

  // Wrap toast methods so they're stable
  const api = useRef({ success: (m) => addToast(m, 'success'), error: (m) => addToast(m, 'error', 6000), info: (m) => addToast(m, 'info') })
  api.current.success = (m) => addToast(m, 'success')
  api.current.error = (m) => addToast(m, 'error', 6000)
  api.current.info = (m) => addToast(m, 'info')

  return (
    <ToastContext.Provider value={api.current}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}

const ICONS = { success: CheckCircle2, error: XCircle, info: Info }
const COLORS = {
  success: { bg: 'var(--ok-muted)', border: 'var(--ok)', icon: 'var(--ok)' },
  error: { bg: 'var(--err-muted)', border: 'var(--err)', icon: 'var(--err)' },
  info: { bg: 'var(--brand-glow)', border: 'var(--border-accent)', icon: 'var(--brand2)' },
}

function ToastContainer({ toasts, onRemove }) {
  if (!toasts.length) return null
  return (
    <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 300, display: 'flex', flexDirection: 'column-reverse', gap: 8, maxWidth: 400 }}>
      {toasts.map(t => {
        const c = COLORS[t.type] || COLORS.info
        const Icon = ICONS[t.type] || Info
        return (
          <div key={t.id} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px',
            background: c.bg, border: `1px solid ${c.border}`, borderRadius: 12,
            boxShadow: '0 8px 32px rgba(0,0,0,0.3)', fontSize: 14, fontWeight: 500,
            animation: 'toastIn 250ms cubic-bezier(0.16, 1, 0.3, 1)',
            cursor: 'pointer',
          }} onClick={() => onRemove(t.id)}>
            <Icon size={18} style={{ color: c.icon, flexShrink: 0 }} />
            <span style={{ flex: 1 }}>{t.message}</span>
          </div>
        )
      })}
    </div>
  )
}
