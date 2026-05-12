import { useState, useEffect, useRef } from 'react'
import { connectionsApi } from '../services/api'
import api from '../services/api'

const ACCEPT = '.xlsx,.xlsm,.xls,.csv,.tsv,.txt,.xml,.json,.jsonl'
const ACCEPT_HINT = 'Excel (.xlsx/.xlsm/.xls) · CSV/TSV/TXT · XML · JSON/JSONL'

const FORMAT_COLORS = {
  excel:       'bg-green-500/20 text-green-400',
  excel_xls:   'bg-green-500/20 text-green-400',
  excel_xlsb:  'bg-green-500/20 text-green-400',
  csv:         'bg-blue-500/20 text-blue-400',
  json:        'bg-amber-500/20 text-amber-400',
  jsonl:       'bg-amber-500/20 text-amber-400',
  xml:         'bg-purple-500/20 text-purple-400',
}

const TYPE_COLORS = {
  'VARCHAR(10)':  'bg-slate-700 text-slate-300',
  'VARCHAR(50)':  'bg-slate-700 text-slate-300',
  'VARCHAR(100)': 'bg-slate-700 text-slate-300',
  'VARCHAR(256)': 'bg-slate-700 text-slate-300',
  'CLOB(1M)':     'bg-slate-700 text-slate-300',
  'SMALLINT':     'bg-cyan-500/20 text-cyan-400',
  'INTEGER':      'bg-cyan-500/20 text-cyan-400',
  'BIGINT':       'bg-cyan-500/20 text-cyan-400',
  'DECIMAL(15,2)':'bg-teal-500/20 text-teal-400',
  'DATE':         'bg-violet-500/20 text-violet-400',
}

