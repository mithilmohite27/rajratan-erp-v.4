import React, { createContext, useContext, useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom'
import { useGoogleLogin } from '@react-oauth/google'
import { loadConfig } from './lib/sheets.js'
import { DEFAULT_CONFIG } from './lib/config.js'
import { getSheetEnvironmentLabel } from './lib/safety.js'
import { MODULES, getUserAccess, canAccessModule } from './lib/permissions.js'

import Production from './pages/Production.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Inventory from './pages/Inventory.jsx'
import MaterialStock from './pages/MaterialStock.jsx'
import CRM from './pages/CRM.jsx'
import CashFlow from './pages/CashFlow.jsx'
import QC from './pages/QC.jsx'
import Vendors from './pages/Vendors.jsx'
import Payroll from './pages/Payroll.jsx'
import PL from './pages/PL.jsx'
import Reports from './pages/Reports.jsx'
import Settings from './pages/Settings.jsx'
import Setup from './pages/Setup.jsx'
import BillGenerator from './pages/Billgenerator.jsx'

export const AppContext = createContext(null)
export const useApp = () => useContext(AppContext)

const NAV = [
  { to: '/production', module: MODULES.production, icon: '🏭', label: 'Production' },
  { to: '/inventory', module: MODULES.inventory, icon: '📦', label: 'Inventory' },
  { to: '/material-stock', module: MODULES.materialStock, icon: '🧱', label: 'Material Stock' },
  { to: '/crm', module: MODULES.crm, icon: '🤝', label: 'Clients' },
  { to: '/cashflow', module: MODULES.cashFlow, icon: '💰', label: 'Cash' },
  { to: '/qc', module: MODULES.qc, icon: '🔴', label: 'QC' },
  { to: '/vendors', module: MODULES.vendors, icon: '🧾', label: 'Vendors' },
  { to: '/payroll', module: MODULES.payroll, icon: '👷', label: 'Payroll' },
  { to: '/pl', module: MODULES.pl, icon: '📊', label: 'P&L' },
  { to: '/reports', module: MODULES.pl, icon: '📈', label: 'Reports' },
  { to: '/setup', module: MODULES.setup, icon: '🌱', label: 'Setup' },
  { to: '/settings', module: MODULES.settings, icon: '⚙️', label: 'Settings' },
  { to: '/bills', module: MODULES.bills, icon: '🧾', label: 'Bills' },
]

const BOTTOM_NAV = [
  { to: '/production', module: MODULES.production, icon: '🏭', label: 'Produce' },
  { to: '/inventory', module: MODULES.inventory, icon: '📦', label: 'Stock' },
  { to: '/crm', module: MODULES.crm, icon: '🤝', label: 'Clients' },
  { to: '/cashflow', module: MODULES.cashFlow, icon: '💰', label: 'Cash' },
]

function allowedNavItems(access) {
  return NAV.filter(n => canAccessModule(access, n.module))
}

function firstAllowedPath(access) {
  return access?.isAllowed ? '/dashboard' : '/denied'
}

function LoginScreen({ onLogin, config = DEFAULT_CONFIG }) {
  const appName = config.APP_NAME || 'Rajratan ERP'
  const companyName = config.COMPANY_NAME || 'Rajratan'
  const poweredBy = config.POWERED_BY_TEXT || 'Enterprises ERP'

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6"
      style={{ background: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 50%, #fed7aa 100%)' }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-orange-500 shadow-xl shadow-orange-200 mb-4">
            <span className="text-4xl">🏭</span>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">{companyName}</h1>
          <p className="text-gray-500 text-sm mt-1">{appName}</p>
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
            Use an owner-approved Google account for {poweredBy}
          </p>
        </div>
      </div>
    </div>
  )
}

function MoreMenu({ open, onClose, navItems }) {
  if (!open) return null
  const more = navItems.filter(n => !BOTTOM_NAV.some(b => b.to === n.to))

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

function BottomNav({ access }) {
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const navItems = allowedNavItems(access)
  const bottomItems = BOTTOM_NAV.filter(n => canAccessModule(access, n.module))
  const moreItems = navItems.filter(n => !bottomItems.some(b => b.to === n.to))
  const isMoreActive = moreItems.some(n => location.pathname.startsWith(n.to))

  return (
    <>
      <MoreMenu open={open} onClose={() => setOpen(false)} navItems={navItems} />
      <nav className="fixed bottom-0 left-0 right-0 z-30 safe-bottom">
        <div className="mx-3 mb-3 bg-white rounded-3xl shadow-xl shadow-gray-200/80 border border-gray-100">
          <div className="flex items-center h-16 px-2">
            {bottomItems.map(n => (
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

            {moreItems.length > 0 && (
              <button onClick={() => setOpen(v => !v)}
                className={`flex-1 flex flex-col items-center gap-0.5 py-2 rounded-2xl transition-all
                  ${isMoreActive ? 'text-orange-500' : 'text-gray-400'}`}>
                <span className="text-xl">☰</span>
                <span className="text-xs font-semibold">More</span>
              </button>
            )}
          </div>
        </div>
      </nav>
    </>
  )
}

function DesktopSidebar({ access, user, config, onLogout }) {
  const navItems = allowedNavItems(access)
  const sheetLabel = getSheetEnvironmentLabel()
  const appName = config.APP_NAME || 'Rajratan ERP'
  const poweredBy = config.POWERED_BY_TEXT || 'Premium factory workspace'

  return (
    <aside className="fixed left-0 top-0 z-30 hidden h-screen w-72 flex-col bg-slate-950 text-white shadow-2xl shadow-slate-900/30 md:flex">
      <div className="border-b border-white/10 p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-500 text-2xl">🏭</div>
          <div>
            <p className="text-lg font-black leading-tight">{appName}</p>
            <p className="text-xs text-slate-400">{poweredBy}</p>
          </div>
        </div>
        <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-3">
          <p className="truncate text-sm font-bold">{user?.name || 'Signed in user'}</p>
          <p className="truncate text-xs text-slate-400">{user?.email}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <span className="rounded-full bg-orange-500/15 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-orange-200">{access?.role}</span>
            <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-slate-300">{sheetLabel.replace('Connected Sheet: ', '')}</span>
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-4">
        <NavLink to="/dashboard"
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-bold transition
            ${isActive ? 'bg-orange-500 text-white shadow-lg shadow-orange-950/30' : 'text-slate-300 hover:bg-white/10 hover:text-white'}`}>
          <span className="text-lg">📊</span>
          <span>Overview</span>
        </NavLink>
        {navItems.map(n => (
          <NavLink key={n.to} to={n.to}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-bold transition
              ${isActive ? 'bg-orange-500 text-white shadow-lg shadow-orange-950/30' : 'text-slate-300 hover:bg-white/10 hover:text-white'}`}>
            <span className="text-lg">{n.icon}</span>
            <span>{n.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-white/10 p-4">
        <button onClick={onLogout}
          className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-slate-200 transition hover:bg-white/10">
          Sign out
        </button>
      </div>
    </aside>
  )
}

function PageHeader({ user, access, config, onLogout }) {
  const location = useLocation()
  const current = NAV.find(n => location.pathname.startsWith(n.to))
  const sheetLabel = getSheetEnvironmentLabel()
  const appName = config.APP_NAME || 'Rajratan ERP'
  const companyName = config.FACTORY_NAME || config.COMPANY_NAME || 'Rajratan Enterprises'

  return (
    <header className="fixed top-0 left-0 right-0 z-20 safe-top md:left-72">
      <div className="bg-white/80 backdrop-blur-md border-b border-gray-100">
        <div className="flex h-16 items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2 md:hidden">
            <div className="w-8 h-8 rounded-xl bg-orange-500 flex items-center justify-center text-sm text-white font-bold">
              {current?.icon || 'R'}
            </div>
            <div>
              <p className="text-sm font-bold text-gray-800 leading-tight">
                {current?.label || appName}
              </p>
              <p className="text-xs text-gray-400 leading-tight">{companyName}</p>
              <p className="text-[10px] text-amber-600 leading-tight font-semibold">{sheetLabel}</p>
            </div>
          </div>
          <div className="hidden md:block">
            <p className="text-sm font-black text-slate-900">{current?.label || 'Overview'}</p>
            <p className="text-xs font-semibold text-slate-400">{sheetLabel}</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden sm:block text-right max-w-[180px]">
              <p className="text-xs font-semibold text-gray-700 leading-tight truncate">{user?.name || user?.email}</p>
              <p className="text-[10px] text-gray-400 leading-tight truncate">{access?.role || 'Unknown'} - {user?.email}</p>
            </div>
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

function AccessPendingScreen({ user, onLogout }) {
  const sheetLabel = getSheetEnvironmentLabel()

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50">
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-xl shadow-gray-200 p-6 text-center">
        <div className="w-14 h-14 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto mb-4 text-2xl font-bold">!</div>
        <h1 className="text-xl font-bold text-gray-900 mb-1">Access pending</h1>
        <p className="text-sm text-gray-500 mb-4">
          This Google account is not approved for Rajratan ERP yet. Please contact the owner.
        </p>
        <div className="bg-gray-50 rounded-2xl p-3 mb-4 text-left">
          <p className="text-xs text-gray-400">Signed in as</p>
          <p className="text-sm font-semibold text-gray-800 break-all">{user?.email || 'Unknown email'}</p>
          <p className="text-xs text-amber-600 font-semibold mt-2">{sheetLabel}</p>
        </div>
        <button onClick={onLogout}
          className="w-full bg-gray-900 text-white font-semibold py-3 rounded-2xl">
          Sign out
        </button>
      </div>
    </div>
  )
}

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white rounded-3xl shadow-xl shadow-gray-200 p-6 text-center">
        <p className="text-sm font-semibold text-gray-700">Checking access...</p>
      </div>
    </div>
  )
}

function PermissionDenied() {
  return (
    <div className="p-4">
      <div className="bg-white border border-gray-100 rounded-2xl p-5 text-center">
        <h1 className="text-lg font-bold text-gray-900 mb-1">Permission required</h1>
        <p className="text-sm text-gray-500">You do not have permission for this module.</p>
      </div>
    </div>
  )
}

function ProtectedRoute({ access, moduleName, children }) {
  if (!canAccessModule(access, moduleName)) return <PermissionDenied />
  return children
}

export default function App() {
  const [accessToken, setAccessToken] = useState(() => sessionStorage.getItem('gToken'))
  const [user, setUser] = useState(() => {
    const stored = sessionStorage.getItem('gUser')
    return stored ? JSON.parse(stored) : null
  })
  const [profileLoaded, setProfileLoaded] = useState(() => !sessionStorage.getItem('gToken') || Boolean(sessionStorage.getItem('gUser')))
  const [config, setConfig] = useState(DEFAULT_CONFIG)
  const [configLoaded, setConfigLoaded] = useState(false)

  const access = getUserAccess(user)

  const login = useGoogleLogin({
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    onSuccess: async (res) => {
      setProfileLoaded(false)
      setAccessToken(res.access_token)
      setConfigLoaded(false)
      sessionStorage.setItem('gToken', res.access_token)
      const profile = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${res.access_token}` }
      }).then(r => r.json())
      setUser(profile)
      sessionStorage.setItem('gUser', JSON.stringify(profile))
      setProfileLoaded(true)
    },
    onError: e => alert('Login failed: ' + JSON.stringify(e))
  })

  const logout = () => {
    setAccessToken(null)
    setUser(null)
    setConfig(DEFAULT_CONFIG)
    setConfigLoaded(false)
    setProfileLoaded(true)
    sessionStorage.removeItem('gToken')
    sessionStorage.removeItem('gUser')
  }

  useEffect(() => {
    if (!accessToken || user || profileLoaded) return
    fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
      .then(r => {
        if (!r.ok) throw new Error('Profile load failed')
        return r.json()
      })
      .then(profile => {
        setUser(profile)
        sessionStorage.setItem('gUser', JSON.stringify(profile))
        setProfileLoaded(true)
      })
      .catch(() => logout())
  }, [accessToken, user, profileLoaded])

  useEffect(() => {
    if (!accessToken || !access.isAllowed || configLoaded) return
    loadConfig(accessToken)
      .then(cfg => {
        if (Object.keys(cfg).length > 0) setConfig(p => ({ ...p, ...cfg }))
        setConfigLoaded(true)
      })
      .catch(() => setConfigLoaded(true))
  }, [accessToken, access.isAllowed, configLoaded])

  if (!accessToken) return <LoginScreen onLogin={login} config={config} />
  if (!profileLoaded) return <LoadingScreen />
  if (!access.isAllowed) return <AccessPendingScreen user={user} onLogout={logout} />

  return (
    <AppContext.Provider value={{ accessToken, config, setConfig, user, access }}>
      <BrowserRouter>
        <DesktopSidebar user={user} access={access} config={config} onLogout={logout} />
        <PageHeader user={user} access={access} config={config} onLogout={logout} />
        <main className="min-h-screen pb-24 pt-16 md:ml-72 md:pb-8" style={{ background: '#f8f9fb' }}>
          <Routes>
            <Route path="/" element={<Navigate to={firstAllowedPath(access)} replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/production" element={<ProtectedRoute access={access} moduleName={MODULES.production}><Production /></ProtectedRoute>} />
            <Route path="/inventory" element={<ProtectedRoute access={access} moduleName={MODULES.inventory}><Inventory /></ProtectedRoute>} />
            <Route path="/material-stock" element={<ProtectedRoute access={access} moduleName={MODULES.materialStock}><MaterialStock /></ProtectedRoute>} />
            <Route path="/crm" element={<ProtectedRoute access={access} moduleName={MODULES.crm}><CRM /></ProtectedRoute>} />
            <Route path="/cashflow" element={<ProtectedRoute access={access} moduleName={MODULES.cashFlow}><CashFlow /></ProtectedRoute>} />
            <Route path="/qc" element={<ProtectedRoute access={access} moduleName={MODULES.qc}><QC /></ProtectedRoute>} />
            <Route path="/vendors" element={<ProtectedRoute access={access} moduleName={MODULES.vendors}><Vendors /></ProtectedRoute>} />
            <Route path="/payroll" element={<ProtectedRoute access={access} moduleName={MODULES.payroll}><Payroll /></ProtectedRoute>} />
            <Route path="/pl" element={<ProtectedRoute access={access} moduleName={MODULES.pl}><PL /></ProtectedRoute>} />
            <Route path="/reports" element={<ProtectedRoute access={access} moduleName={MODULES.pl}><Reports /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute access={access} moduleName={MODULES.settings}><Settings /></ProtectedRoute>} />
            <Route path="/setup" element={<ProtectedRoute access={access} moduleName={MODULES.setup}><Setup /></ProtectedRoute>} />
            <Route path="/bills" element={<ProtectedRoute access={access} moduleName={MODULES.bills}><BillGenerator /></ProtectedRoute>} />
            <Route path="/denied" element={<PermissionDenied />} />
            <Route path="*" element={<Navigate to={firstAllowedPath(access)} replace />} />
          </Routes>
        </main>
        <div className="md:hidden">
          <BottomNav access={access} />
        </div>
      </BrowserRouter>
    </AppContext.Provider>
  )
}
