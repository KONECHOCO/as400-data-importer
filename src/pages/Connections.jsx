import { useState, useEffect } from 'react'
import { connectionsApi } from '../services/api'

const EMPTY_FORM = { name: '', host: '', user: '', password: '', port: 446, library: '*LIBL', description: '', ssl: false, login_timeout: 10 }

export default function Connections() {
  const [conns, setConns] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [testing, setTesting] = useState(null)
  const [testResult, setTestResult] = useState({})
  const [showPwd, setShowPwd] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { load() }, [])

  const load = async () => {
    try {
      const res = await connectionsApi.list()
      setConns(res.data)
    } finally { setLoading(false) }
  }

  const openNew = () => {
    setEditId(null)
    setForm(EMPTY_FORM)
    setError('')
    setShowForm(true)
  }

  const openEdit = (conn) => {
    setEditId(conn.id)
    setForm({ name: conn.name, host: conn.host, user: conn.user, password: '', port: conn.port, library: conn.library, description: conn.description || '', ssl: conn.ssl || false, login_timeout: conn.login_timeout || 10 })
    setError('')
    setShowForm(true)
  }

  const save = async e => {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      if (editId) {
        await connectionsApi.update(editId, form)
      } else {
        await connectionsApi.create(form)
      }
      setShowForm(false)
      setEditId(null)
      setForm(EMPTY_FORM)
      load()
    } catch (err) {
      setError(err.response?.data?.detail || 'Errore salvataggio')
    } finally { setSaving(false) }
  }

  const testConn = async (id) => {
    setTesting(id)
    setTestResult(r => ({ ...r, [id]: null }))
    try {
      const res = await connectionsApi.test(id)
      setTestResult(r => ({ ...r, [id]: res.data }))
    } catch {
      setTestResult(r => ({ ...r, [id]: { success: false, message: 'Errore di connessione' } }))
    } finally { setTesting(null) }
  }

  const del = async (id) => {
    if (!confirm('Eliminare questa connessione?')) return
    await connectionsApi.delete(id)
    load()
  }

  const handle = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }))

  const inputClass = "w-full bg-[#252838] border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
  const labelClass = "text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1.5"

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Connessioni AS/400</h2>
          <p className="text-slate-400 text-sm mt-0.5">Gestisci le connessioni ai tuoi sistemi IBM i</p>
        </div>
        <button
          onClick={openNew}
          className="bg-blue-500 hover:bg-blue-600 text-white font-semibold px-4 py-2 rounded-xl text-sm transition-colors"
        >
          + Nuova Connessione
        </button>
      </div>

      {/* Form nuova/modifica connessione */}
      {showForm && (
        <div className="bg-[#151824] border border-blue-500/30 rounded-2xl p-6">
          <h3 className="text-white font-semibold mb-4">{editId ? 'Modifica Connessione' : 'Nuova Connessione AS/400'}</h3>
          <form onSubmit={save} className="grid grid-cols-2 gap-4">

            {/* Nome */}
            <div>
              <label className={labelClass}>Nome</label>
              <input name="name" value={form.name} onChange={handle}
                placeholder="Es. Produzione" className={inputClass} />
            </div>

            {/* Host */}
            <div>
              <label className={labelClass}>Host / IP</label>
              <input name="host" value={form.host} onChange={handle}
                placeholder="192.168.1.100" className={inputClass} />
            </div>

            {/* Utente */}
            <div>
              <label className={labelClass}>Utente</label>
              <input name="user" value={form.user} onChange={handle}
                placeholder="IKONET1" className={inputClass} />
            </div>

            {/* Password con toggle visibilità */}
            <div>
              <label className={labelClass}>Password</label>
              <div className="relative">
                <input
                  name="password"
                  type={showPwd ? 'text' : 'password'}
                  value={form.password}
                  onChange={handle}
                  placeholder="••••••••"
                  className={inputClass + ' pr-12'}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-sm transition-colors"
                >
                  {showPwd ? '🙈' : '👁'}
                </button>
              </div>
            </div>

            {/* Porta */}
            <div>
              <label className={labelClass}>Porta DRDA</label>
              <input name="port" type="number" value={form.port} onChange={handle}
                placeholder="446" className={inputClass} />
            </div>

            {/* Libreria */}
            <div>
              <label className={labelClass}>Libreria</label>
              <input name="library" value={form.library} onChange={handle}
                placeholder="*LIBL" className={inputClass} />
            </div>

            {/* Timeout */}
            <div>
              <label className={labelClass}>Timeout login (sec)</label>
              <input name="login_timeout" type="number" value={form.login_timeout} onChange={handle}
                placeholder="10" className={inputClass} />
            </div>

            {/* SSL */}
            <div className="flex items-center gap-3 pt-2">
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" name="ssl" checked={form.ssl}
                  onChange={e => setForm(f => ({ ...f, ssl: e.target.checked }))}
                  className="sr-only peer" />
                <div className="w-10 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"></div>
              </label>
              <div>
                <p className="text-white text-sm font-semibold">Connessione SSL</p>
                <p className="text-slate-500 text-xs">Attiva se l'AS/400 richiede TLS (porta 9471)</p>
              </div>
            </div>

            {/* Descrizione */}
            <div className="col-span-2">
              <label className={labelClass}>Descrizione (opzionale)</label>
              <input name="description" value={form.description} onChange={handle}
                placeholder="Note..." className={inputClass} />
            </div>

            {/* Info porte VPN */}
            <div className="col-span-2 bg-amber-500/5 border border-amber-500/20 rounded-xl p-3">
              <p className="text-amber-400 text-xs font-semibold mb-1">Connessione via VPN</p>
              <p className="text-slate-400 text-xs">Assicurati che la VPN consenta il traffico sulle porte AS/400: <span className="font-mono text-slate-300">449</span> (port mapper), <span className="font-mono text-slate-300">446</span> (DRDA), <span className="font-mono text-slate-300">8476</span> (database), <span className="font-mono text-slate-300">8471</span> (central), <span className="font-mono text-slate-300">8473</span> (signon).</p>
            </div>

            {/* Errore */}
            {error && (
              <div className="col-span-2 bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-red-400 text-sm">
                {error}
              </div>
            )}

            {/* Bottoni */}
            <div className="col-span-2 flex gap-3">
              <button type="submit" disabled={saving}
                className="bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition-colors">
                {saving ? 'Salvataggio...' : editId ? 'Aggiorna Connessione' : 'Salva Connessione'}
              </button>
              <button type="button" onClick={() => { setShowForm(false); setEditId(null) }}
                className="bg-slate-800 hover:bg-slate-700 text-white px-6 py-2.5 rounded-xl text-sm transition-colors">
                Annulla
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Lista connessioni */}
      {loading ? (
        <p className="text-slate-500">Caricamento...</p>
      ) : conns.length === 0 ? (
        <div className="bg-[#151824] border border-slate-800 rounded-2xl p-12 text-center">
          <div className="text-4xl mb-3">⚡</div>
          <p className="text-white font-semibold">Nessuna connessione</p>
          <p className="text-slate-400 text-sm mt-1">Aggiungi la tua prima connessione AS/400</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {conns.map(conn => (
            <div key={conn.id} className={`bg-[#151824] border rounded-2xl p-5 transition-colors ${
              testResult[conn.id]
                ? testResult[conn.id].success ? 'border-green-500/30' : 'border-red-500/30'
                : 'border-slate-800'
            }`}>
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-blue-400 text-lg">⚡</span>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-white font-semibold">{conn.name}</p>
                    {conn.ssl && <span className="text-xs bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-full">SSL</span>}
                  </div>
                  <p className="text-slate-400 text-sm">{conn.user}@{conn.host}:{conn.port} — {conn.library}</p>
                  {conn.description && <p className="text-slate-500 text-xs mt-0.5">{conn.description}</p>}
                  {conn.last_used && (
                    <p className="text-slate-600 text-xs mt-0.5">
                      Ultimo uso: {new Date(conn.last_used).toLocaleString('it-IT')}
                    </p>
                  )}
                </div>

                <button
                  onClick={() => testConn(conn.id)}
                  disabled={testing === conn.id}
                  className="bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-xl transition-colors whitespace-nowrap"
                >
                  {testing === conn.id ? '⏳ Test...' : 'Testa'}
                </button>

                <button
                  onClick={() => openEdit(conn)}
                  className="text-slate-400 hover:text-blue-400 transition-colors text-sm px-3 py-2 rounded-xl hover:bg-blue-500/10"
                  title="Modifica"
                >
                  ✎
                </button>

                <button
                  onClick={() => del(conn.id)}
                  className="text-slate-500 hover:text-red-400 transition-colors text-sm px-3 py-2 rounded-xl hover:bg-red-500/10"
                  title="Elimina"
                >
                  ✕
                </button>
              </div>

              {testResult[conn.id] && (
                <div className={`mt-3 rounded-xl px-4 py-2.5 text-sm flex items-start gap-2 ${
                  testResult[conn.id].success
                    ? 'bg-green-500/10 border border-green-500/20 text-green-400'
                    : 'bg-red-500/10 border border-red-500/20 text-red-400'
                }`}>
                  <span className="flex-shrink-0 font-bold">{testResult[conn.id].success ? '✓' : '✕'}</span>
                  <span className="font-mono text-xs break-all">{testResult[conn.id].message}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