function Steps({ current }) {
  const steps = ['File & Configurazione', 'Anteprima & Colonne', 'Import']
  return (
    <div className="flex items-center gap-0 mb-6">
      {steps.map((label, i) => {
        const n = i + 1
        const done   = n < current
        const active = n === current
        return (
          <div key={n} className="flex items-center flex-1 last:flex-none">
            <div className="flex items-center gap-2 flex-shrink-0">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors ${
                done   ? 'bg-green-500 border-green-500 text-white' :
                active ? 'bg-blue-500 border-blue-500 text-white' :
                         'bg-transparent border-slate-600 text-slate-500'
              }`}>
                {done ? '✓' : n}
              </div>
              <span className={`text-xs font-semibold hidden sm:block ${active ? 'text-white' : done ? 'text-green-400' : 'text-slate-500'}`}>
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={`flex-1 h-px mx-3 ${done ? 'bg-green-500' : 'bg-slate-700'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

const MODES = [
  { id: 'create', label: 'Crea tabella',  desc: 'Elimina e ricrea la tabella con i dati del file' },
  { id: 'insert', label: 'Inserisci',     desc: 'Aggiunge righe alla tabella esistente' },
  { id: 'update', label: 'Aggiorna',      desc: 'Aggiorna righe esistenti tramite chiave primaria' },
]

export default function Import() {
  const [step, setStep]       = useState(1)
  const [conns, setConns]     = useState([])
  const [file, setFile]       = useState(null)
  const [form, setForm]       = useState({ connection_id: '', library: '', table_name: '', mode: 'create' })
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  // File options (sheet, encoding, separator)
  const [fileOptions, setFileOptions] = useState({})

  // Step 2
  const [preview, setPreview]   = useState(null)
  const [mapping, setMapping]   = useState([])

  // Step 3
  const [opId, setOpId]         = useState(null)
  const [status, setStatus]     = useState(null)
  const pollRef                 = useRef()
  const logEndRef               = useRef()

  useEffect(() => {
    connectionsApi.list().then(r => setConns(r.data))
    return () => clearInterval(pollRef.current)
  }, [])

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [status?.log])

  const handle = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }))

  // ── Preview helpers ───────────────────────────────────────────────────────
  const fetchPreview = async (opts) => {
    setLoading(true); setError('')
    const fd = new FormData()
    fd.append('file', file)
    fd.append('options', JSON.stringify(opts))
    try {
      const res = await api.post('/api/import/preview', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      setPreview(res.data)
      setMapping(res.data.mapping)
      return res.data
    } catch (err) {
      setError(err.response?.data?.detail || 'Errore lettura file')
      return null
    } finally { setLoading(false) }
  }

  const loadPreview = async () => {
    if (!file || !form.connection_id || !form.library || !form.table_name) {
      setError('Compila tutti i campi e seleziona un file'); return
    }
    const data = await fetchPreview(fileOptions)
    if (data) setStep(2)
  }

  const onSheetChange = async (sheet) => {
    const newOpts = { ...fileOptions, sheet: typeof sheet === 'string' ? sheet : Number(sheet) }
    setFileOptions(newOpts)
    await fetchPreview(newOpts)
  }

  // ── Start import ──────────────────────────────────────────────────────────
  const startImport = async () => {
    setLoading(true); setError('')
    const fd = new FormData()
    fd.append('file', file)
    fd.append('connection_id', form.connection_id)
    fd.append('library', form.library.toUpperCase())
    fd.append('table_name', form.table_name.toUpperCase())
    fd.append('mode', form.mode)
    fd.append('column_mapping', JSON.stringify(mapping))
    fd.append('options', JSON.stringify(fileOptions))
    try {
      const res = await api.post('/api/import', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      setOpId(res.data.operation_id)
      setStatus({ status: 'running', progress: 0, rows_count: 0, rows_error: 0, total_rows: null, log: [] })
      setStep(3)
      pollRef.current = setInterval(async () => {
        try {
          const s = await api.get(`/api/import/${res.data.operation_id}/status`)
          setStatus(s.data)
          if (s.data.status === 'completed' || s.data.status === 'failed') {
            clearInterval(pollRef.current)
            setLoading(false)
          }
        } catch {}
      }, 1000)
    } catch (err) {
      setError(err.response?.data?.detail || 'Errore avvio import')
      setLoading(false)
    }
  }

  const reset = () => {
    setStep(1); setFile(null); setPreview(null); setMapping([])
    setOpId(null); setStatus(null); setError(''); setLoading(false)
    setFileOptions({})
    clearInterval(pollRef.current)
  }

  // ── Mapping helpers ───────────────────────────────────────────────────────
  const toggleAll = (include) => setMapping(m => m.map(c => ({ ...c, include })))
  const updateMapping = (i, field, val) => setMapping(m => m.map((c, idx) => idx === i ? { ...c, [field]: val } : c))
  const includedCount = mapping.filter(m => m.include).length

  const inputCls = "w-full bg-[#252838] border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
  const labelCls = "text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1.5"

  return (
    <div className="space-y-5 max-w-5xl">
      <Steps current={step} />

      {/* ── STEP 1: File + Config ─────────────────────────────────────────── */}
      {step === 1 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Upload */}
          <div className="bg-[#151824] border border-slate-800 rounded-2xl p-6 space-y-4">
            <p className="text-xs font-semibold text-blue-400 uppercase tracking-widest">Carica File</p>
            <label className={`flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-8 cursor-pointer transition-colors ${
              file ? 'border-green-500/50 bg-green-500/5' : 'border-slate-700 hover:border-blue-500/50 hover:bg-blue-500/5'
            }`}>
              <span className="text-3xl mb-2">{file ? '✓' : '↑'}</span>
              <span className={`font-semibold text-sm ${file ? 'text-green-400' : 'text-slate-300'}`}>
                {file ? file.name : 'Clicca o trascina un file'}
              </span>
              <span className="text-slate-500 text-xs mt-1 text-center">{ACCEPT_HINT}</span>
              <input type="file" className="hidden" accept={ACCEPT}
                onChange={e => { setFile(e.target.files[0]); setError(''); setFileOptions({}) }} />
            </label>
            {file && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">{(file.size / 1024).toFixed(1)} KB</span>
                <button onClick={() => { setFile(null); setFileOptions({}) }} className="text-red-400 hover:underline">Rimuovi</button>
              </div>
            )}
          </div>

          {/* Config */}
          <div className="bg-[#151824] border border-slate-800 rounded-2xl p-6 space-y-4">
            <p className="text-xs font-semibold text-blue-400 uppercase tracking-widest">Destinazione AS400</p>

            <div>
              <label className={labelCls}>Connessione</label>
              <select name="connection_id" value={form.connection_id} onChange={handle} className={inputCls}>
                <option value="">Seleziona...</option>
                {conns.map(c => <option key={c.id} value={c.id}>{c.name} ({c.host})</option>)}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Libreria</label>
                <input name="library" value={form.library} onChange={handle}
                  placeholder="es. MYLIB" className={inputCls + ' uppercase'} />
              </div>
              <div>
                <label className={labelCls}>Tabella</label>
                <input name="table_name" value={form.table_name} onChange={handle}
                  placeholder="es. CLIENTI" className={inputCls + ' uppercase'} />
              </div>
            </div>

            <div>
              <label className={labelCls}>Modalità</label>
              <div className="space-y-2">
                {MODES.map(m => (
                  <label key={m.id} className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer border transition-colors ${
                    form.mode === m.id ? 'border-blue-500/50 bg-blue-500/5' : 'border-slate-800 hover:border-slate-700'
                  }`}>
                    <input type="radio" name="mode" value={m.id} checked={form.mode === m.id}
                      onChange={handle} className="accent-blue-500 flex-shrink-0" />
                    <div>
                      <p className="text-white text-sm font-semibold">{m.label}</p>
                      <p className="text-slate-400 text-xs">{m.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {error && <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-red-400 text-sm">⚠ {error}</div>}

            <button onClick={loadPreview} disabled={loading || !file || !form.connection_id || !form.library || !form.table_name}
              className="w-full bg-blue-500 hover:bg-blue-600 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold py-3 rounded-xl transition-colors text-sm">
              {loading ? '⏳ Lettura file...' : 'Anteprima & Mappa Colonne →'}
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 2: Preview + Mapping ─────────────────────────────────────── */}
      {step === 2 && preview && (
        <div className="space-y-5">
          {/* Info file + sheet selector */}
          <div className="bg-[#151824] border border-slate-800 rounded-2xl p-6">
            <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
              <div>
                <p className="text-xs font-semibold text-blue-400 uppercase tracking-widest">Anteprima File</p>
                <p className="text-slate-400 text-xs mt-0.5">
                  {preview.filename} —{' '}
                  <span className="text-white font-semibold">{preview.total_rows?.toLocaleString()}</span> righe totali · prime 10 mostrate
                </p>
                <div className="flex gap-2 mt-2 flex-wrap">
                  {preview.format && (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-mono font-semibold ${FORMAT_COLORS[preview.format] || 'bg-slate-700 text-slate-300'}`}>
                      {preview.format}
                    </span>
                  )}
                  {preview.encoding && preview.format !== 'excel' && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700 text-slate-400 font-mono">
                      {preview.encoding}
                    </span>
                  )}
                  {preview.separator && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700 text-slate-400 font-mono">
                      sep: {preview.separator === '\t' ? 'TAB' : `"${preview.separator}"`}
                    </span>
                  )}
                </div>
              </div>

              {/* Sheet selector (Excel multi-foglio) */}
              {preview.sheets?.length > 1 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">Foglio:</span>
                  <select
                    value={fileOptions.sheet ?? 0}
                    onChange={e => onSheetChange(e.target.value)}
                    className="bg-[#252838] border border-slate-700 rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none focus:border-blue-500"
                  >
                    {preview.sheets.map((s, i) => (
                      <option key={i} value={s}>{s}</option>
                    ))}
                  </select>
                  {loading && <span className="text-blue-400 text-xs animate-pulse">Aggiorno...</span>}
                </div>
              )}
            </div>

            <div className="overflow-auto max-h-52 rounded-xl border border-slate-700">
              <table className="w-full text-xs">
                <thead className="bg-[#252838] sticky top-0">
                  <tr>
                    {preview.headers.map(h => (
                      <th key={h} className="text-left text-slate-400 font-semibold uppercase tracking-wider px-3 py-2.5 border-b border-slate-700 whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.preview.map((row, i) => (
                    <tr key={i} className={i % 2 === 0 ? 'bg-[#0d0f1a]' : 'bg-[#111320]'}>
                      {preview.headers.map(h => (
                        <td key={h} className="px-3 py-2 text-slate-300 border-b border-slate-800 max-w-[160px] truncate">
                          {row[h] != null && row[h] !== '' ? row[h] : <span className="text-slate-600 italic">vuoto</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mapping colonne */}
          <div className="bg-[#151824] border border-slate-800 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-xs font-semibold text-blue-400 uppercase tracking-widest">Mappatura Colonne</p>
                <p className="text-slate-400 text-xs mt-0.5">
                  <span className="text-white font-semibold">{includedCount}</span> di {mapping.length} colonne selezionate
                </p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => toggleAll(true)}
                  className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-lg transition-colors">
                  Seleziona tutto
                </button>
                <button onClick={() => toggleAll(false)}
                  className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-lg transition-colors">
                  Deseleziona
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-slate-700 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-[#252838]">
                  <tr>
                    <th className="text-left text-slate-400 font-semibold text-xs uppercase tracking-wider px-4 py-2.5 border-b border-slate-700 w-8">Inc.</th>
                    <th className="text-left text-slate-400 font-semibold text-xs uppercase tracking-wider px-4 py-2.5 border-b border-slate-700">Colonna nel file</th>
                    <th className="text-left text-slate-400 font-semibold text-xs uppercase tracking-wider px-4 py-2.5 border-b border-slate-700">Tipo rilevato</th>
                    <th className="text-left text-slate-400 font-semibold text-xs uppercase tracking-wider px-4 py-2.5 border-b border-slate-700">→</th>
                    <th className="text-left text-slate-400 font-semibold text-xs uppercase tracking-wider px-4 py-2.5 border-b border-slate-700">
                      Colonna AS400 <span className="text-slate-600 normal-case font-normal">(max 10 car.)</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {mapping.map((col, i) => (
                    <tr key={i} className={`border-b border-slate-800 ${!col.include ? 'opacity-40' : ''}`}>
                      <td className="px-4 py-2.5 text-center">
                        <input type="checkbox" checked={col.include}
                          onChange={e => updateMapping(i, 'include', e.target.checked)}
                          className="accent-blue-500 w-4 h-4 cursor-pointer" />
                      </td>
                      <td className="px-4 py-2.5 font-mono text-slate-300 text-xs">{col.file_col}</td>
                      <td className="px-4 py-2.5">
                        {col.type && (
                          <span className={`text-xs px-2 py-0.5 rounded font-mono ${TYPE_COLORS[col.type] || 'bg-slate-700 text-slate-400'}`}>
                            {col.type}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-slate-600">→</td>
                      <td className="px-4 py-2">
                        <input
                          value={col.as400_col}
                          onChange={e => updateMapping(i, 'as400_col', e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '').slice(0, 10))}
                          disabled={!col.include}
                          className="bg-[#252838] border border-slate-700 rounded-lg px-3 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-blue-500 w-36 disabled:opacity-40"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {error && <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-red-400 text-sm">⚠ {error}</div>}

          <div className="flex gap-3">
            <button onClick={() => setStep(1)}
              className="bg-slate-800 hover:bg-slate-700 text-white font-semibold px-6 py-3 rounded-xl text-sm transition-colors">
              ← Indietro
            </button>
            <button onClick={startImport} disabled={loading || includedCount === 0}
              className="flex-1 bg-green-500 hover:bg-green-600 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold py-3 rounded-xl transition-colors text-sm">
              {loading ? '⏳ Avvio...' : `▶ Avvia Import — ${preview.total_rows?.toLocaleString()} righe · ${includedCount} colonne`}
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 3: Progress + Log ────────────────────────────────────────── */}
      {step === 3 && status && (
        <div className="space-y-5">
          <div className="bg-[#151824] border border-slate-800 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-white font-semibold">
                {status.status === 'running'   ? '⏳ Import in corso...' :
                 status.status === 'completed' ? '✓ Import completato' :
                                                 '✕ Import fallito'}
              </p>
              {status.total_rows && (
                <span className="text-slate-400 text-sm">
                  {status.rows_count?.toLocaleString()} / {status.total_rows?.toLocaleString()} righe
                </span>
              )}
            </div>
            <div className="h-3 bg-slate-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  status.status === 'completed' ? 'bg-green-500' :
                  status.status === 'failed'    ? 'bg-red-500'   : 'bg-blue-500'
                }`}
                style={{ width: `${status.progress ?? 0}%` }}
              />
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="bg-slate-800/50 rounded-xl p-3">
                <div className="text-xl font-bold text-green-400">{status.rows_count?.toLocaleString() ?? 0}</div>
                <div className="text-slate-400 text-xs mt-0.5">Righe inserite</div>
              </div>
              <div className="bg-slate-800/50 rounded-xl p-3">
                <div className="text-xl font-bold text-red-400">{status.rows_error?.toLocaleString() ?? 0}</div>
                <div className="text-slate-400 text-xs mt-0.5">Errori</div>
              </div>
              <div className="bg-slate-800/50 rounded-xl p-3">
                <div className="text-xl font-bold text-blue-400">{status.progress ?? 0}%</div>
                <div className="text-slate-400 text-xs mt-0.5">Completato</div>
              </div>
            </div>
            {status.error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-red-400 text-sm font-mono break-all">
                {status.error}
              </div>
            )}
          </div>

          {status.log?.length > 0 && (
            <div className="bg-[#111320] border border-slate-800 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-red-400 uppercase tracking-widest">
                  Log Errori ({status.log.length})
                </p>
                <button
                  onClick={() => {
                    const csv = 'Riga,Errore\n' + status.log.map(l => `${l.row},"${l.msg}"`).join('\n')
                    const a = document.createElement('a')
                    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
                    a.download = `errori_import_${new Date().toISOString().slice(0,10)}.csv`
                    a.click()
                  }}
                  className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-lg transition-colors"
                >
                  ↓ Scarica CSV errori
                </button>
              </div>
              <div className="max-h-48 overflow-y-auto font-mono text-xs space-y-1">
                {status.log.map((l, i) => (
                  <div key={i} className="flex gap-3 text-red-400">
                    <span className="text-slate-600 flex-shrink-0">Riga {l.row}</span>
                    <span className="break-all">{l.msg}</span>
                  </div>
                ))}
                <div ref={logEndRef} />
              </div>
            </div>
          )}

          {(status.status === 'completed' || status.status === 'failed') && (
            <div className="flex gap-3">
              <button onClick={reset}
                className="flex-1 bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 rounded-xl transition-colors text-sm">
                Nuovo Import
              </button>
              <a href="/history"
                className="bg-slate-800 hover:bg-slate-700 text-white font-semibold px-6 py-3 rounded-xl text-sm transition-colors">
                Vedi Storico →
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
