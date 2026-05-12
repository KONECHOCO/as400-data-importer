import { useState, useEffect, useCallback } from "react";
import { adminApi } from "../services/api";
const API_BASE = (import.meta.env.VITE_API_URL || "") + "/api";
function getToken() { return localStorage.getItem("token"); }
function authHeaders() { return { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` }; }
const PLANS = ["trial", "starter", "business", "enterprise"];
const planColors = { starter: { bg: "#E6F1FB", text: "#0C447C", border: "#378ADD" }, pro: { bg: "#EAF3DE", text: "#27500A", border: "#639922" }, enterprise: { bg: "#EEEDFE", text: "#3C3489", border: "#7F77DD" } };
const statusColors = { active: { bg: "#EAF3DE", text: "#27500A" }, expired: { bg: "#FCEBEB", text: "#791F1F" }, revoked: { bg: "#F1EFE8", text: "#444441" } };
function getLicenseStatus(l) { if (l.revoked) return "revoked"; if (l.expires_at && new Date(l.expires_at) < new Date()) return "expired"; return "active"; }
function formatDate(dt) { if (!dt) return "—"; return new Date(dt).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" }); }
function daysLeft(dt) { if (!dt) return null; return Math.ceil((new Date(dt) - new Date()) / 86400000); }
export default function AdminLicenses() {
  const [licenses, setLicenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const [toast, setToast] = useState(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [newLic, setNewLic] = useState({ email: "", user_name: "", company: "", plan: "starter", expires_days: 365, notes: "" });
  const [extendModal, setExtendModal] = useState(null);
  const [extendDays, setExtendDays] = useState(30);
  const showToast = (msg, type = "success") => { setToast({ msg, type }); setTimeout(() => setToast(null), 3500); };
  const fetchLicenses = useCallback(async () => {
    setLoading(true); setError(null);
    try { const r = await fetch(API_BASE + "/admin/licenses", { headers: authHeaders() }); if (!r.ok) throw new Error("Errore " + r.status); setLicenses(await r.json()); }
    catch (e) { setError(e.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { fetchLicenses(); }, [fetchLicenses]);
  const createLicense = async () => {
    if (!newLic.email.trim() || !newLic.email.includes("@")) return showToast("Inserisci un'email valida", "error");
    setActionLoading("create");
    try {
      const r = await fetch(API_BASE + "/admin/issued-licenses", { method: "POST", headers: authHeaders(), body: JSON.stringify({ email: newLic.email.trim(), user_name: newLic.user_name.trim(), company: newLic.company.trim(), plan: newLic.plan, expires_days: Number(newLic.expires_days), notes: newLic.notes }) });
      if (!r.ok) throw new Error(await r.text());
      const d = await r.json(); showToast("Licenza creata: " + d.license_key);
      setShowCreate(false); setNewLic({ email: "", user_name: "", company: "", plan: "starter", expires_days: 365, notes: "" }); await fetchLicenses();
    } catch (e) { showToast(e.message, "error"); } finally { setActionLoading(null); }
  };
  const revokeLicense = async (key) => {
    if (!window.confirm("Revocare " + key + "?")) return; setActionLoading(key + "_r");
    try { const r = await fetch(API_BASE + "/admin/licenses/" + key + "/revoke", { method: "POST", headers: authHeaders() }); if (!r.ok) throw new Error(await r.text()); showToast("Revocata"); await fetchLicenses(); }
    catch (e) { showToast(e.message, "error"); } finally { setActionLoading(null); }
  };
  const resetHardware = async (key) => {
    if (!window.confirm("Reset hardware per " + key + "?")) return; setActionLoading(key + "_hw");
    try { const r = await fetch(API_BASE + "/admin/licenses/" + key + "/reset-hardware", { method: "POST", headers: authHeaders() }); if (!r.ok) throw new Error(await r.text()); showToast("Reset eseguito"); await fetchLicenses(); }
    catch (e) { showToast(e.message, "error"); } finally { setActionLoading(null); }
  };
  const extendLicense = async () => {
    if (!extendModal || !extendDays) return;
    setActionLoading(extendModal + "_ext");
    try {
      await adminApi.extendLicense(extendModal, Number(extendDays));
      showToast("Licenza estesa di " + extendDays + " giorni");
      setExtendModal(null);
      await fetchLicenses();
    } catch (e) { showToast(e.response?.data?.detail || e.message, "error"); }
    finally { setActionLoading(null); }
  };
  const filtered = licenses.filter(l => {
    const s = getLicenseStatus(l); const q = search.toLowerCase();
    return (filterStatus === "all" || s === filterStatus) && (!q || [l.license_key, l.email, l.user_name, l.company, l.hardware_id, l.notes].some(v => (v||"").toLowerCase().includes(q)));
  });
  const stats = { total: licenses.length, active: licenses.filter(l => getLicenseStatus(l)==="active").length, expired: licenses.filter(l => getLicenseStatus(l)==="expired").length, revoked: licenses.filter(l => getLicenseStatus(l)==="revoked").length };
  return (
    <div>
      {toast && <div style={{ position:"fixed", top:20, right:20, zIndex:9999, background: toast.type==="error"?"#FCEBEB":"#EAF3DE", color: toast.type==="error"?"#791F1F":"#27500A", border:"1px solid", borderRadius:10, padding:"12px 20px", fontSize:14, fontWeight:500 }}>{toast.msg}</div>}
      <div className="flex items-center justify-between mb-6">
        <div><h1 className="text-xl font-semibold text-white">Gestione Licenze</h1><p className="text-slate-400 text-sm mt-1">Crea, monitora e gestisci le licenze clienti</p></div>
        <button onClick={() => setShowCreate(true)} className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">+ Nuova licenza</button>
      </div>
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[{label:"Totale",value:stats.total,cls:"text-white"},{label:"Attive",value:stats.active,cls:"text-green-400"},{label:"Scadute",value:stats.expired,cls:"text-red-400"},{label:"Revocate",value:stats.revoked,cls:"text-slate-400"}].map(s => (
          <div key={s.label} className="bg-slate-800/50 rounded-xl p-4 text-center"><div className="text-slate-400 text-xs mb-1">{s.label}</div><div className={"text-3xl font-semibold " + s.cls}>{s.value}</div></div>
        ))}
      </div>
      <div className="flex gap-3 mb-4">
        <input type="text" placeholder="Cerca chiave, cliente, hostname..." value={search} onChange={e => setSearch(e.target.value)} className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500" />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none">
          <option value="all">Tutti</option><option value="active">Attive</option><option value="expired">Scadute</option><option value="revoked">Revocate</option>
        </select>
        <button onClick={fetchLicenses} className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-400 hover:text-white">&#8635;</button>
      </div>
      {loading ? <div className="text-center py-12 text-slate-400">Caricamento...</div>
      : error ? <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">Errore: {error}</div>
      : filtered.length === 0 ? <div className="text-center py-12 text-slate-400 text-sm">Nessuna licenza trovata</div>
      : <div className="space-y-3">{filtered.map(lic => {
          const status = getLicenseStatus(lic); const sc = statusColors[status]; const pc = planColors[lic.plan]||planColors.starter;
          const days = daysLeft(lic.expires_at); const soon = days !== null && days > 0 && days <= 30;
          return (
            <div key={lic._id} className={"bg-slate-800/60 rounded-xl p-4 border " + (soon?"border-amber-500/40":"border-slate-700/50")}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-3">
                    <code className="text-sm font-mono bg-slate-900 px-2 py-0.5 rounded text-blue-300 tracking-wider">{lic.license_key}</code>
                    <button onClick={() => { navigator.clipboard.writeText(lic.license_key); showToast("Copiato!"); }} className="text-slate-500 hover:text-white text-xs">&#8686;</button>
                    <span style={{background:pc.bg,color:pc.text,border:"1px solid "+pc.border}} className="text-xs font-semibold px-2 py-0.5 rounded">{(lic.plan||"").toUpperCase()}</span>
                    <span style={{background:sc.bg,color:sc.text}} className="text-xs font-semibold px-2 py-0.5 rounded">{status==="active"?"Attiva":status==="expired"?"Scaduta":"Revocata"}</span>
                    {soon && <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-500/15 text-amber-400">Scade in {days}gg</span>}
                  </div>
                  <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-sm">
                    {[["Email",lic.email||"—"],["Nome",lic.user_name||"—"],["Azienda",lic.company||"—"],["HW ID",lic.hardware_id||"Non attivata"],["Scadenza",formatDate(lic.expires_at)],["Creata",formatDate(lic.created_at)]].map(([k,v]) => (
                      <div key={k}><span className="text-slate-500">{k}: </span><span className="text-slate-200">{v}</span></div>
                    ))}
                  </div>
                  {lic.notes && <div className="mt-2 text-xs text-slate-500 italic">Note: {lic.notes}</div>}
                  {lic.suspicious_attempts > 0 && <div className="mt-2 text-xs bg-amber-500/10 text-amber-400 px-2 py-1 rounded inline-block">&#9888; {lic.suspicious_attempts} tentativo/i da hardware diverso</div>}
                </div>
                <div className="flex flex-col gap-2 min-w-28">
                  {status !== "revoked" && <button onClick={() => { setExtendModal(lic.license_key); setExtendDays(30); }} className="text-xs px-3 py-1.5 rounded-lg border border-green-500/30 bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors">Estendi</button>}
                  {lic.hardware_id && <button onClick={() => resetHardware(lic.license_key)} disabled={actionLoading===lic.license_key+"_hw"} className="text-xs px-3 py-1.5 rounded-lg border border-blue-500/30 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors">{actionLoading===lic.license_key+"_hw"?"...":"Reset hardware"}</button>}
                  {status !== "revoked" && <button onClick={() => revokeLicense(lic.license_key)} disabled={actionLoading===lic.license_key+"_r"} className="text-xs px-3 py-1.5 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors">{actionLoading===lic.license_key+"_r"?"...":"Revoca"}</button>}
                </div>
              </div>
            </div>
          );
        })}</div>}
      {extendModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-80 max-w-full">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-base font-semibold text-white">Estendi licenza</h2>
              <button onClick={() => setExtendModal(null)} className="text-slate-500 hover:text-white text-xl">&#215;</button>
            </div>
            <code className="text-xs font-mono text-blue-300 bg-slate-800 px-2 py-1 rounded block mb-4 truncate">{extendModal}</code>
            <label className="block text-xs text-slate-400 mb-1.5">Giorni da aggiungere</label>
            <input type="number" min="1" max="3650" value={extendDays} onChange={e => setExtendDays(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-green-500 mb-4" />
            <div className="flex gap-3 justify-end">
              <button onClick={() => setExtendModal(null)} className="px-4 py-2 rounded-lg border border-slate-700 text-slate-300 text-sm hover:bg-slate-800">Annulla</button>
              <button onClick={extendLicense} disabled={actionLoading===extendModal+"_ext"} className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-semibold">
                {actionLoading===extendModal+"_ext"?"Estensione...":"Estendi +"+extendDays+"gg"}
              </button>
            </div>
          </div>
        </div>
      )}
      {showCreate && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-96 max-w-full">
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-lg font-semibold text-white">Nuova licenza</h2>
              <button onClick={() => setShowCreate(false)} className="text-slate-500 hover:text-white text-xl">&#215;</button>
            </div>
            <div className="space-y-4">
              {[{label:"Email cliente *",key:"email",type:"email",ph:"cliente@azienda.it"},{label:"Nome / Ragione sociale",key:"user_name",type:"text",ph:"es. Mario Rossi"},{label:"Azienda",key:"company",type:"text",ph:"es. Rossi SRL"},{label:"Durata (giorni)",key:"expires_days",type:"number",ph:"365"},{label:"Note interne",key:"notes",type:"text",ph:"Opzionale"}].map(f => (
                <div key={f.key}><label className="block text-xs text-slate-400 mb-1.5">{f.label}</label>
                <input type={f.type} placeholder={f.ph} value={newLic[f.key]} onChange={e => setNewLic(p=>({...p,[f.key]:e.target.value}))} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500" /></div>
              ))}
              <div><label className="block text-xs text-slate-400 mb-1.5">Piano</label>
              <select value={newLic.plan} onChange={e => setNewLic(p=>({...p,plan:e.target.value}))} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none">
                {PLANS.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase()+p.slice(1)}</option>)}
              </select></div>
              <div className="bg-slate-800 rounded-lg p-3 text-sm"><span className="text-slate-400">Scade il: </span><span className="text-white font-medium">{formatDate(new Date(Date.now()+Number(newLic.expires_days)*86400000).toISOString())}</span></div>
            </div>
            <div className="flex gap-3 mt-5 justify-end">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 rounded-lg border border-slate-700 text-slate-300 text-sm hover:bg-slate-800">Annulla</button>
              <button onClick={createLicense} disabled={actionLoading==="create"} className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold">{actionLoading==="create"?"Creazione...":"Crea licenza"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
