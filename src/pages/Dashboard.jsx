import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { operationsApi, connectionsApi } from '../services/api'

export default function Dashboard() {
  const { user, getTrialDaysLeft } = useAuth()
  const [ops, setOps] = useState([])
  const [conns, setConns] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      operationsApi.list(),
      connectionsApi.list()
    ]).then(([opsRes, connsRes]) => {
      setOps(opsRes.data.slice(0, 5))
      setConns(connsRes.data)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const importOps = ops.filter(o => o.type === 'import')
  const exportOps = ops.filter(o => o.type === 'export')
  const totalRows = ops.reduce((sum, o) => sum + (o.rows_count || 0), 0)
  const trialDays = getTrialDaysLeft()

  const cards = [
    { label: 'Connessioni AS/400', value: conns.length, icon: '⚡', color: 'blue', link: '/connections' },
    { label: 'Import eseguiti', value: importOps.length, icon: '↑', color: 'green', link: '/import' },
    { label: 'Export eseguiti', value: exportOps.length, icon: '↓', color: 'purple', link: '/export' },
    { label: 'Righe elaborate', value: totalRows.toLocaleString(), icon: '◈', color: 'cyan', link: '/history' },
  ]

  const colorMap = {
    blue: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    green: 'bg-green-500/10 text-green-400 border-green-500/20',
    purple: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    cyan: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  }

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Ciao, {user?.name?.split(' ')[0]}! 👋</h2>
          <p className="text-slate-400 text-sm mt-1">{user?.company} — {new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>
        {user?.plan_status === 'trial' && trialDays <= 7 && (
          <Link to="/plans" className="bg-amber-500 hover:bg-amber-600 text-black font-bold px-4 py-2 rounded-xl text-sm transition-colors">
            ⚠ {trialDays} giorni rimasti — Abbonati
          </Link>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-4">
        {cards.map(card => (
          <Link key={card.label} to={card.link} className="block min-w-0">
            <div className={`h-full bg-[#151824] border ${colorMap[card.color]} rounded-2xl p-5 hover:border-opacity-80 transition-colors`}>
              <div className={`text-xl mb-3 w-10 h-10 rounded-xl flex items-center justify-center ${colorMap[card.color]}`}>
                {card.icon}
              </div>
              <div className="text-2xl font-bold text-white truncate">{loading ? '...' : card.value}</div>
              <div className="text-slate-400 text-xs mt-1 leading-snug break-words">{card.label}</div>
            </div>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Quick actions */}
        <div className="bg-[#151824] border border-slate-800 rounded-2xl p-6">
          <h3 className="text-white font-semibold mb-4">Azioni Rapide</h3>
          <div className="space-y-3">
            <Link to="/import" className="flex items-center gap-3 p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl hover:bg-blue-500/15 transition-colors">
              <span className="text-blue-400 text-lg">↑</span>
              <div>
                <p className="text-white text-sm font-semibold">Importa Dati</p>
                <p className="text-slate-400 text-xs">Carica CSV, Excel, XML su AS/400</p>
              </div>
              <span className="ml-auto text-slate-500">→</span>
            </Link>
            <Link to="/export" className="flex items-center gap-3 p-3 bg-green-500/10 border border-green-500/20 rounded-xl hover:bg-green-500/15 transition-colors">
              <span className="text-green-400 text-lg">↓</span>
              <div>
                <p className="text-white text-sm font-semibold">Esporta Dati</p>
                <p className="text-slate-400 text-xs">Query SQL e download file</p>
              </div>
              <span className="ml-auto text-slate-500">→</span>
            </Link>
            <Link to="/connections" className="flex items-center gap-3 p-3 bg-slate-800 border border-slate-700 rounded-xl hover:bg-slate-700 transition-colors">
              <span className="text-slate-400 text-lg">⚡</span>
              <div>
                <p className="text-white text-sm font-semibold">Gestisci Connessioni</p>
                <p className="text-slate-400 text-xs">Aggiungi o modifica AS/400</p>
              </div>
              <span className="ml-auto text-slate-500">→</span>
            </Link>
          </div>
        </div>

        {/* Recent operations */}
        <div className="bg-[#151824] border border-slate-800 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-semibold">Operazioni Recenti</h3>
            <Link to="/history" className="text-blue-400 text-xs hover:underline">Vedi tutto</Link>
          </div>
          {loading ? (
            <p className="text-slate-500 text-sm">Caricamento...</p>
          ) : ops.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-slate-500 text-sm">Nessuna operazione ancora</p>
              <Link to="/import" className="text-blue-400 text-xs hover:underline mt-1 block">Inizia il tuo primo import →</Link>
            </div>
          ) : (
            <div className="space-y-2">
              {ops.map((op, i) => (
                <div key={i} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-800 transition-colors">
                  <span className={`text-sm ${op.type === 'import' ? 'text-blue-400' : 'text-green-400'}`}>
                    {op.type === 'import' ? '↑' : '↓'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-xs font-semibold truncate">
                      {op.filename || op.table_name || 'Query SQL'}
                    </p>
                    <p className="text-slate-500 text-xs">{op.rows_count?.toLocaleString()} righe</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    op.status === 'completed' ? 'bg-green-500/10 text-green-400' :
                    op.status === 'failed' ? 'bg-red-500/10 text-red-400' :
                    'bg-amber-500/10 text-amber-400'
                  }`}>
                    {op.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
