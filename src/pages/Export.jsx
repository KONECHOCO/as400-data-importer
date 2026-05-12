import { useState, useEffect } from 'react'
import { connectionsApi, queriesApi } from '../services/api'
import api from '../services/api'

const DEFAULT_SQL = 'SELECT * FROM MYLIB.TABELLA'

const TEMPLATES = [
  { label: '↺ Azzera',   action: 'reset'  },
  { label: 'WHERE',      action: 'append', snippet: " WHERE CAMPO = 'VALORE'" },
  { label: 'COUNT',      action: 'append', snippet: ', COUNT(*) as TOT' },
  { label: 'GROUP BY',   action: 'append', snippet: ' GROUP BY CAMPO ORDER BY TOT DESC' },
  { label: 'FETCH 100',  action: 'fetch',  snippet: 'FETCH FIRST 100 ROWS ONLY' },
  { label: 'FETCH 1000', action: 'fetch',  snippet: 'FETCH FIRST 1000 ROWS ONLY' },
]

const FORMATS = [
  { id: 'xlsx', label: 'Excel',  icon: '📊', ext: '.xlsx' },
  { id: 'csv',  label: 'CSV',    icon: '📄', ext: '.csv'  },
  { id: 'tsv',  label: 'TSV',    icon: '📄', ext: '.tsv'  },
  { id: 'json', label: 'JSON',   icon: '{}', ext: '.json' },
  { id: 'xml',  label: 'XML',    icon: '</>', ext: '.xml'  },
  { id: 'pdf',  label: 'PDF',    icon: '📕', ext: '.pdf'  },
]

const FMT_OPTIONS = [
  { value: '',      label: '— nessuno' },
  { value: 'upper', label: 'MAIUSCOLO' },
  { value: 'lower', label: 'minuscolo' },
  { value: 'trim',  label: 'Trim spazi' },
]

function buildColConfig(col) {
  const fmtMap = {
    upper: { fmt_type: 'text', fmt_options: { uppercase: true, trim: true } },
    lower: { fmt_type: 'text', fmt_options: { lowercase: true, trim: true } },
    trim:  { fmt_type: 'text', fmt_options: { trim: true } },
  }
  const fmt = fmtMap[col._fmtSelect] || { fmt_type: '', fmt_options: {} }
  return {
    as400_col:   col.as400_col,
    label:       col.label || col.as400_col,
    include:     col.include,
    order:       col.order,
    fmt_type:    fmt.fmt_type,
    fmt_options: fmt.fmt_options,
  }
}

