import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../services/api'

export default function LoginPage() {
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState({ email: '', password: '', name: '', company: '' })
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPwd, setShowPwd] = useState(false)
  const { login, register } = useAuth()
  const navigate = useNavigate()

  const handle = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }))

  const submit = async e => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)
    try {
      if (mode === 'login') {
        await login(form.email, form.password)
        navigate('/dashboard')
      } else if (mode === 'register') {
        if (!form.name || !form.company) { setError('Compila tutti i campi'); setLoading(false); return }
        await register(form)
        navigate('/dashboard')
      } else if (mode === 'forgot') {
        await api.post('/api/auth/forgot-password', { email: form.email })
        setSuccess('Email inviata! Controlla la tua casella di posta.')
        setLoading(false)
        return
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Errore. Riprova.')
      // Cancella solo la password, l'email rimane compilata
      setForm(f => ({ ...f, password: '' }))
    } finally {
      setLoading(false)
    }
  }

  const inputClass = "w-full bg-[#252838] border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors placeholder-slate-500"

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
          <h1 className="text-2xl font-bold text-white">AS400 Data Importer</h1>
          <p className="text-slate-400 text-sm mt-1">
            {mode === 'login' ? 'Accedi al tuo account' : mode === 'register' ? '14 giorni di prova gratuita' : 'Recupero password'}
          </p>
        </div>

        <div className="bg-[#151824] border border-slate-800 rounded-2xl p-8 shadow-2xl">
          {mode === 'register' && (
            <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3 mb-6 text-center">
              <span className="text-green-400 text-sm font-semibold">🎉 14 giorni gratis — nessuna carta richiesta</span>
            </div>
          )}

          <form onSubmit={submit} className="space-y-4">
            {mode === 'register' && (
              <>
                <div>
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1.5">Nome Completo</label>
                  <input name="name" value={form.name} onChange={handle} placeholder="Mario Rossi" className={inputClass} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1.5">Azienda</label>
                  <input name="company" value={form.company} onChange={handle} placeholder="Acme S.r.l." className={inputClass} />
                </div>
              </>
            )}

            <div>
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1.5">Email</label>
              <input name="email" type="email" value={form.email} onChange={handle} placeholder="mario@azienda.com" className={inputClass} />
            </div>

            {mode !== 'forgot' && (
              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1.5">Password</label>
                <div className="relative">
                  <input name="password" type={showPwd ? 'text' : 'password'} value={form.password} onChange={handle}
                    placeholder="••••••••" className={inputClass + ' pr-12'} />
                  <button type="button" onClick={() => setShowPwd(s => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-sm transition-colors">
                    {showPwd ? '🙈' : '👁'}
                  </button>
                </div>
                {mode === 'login' && (
                  <div className="text-right mt-1.5">
                    <button type="button" onClick={() => { setMode('forgot'); setError(''); setSuccess('') }}
                      className="text-blue-400 hover:text-blue-300 text-xs transition-colors">
                      Ho dimenticato la password
                    </button>
                  </div>
                )}
              </div>
            )}

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-red-400 text-sm text-center">
                ⚠ {error}
              </div>
            )}
            {success && (
              <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3 text-green-400 text-sm text-center">
                ✓ {success}
              </div>
            )}

            <button type="submit" disabled={loading}
              className="w-full bg-blue-500 hover:bg-blue-600 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold py-3.5 rounded-xl transition-colors text-sm mt-2">
              {loading ? '...' : mode === 'login' ? 'Accedi' : mode === 'register' ? 'Inizia prova gratuita' : 'Invia email di recupero'}
            </button>
          </form>

          <div className="mt-6 space-y-2 text-center">
            {mode !== 'login' && (
              <button onClick={() => { setMode('login'); setError(''); setSuccess('') }}
                className="text-slate-400 hover:text-white text-sm transition-colors block w-full">
                ← Torna al login
              </button>
            )}
            {mode === 'login' && (
              <button onClick={() => { setMode('register'); setError(''); setSuccess('') }}
                className="text-slate-400 hover:text-white text-sm transition-colors">
                Non hai un account? <span className="text-blue-400">Registrati gratis</span>
              </button>
            )}
          </div>
        </div>

        <p className="text-center text-slate-600 text-xs mt-6">© 2026 Ikonet Solutions — Tutti i diritti riservati</p>
      </div>
    </div>
  )
}
