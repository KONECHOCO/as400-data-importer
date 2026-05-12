import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

export default function SetupAccount({ licenseInfo, onSetup }) {
  const { setupAccount } = useAuth()
  const [form, setForm] = useState({
    name: licenseInfo?.user_name || '',
    company: licenseInfo?.company || '',
    email: licenseInfo?.email || '',
    password: '',
    confirm: '',
  })
  const [showPwd, setShowPwd] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handle = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }))

  const submit = async e => {
    e.preventDefault()
    setError('')
    if (!form.name || !form.company || !form.email) { setError('Compila tutti i campi'); return }
    if (form.password.length < 6) { setError('Password minimo 6 caratteri'); return }
    if (form.password !== form.confirm) { setError('Le password non coincidono'); return }
    setLoading(true)
    try {
      await setupAccount({ name: form.name, company: form.company, email: form.email, password: form.password })
      onSetup()
    } catch (err) {
      setError(err.response?.data?.detail || 'Errore configurazione')
    } finally { setLoading(false) }
  }

  const inputClass = "w-full bg-[#252838] border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
  const labelClass = "text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1.5"

  return (
    <div className="min-h-screen bg-[#0d0f1a] flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-green-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md relative">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-green-500 flex items-center justify-center shadow-lg">
              <span className="text-white font-black text-base">IK</span>
            </div>
            <div className="text-left">
              <div className="text-white font-bold text-xl leading-none">ikonet</div>
              <div className="text-blue-400 text-xs tracking-widest">AS400 IMPORTER</div>
            </div>
          </div>
          <div className="inline-flex items-center gap-2 bg-green-500/10 border border-green-500/20 rounded-full px-4 py-1.5 mb-4">
            <span className="text-green-400 text-xs font-semibold">✓ Licenza attivata</span>
            {licenseInfo?.plan && <span className="text-green-300 text-xs">— Piano {licenseInfo.plan}</span>}
          </div>
          <h1 className="text-xl font-bold text-white">Configura il tuo account</h1>
          <p className="text-slate-400 text-sm mt-1">Imposta le credenziali di accesso locale</p>
        </div>

        <div className="bg-[#151824] border border-slate-800 rounded-2xl p-8 shadow-2xl">
          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Nome</label>
                <input name="name" value={form.name} onChange={handle}
                  placeholder="Mario Rossi" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Azienda</label>
                <input name="company" value={form.company} onChange={handle}
                  placeholder="Acme S.r.l." className={inputClass} />
              </div>
            </div>

            <div>
              <label className={labelClass}>Email (per accesso locale)</label>
              <input name="email" type="email" value={form.email} onChange={handle}
                placeholder="mario@azienda.com" className={inputClass} />
            </div>

            <div>
              <label className={labelClass}>Password</label>
              <div className="relative">
                <input name="password" type={showPwd ? 'text' : 'password'}
                  value={form.password} onChange={handle}
                  placeholder="Minimo 6 caratteri"
                  className={inputClass + ' pr-12'} />
                <button type="button" onClick={() => setShowPwd(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-sm">
                  {showPwd ? '🙈' : '👁'}
                </button>
              </div>
            </div>

            <div>
              <label className={labelClass}>Conferma Password</label>
              <input name="confirm" type={showPwd ? 'text' : 'password'}
                value={form.confirm} onChange={handle}
                placeholder="Ripeti la password" className={inputClass} />
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-red-400 text-sm text-center">
                ⚠ {error}
              </div>
            )}

            <button type="submit" disabled={loading}
              className="w-full bg-blue-500 hover:bg-blue-600 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold py-3.5 rounded-xl transition-colors text-sm mt-2">
              {loading ? '⏳ Configurazione...' : 'Accedi all\'applicazione →'}
            </button>
          </form>
        </div>

        <p className="text-center text-slate-600 text-xs mt-6">
          Le credenziali sono salvate localmente sul tuo dispositivo
        </p>
      </div>
    </div>
  )
}
