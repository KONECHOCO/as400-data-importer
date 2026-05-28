import { createContext, useContext, useState, useEffect } from 'react'
import { authApi, licenseApi } from '../services/api'

const AuthContext = createContext(null)

// ── Helper: persistenza token tramite pywebview API (desktop) o localStorage (browser) ──
const isDesktop = () => typeof window !== 'undefined' && !!window.pywebview

async function persistToken(token) {
  if (isDesktop() && window.pywebview?.api?.store_token) {
    await window.pywebview.api.store_token(token)
  }
  localStorage.setItem('token', token)
}

async function loadPersistedToken() {
  // Prima prova pywebview (più affidabile tra riavvii)
  if (isDesktop() && window.pywebview?.api?.get_token) {
    try {
      const res = await window.pywebview.api.get_token()
      if (res?.ok && res.token) {
        localStorage.setItem('token', res.token) // sync localStorage
        return res.token
      }
    } catch {}
  }
  return localStorage.getItem('token')
}

async function clearPersistedToken() {
  if (isDesktop() && window.pywebview?.api?.clear_token) {
    await window.pywebview.api.clear_token()
  }
  localStorage.removeItem('token')
  localStorage.removeItem('user')
}

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [licState, setLicState] = useState(null)

  const _fetchLicense = () =>
    licenseApi.status()
      .then(res => setLicState(res.data))
      .catch(() => {})

  useEffect(() => {
    _fetchLicense()

    const init = async () => {
      // Attendi che pywebview sia pronto (può richiedere ~300ms)
      if (isDesktop()) {
        await new Promise(resolve => {
          const check = () => window.pywebview?.api ? resolve() : setTimeout(check, 100)
          check()
        })
      }

      const token     = await loadPersistedToken()
      const savedUser = localStorage.getItem('user')

      if (token && savedUser) {
        setUser(JSON.parse(savedUser))
        authApi.me()
          .then(res => {
            setUser(res.data)
            localStorage.setItem('user', JSON.stringify(res.data))
          })
          .catch(err => {
            // Logout solo su 401/403 — NON su errori di rete (server temporaneamente irraggiungibile)
            const status = err?.response?.status
            if (status === 401 || status === 403) {
              logout()
            }
            // Altrimenti mantieni l'utente loggato con i dati in cache
          })
          .finally(() => setLoading(false))
      } else {
        setLoading(false)
      }
    }

    init()
  }, [])

  const login = async (email, password) => {
    const res = await authApi.login({ email, password })
    const { token, user } = res.data
    await persistToken(token)
    localStorage.setItem('user', JSON.stringify(user))
    setUser(user)
    _fetchLicense()
    return user
  }

  const setupAccount = async (data) => {
    const res = await authApi.setup(data)
    const { token, user } = res.data
    await persistToken(token)
    localStorage.setItem('user', JSON.stringify(user))
    setUser(user)
    _fetchLicense()
    return user
  }

  const register = async (data) => {
    const res = await authApi.register(data)
    const { token, user } = res.data
    await persistToken(token)
    localStorage.setItem('user', JSON.stringify(user))
    setUser(user)
    _fetchLicense()
    return user
  }

  const logout = async () => {
    await clearPersistedToken()
    setUser(null)
  }

  const getTrialDaysLeft = () => licState?.trial_days_left ?? 0

  const getPlanStatus = () => {
    if (!licState) return 'expired'
    if (licState.trial_active) return 'trial'
    if (licState.activated && licState.valid) return 'active'
    return 'expired'
  }

  const isPlanActive = () => !!licState?.valid

  return (
    <AuthContext.Provider value={{
      user, loading, login, setupAccount, register, logout,
      licState, getTrialDaysLeft, getPlanStatus, isPlanActive
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
