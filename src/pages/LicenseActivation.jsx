import { useState, useEffect } from 'react'
import api from '../services/api'

export default function LicenseActivation({ trialExpired, onActivated }) {
  const [key, setKey]         = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [hwId, setHwId]       = useState('')
  const [copied, setCopied]   = useState(false)

  useEffect(() => {
    api.get('/api/license/status')
      .then(r => setHwId(r.data.hardware_id || ''))
      .catch(() => {})
  }, [])

  const copyHwId = () => {
    navigator.clipboard.writeText(hwId).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  // Chiave valida: almeno 3 trattini e lunghezza minima
  const cleanKey = key.trim().toUpperCase()
  const isValid  = cleanKey.length >= 14 && cleanKey.split('-').length >= 4

  const submit = async (e) => {
    e.preventDefault()
    if (!isValid) { setError('Formato non valido — incolla la chiave ricevuta via email'); return }
    setError('')
    setLoading(true)
    try {
      const res = await api.post('/api/license/activate', { license_key: cleanKey })
      onActivated(res.data)
    } catch (err) {
      setError(err.response?.data?.detail || 'Licenza non valida o server non raggiungibile')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0d0f1a] flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md relative">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-6">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-green-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <span className="text-white font-black text-xl">IK</span>
            </div>
            <div className="text-left">
              <div className="text-white font-bold text-2xl leading-none">ikonet</div>
              <div className="text-blue-400 text-xs tracking-widest">AS400 IMPORTER</div>
            </div>
          </div>

          {trialExpired ? (
            <>
              <div className="inline-flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-full px-4 py-1.5 text-red-400 text-xs font-semibold mb-3">
                Il periodo di prova è scaduto
              </div>
              <h1 className="text-xl font-bold text-white">Attiva una licenza per continuare</h1>
              <p className="text-slate-400 text-sm mt-1">Acquista un piano e inserisci la chiave qui sotto</p>
            </>
          ) : (
            <>
              <h1 className="text-xl font-bold text-white">Attivazione Licenza</h1>
              <p className="text-slate-400 text-sm mt-1">Inserisci la chiave ricevuta via email</p>
            </>
          )}
        </div>

        {/* Card */}
        <div className="bg-[#151824] border border-slate-800 rounded-2xl p-8 shadow-2xl space-y-5">

          {/* Banner trial gratuito */}
          <a
            href="https://as400.ikonetsolutions.com/register"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 hover:bg-blue-500/15 transition-colors group"
          >
            <div className="w-9 h-9 rounded-lg bg-blue-500/20 flex items-center justify-center flex-shrink-0 text-lg">✨</div>
            <div className="flex-1">
              <p className="text-blue-300 font-semibold text-sm">Non hai ancora una chiave?</p>
              <p className="text-slate-400 text-xs">Registrati gratis → ricevi chiave trial 14 giorni via email</p>
            </div>
            <span className="text-blue-400 text-xs group-hover:translate-x-0.5 transition-transform">→</span>
          </a>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-2">
                Chiave Licenza
              </label>
              <input
                value={key}
                onChange={e => { setKey(e.target.value.toUpperCase()); setError('') }}
                placeholder="TRIAL-XXXX-XXXX-XXXX"
                spellCheck={false}
                autoComplete="off"
                className={`w-full bg-[#252838] border rounded-xl px-4 py-3.5 text-white font-mono text-sm tracking-widest text-center focus:outline-none transition-colors placeholder-slate-600 ${
                  key && isValid  ? 'border-green-500' :
                  key && !isValid ? 'border-slate-600' :
                  'border-slate-700 focus:border-blue-500'
                }`}
              />
              <p className="text-slate-600 text-xs mt-1.5 text-center">
                Incolla la chiave esattamente come ricevuta (es. TRIAL-A1B2-C3D4-E5F6)
              </p>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-red-400 text-sm text-center">
                ⚠ {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !isValid}
              className="w-full bg-blue-500 hover:bg-blue-600 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold py-3.5 rounded-xl transition-colors text-sm"
            >
              {loading ? '⏳ Verifica in corso...' : '✓ Attiva Licenza'}
            </button>
          </form>

          {/* Hardware ID */}
          {hwId && (
            <div className="pt-4 border-t border-slate-800">
              <p className="text-xs text-slate-500 mb-1.5">Hardware ID di questo dispositivo</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-[#0d0f1a] border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-400 tracking-wider truncate">
                  {hwId}
                </code>
                <button
                  onClick={copyHwId}
                  className={`flex-shrink-0 px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                    copied ? 'bg-green-500/20 text-green-400' : 'bg-slate-800 hover:bg-slate-700 text-slate-400'
                  }`}
                >
                  {copied ? '✓ Copiato' : 'Copia'}
                </button>
              </div>
              <p className="text-slate-600 text-xs mt-1.5">
                Comunicalo al supporto se la tua licenza non si attiva
              </p>
            </div>
          )}

          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-3">
            <p className="text-slate-400 text-xs font-semibold mb-0.5">Modalità offline</p>
            <p className="text-slate-500 text-xs">
              Una volta attivata, la licenza funziona per 7 giorni anche senza connessione internet.
            </p>
          </div>
        </div>

        <div className="mt-5 text-center space-y-2">
          <a
            href="https://as400.ikonetsolutions.com/plans"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300 text-sm transition-colors block"
          >
            Acquista una licenza su as400.ikonetsolutions.com →
          </a>
          <p className="text-slate-600 text-xs">Supporto: supporto@ikonetsolutions.com</p>
        </div>

        <p className="text-center text-slate-700 text-xs mt-4">
          © 2026 Ikonet Solutions
        </p>
      </div>
    </div>
  )
}
