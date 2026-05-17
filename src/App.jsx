import React, { createContext, useContext, useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom'
import { useGoogleLogin } from '@react-oauth/google'
import { loadConfig } from './lib/sheets.js'
import { DEFAULT_CONFIG } from './lib/config.js'

import Production from './pages/Production.jsx'
import Inventory  from './pages/Inventory.jsx'
import CRM        from './pages/CRM.jsx'
import CashFlow   from './pages/CashFlow.jsx'
import QC         from './pages/QC.jsx'
import Vendors    from './pages/Vendors.jsx'
import Payroll    from './pages/Payroll.jsx'
import PL         from './pages/PL.jsx'
import Settings   from './pages/Settings.jsx'
import Setup      from './pages/Setup.jsx'

export const AppContext = createContext(null)
export const useApp = () => useContext(AppContext)

const NAV = [
  { to: '/production', icon: '🏭', label: 'Production' },
  { to: '/inventory',  icon: '📦', label: 'Inventory'  },
  { to: '/crm',        icon: '🤝', label: 'Clients'    },
  { to: '/cashflow',   icon: '💰', label: 'Cash'       },
  { to: '/qc',         icon: '🔴', label: 'QC'         },
  { to: '/vendors',    icon: '🧾', label: 'Vendors'    },
  { to: '/payroll',    icon: '👷', label: 'Payroll'    },
  { to: '/pl',         icon: '📊', label: 'P&L'        },
  { to: '/setup',      icon: '🌱', label: 'Setup'      },
  { to: '/settings',   icon: '⚙️', label: 'Settings'  },
]

const BOTTOM_NAV = [
  { to: '/production', icon: '🏭', label: 'Produce' },
  { to: '/inventory',  icon: '📦', label: 'Stock'   },
  { to: '/crm',        icon: '🤝', label: 'Clients' },
  { to: '/cashflow',   icon: '💰', label: 'Cash'    },
]

// ── Login Page ────────────────────────────────
function LoginScreen({ onLogin }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6"
      style={{ background: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 50%, #fed7aa 100%)' }}>
      <div className="w-full max-w-sm">
        {/* Logo card */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-orange-500 shadow-xl shadow-orange-200 mb-4">
            <span className="text-4xl">🏭</span>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Rajratan</h1>
          <p className="text-gray-500 text-sm mt-1">Enterprises ERP</p>
        </div>

        <div className="bg-white rounded-3xl shadow-xl shadow-gray-200 p-8">
          <h2 className="text-lg font-bold text-gray-800 mb-1">Welcome back</h2>
          <p className="text-sm text-gray-400 mb-6">Sign in to manage your factory</p>

          <button onClick={onLogin}
            className="w-full flex items-center justify-center gap-3 bg-gray-900 hover:bg-gray-800 active:bg-black text-white font-semibold py-4 px-6 rounded-2xl text-base transition-all shadow-lg shadow-gray-300">
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </button>

          <p className="text-xs text-gray-300 text-center mt-4">
            Use the Google account that owns the Rajratan ERP spreadsheet
          </p>
        </div>
      </div>
    </div>
  )
}

// ── More Menu (slide-up) ──────────────────────
function MoreMenu({ open, onClose }) {
  if (!open) return null
  const more = NAV.slice(4) // QC onwards
  return (
    <>
      <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40" onClick={onClose} />
      <div className="fixed bottom-20 left-3 right-3 bg-white rounded-3xl shadow-2xl z-50 p-4 safe-bottom">
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4" />
        <div className="grid grid-cols-3 gap-2">
          {more.map(n => (
            <NavLink key={n.to} to={n.to} onClick={onClose}
              className={({ isActive }) =>
                `flex flex-col items-center gap-1 p-3 rounded-2xl text-xs font-semibold transition-all
                ${isActive ? 'bg-orange-50 text-orange-600' : 'text-gray-500 hover:bg-gray-50'}`}>
              <span className="text-2xl">{n.icon}</span>
              <span>{n.label}</span>
            </NavLink>
          ))}
        </div>
      </div>
    </>
  )
}

// ── Bottom Navigation ─────────────────────────
function BottomNav() {
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const isMoreActive = NAV.slice(4).some(n => location.pathname.startsWith(n.to))

  return (
    <>
      <MoreMenu open={open} onClose={() => setOpen(false)} />
      <nav className="fixed bottom-0 left-0 right-0 z-30 safe-bottom">
        <div className="mx-3 mb-3 bg-white rounded-3xl shadow-xl shadow-gray-200/80 border border-gray-100">
          <div className="flex items-center h-16 px-2">
            {BOTTOM_NAV.map(n => (
              <NavLink key={n.to} to={n.to}
                className={({ isActive }) =>
                  `flex-1 flex flex-col items-center gap-0.5 py-2 rounded-2xl transition-all
                  ${isActive ? 'text-orange-500' : 'text-gray-400'}`}>
                {({ isActive }) => (
                  <>
                    <span className={`text-xl transition-transform ${isActive ? 'scale-110' : ''}`}>{n.icon}</span>
                    <span className={`text-xs font-semibold ${isActive ? 'text-orange-500' : 'text-gray-400'}`}>{n.label}</span>
                    {isActive && <span className="absolute bottom-3.5 w-1 h-1 bg-orange-500 rounded-full" />}
                  </>
                )}
              </NavLink>
            ))}

            {/* More button */}
            <button onClick={() => setOpen(v => !v)}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2 rounded-2xl transition-all
                ${isMoreActive ? 'text-orange-500' : 'text-gray-400'}`}>
              <span className="text-xl">☰</span>
              <span className="text-xs font-semibold">More</span>
            </button>
          </div>
        </div>
      </nav>
    </>
  )
}

// ── Page Header ───────────────────────────────
function PageHeader({ user, onLogout }) {
  const location = useLocation()
  const current = NAV.find(n => location.pathname.startsWith(n.to))

  return (
    <header className="fixed top-0 left-0 right-0 z-20 safe-top">
      <div className="bg-white/80 backdrop-blur-md border-b border-gray-100">
        <div className="flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-orange-500 flex items-center justify-center text-sm">
              {current?.icon || '🏭'}
            </div>
            <div>
              <p className="text-sm font-bold text-gray-800 leading-tight">
                {current?.label || 'Rajratan ERP'}
              </p>
              <p className="text-xs text-gray-400 leading-tight">Rajratan Enterprises</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {user?.picture ? (
              <img src={user.picture} alt="" className="w-8 h-8 rounded-full border-2 border-orange-100" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center text-sm font-bold text-orange-600">
                {user?.name?.[0] || 'R'}
              </div>
            )}
            <button onClick={onLogout}
              className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 font-semibold px-3 py-1.5 rounded-xl transition-colors">
              Sign out
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}

// ── Main App ──────────────────────────────────
export default function App() {
  const [accessToken, setAccessToken] = useState(() => sessionStorage.getItem('gToken'))
  const [user,        setUser]        = useState(null)
  const [config,      setConfig]      = useState(DEFAULT_CONFIG)
  const [configLoaded,setConfigLoaded]= useState(false)

  const login = useGoogleLogin({
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    onSuccess: async (res) => {
      setAccessToken(res.access_token)
      sessionStorage.setItem('gToken', res.access_token)
      const profile = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${res.access_token}` }
      }).then(r => r.json())
      setUser(profile)
    },
    onError: e => alert('Login failed: ' + JSON.stringify(e))
  })

  const logout = () => {
    setAccessToken(null); setUser(null)
    sessionStorage.removeItem('gToken')
  }

  useEffect(() => {
    if (!accessToken || configLoaded) return
    loadConfig(accessToken)
      .then(cfg => {
        if (Object.keys(cfg).length > 0) setConfig(p => ({ ...p, ...cfg }))
        setConfigLoaded(true)
      })
      .catch(() => setConfigLoaded(true))
  }, [accessToken])

  if (!accessToken) return <LoginScreen onLogin={login} />

  return (
    <AppContext.Provider value={{ accessToken, config, setConfig, user }}>
      <BrowserRouter>
        <PageHeader user={user} onLogout={logout} />
        <main className="pt-14 pb-24 min-h-screen" style={{ background: '#f8f9fb' }}>
          <Routes>
            <Route path="/"           element={<Navigate to="/production" replace />} />
            <Route path="/production" element={<Production />} />
            <Route path="/inventory"  element={<Inventory />} />
            <Route path="/crm"        element={<CRM />} />
            <Route path="/cashflow"   element={<CashFlow />} />
            <Route path="/qc"         element={<QC />} />
            <Route path="/vendors"    element={<Vendors />} />
            <Route path="/payroll"    element={<Payroll />} />
            <Route path="/pl"         element={<PL />} />
            <Route path="/settings"   element={<Settings />} />
            <Route path="/setup"      element={<Setup />} />
          </Routes>
        </main>
        <BottomNav />
      </BrowserRouter>
    </AppContext.Provider>
  )
}