export default function Export() {
  const [conns, setConns]         = useState([])
  const [connId, setConnId]       = useState('')
  const [sql, setSql]             = useState('')
  const [limit, setLimit]         = useState(1000)
  const [useLimit, setUseLimit]   = useState(true)
  const [loading, setLoading]     = useState(false)
  const [results, setResults]     = useState(null)
  const [querySql, setQuerySql]   = useState('')
  const [error, setError]         = useState('')

  const [savedQueries, setSavedQueries] = useState([])
  const [showSaved, setShowSaved]       = useState(false)
  const [saveName, setSaveName]         = useState('')
  const [showSaveForm, setShowSaveForm] = useState(false)

  // Column configurator
  const [colConfigs, setColConfigs] = useState([])
  const [dragIdx, setDragIdx]       = useState(null)
  const [dragOverIdx, setDragOverIdx] = useState(null)

  // Export
  const applyTemplate = (t) => {
    if (t.action === 'reset') {
      setSql(DEFAULT_SQL)
    } else if (t.action === 'append') {
      setSql(prev => prev.trim() + t.snippet)
    } else if (t.action === 'fetch') {
      setSql(prev => {
        if (/FETCH FIRST \d+ ROWS ONLY/i.test(prev)) {
          return prev.replace(/FETCH FIRST \d+ ROWS ONLY/i, t.snippet)
        }
        return prev.trim() + ' ' + t.snippet
      })
    }
  }

  const [fmt, setFmt]               = useState('xlsx')
  const [downloading, setDownloading] = useState(false)
  const [sendEmail, setSendEmail]     = useState(true)
  const [downloadDone, setDownloadDone] = useState(null) // {path, filename}

  useEffect(() => {
    connectionsApi.list().then(r => setConns(r.data))
    queriesApi.list().then(r => setSavedQueries(r.data))
  }, [])

  // ── Query ─────────────────────────────────────────────────────────────────
  const runQuery = async () => {
    if (!connId || !sql.trim()) return
    setLoading(true); setError(''); setResults(null); setColConfigs([])

    let query = sql.trim()
    const hasLimit = query.toUpperCase().includes('FETCH FIRST')
    if (useLimit && !hasLimit) query += ` FETCH FIRST ${limit} ROWS ONLY`

    setQuerySql(sql.trim())

    try {
      const res = await api.post('/api/query', { connection_id: connId, sql: query, limit })
      setResults(res.data)
      if (res.data.columns?.length) {
        setColConfigs(res.data.columns.map((col, i) => ({
          as400_col: col, label: col, include: true,
          order: i, _fmtSelect: '',
        })))
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Errore query')
    } finally { setLoading(false) }
  }

  const saveQuery = async () => {
    if (!saveName.trim() || !sql.trim()) return
    await queriesApi.save({ name: saveName, sql, connection_id: connId })
    const r = await queriesApi.list(); setSavedQueries(r.data)
    setShowSaveForm(false); setSaveName('')
  }

  // ── Drag & drop ───────────────────────────────────────────────────────────
  const onDragStart = (e, i) => {
    setDragIdx(i)
    e.dataTransfer.effectAllowed = 'move'
  }
  const onDragOver = (e, i) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (i !== dragOverIdx) setDragOverIdx(i)
  }
  const onDrop = (e, i) => {
    e.preventDefault()
    if (dragIdx === null || dragIdx === i) { setDragIdx(null); setDragOverIdx(null); return }
    const arr = [...colConfigs]
    const [moved] = arr.splice(dragIdx, 1)
    arr.splice(i, 0, moved)
    setColConfigs(arr.map((c, idx) => ({ ...c, order: idx })))
    setDragIdx(null); setDragOverIdx(null)
  }
  const onDragEnd = () => { setDragIdx(null); setDragOverIdx(null) }

  const updateCol = (i, field, val) =>
    setColConfigs(cs => cs.map((c, idx) => idx === i ? { ...c, [field]: val } : c))
  const toggleAll = (include) =>
    setColConfigs(cs => cs.map(c => ({ ...c, include })))

  const includedCount = colConfigs.filter(c => c.include).length

  // ── Download ──────────────────────────────────────────────────────────────
  const isDesktop = typeof window !== 'undefined' && !!window.pywebview

  const downloadExport = async () => {
    if (!results) return
    setDownloading(true); setError(''); setDownloadDone(null)
    try {
      const fd = new FormData()
      fd.append('connection_id', connId)
      fd.append('sql', querySql)
      fd.append('fmt', fmt)
      fd.append('send_email', sendEmail ? '1' : '0')
      fd.append('col_configs', JSON.stringify(colConfigs.filter(c => c.include).map(buildColConfig)))

      const res = await api.post('/api/export/download', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        responseType: 'blob',
      })

      const cd = res.headers['content-disposition'] || ''
      const fname = cd.match(/filename="?([^"]+)"?/)?.[1]
        || `export_${new Date().toISOString().slice(0, 10)}.${fmt}`

      if (isDesktop && window.pywebview?.api?.save_file) {
        // ── App desktop: dialog di salvataggio nativa Windows ──
        const reader = new FileReader()
        reader.onloadend = async () => {
          const b64 = reader.result.split(',')[1]
          const result = await window.pywebview.api.save_file(fname, b64)
          if (result.ok) {
            setDownloadDone({ path: result.path, filename: result.filename })
          } else if (result.msg !== 'Annullato') {
            setError('Errore salvataggio: ' + result.msg)
          }
          setDownloading(false)
        }
        reader.readAsDataURL(res.data)
        return // setDownloading verrà chiamato nel callback
      } else {
        // ── Browser normale ──
        const url = URL.createObjectURL(res.data)
        const a = document.createElement('a')
        a.href = url; a.download = fname; a.click()
        URL.revokeObjectURL(url)
        setDownloadDone({ filename: fname })
      }
    } catch (err) {
      let msg = 'Errore durante il download'
      try {
        if (err.response?.data instanceof Blob) {
          const text = await err.response.data.text()
          try { msg = JSON.parse(text)?.detail || msg } catch { msg = text.slice(0, 200) || msg }
        } else if (err.response?.data?.detail) {
          msg = err.response.data.detail
        } else if (err.message) {
          msg = err.message
        }
      } catch { /* keep default msg */ }
      setError(msg)
    } finally {
      if (!isDesktop || !window.pywebview?.api?.save_file) setDownloading(false)
    }
  }

  const inputCls = "w-full bg-[#252838] border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"

  return (
    <div className="space-y-5">

      {/* ── Query panel ──────────────────────────────────────────────────── */}
      <div className="bg-[#151824] border border-slate-800 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs font-semibold text-blue-400 uppercase tracking-widest">Query SQL</p>
          <div className="flex gap-2">
            <button onClick={() => setShowSaved(s => !s)}
              className="text-slate-400 hover:text-white text-xs bg-slate-800 px-3 py-1.5 rounded-lg transition-colors">
              Salvate ({savedQueries.length})
            </button>
            <button onClick={() => setShowSaveForm(s => !s)}
              className="text-slate-400 hover:text-white text-xs bg-slate-800 px-3 py-1.5 rounded-lg transition-colors">
              + Salva
            </button>
          </div>
        </div>

        {showSaved && (
          <div className="mb-4 bg-[#0d0f1a] border border-slate-800 rounded-xl p-3 max-h-40 overflow-y-auto space-y-1">
            {savedQueries.length === 0
              ? <p className="text-slate-500 text-xs">Nessuna query salvata</p>
              : savedQueries.map(q => (
                <div key={q.id} className="flex items-center gap-2">
                  <button onClick={() => { setSql(q.sql_query || q.sql || ''); setShowSaved(false) }}
                    className="flex-1 text-left text-slate-300 hover:text-white text-xs p-2 rounded-lg hover:bg-slate-800 transition-colors">
                    {q.name}
                  </button>
                  <button onClick={async () => { await queriesApi.delete(q.id); const r = await queriesApi.list(); setSavedQueries(r.data) }}
                    className="text-slate-600 hover:text-red-400 text-xs px-1">✕</button>
                </div>
              ))}
          </div>
        )}

        <select value={connId} onChange={e => setConnId(e.target.value)} className={inputCls + ' mb-3'}>
          <option value="">Seleziona connessione AS/400...</option>
          {conns.map(c => <option key={c.id} value={c.id}>{c.name} ({c.host})</option>)}
        </select>

        <textarea
          value={sql}
          onChange={e => setSql(e.target.value)}
          onKeyDown={e => { if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); runQuery() } }}
          rows={5}
          placeholder={DEFAULT_SQL}
          className="w-full bg-[#0d0f1a] border border-slate-700 rounded-xl px-4 py-3 text-white text-sm font-mono focus:outline-none focus:border-blue-500 mb-3 resize-none"
        />

        <div className="flex gap-2 flex-wrap mb-4">
          {TEMPLATES.map(t => (
            <button key={t.label} onClick={() => applyTemplate(t)}
              className={`text-xs px-3 py-1.5 rounded-lg transition-colors font-mono ${
                t.action === 'reset'
                  ? 'bg-slate-700 hover:bg-red-900/40 text-slate-400 hover:text-red-400'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-blue-400'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3 mb-4">
          <input type="checkbox" id="limitChk" checked={useLimit} onChange={e => setUseLimit(e.target.checked)} className="accent-blue-500" />
          <label htmlFor="limitChk" className="text-slate-400 text-sm">Anteprima limitata a</label>
          <input type="number" value={limit} onChange={e => setLimit(e.target.value)}
            className="w-24 bg-[#252838] border border-slate-700 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-blue-500" />
          <span className="text-slate-400 text-sm">righe</span>
          <span className="text-slate-600 text-xs">(il download scarica tutto)</span>
        </div>

        {showSaveForm && (
          <div className="flex gap-2 mb-4">
            <input value={saveName} onChange={e => setSaveName(e.target.value)} placeholder="Nome query..."
              className="flex-1 bg-[#252838] border border-slate-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500" />
            <button onClick={saveQuery} className="bg-blue-500 hover:bg-blue-600 text-white text-sm px-4 py-2.5 rounded-xl transition-colors">Salva</button>
          </div>
        )}

        <div className="flex items-center gap-3">
          <button onClick={runQuery} disabled={loading || !connId || !sql.trim()}
            className="flex-1 bg-blue-500 hover:bg-blue-600 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold py-3 rounded-xl transition-colors text-sm">
            {loading ? '⏳ Esecuzione...' : '⚡ Esegui Query'}
          </button>
          <span className="text-slate-600 text-xs">Ctrl+Invio</span>
        </div>

        {error && <div className="mt-3 bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-red-400 text-sm">{error}</div>}
      </div>

      {/* ── Results preview ──────────────────────────────────────────────── */}
      {results && (
        <div className="bg-[#151824] border border-slate-800 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-blue-400 uppercase tracking-widest">
              Anteprima — <span className="text-green-400">{results.rows?.toLocaleString()} righe</span>
            </p>
          </div>
          {results.rows > 50 && (
            <p className="text-slate-500 text-xs mb-3">
              Mostrate prime 50 righe · il download include tutte le {results.rows?.toLocaleString()} righe
            </p>
          )}
          <div className="overflow-auto max-h-72 rounded-xl border border-slate-700">
            {results.data?.length > 0 ? (
              <table className="w-full text-xs">
                <thead className="bg-[#252838] sticky top-0">
                  <tr>
                    {Object.keys(results.data[0]).map(col => (
                      <th key={col} className="text-left text-slate-400 font-semibold uppercase tracking-wider px-4 py-3 border-b border-slate-700 whitespace-nowrap">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {results.data.slice(0, 50).map((row, i) => (
                    <tr key={i} className={i % 2 === 0 ? 'bg-[#0d0f1a]' : 'bg-[#111320]'}>
                      {Object.values(row).map((val, j) => (
                        <td key={j} className="px-4 py-2.5 text-slate-300 border-b border-slate-800 max-w-xs truncate">
                          {val != null && val !== '' ? val : <span className="text-slate-600">null</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-slate-500 text-sm p-4">Nessun risultato</p>
            )}
          </div>
        </div>
      )}

      {/* ── Column configurator ──────────────────────────────────────────── */}
      {colConfigs.length > 0 && (
        <div className="bg-[#151824] border border-slate-800 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-xs font-semibold text-blue-400 uppercase tracking-widest">Configurazione Colonne</p>
              <p className="text-slate-400 text-xs mt-0.5">
                <span className="text-white font-semibold">{includedCount}</span> di {colConfigs.length} colonne ·
                {' '}<span className="text-slate-500">trascina ⠿ per riordinare</span>
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => toggleAll(true)}
                className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-lg transition-colors">
                Tutto
              </button>
              <button onClick={() => toggleAll(false)}
                className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-lg transition-colors">
                Niente
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-700 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[#252838]">
                <tr>
                  <th className="px-2 py-2.5 border-b border-slate-700 w-8"></th>
                  <th className="text-left text-slate-400 font-semibold text-xs uppercase tracking-wider px-2 py-2.5 border-b border-slate-700 w-8">Inc.</th>
                  <th className="text-left text-slate-400 font-semibold text-xs uppercase tracking-wider px-3 py-2.5 border-b border-slate-700">Colonna AS400</th>
                  <th className="text-slate-400 text-xs px-2 py-2.5 border-b border-slate-700">→</th>
                  <th className="text-left text-slate-400 font-semibold text-xs uppercase tracking-wider px-3 py-2.5 border-b border-slate-700">Intestazione output</th>
                  <th className="text-left text-slate-400 font-semibold text-xs uppercase tracking-wider px-3 py-2.5 border-b border-slate-700">Formato testo</th>
                </tr>
              </thead>
              <tbody>
                {colConfigs.map((col, i) => (
                  <tr
                    key={col.as400_col + i}
                    draggable
                    onDragStart={e => onDragStart(e, i)}
                    onDragOver={e => onDragOver(e, i)}
                    onDrop={e => onDrop(e, i)}
                    onDragEnd={onDragEnd}
                    className={`border-b border-slate-800 transition-colors select-none ${
                      !col.include ? 'opacity-40' : ''
                    } ${dragOverIdx === i && dragIdx !== i ? 'bg-blue-500/10 border-t-2 border-t-blue-500' : ''
                    } ${dragIdx === i ? 'opacity-50' : ''}`}
                  >
                    <td className="px-2 py-2.5 text-center cursor-grab text-slate-500 hover:text-slate-300 text-base">
                      ⠿
                    </td>
                    <td className="px-2 py-2.5 text-center">
                      <input type="checkbox" checked={col.include}
                        onChange={e => updateCol(i, 'include', e.target.checked)}
                        className="accent-blue-500 w-4 h-4 cursor-pointer" />
                    </td>
                    <td className="px-3 py-2.5 font-mono text-slate-300 text-xs whitespace-nowrap">
                      {col.as400_col}
                    </td>
                    <td className="px-2 py-2.5 text-slate-600 text-xs text-center">→</td>
                    <td className="px-3 py-2">
                      <input
                        value={col.label}
                        onChange={e => updateCol(i, 'label', e.target.value)}
                        disabled={!col.include}
                        placeholder={col.as400_col}
                        className="bg-[#252838] border border-slate-700 rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none focus:border-blue-500 w-44 disabled:opacity-40"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={col._fmtSelect}
                        onChange={e => updateCol(i, '_fmtSelect', e.target.value)}
                        disabled={!col.include}
                        className="bg-[#252838] border border-slate-700 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-blue-500 disabled:opacity-40"
                      >
                        {FMT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Format & Download ─────────────────────────────────────────────── */}
      {results && (
        <div className="bg-[#151824] border border-slate-800 rounded-2xl p-6">
          <p className="text-xs font-semibold text-blue-400 uppercase tracking-widest mb-4">Formato & Download</p>

          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-5">
            {FORMATS.map(f => (
              <button
                key={f.id}
                onClick={() => setFmt(f.id)}
                className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all text-xs font-bold ${
                  fmt === f.id
                    ? 'border-blue-500 bg-blue-500/10 text-white scale-105'
                    : 'border-slate-700 hover:border-slate-500 text-slate-400 hover:text-white'
                }`}
              >
                <span className="text-lg">{f.icon}</span>
                <span>{f.label}</span>
                <span className="text-slate-500 font-normal text-xs">{f.ext}</span>
              </button>
            ))}
          </div>

          {error && <div className="mb-4 bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-red-400 text-sm">{error}</div>}

          {/* Notifica download completato */}
          {downloadDone && (
            <div className="mb-4 bg-green-500/10 border border-green-500/20 rounded-xl p-3 flex items-center gap-3">
              <span className="text-green-400 text-lg">✓</span>
              <div className="flex-1">
                <p className="text-green-400 text-sm font-semibold">File salvato con successo!</p>
                {downloadDone.path && (
                  <p className="text-slate-400 text-xs mt-0.5 truncate">{downloadDone.path}</p>
                )}
                {sendEmail && (
                  <p className="text-blue-400 text-xs mt-0.5">📧 File inviato anche via email</p>
                )}
              </div>
              <button onClick={() => setDownloadDone(null)} className="text-slate-600 hover:text-slate-400 text-sm">✕</button>
            </div>
          )}

          {/* Toggle invio email */}
          <div className="flex items-center gap-3 mb-4 bg-slate-800/50 rounded-xl px-4 py-3">
            <input
              type="checkbox"
              id="sendEmailChk"
              checked={sendEmail}
              onChange={e => setSendEmail(e.target.checked)}
              className="accent-blue-500 w-4 h-4 cursor-pointer"
            />
            <label htmlFor="sendEmailChk" className="text-slate-300 text-sm cursor-pointer select-none">
              Invia il file anche via email al termine del download
            </label>
            <span className="ml-auto text-xs text-slate-500">📧</span>
          </div>

          <button
            onClick={downloadExport}
            disabled={downloading || includedCount === 0}
            className="w-full bg-green-500 hover:bg-green-600 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold py-3.5 rounded-xl transition-colors text-sm"
          >
            {downloading
              ? '⏳ Download in corso...'
              : `↓ Scarica ${fmt.toUpperCase()} — ${includedCount} colonne · ${results.rows?.toLocaleString()} righe totali`}
          </button>

          <p className="text-slate-600 text-xs mt-2 text-center">
            Il download riesegue la query senza limiti · rimuovi FETCH FIRST per esportare tutto
          </p>
        </div>
      )}
    </div>
  )
}
