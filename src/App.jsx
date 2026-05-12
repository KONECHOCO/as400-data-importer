import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { licenseApi } from './services/api'
import Layout         from './components/Layout'
import LicenseActivation from './pages/LicenseActivation'
import SetupAccount      from './pages/SetupAccount'
import LoginPage         from './pages/LoginPage'
import Dashboard         from './pages/Dashboard'
import Connections       from './pages/Connections'
import Import            from './pages/Import'
import Export            from './pages/Export'
import History           from './pages/History'
import Plans             from './pages/Plans'
import Settings          from './pages/Settings'
import AdminLicenses     from './pages/AdminLicenses'
import ResetPassword     from './pages/ResetPassword'
import Landing           from './pages/Landing'

// ── Schermata di caricamento ──────────────────────────────────────────────────
function Splash() {
  return (
    <div className="min-h-screen bg-[#0d0f1a] flex items-center justify-center">
      <div className="text-center space-y-3">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-green-500 flex items-center justify-center mx-auto shadow-lg">
          <span className="text-white font-black text-xl">IK</span>
        </div>
        <div className="text-blue-400 text-xs tracking-widest animate-pulse">AVVIO IN CORSO...</div>
      </div>
    </div>
  )
}

// ── Wrapper rotte protette ────────────────────────────────────────────────────
function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <Splash />
  if (!user)   return <Navigate to="/login" replace />
  return <Layout>{children}</Layout>
}

// ── App con controllo licenza ─────────────────────────────────────────────────
function AppShell() {
  const { user, loading } = useAuth()
  const [licState, setLicState] = useState(null) // null = in verifica
  const [licInfo,  setLicInfo]  = useState(null)

  useEffect(() => {
    licenseApi.status()
      .then(res => setLicState(res.data))
      .catch(() => setLicState({ activated: false }))
  }, [])

  // Caricamento iniziale
  if (licState === null || loading) return <Splash />

  // 1) Licenza non valida in qualsiasi stato → Attivazione
  if (!licState.valid) {
    return (
      <LicenseActivation
        trialExpired={!!licState.trial_expired}
        onActivated={(data) => {
          setLicInfo(data)
          setLicState({ ...data, activated: true, valid: true })
        }}
      />
    )
  }

  // 2) Licenza valida ma nessun account locale → Setup
  const isValid = licState.trial_active || licState.activated
  if (isValid && !licState.has_account && !user) {
    return (
      <SetupAccount
        licenseInfo={licInfo || licState}
        onSetup={() => setLicState(s => ({ ...s, has_account: true }))}
      />
    )
  }

  // 3) Account configurato — routing normale
  return (
    <Routes>
      <Route path="/login"         element={user ? <Navigate to="/dashboard" replace /> : <LoginPage />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/dashboard"     element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/connections"   element={<ProtectedRoute><Connections /></ProtectedRoute>} />
      <Route path="/import"        element={<ProtectedRoute><Import /></ProtectedRoute>} />
      <Route path="/export"        element={<ProtectedRoute><Export /></ProtectedRoute>} />
      <Route path="/history"       element={<ProtectedRoute><History /></ProtectedRoute>} />
      <Route path="/plans"         element={user ? <ProtectedRoute><Plans /></ProtectedRoute> : <Plans />} />
      <Route path="/settings"      element={<ProtectedRoute><Settings /></ProtectedRoute>} />
      <Route path="/admin/licenses" element={<ProtectedRoute><AdminLicenses /></ProtectedRoute>} />
      <Route path="/"              element={user ? <Navigate to="/dashboard" replace /> : <Landing />} />
      <Route path="*"              element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </BrowserRouter>
  )
}
