import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import api from '../services/api'

export default function ResetPassword() {
  const [searchParams] = useSearchParams()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const navigate = useNavigate()
  const token = searchParams.get('token')

  useEffect(() => {
    if (!token) {
      setError('Token non valido o scaduto')
    }
  }, [token])

  const submit = async e => {
    e.preventDefault()
    setError('')
    if (password.length < 6) { setError('Password minimo 6 caratteri'); return }
    if (password !== confirm) { setError('Le password non coincidono'); return }
    setLoading(true)
    try {
      await api.post('/api/auth/reset-password', { token, password })
      setSuccess(true)
      setTimeout(() => navigate('/login'), 3000)
    } catch (err) {
      setError(err.response?.data?.detail || 'Token scaduto o non valido')
    } finally {
      setLoading(false)
    }
  }

  const inputClass = "w-full bg-[#252838] border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"

  return (
    <div className="min-h-screen bg-[#0d0f1a] flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-green-500/5 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md relative">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-green-500 flex items-center justify-center shadow-lg">
              <span className="text-white font-black text-base">IK</span>
            </div>
            <div className="text-left">
              <div className="text-white font-bold text-xl leading-none">ikonet</div>
              <div className="text-blue-400 text-xs tracking-widest">SOLUTIONS</div>
            </div>
          </div>
          <h1 className="text-2xl font-bold text-white">Nuova Password</h1>
          <p className="text-slate-400 text-sm mt-1">Imposta la tua nuova password</p>
        </div>

        <div className="bg-[#151824] border border-slate-800 rounded-2xl p-8 shadow-2xl">
          {success ? (
            <div className="text-center space-y-4">
              <div className="text-5xl">✅</div>
              <p className="text-green-400 font-semibold text-lg">Password aggiornata!</p>
              <p className="text-slate-400 text-sm">Verrai reindirizzato al login tra 3 secondi...</p>
              <button onClick={() => navigate('/login')}
                className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 rounded-xl transition-colors text-sm">
                Vai al Login
              </button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1.5">
                  Nuova Password
                </label>
                <div className="relative">
                  <input
                    type={showPwd ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Minimo 6 caratteri"
                    className={inputClass + ' pr-12'}
                  />
                  <button type="button" onClick={() => setShowPwd(s => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-sm transition-colors">
                    {showPwd ? '🙈' : '👁'}
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1.5">
                  Conferma Password
                </label>
                <input
                  type={showPwd ? 'text' : 'password'}
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  placeholder="Ripeti la password"
                  className={inputClass}
                />
              </div>

              {error && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-red-400 text-sm text-center">
                  ⚠ {error}
                </div>
              )}

              <button type="submit" disabled={loading || !token}
                className="w-full bg-blue-500 hover:bg-blue-600 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold py-3.5 rounded-xl transition-colors text-sm">
                {loading ? '...' : 'Imposta Nuova Password'}
              </button>

              <button type="button" onClick={() => navigate('/login')}
                className="w-full text-slate-400 hover:text-white text-sm transition-colors">
                ← Torna al login
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-slate-600 text-xs mt-6">© 2026 Ikonet Solutions</p>
      </div>
    </div>
  )
}
