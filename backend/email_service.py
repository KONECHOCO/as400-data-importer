"""
email_service.py — Invio email via SendGrid HTTP API.
Usa requests (già incluso nel bundle PyInstaller) — nessuna dipendenza aggiuntiva.

Configurazione (env vars o fallback hardcoded):
  SENDGRID_API_KEY  — chiave SendGrid
  APP_BASE_URL      — URL base per i link (default http://localhost:8000)
"""
import os
import json
import threading
from datetime import datetime

try:
    import requests as _requests
except ImportError:
    _requests = None

# ── Configurazione ────────────────────────────────────────────────────────────
SENDGRID_API_KEY = os.environ.get("SENDGRID_API_KEY", "")
FROM_EMAIL = os.environ.get("APP_FROM_EMAIL", "noreply@as400pro.ikonetsolutions.com")
FROM_NAME = os.environ.get("APP_FROM_NAME", "AS400 Data Importer Pro")
APP_BASE_URL = os.environ.get("APP_BASE_URL", "http://localhost:8000")
PUBLIC_SITE_URL = os.environ.get("APP_PUBLIC_SITE_URL", "https://as400pro.ikonetsolutions.com")
SUPPORT_EMAIL = os.environ.get("APP_SUPPORT_EMAIL", "supporto@as400pro.ikonetsolutions.com")

SENDGRID_URL = "https://api.sendgrid.com/v3/mail/send"
DOWNLOAD_URL = os.environ.get("APP_DOWNLOAD_URL", f"{PUBLIC_SITE_URL}/AS400ImporterPro-Setup.exe")


# ── Helper interno ────────────────────────────────────────────────────────────
def _send(to_email: str, to_name: str, subject: str, html: str,
          attachment_content: bytes = None, attachment_name: str = None,
          attachment_mime: str = "application/octet-stream") -> bool:
    """Invia una singola email via SendGrid. Ritorna True se OK."""
    import base64 as _b64
    if not _requests:
        print("[EMAIL] requests non disponibile", flush=True)
        return False
    if not SENDGRID_API_KEY or SENDGRID_API_KEY.startswith("SG.PLACEHOLDER"):
        print("[EMAIL] SENDGRID_API_KEY non configurata", flush=True)
        return False

    payload = {
        "personalizations": [{"to": [{"email": to_email, "name": to_name}]}],
        "from": {"email": FROM_EMAIL, "name": FROM_NAME},
        "subject": subject,
        "content": [{"type": "text/html", "value": html}],
    }

    # Allegato opzionale
    if attachment_content and attachment_name:
        payload["attachments"] = [{
            "content":     _b64.b64encode(attachment_content).decode(),
            "type":        attachment_mime,
            "filename":    attachment_name,
            "disposition": "attachment",
        }]

    try:
        resp = _requests.post(
            SENDGRID_URL,
            headers={
                "Authorization": f"Bearer {SENDGRID_API_KEY}",
                "Content-Type": "application/json",
            },
            data=json.dumps(payload),
            timeout=15,
        )
        if resp.status_code in (200, 202):
            print(f"[EMAIL] Inviata a {to_email} — {subject}", flush=True)
            return True
        print(f"[EMAIL] Errore {resp.status_code}: {resp.text[:200]}", flush=True)
        return False
    except Exception as exc:
        print(f"[EMAIL] Eccezione: {exc}", flush=True)
        return False


def _async(fn, *args):
    """Esegue fn(*args) in un daemon thread (non blocca la risposta HTTP)."""
    threading.Thread(target=fn, args=args, daemon=True).start()


