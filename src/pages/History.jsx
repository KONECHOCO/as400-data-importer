import { useState, useEffect } from 'react'
import { operationsApi } from '../services/api'

export default function History() {
  const [ops, setOps] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    operationsApi.list().then(r => setOps(r.data)).finally(() => setLoading(false))
  }, [])

  const filtered = filter === 'all' ? ops : ops.filter(o => o.type === filter)

  const statusColors = {
    completed: 'bg-green-500/10 text-green-400',
    failed: 'bg-red-500/10 text-red-400',
    running: 'bg-blue-500/10 text-blue-400',
    pending: 'bg-amber-500/10 text-amber-400',
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Storico Operazioni</h2>
          <p className="text-slate-400 text-sm mt-0.5">{ops.length} operazioni totali</p>
        </div>
        <div className="flex gap-2">
          {['all', 'import', 'export'].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`text-xs px-3 py-1.5 rounded-lg capitalize transition-colors ${filter === f ? 'bg-blue-500 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}>
              {f === 'all' ? 'Tutte' : f}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-slate-500">Caricamento...</p>
      ) : filtered.length === 0 ? (
        <div className="bg-[#151824] border border-slate-800 rounded-2xl p-12 text-center">
          <div className="text-4xl mb-3">◷</div>
          <p className="text-white font-semibold">Nessuna operazione</p>
          <p className="text-slate-400 text-sm mt-1">Le operazioni di import ed export appariranno qui</p>
        </div>
      ) : (
        <div className="bg-[#151824] border border-slate-800 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[#111320] border-b border-slate-800">
              <tr>
                <th className="text-left text-slate-400 font-semibold text-xs uppercase tracking-wider px-5 py-3">Tipo</th>
                <th className="text-left text-slate-400 font-semibold text-xs uppercase tracking-wider px-5 py-3">File / Query</th>
                <th className="text-left text-slate-400 font-semibold text-xs uppercase tracking-wider px-5 py-3">Righe</th>
                <th className="text-left text-slate-400 font-semibold text-xs uppercase tracking-wider px-5 py-3">Stato</th>
                <th className="text-left text-slate-400 font-semibold text-xs uppercase tracking-wider px-5 py-3">Data</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((op, i) => (
                <tr key={op.id || i} className={`border-b border-slate-800 hover:bg-slate-800/30 transition-colors ${i % 2 === 0 ? '' : 'bg-[#111320]/30'}`}>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${op.type === 'import' ? 'text-blue-400' : 'text-green-400'}`}>
                      {op.type === 'import' ? '↑' : '↓'} {op.type}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 max-w-xs">
                    <p className="text-white text-xs truncate">{op.filename || op.sql?.slice(0, 60) || '-'}</p>
                    {op.table_name && <p className="text-slate-500 text-xs">{op.library}.{op.table_name}</p>}
                  </td>
                  <td className="px-5 py-3.5 text-white text-xs">{op.rows_count?.toLocaleString() || 0}</td>
                  <td className="px-5 py-3.5">
                    <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${statusColors[op.status] || 'bg-slate-700 text-slate-400'}`}>
                      {op.status}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-slate-400 text-xs">
                    {op.created_at ? new Date(op.created_at).toLocaleString('it-IT') : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
