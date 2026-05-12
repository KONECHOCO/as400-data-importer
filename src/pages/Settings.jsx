import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { authApi } from '../services/api'
import api from '../services/api'

export default function Settings() {
  const { user } = useAuth()

  // Profilo
  const [profile, setProfile]       = useState({ name: user?.name || '', company: user?.company || '' })
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileMsg, setProfileMsg]  = useState(null)

  // Password
  const [pwd, setPwd]               = useState({ current: '', password: '', confirm: '' })
  const [showPwd, setShowPwd]       = useState(false)
  const [pwdSaving, setPwdSaving]   = useState(false)
  const [pwdMsg, setPwdMsg]         = useState(null)

  // App settings
  const [appSettings, setAppSettings]   = useState({
    default_library: '',
    default_export_fmt: 'xlsx',
    default_import_mode: 'create',
    export_limit: '1000',
  })
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [settingsMsg, setSettingsMsg]   = useState(null)

  // DB stats
  const [dbStats, setDbStats] = useState(null)

  useEffect(() => {
    api.get('/api/settings').then(r => {
      if (r.data && Object.keys(r.data).length > 0) {
        setAppSettings(s => ({ ...s, ...r.data }))
      }
    }).catch(() => {})

    api.get('/api/db/stats').then(r => setDbStats(r.data)).catch(() => {})
  }, [])

  const inputClass  = 'w-full bg-[#252838] border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors'
  const labelClass  = 'text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1.5'

  const Msg = ({ msg }) => msg ? (
    <div className={`rounded-xl p-3 text-sm ${msg.type === 'success' ? 'bg-green-500/10 border border-green-500/20 text-green-400' : 'bg-red-500/10 border border-red-500/20 text-red-400'}`}>
      {msg.type === 'success' ? '✓ ' : '⚠ '}{msg.text}
    </div>
  ) : null

  const saveProfile = async e => {
    e.preventDefault()
    if (!profile.name.trim() || !profile.company.trim()) {
      setProfileMsg({ type: 'error', text: 'Nome e azienda sono obbligatori' }); return
    }
    setProfileSaving(true); setProfileMsg(null)
    try {
      const res = await authApi.updateProfile(profile)
      localStorage.setItem('user', JSON.stringify(res.data))
      setProfileMsg({ type: 'success', text: 'Profilo aggiornato' })
    } catch (err) {
      setProfileMsg({ type: 'error', text: err.response?.data?.detail || 'Errore aggiornamento' })
    } finally { setProfileSaving(false) }
  }

  const savePassword = async e => {
    e.preventDefault()
    setPwdMsg(null)
    if (pwd.password.length < 6) { setPwdMsg({ type: 'error', text: 'Password minimo 6 caratteri' }); return }
    if (pwd.password !== pwd.confirm) { setPwdMsg({ type: 'error', text: 'Le password non coincidono' }); return }
    setPwdSaving(true)
    try {
      await authApi.changePassword({ current_password: pwd.current, new_password: pwd.password })
      setPwd({ current: '', password: '', confirm: '' })
      setPwdMsg({ type: 'success', text: 'Password aggiornata con successo' })
    } catch (err) {
      setPwdMsg({ type: 'error', text: err.response?.data?.detail || 'Password attuale non corretta' })
    } finally { setPwdSaving(false) }
  }

  const saveAppSettings = async e => {
    e.preventDefault()
    setSettingsSaving(true); setSettingsMsg(null)
    try {
      await api.put('/api/settings', appSettings)
      setSettingsMsg({ type: 'success', text: 'Impostazioni salvate' })
    } catch (err) {
      setSettingsMsg({ type: 'error', text: 'Errore salvataggio impostazioni' })
    } finally { setSettingsSaving(false) }
  }

  return (
    <div className="max-w-2xl space-y-6">

      {/* ── Profilo ─────────────────────────────────────────────────────── */}
      <div className="bg-[#151824] border border-slate-800 rounded-2xl p-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-14 h-14 rounded-2xl bg-blue-500/20 border border-blue-500/30 flex items-center justify-center">
            <span className="text-blue-400 text-2xl font-bold">{user?.name?.[0]?.toUpperCase()}</span>
          </div>
          <div>
            <p className="text-white font-bold text-lg">{user?.name}</p>
            <p className="text-slate-400 text-sm">{user?.email}</p>
          </div>
        </div>

        <p className="text-xs font-semibold text-blue-400 uppercase tracking-widest mb-4">Dati Profilo</p>
        <form onSubmit={saveProfile} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Nome Completo</label>
              <input value={profile.name} onChange={e => setProfile(p => ({ ...p, name: e.target.value }))}
                placeholder="Mario Rossi" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Azienda</label>
              <input value={profile.company} onChange={e => setProfile(p => ({ ...p, company: e.target.value }))}
                placeholder="Acme S.r.l." className={inputClass} />
            </div>
          </div>
          <div>
            <label className={labelClass}>Email</label>
            <input value={user?.email || ''} disabled className={inputClass + ' opacity-50 cursor-not-allowed'} />
            <p className="text-slate-600 text-xs mt-1">L'email non può essere modificata</p>
          </div>
          <Msg msg={profileMsg} />
          <button type="submit" disabled={profileSaving}
            className="bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition-colors">
            {profileSaving ? 'Salvataggio...' : 'Salva Profilo'}
          </button>
        </form>
      </div>

      {/* ── Password ────────────────────────────────────────────────────── */}
      <div className="bg-[#151824] border border-slate-800 rounded-2xl p-6">
        <p className="text-xs font-semibold text-blue-400 uppercase tracking-widest mb-4">Sicurezza</p>
        <form onSubmit={savePassword} className="space-y-4">
          <div>
            <label className={labelClass}>Password Attuale</label>
            <div className="relative">
              <input type={showPwd ? 'text' : 'password'} value={pwd.current}
                onChange={e => setPwd(p => ({ ...p, current: e.target.value }))}
                placeholder="••••••••" className={inputClass + ' pr-12'} />
              <button type="button" onClick={() => setShowPwd(s => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-sm transition-colors">
                {showPwd ? '🙈' : '👁'}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Nuova Password</label>
              <input type={showPwd ? 'text' : 'password'} value={pwd.password}
                onChange={e => setPwd(p => ({ ...p, password: e.target.value }))}
                placeholder="Minimo 6 caratteri" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Conferma Password</label>
              <input type={showPwd ? 'text' : 'password'} value={pwd.confirm}
                onChange={e => setPwd(p => ({ ...p, confirm: e.target.value }))}
                placeholder="Ripeti la password" className={inputClass} />
            </div>
          </div>
          <Msg msg={pwdMsg} />
          <button type="submit" disabled={pwdSaving || !pwd.current || !pwd.password || !pwd.confirm}
            className="bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition-colors">
            {pwdSaving ? 'Aggiornamento...' : 'Cambia Password'}
          </button>
        </form>
      </div>

      {/* ── Impostazioni applicazione ────────────────────────────────────── */}
      <div className="bg-[#151824] border border-slate-800 rounded-2xl p-6">
        <p className="text-xs font-semibold text-blue-400 uppercase tracking-widest mb-4">Preferenze Applicazione</p>
        <form onSubmit={saveAppSettings} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Libreria AS400 predefinita</label>
              <input
                value={appSettings.default_library}
                onChange={e => setAppSettings(s => ({ ...s, default_library: e.target.value.toUpperCase() }))}
                placeholder="es. MYLIB"
                className={inputClass + ' uppercase'}
              />
            </div>
            <div>
              <label className={labelClass}>Limite righe export</label>
              <input
                type="number"
                value={appSettings.export_limit}
                onChange={e => setAppSettings(s => ({ ...s, export_limit: e.target.value }))}
                placeholder="1000"
                className={inputClass}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Formato export predefinito</label>
              <select
                value={appSettings.default_export_fmt}
                onChange={e => setAppSettings(s => ({ ...s, default_export_fmt: e.target.value }))}
                className={inputClass}
              >
                {['xlsx', 'csv', 'tsv', 'json', 'xml', 'pdf'].map(f => (
                  <option key={f} value={f}>{f.toUpperCase()}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Modalità import predefinita</label>
              <select
                value={appSettings.default_import_mode}
                onChange={e => setAppSettings(s => ({ ...s, default_import_mode: e.target.value }))}
                className={inputClass}
              >
                <option value="create">Crea tabella</option>
                <option value="insert">Inserisci righe</option>
                <option value="update">Aggiorna righe</option>
              </select>
            </div>
          </div>
          <Msg msg={settingsMsg} />
          <button type="submit" disabled={settingsSaving}
            className="bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition-colors">
            {settingsSaving ? 'Salvataggio...' : 'Salva Impostazioni'}
          </button>
        </form>
      </div>

      {/* ── Archiviazione dati ───────────────────────────────────────────── */}
      <div className="bg-[#151824] border border-slate-800 rounded-2xl p-6">
        <p className="text-xs font-semibold text-blue-400 uppercase tracking-widest mb-4">Archiviazione Locale</p>
        {dbStats ? (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="bg-slate-800/50 rounded-xl p-3">
                <div className="text-2xl font-bold text-white">{dbStats.connections}</div>
                <div className="text-slate-400 text-xs mt-0.5">Connessioni</div>
              </div>
              <div className="bg-slate-800/50 rounded-xl p-3">
                <div className="text-2xl font-bold text-white">{dbStats.operations}</div>
                <div className="text-slate-400 text-xs mt-0.5">Operazioni</div>
              </div>
              <div className="bg-slate-800/50 rounded-xl p-3">
                <div className="text-2xl font-bold text-white">{dbStats.saved_queries}</div>
                <div className="text-slate-400 text-xs mt-0.5">Query salvate</div>
              </div>
            </div>
            <div className="bg-[#0d0f1a] border border-slate-800 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Database SQLite</span>
                <span className="text-green-400 font-semibold">{dbStats.db_size_kb} KB</span>
              </div>
              <code className="block text-xs font-mono text-slate-500 truncate">{dbStats.db_path}</code>
              <p className="text-slate-600 text-xs">
                I dati sono salvati permanentemente — sopravvivono al riavvio del server
              </p>
            </div>
          </div>
        ) : (
          <div className="text-slate-500 text-sm">Caricamento statistiche...</div>
        )}
      </div>

    </div>
  )
}