# ── Template base ─────────────────────────────────────────────────────────────
def _wrap(content: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="it">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0d0f1a;font-family:Arial,Helvetica,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:40px 16px">
      <table width="540" cellpadding="0" cellspacing="0"
             style="background:#151824;border:1px solid #1e293b;border-radius:16px;overflow:hidden">
        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#1e3a8a,#166534);padding:28px 36px">
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="background:linear-gradient(135deg,#2563eb,#22c55e);border-radius:10px;
                           padding:10px 16px;font-weight:900;font-size:20px;color:#fff;
                           letter-spacing:1px">IK</td>
                <td style="padding-left:14px">
                  <div style="color:#fff;font-weight:700;font-size:18px;line-height:1.2">ikonet</div>
                  <div style="color:#93c5fd;font-size:10px;letter-spacing:3px">AS400 DATA IMPORTER</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <!-- Body -->
        <tr><td style="padding:32px 36px;color:#e2e8f0">
          {content}
        </td></tr>
        <!-- Footer -->
        <tr>
          <td style="padding:20px 36px;border-top:1px solid #1e293b;
                     font-size:11px;color:#475569;text-align:center">
            © {datetime.utcnow().year} Ikonet Solutions ·
            <a href="{PUBLIC_SITE_URL}" style="color:#3b82f6;text-decoration:none">
              as400pro.ikonetsolutions.com</a>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body></html>"""


def _btn(label: str, url: str, color: str = "#2563eb") -> str:
    return (
        f'<div style="text-align:center;margin:28px 0">'
        f'<a href="{url}" style="background:{color};color:#fff;padding:13px 32px;'
        f'border-radius:8px;font-weight:700;font-size:14px;text-decoration:none;'
        f'display:inline-block">{label}</a></div>'
    )


# ── Email 0: Licenza trial inviata dall'admin ─────────────────────────────────
def send_trial_license(to_email: str, name: str, license_key: str,
                       plan: str = "trial", expires_days: int = 14,
                       company: str = ""):
    """Inviata dall'admin quando crea una nuova licenza per un cliente."""
    plan_label = plan.upper() if plan else "TRIAL"
    html = _wrap(f"""
      <h2 style="margin:0 0 8px;color:#fff;font-size:22px">La tua licenza AS400 Data Importer Pro</h2>
      <p style="color:#94a3b8;margin:0 0 20px">
        Ciao <strong style="color:#e2e8f0">{name or to_email}</strong>
        {'di <strong style="color:#e2e8f0">' + company + '</strong>' if company else ''}!
        Ecco la tua chiave di licenza e le istruzioni per iniziare.
      </p>

      <!-- Chiave licenza -->
      <div style="background:#0f172a;border:2px solid #2563eb44;border-radius:12px;padding:20px;margin-bottom:20px;text-align:center">
        <p style="margin:0 0 8px;color:#94a3b8;font-size:12px;letter-spacing:2px;text-transform:uppercase">
          La tua chiave di licenza
        </p>
        <div style="background:#1e293b;border-radius:8px;padding:14px 20px;display:inline-block;margin-bottom:8px">
          <code style="color:#60a5fa;font-size:18px;font-weight:700;letter-spacing:3px">{license_key}</code>
        </div>
        <p style="margin:8px 0 0;color:#64748b;font-size:11px">
          Piano: <strong style="color:#94a3b8">{plan_label}</strong> ·
          Durata: <strong style="color:#94a3b8">{expires_days} giorni</strong>
        </p>
      </div>

      <!-- Step 1: Download -->
      <div style="background:#0f172a;border:1px solid #1e293b;border-radius:12px;padding:16px;margin-bottom:12px">
        <p style="margin:0 0 10px;color:#e2e8f0;font-size:14px;font-weight:700">
          <span style="background:#2563eb;color:#fff;border-radius:50%;width:22px;height:22px;
                       display:inline-block;text-align:center;font-size:12px;line-height:22px;
                       margin-right:8px">1</span>
          Scarica e installa l'applicazione
        </p>
        {_btn("⬇️ Scarica AS400 Data Importer Pro (.exe)", DOWNLOAD_URL, "#2563eb")}
      </div>

      <!-- Step 2: Attiva -->
      <div style="background:#0f172a;border:1px solid #1e293b;border-radius:12px;padding:16px;margin-bottom:20px">
        <p style="margin:0 0 10px;color:#e2e8f0;font-size:14px;font-weight:700">
          <span style="background:#22c55e;color:#fff;border-radius:50%;width:22px;height:22px;
                       display:inline-block;text-align:center;font-size:12px;line-height:22px;
                       margin-right:8px">2</span>
          Attiva la licenza nell'app
        </p>
        <p style="margin:0;color:#94a3b8;font-size:13px">
          Vai in <strong style="color:#e2e8f0">Abbonamento → Inserisci chiave</strong>
          e incolla il codice qui sopra.
        </p>
      </div>

      <p style="color:#64748b;font-size:12px;margin:0;text-align:center">
        Problemi con l'attivazione? Scrivi a
        <a href="mailto:{SUPPORT_EMAIL}" style="color:#3b82f6">
          {SUPPORT_EMAIL}</a>
      </p>
    """)
    _async(_send, to_email, name or to_email,
           f"La tua licenza AS400 Data Importer Pro — {plan_label}", html)


# ── Email 1: Benvenuto ────────────────────────────────────────────────────────
def send_welcome(to_email: str, name: str, company: str):
    html = _wrap(f"""
      <h2 style="margin:0 0 8px;color:#fff;font-size:22px">Benvenuto, {name}! 👋</h2>
      <p style="color:#94a3b8;margin:0 0 20px">
        Il tuo account <strong style="color:#e2e8f0">{company}</strong>
        è attivo su <strong style="color:#e2e8f0">AS400 Data Importer Pro</strong>.
        Segui i 2 passi qui sotto per iniziare subito.
      </p>

      <!-- STEP 1: Download -->
      <div style="background:#0f172a;border:1px solid #2563eb44;border-radius:12px;padding:20px;margin-bottom:16px">
        <div style="display:flex;align-items:center;margin-bottom:12px">
          <span style="background:#2563eb;color:#fff;border-radius:50%;width:24px;height:24px;
                       display:inline-block;text-align:center;font-weight:700;font-size:13px;
                       line-height:24px;margin-right:10px">1</span>
          <strong style="color:#e2e8f0;font-size:15px">Scarica e installa l'applicazione</strong>
        </div>
        <p style="margin:0 0 14px;color:#94a3b8;font-size:13px">
          Clicca il pulsante per scaricare il programma per Windows (80 MB).
          Dopo l'installazione avvialo dal desktop.
        </p>
        {_btn("⬇️ Scarica AS400 Data Importer Pro (.exe)", DOWNLOAD_URL, "#2563eb")}
        <p style="margin:0;color:#475569;font-size:11px;text-align:center">
          Windows 10/11 — 64 bit · Richiede Java (JRE 8+)
        </p>
      </div>

      <!-- STEP 2: Login -->
      <div style="background:#0f172a;border:1px solid #22c55e44;border-radius:12px;padding:20px;margin-bottom:24px">
        <div style="display:flex;align-items:center;margin-bottom:12px">
          <span style="background:#22c55e;color:#fff;border-radius:50%;width:24px;height:24px;
                       display:inline-block;text-align:center;font-weight:700;font-size:13px;
                       line-height:24px;margin-right:10px">2</span>
          <strong style="color:#e2e8f0;font-size:15px">Accedi con le tue credenziali</strong>
        </div>
        <p style="margin:0;color:#94a3b8;font-size:13px">
          All'avvio dell'app, accedi con l'email
          <strong style="color:#e2e8f0">{to_email}</strong> e la password che hai scelto.
          La sessione resterà attiva ad ogni riapertura.
        </p>
      </div>

      <!-- Funzionalità -->
      <div style="background:#0f172a;border:1px solid #1e293b;border-radius:12px;padding:20px;margin-bottom:24px">
        <p style="margin:0 0 12px;color:#94a3b8;font-size:13px">
          <strong style="color:#e2e8f0">Cosa puoi fare:</strong>
        </p>
        <table cellpadding="0" cellspacing="0" style="width:100%">
          {''.join(f'<tr><td style="padding:4px 0;color:#94a3b8;font-size:13px">• {item}</td></tr>' for item in [
            'Connettere i tuoi sistemi AS/400 tramite JDBC',
            'Importare dati da file CSV, Excel, XML',
            'Esportare query SQL in qualsiasi formato (Excel, PDF, CSV…)',
            'Ricevere i file esportati direttamente via email',
          ])}
        </table>
      </div>

      <p style="color:#64748b;font-size:12px;margin:20px 0 0;text-align:center">
        Hai problemi con il download o l'installazione? Scrivi a
        <a href="mailto:{SUPPORT_EMAIL}" style="color:#3b82f6">
          {SUPPORT_EMAIL}</a>
      </p>
    """)
    _async(_send, to_email, name,
           "Benvenuto su AS400 Data Importer Pro — Scarica l'app e inizia subito ✓", html)


# ── Email 2: Import completato ────────────────────────────────────────────────
def send_import_done(to_email: str, name: str,
                     filename: str, table: str, library: str,
                     rows_ok: int, rows_err: int, duration_s: float = 0):
    status_color = "#22c55e" if rows_err == 0 else "#f59e0b"
    status_label = "Completato con successo" if rows_err == 0 else f"Completato con {rows_err} errori"

    html = _wrap(f"""
      <h2 style="margin:0 0 6px;color:#fff">Import completato</h2>
      <p style="color:#94a3b8;margin:0 0 24px;font-size:14px">
        Il file <strong style="color:#e2e8f0">{filename}</strong> è stato importato.
      </p>

      <div style="background:#0f172a;border:1px solid #1e293b;border-radius:12px;
                  padding:20px;margin-bottom:24px">
        <table cellpadding="0" cellspacing="8" style="width:100%">
          <tr>
            <td style="color:#64748b;font-size:13px;width:140px">Stato</td>
            <td><span style="background:{status_color}22;color:{status_color};
                             padding:3px 10px;border-radius:20px;font-size:12px;
                             font-weight:700">{status_label}</span></td>
          </tr>
          <tr>
            <td style="color:#64748b;font-size:13px">Destinazione</td>
            <td style="color:#e2e8f0;font-size:13px">
              <code style="background:#1e293b;padding:2px 6px;border-radius:4px">
                {library}.{table}</code></td>
          </tr>
          <tr>
            <td style="color:#64748b;font-size:13px">Righe importate</td>
            <td style="color:#22c55e;font-weight:700;font-size:14px">{rows_ok:,}</td>
          </tr>
          {'<tr><td style="color:#64748b;font-size:13px">Righe con errore</td>'
           f'<td style="color:#ef4444;font-weight:700;font-size:14px">{rows_err:,}</td></tr>'
           if rows_err > 0 else ''}
          {f'<tr><td style="color:#64748b;font-size:13px">Durata</td>'
           f'<td style="color:#94a3b8;font-size:13px">{duration_s:.1f}s</td></tr>'
           if duration_s > 0 else ''}
        </table>
      </div>

      {_btn("Vedi storico operazioni", f"{APP_BASE_URL}/history")}
    """)
    _async(_send, to_email, name,
           f"Import '{filename}' completato — {rows_ok:,} righe importate", html)


# ── Email 3: Export completato (con allegato opzionale) ───────────────────────
def send_export_done(to_email: str, name: str,
                     fmt: str, rows: int, sql_preview: str = "",
                     file_content: bytes = None, filename: str = None):
    has_attachment = bool(file_content and filename)

    mime_map = {
        "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "xls":  "application/vnd.ms-excel",
        "csv":  "text/csv",
        "tsv":  "text/tab-separated-values",
        "pdf":  "application/pdf",
        "json": "application/json",
        "xml":  "application/xml",
        "txt":  "text/plain",
    }
    attachment_mime = mime_map.get(fmt.lower(), "application/octet-stream")

    html = _wrap(f"""
      <h2 style="margin:0 0 6px;color:#fff">Export completato ✓</h2>
      <p style="color:#94a3b8;margin:0 0 24px;font-size:14px">
        Il tuo file <strong style="color:#e2e8f0">.{fmt.upper()}</strong>
        {'è allegato a questa email.' if has_attachment else 'è stato esportato con successo.'}
      </p>

      <div style="background:#0f172a;border:1px solid #1e293b;border-radius:12px;
                  padding:20px;margin-bottom:24px">
        <table cellpadding="0" cellspacing="8" style="width:100%">
          <tr>
            <td style="color:#64748b;font-size:13px;width:140px">Formato</td>
            <td style="color:#e2e8f0;font-size:13px">
              <code style="background:#1e293b;padding:2px 8px;border-radius:4px;
                           font-weight:700">.{fmt.upper()}</code></td>
          </tr>
          <tr>
            <td style="color:#64748b;font-size:13px">Righe esportate</td>
            <td style="color:#22c55e;font-weight:700;font-size:14px">{rows:,}</td>
          </tr>
          {f'<tr><td style="color:#64748b;font-size:13px">File allegato</td>'
           f'<td style="color:#3b82f6;font-size:13px;font-weight:600">{filename}</td></tr>'
           if has_attachment else ''}
          {f'<tr><td style="color:#64748b;font-size:13px;vertical-align:top">Query SQL</td>'
           f'<td><code style="background:#1e293b;padding:6px 8px;border-radius:6px;'
           f'font-size:11px;color:#94a3b8;display:block;word-break:break-all">'
           f'{sql_preview[:120]}{"..." if len(sql_preview)>120 else ""}</code></td></tr>'
           if sql_preview else ''}
        </table>
      </div>

      {_btn("Vai all'export", f"{APP_BASE_URL}/export")}
    """)

    def _do_send():
        _send(to_email, name,
              f"Export .{fmt.upper()} — {rows:,} righe {'📎' if has_attachment else ''}",
              html,
              attachment_content=file_content if has_attachment else None,
              attachment_name=filename if has_attachment else None,
              attachment_mime=attachment_mime)

    _async(_do_send)


# ── Email 4: Avviso licenza in scadenza ───────────────────────────────────────
def send_license_expiry_warning(to_email: str, name: str,
                                days_left: int, expires_at: str, plan: str = ""):
    if days_left <= 7:
        badge_color, badge_bg, urgency = "#ef4444", "#ef444422", "⚠️ Urgente"
    elif days_left <= 14:
        badge_color, badge_bg, urgency = "#f59e0b", "#f59e0b22", "Attenzione"
    else:
        badge_color, badge_bg, urgency = "#3b82f6", "#3b82f622", "Promemoria"

    html = _wrap(f"""
      <h2 style="margin:0 0 6px;color:#fff">{urgency} — Licenza in scadenza</h2>
      <p style="color:#94a3b8;margin:0 0 24px;font-size:14px">
        La tua licenza AS400 Data Importer Pro scade tra
        <strong style="color:{badge_color}"> {days_left} giorni</strong>.
        Rinnova adesso per non interrompere il servizio.
      </p>

      <div style="background:#0f172a;border:1px solid {badge_color}44;border-radius:12px;
                  padding:20px;margin-bottom:24px">
        <table cellpadding="0" cellspacing="8" style="width:100%">
          <tr>
            <td style="color:#64748b;font-size:13px;width:140px">Piano attivo</td>
            <td style="color:#e2e8f0;font-size:13px;font-weight:700">
              {plan or "AS400 Importer"}</td>
          </tr>
          <tr>
            <td style="color:#64748b;font-size:13px">Scadenza</td>
            <td><span style="background:{badge_bg};color:{badge_color};
                             padding:3px 10px;border-radius:20px;font-size:12px;
                             font-weight:700">{expires_at[:10]}</span></td>
          </tr>
          <tr>
            <td style="color:#64748b;font-size:13px">Giorni rimanenti</td>
            <td style="color:{badge_color};font-weight:700;font-size:18px">
              {days_left}</td>
          </tr>
        </table>
      </div>

      {_btn("Rinnova la licenza →", PUBLIC_SITE_URL, badge_color)}

      <p style="color:#64748b;font-size:12px;margin:16px 0 0;text-align:center">
        Hai già rinnovato? Inserisci la nuova chiave in
        <strong style="color:#94a3b8">Abbonamento → Inserisci chiave</strong>
        all'interno dell'app.
      </p>
    """)
    _async(_send, to_email, name,
           f"⚠️ La tua licenza scade tra {days_left} giorni — Rinnova ora", html)


# ── Email 5: Reset password ───────────────────────────────────────────────────
def send_password_reset(to_email: str, name: str, reset_token: str):
    reset_link = f"{APP_BASE_URL}/reset-password?token={reset_token}"
    html = _wrap(f"""
      <h2 style="margin:0 0 6px;color:#fff">Reimposta la tua password</h2>
      <p style="color:#94a3b8;margin:0 0 24px;font-size:14px">
        Abbiamo ricevuto una richiesta di reset per l'account associato a
        <strong style="color:#e2e8f0">{to_email}</strong>.<br>
        Il link è valido per <strong style="color:#e2e8f0">1 ora</strong>.
      </p>

      {_btn("Reimposta password", reset_link)}

      <div style="background:#0f172a;border:1px solid #1e293b;border-radius:8px;
                  padding:14px;margin-top:16px">
        <p style="margin:0;color:#64748b;font-size:11px">
          Se il pulsante non funziona, copia questo link nel browser:<br>
          <a href="{reset_link}" style="color:#3b82f6;word-break:break-all;font-size:11px">
            {reset_link}</a>
        </p>
      </div>

      <p style="color:#64748b;font-size:12px;margin:20px 0 0;text-align:center">
        Non hai richiesto il reset? Ignora questa email.
        La tua password rimane invariata.
      </p>
    """)
    # Reset password è sincrono — vogliamo sapere subito se fallisce
    return _send(to_email, name, "Reimposta la tua password — AS400 Data Importer Pro", html)
