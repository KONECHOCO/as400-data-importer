import { useState, useEffect } from 'react'
import { licenseApi } from '../services/api'

export default function Plans() {
  const [licState, setLicState] = useState(null)
  const [loading, setLoading]   = useState(true)
  const [key, setKey]           = useState('')
  const [activating, setActivating] = useState(false)
  const [keyError, setKeyError]     = useState('')
  const [keySuccess, setKeySuccess] = useState('')

  const fetchStatus = () =>
    licenseApi.status()
      .then(r => setLicState(r.data))
      .finally(() => setLoading(false))

  useEffect(() => { fetchStatus() }, [])

  const activate = async (e) => {
    e.preventDefault()
    if (!key.trim()) { setKeyError('Inserisci una chiave licenza'); return }
    setKeyError(''); setKeySuccess(''); setActivating(true)
    try {
      await licenseApi.activate(key.trim())
      setKeySuccess('Licenza attivata con successo!')
      setKey('')
      await fetchStatus()
    } catch (err) {
      setKeyError(err.response?.data?.detail || 'Chiave non valida o errore di connessione')
    } finally { setActivating(false) }
  }

  if (loading) return <p className="text-slate-500 text-sm p-6">Caricamento...</p>

  const isTrial     = licState?.trial_active
  const isActivated = licState?.activated && licState?.valid
  const isExpired   = licState?.trial_expired || (licState?.activated && !licState?.valid)
  const daysLeft    = licState?.trial_days_left ?? 0

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white">Licenza & Abbonamento</h2>
        <p className="text-slate-400 text-sm mt-0.5">
          {isTrial ? 'Periodo di prova gratuita in corso' : 'Informazioni sulla tua licenza'}
        </p>
      </div>

      {/* ── Stato attuale ── */}
      {isTrial && (
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-6 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-lg">
              ⏳
            </div>
            <div>
              <p className="text-white font-bold">Periodo di prova gratuita</p>
              <p className="text-amber-400 text-sm">{daysLeft} giorni rimanenti</p>
            </div>
            <span className="ml-auto bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-semibold px-3 py-1 rounded-full">
              Trial attivo
            </span>
          </div>
          <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-amber-500 to-amber-400 rounded-full transition-all"
              style={{ width: `${Math.max(5, (daysLeft / 14) * 100)}%` }}
            />
          </div>
          <p className="text-slate-500 text-xs">
            Il trial dura 14 giorni. Inserisci una chiave licenza per continuare dopo la scadenza.
          </p>
        </div>
      )}

      {isActivated && (
        <div className="bg-[#151824] border border-green-500/20 rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-500/10 border border-green-500/20 flex items-center justify-center text-lg">
              ✓
            </div>
            <div>
              <p className="text-white font-bold capitalize">{licState?.plan || 'Licenza attiva'}</p>
              <p className="text-slate-400 text-sm">Piano attivo</p>
            </div>
            <span className="ml-auto bg-green-500/10 border border-green-500/20 text-green-400 text-xs font-semibold px-3 py-1 rounded-full">
              Attiva
            </span>
          </div>
          {licState?.expires_at && (
            <div className="flex items-center justify-between py-3 border-t border-slate-800">
              <span className="text-slate-400 text-sm">Scadenza</span>
              <span className="text-white text-sm font-semibold">
                {new Date(licState.expires_at).toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' })}
              </span>
            </div>
          )}
          {licState?.company && (
            <div className="flex items-center justify-between py-3 border-t border-slate-800">
              <span className="text-slate-400 text-sm">Intestata a</span>
              <span className="text-white text-sm">{licState.company}</span>
            </div>
          )}
          {licState?.email && (
            <div className="flex items-center justify-between py-3 border-t border-slate-800">
              <span className="text-slate-400 text-sm">Email registrata</span>
              <span className="text-white text-sm">{licState.email}</span>
            </div>
          )}
          {licState?.hardware_id && (
            <div className="flex items-center justify-between py-3 border-t border-slate-800">
              <span className="text-slate-400 text-sm">Hardware ID</span>
              <span className="text-slate-400 text-xs font-mono">{licState.hardware_id}</span>
            </div>
          )}
        </div>
      )}

      {isExpired && (
        <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-5">
          <p className="text-red-400 font-semibold">Licenza scaduta o non valida</p>
          <p className="text-slate-400 text-sm mt-1">
            {licState?.reason === 'revocata' ? 'La licenza è stata revocata.' :
             licState?.reason === 'scaduta'  ? 'La licenza è scaduta.' :
             'Il periodo di prova è terminato.'}
            {' '}Inserisci una nuova chiave o acquista una licenza.
          </p>
        </div>
      )}

      {/* ── Attivazione chiave ── */}
      <div className="bg-[#151824] border border-slate-700 rounded-2xl p-6">
        <h3 className="text-white font-semibold mb-1">
          {isActivated ? 'Aggiorna chiave licenza' : 'Attiva la tua licenza'}
        </h3>
        <p className="text-slate-400 text-sm mb-4">
          {isActivated
            ? 'Hai ricevuto una nuova chiave? Inseriscila qui per aggiornare la licenza.'
            : 'Hai una chiave licenza? Inseriscila qui per attivare l\'applicazione.'}
        </p>
        <form onSubmit={activate} className="flex gap-3">
          <input
            type="text"
            value={key}
            onChange={e => { setKey(e.target.value); setKeyError(''); setKeySuccess('') }}
            placeholder="XXXX-XXXX-XXXX-XXXX"
            className="flex-1 bg-[#0d0f1a] border border-slate-700 rounded-xl px-4 py-2.5 text-white text-sm font-mono focus:outline-none focus:border-blue-500 transition-colors placeholder-slate-600"
          />
          <button
            type="submit"
            disabled={activating}
            className="bg-blue-500 hover:bg-blue-600 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors whitespace-nowrap"
          >
            {activating ? '⏳ Attivazione...' : 'Attiva'}
          </button>
        </form>
        {keyError   && <p className="text-red-400 text-sm mt-2">⚠ {keyError}</p>}
        {keySuccess && <p className="text-green-400 text-sm mt-2">✓ {keySuccess}</p>}
      </div>

      {/* ── Acquista / supporto ── */}
      <div className="bg-[#151824] border border-slate-800 rounded-2xl p-6">
        <h3 className="text-white font-semibold mb-1">Acquista una licenza</h3>
        <p className="text-slate-400 text-sm mb-4">
          Scegli il piano più adatto alla tua azienda sul portale Ikonet Solutions.
          Il pagamento avviene via PayPal in totale sicurezza.
        </p>
        <a
          href="https://as400.ikonetsolutions.com/plans"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors"
        >
          Vedi i piani e acquista via PayPal →
        </a>
      </div>
    </div>
  )
}
