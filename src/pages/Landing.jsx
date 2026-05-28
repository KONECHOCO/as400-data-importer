import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useEffect } from 'react'

export default function Landing() {
  const { user } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (user) navigate('/dashboard', { replace: true })
  }, [navigate, user])

  return (
    <div className="min-h-screen bg-[#0d0f1a] text-white">

      {/* ── Navbar ── */}
      <header className="border-b border-slate-800/50 sticky top-0 z-50 bg-[#0d0f1a]/90 backdrop-blur">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center gap-8">
          <div className="flex items-center gap-2 mr-6">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-green-500 flex items-center justify-center">
              <span className="text-white font-black text-xs">IK</span>
            </div>
            <div>
              <div className="text-white font-bold text-sm leading-none">ikonet</div>
              <div className="text-blue-400 text-[9px] tracking-widest">SOLUTIONS</div>
            </div>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm text-slate-400">
            <a href="#features" className="hover:text-white transition-colors">Funzionalità</a>
            <a href="#pricing" className="hover:text-white transition-colors">Prezzi</a>
            <a href="#faq" className="hover:text-white transition-colors">FAQ</a>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <Link to="/login" className="text-slate-400 hover:text-white text-sm transition-colors px-3 py-2">
              Accedi
            </Link>
            <Link to="/login"
              className="bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
              Prova Gratis
            </Link>
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="max-w-4xl mx-auto px-6 pt-20 pb-16 text-center">
        <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-full px-4 py-2 text-sm text-blue-300 mb-8">
          <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
          14 giorni di prova gratuita — nessuna carta richiesta
        </div>

        <h1 className="text-5xl md:text-6xl font-black leading-tight mb-6">
          Import ed Export<br />
          <span className="bg-gradient-to-r from-blue-400 to-green-400 bg-clip-text text-transparent">
            AS/400 semplificato
          </span>
        </h1>

        <p className="text-slate-400 text-lg max-w-2xl mx-auto mb-10 leading-relaxed">
          La piattaforma desktop per gestire dati IBM i (AS/400). Import da Excel, CSV, XML —
          Export con query SQL — Nessuna configurazione complessa.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-6">
          <Link to="/login"
            className="bg-blue-500 hover:bg-blue-600 text-white font-bold px-8 py-4 rounded-xl text-base transition-colors">
            Inizia gratis — 14 giorni ✨
          </Link>
          <a href="#pricing"
            className="bg-slate-800 hover:bg-slate-700 text-white font-bold px-8 py-4 rounded-xl text-base transition-colors">
            Vedi i prezzi →
          </a>
        </div>

        <p className="text-slate-600 text-sm">
          ✓ Nessuna carta richiesta &nbsp;·&nbsp; ✓ Annulla quando vuoi &nbsp;·&nbsp; ✓ Setup in 2 minuti
        </p>
      </section>

      {/* ── Features ── */}
      <section id="features" className="max-w-6xl mx-auto px-6 py-16 border-t border-slate-800">
        <h2 className="text-2xl font-bold text-center mb-10">Tutto quello che ti serve</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            { icon: '↑', color: 'blue', title: 'Import Dati', desc: 'Carica file CSV, Excel, XML direttamente sulle tabelle AS/400 in pochi click.' },
            { icon: '↓', color: 'green', title: 'Export SQL', desc: 'Esegui query SQL personalizzate ed esporta i risultati in CSV, Excel, JSON, PDF.' },
            { icon: '⚡', color: 'purple', title: 'Connessioni JDBC', desc: 'Connetti più sistemi AS/400 con driver JT400. SSL supportato.' },
            { icon: '◷', color: 'amber', title: 'Storico operazioni', desc: 'Tieni traccia di ogni import ed export con log dettagliati.' },
            { icon: '✉', color: 'rose', title: 'Notifiche email', desc: 'Ricevi email automatiche a fine import, export e per avvisi licenza.' },
            { icon: '🔒', color: 'slate', title: 'Sicurezza locale', desc: 'I dati rimangono sul tuo dispositivo. Nessun cloud, nessuna esposizione.' },
          ].map(f => (
            <div key={f.title} className="bg-[#151824] border border-slate-800 rounded-2xl p-6">
              <div className={`w-10 h-10 rounded-xl bg-${f.color}-500/10 flex items-center justify-center text-lg mb-4`}>
                {f.icon}
              </div>
              <h3 className="text-white font-semibold mb-2">{f.title}</h3>
              <p className="text-slate-400 text-sm leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="pricing" className="max-w-5xl mx-auto px-6 py-16 border-t border-slate-800">
        <h2 className="text-2xl font-bold text-center mb-3">Piani e prezzi</h2>
        <p className="text-slate-400 text-center text-sm mb-10">Licenza annuale. Pagamento via PayPal.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            { id: 'starter', name: 'Starter', price: 29, color: 'blue',
              features: ['1 connessione AS/400', 'Import fino a 50.000 righe', 'Export CSV ed Excel', '1 utente'] },
            { id: 'business', name: 'Business', price: 79, color: 'purple', popular: true,
              features: ['3 connessioni AS/400', 'Import illimitato', 'Export tutti i formati', '5 utenti', 'Supporto prioritario'] },
            { id: 'enterprise', name: 'Enterprise', price: 149, color: 'amber',
              features: ['Connessioni illimitate', 'Import illimitato', 'Tutti i formati', 'Utenti illimitati', 'Supporto dedicato'] },
          ].map(p => (
            <div key={p.id}
              className={`bg-[#151824] border ${p.popular ? 'border-purple-500/40' : 'border-slate-800'} rounded-2xl p-6 relative`}>
              {p.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="bg-purple-500 text-white text-xs font-bold px-4 py-1 rounded-full">PIÙ POPOLARE</span>
                </div>
              )}
              <p className="text-sm font-bold text-slate-400 mb-2">{p.name}</p>
              <div className="mb-4">
                <span className="text-3xl font-black">{p.price}€</span>
                <span className="text-slate-400 text-sm">/anno</span>
              </div>
              <ul className="space-y-2 mb-6">
                {p.features.map((f, i) => (
                  <li key={i} className="text-slate-300 text-sm flex gap-2">
                    <span className="text-green-400">✓</span>{f}
                  </li>
                ))}
              </ul>
              <Link to="/plans"
                className={`block text-center font-bold py-2.5 rounded-xl text-sm transition-colors ${
                  p.popular ? 'bg-purple-500 hover:bg-purple-600 text-white' : 'bg-slate-700 hover:bg-slate-600 text-white'
                }`}>
                Acquista
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" className="max-w-3xl mx-auto px-6 py-16 border-t border-slate-800">
        <h2 className="text-2xl font-bold text-center mb-10">Domande frequenti</h2>
        <div className="space-y-4">
          {[
            { q: 'Come funziona il periodo di prova?', a: 'Hai 14 giorni gratuiti senza inserire nessuna carta di credito. Puoi usare tutte le funzionalità.' },
            { q: 'Dove vengono salvati i miei dati?', a: 'Tutto rimane sul tuo computer. Nessun dato viene inviato ai nostri server, eccetto per la verifica della licenza.' },
            { q: 'Come attivo la licenza?', a: "Dopo l'acquisto via PayPal ricevi una chiave licenza. Inseriscila nella sezione Abbonamento dell'app." },
            { q: 'Posso installarlo su più computer?', a: "Ogni chiave licenza è associata a un singolo dispositivo. Acquista licenze separate per più PC." },
          ].map(f => (
            <div key={f.q} className="bg-[#151824] border border-slate-800 rounded-xl p-5">
              <p className="text-white font-semibold mb-2">{f.q}</p>
              <p className="text-slate-400 text-sm leading-relaxed">{f.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA finale ── */}
      <section className="max-w-3xl mx-auto px-6 py-16 text-center border-t border-slate-800">
        <h2 className="text-2xl font-bold mb-3">Pronto a iniziare?</h2>
        <p className="text-slate-400 mb-6">14 giorni gratuiti. Nessuna carta richiesta.</p>
        <Link to="/login"
          className="inline-block bg-blue-500 hover:bg-blue-600 text-white font-bold px-8 py-4 rounded-xl transition-colors">
          Inizia gratis →
        </Link>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-slate-800 py-6 text-center text-slate-600 text-xs">
        © 2026 Ikonet Solutions · AS400 Data Importer
      </footer>
    </div>
  )
}
