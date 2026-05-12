import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const nav = [
  { path: '/dashboard', icon: '⊞', label: 'Dashboard' },
  { path: '/connections', icon: '⚡', label: 'Connessioni' },
  { path: '/import', icon: '↑', label: 'Import' },
  { path: '/export', icon: '↓', label: 'Export' },
  { path: '/history', icon: '◷', label: 'Storico' },
  { path: '/plans', icon: '★', label: 'Abbonamento' },
  { path: '/settings', icon: '⚙', label: 'Impostazioni' },
]
const adminNav = [
  { path: '/admin/licenses', icon: '🔑', label: 'Licenze' },
]

export default function Layout({ children }) {
  const { user, logout, getTrialDaysLeft, getPlanStatus } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(false)
  const trialDays  = getTrialDaysLeft()
  const planStatus = getPlanStatus()

  return (
    <div className="min-h-screen bg-[#0d0f1a] flex">

      {/* Sidebar */}
      <aside className={`${collapsed ? 'w-16' : 'w-56'} transition-all duration-200 bg-[#111320] border-r border-slate-800 flex flex-col`}>

        {/* Logo */}
        <div className="h-16 flex items-center px-4 border-b border-slate-800 gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-green-500 flex items-center justify-center flex-shrink-0">
            <span className="text-white font-black text-xs">IK</span>
          </div>
          {!collapsed && (
            <div>
              <div className="text-white font-bold text-sm leading-none">ikonet</div>
              <div className="text-blue-400 text-[9px] tracking-widest">AS400</div>
            </div>
          )}
          <button
            onClick={() => setCollapsed(c => !c)}
            className="ml-auto text-slate-500 hover:text-white transition-colors text-xs"
          >
            {collapsed ? '→' : '←'}
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 space-y-1 px-2">
          {nav.map(item => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm ${
                location.pathname === item.path
                  ? 'bg-blue-500/15 text-blue-400 font-semibold'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <span className="text-base flex-shrink-0">{item.icon}</span>
              {!collapsed && <span>{item.label}</span>}
            </Link>
          ))}

          {user?.is_admin && (
            <>
              {!collapsed && (
                <p className="px-3 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-600">Admin</p>
              )}
              {adminNav.map(item => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm ${
                    location.pathname === item.path
                      ? 'bg-purple-500/15 text-purple-400 font-semibold'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <span className="text-base flex-shrink-0">{item.icon}</span>
                  {!collapsed && <span>{item.label}</span>}
                </Link>
              ))}
            </>
          )}
        </nav>

        {/* Trial banner */}
        {!collapsed && planStatus === 'trial' && trialDays > 0 && (
          <div className="mx-2 mb-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
            <p className="text-amber-400 text-xs font-semibold">{trialDays} giorni di prova</p>
            <Link to="/plans" className="text-amber-300 text-xs hover:underline">Abbonati →</Link>
          </div>
        )}

        {/* User */}
        <div className="p-3 border-t border-slate-800">
          {!collapsed ? (
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                <span className="text-blue-400 text-xs font-bold">{user?.name?.[0]?.toUpperCase()}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-xs font-semibold truncate">{user?.name}</p>
                <p className="text-slate-500 text-[10px] truncate">{user?.email}</p>
              </div>
              <button onClick={() => { logout(); navigate('/login') }} className="text-slate-500 hover:text-red-400 text-xs">✕</button>
            </div>
          ) : (
            <button onClick={() => { logout(); navigate('/login') }} className="w-full flex justify-center text-slate-500 hover:text-red-400">✕</button>
          )}
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {/* Topbar */}
        <div className="h-16 bg-[#111320] border-b border-slate-800 flex items-center px-6 gap-4">
          <h1 className="text-white font-bold capitalize">
            {[...nav, ...adminNav].find(n => n.path === location.pathname)?.label || 'Dashboard'}
          </h1>
          <div className="ml-auto flex items-center gap-3">
            <span className={`text-xs px-3 py-1 rounded-full font-semibold ${
              planStatus === 'active' ? 'bg-green-500/15 text-green-400' :
              planStatus === 'trial'  ? 'bg-amber-500/15 text-amber-400' :
              'bg-red-500/15 text-red-400'
            }`}>
              {planStatus === 'active' ? `Piano attivo` :
               planStatus === 'trial'  ? `Trial — ${trialDays} giorni` : 'Scaduto'}
            </span>
          </div>
        </div>

        <div className="p-6">
          {children}
        </div>
      </main>
    </div>
  )
}
