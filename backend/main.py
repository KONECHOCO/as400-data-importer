import os, uuid, threading, json
from datetime import datetime, timedelta
from typing import Optional

from fastapi import FastAPI, HTTPException, Depends, Header, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from jose import jwt, JWTError
from passlib.context import CryptContext

import jaydebeapi

from .database     import init_db, get_db
from .crypto       import encrypt, decrypt
from .license_mgr  import get_status, activate as lic_activate, get_hardware_id
from .email_service import (
    send_welcome,
    send_import_done,
    send_export_done,
    send_license_expiry_warning,
    send_password_reset,
)
from .file_handler import (
    get_preview      as fh_preview,
    read_file        as fh_read,
    import_df        as fh_import_df,
    export_file      as fh_export,
    apply_formatting as fh_format,
)
import pandas as pd
from fastapi.responses import Response as FastAPIResponse

# ── Setup ─────────────────────────────────────────────────────────────────────
SECRET   = "ikonet-local-secret-2026"
ALGO     = "HS256"
AS400_DRIVER = "com.ibm.as400.access.AS400JDBCDriver"

# In frozen mode (PyInstaller), lib/ is alongside the exe — set via env var from run.py
def _jt400_jar_path() -> str:
    """Return the configured JT400 driver path with a clear error if missing."""
    jar_path = os.environ.get("AS400_JT400_JAR") or os.path.join(
        os.path.dirname(__file__), "lib", "jt400.jar"
    )
    if not os.path.exists(jar_path):
        raise FileNotFoundError(
            "Driver JT400 non trovato. Verifica che jt400.jar sia in backend/lib/ "
            "oppure imposta AS400_JT400_JAR."
        )
    return jar_path

pwd_ctx  = CryptContext(schemes=["sha256_crypt"], deprecated="auto")

app = FastAPI(title="Ikonet AS400 Local Agent")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

init_db()

# ── Pending imports (in-memory durante l'esecuzione) ─────────────────────────
_pending: dict = {}

# ── JWT ───────────────────────────────────────────────────────────────────────
def _make_token(uid: str) -> str:
    return jwt.encode({"sub": uid, "exp": datetime.utcnow() + timedelta(days=30)}, SECRET, ALGO)

def _get_user(authorization: str = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Non autenticato")
    try:
        uid = jwt.decode(authorization[7:], SECRET, ALGO)["sub"]
    except JWTError:
        raise HTTPException(401, "Token non valido")
    db = get_db()
    row = db.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()
    db.close()
    if not row:
        raise HTTPException(401, "Utente non trovato")
    return dict(row)

def _pub(u: dict) -> dict:
    return {k: v for k, v in u.items() if k != "password_hash"}

# ── License guard ─────────────────────────────────────────────────────────────
def _require_license():
    db = get_db()
    status = get_status(db)
    db.close()
    if not status.get("valid"):
        raise HTTPException(402, status.get("reason", "Licenza non attiva"))

# ── AS/400 helpers ────────────────────────────────────────────────────────────
def _as400_url(host: str, port: int, library: str, ssl: bool, timeout: int) -> str:
    lib = library if library and library != "*LIBL" else ""
    port_part = f":{port}" if port else ""
    return (
        f"jdbc:as400://{host}{port_part}/{lib}"
        f";prompt=false;secure={'true' if ssl else 'false'}"
        f";loginTimeout={timeout};date format=iso;time format=iso"
        f";translate binary=true"
    )

def _open_jdbc(host, user, password, port=446, library="*LIBL", ssl=False, timeout=10):
    url = _as400_url(host, port, library, ssl, timeout)
    return jaydebeapi.connect(AS400_DRIVER, url, [user, password], _jt400_jar_path())

def _test_jdbc(c: dict) -> dict:
    try:
        pw = decrypt(c["password_encrypted"])
        conn = _open_jdbc(c["host"], c["as400_user"], pw, c["port"], c["library"], bool(c["ssl"]), c["login_timeout"])
        cur = conn.cursor()
        cur.execute("SELECT CURRENT_DATE, CURRENT_TIME FROM SYSIBM.SYSDUMMY1")
        row = cur.fetchone()
        cur.close(); conn.close()
        return {"success": True, "message": f"Connesso a {c['host']}:{c['port']} — data sistema: {row[0]} {row[1]}"}
    except Exception as e:
        raw = str(e)
        low = raw.lower()
        if "unknown host" in low or "nodename nor servname" in low or "name or service not known" in low:
            hint = "Host non raggiungibile — controlla IP/hostname e connessione VPN"
        elif "timed out" in low or "timeout" in low or "connection timed" in low:
            hint = "Connessione scaduta — AS400 non risponde. Verifica VPN, firewall e porte (446/449)"
        elif "connection refused" in low or "refused" in low:
            hint = "Connessione rifiutata — verifica firewall e che l'AS400 sia avviato (porte: 449, 446, 8476)"
        elif "password" in low or "not authorized" in low or "cpe3101" in low or "credentials" in low:
            hint = "Credenziali AS400 non valide — controlla utente e password"
        elif "ssl" in low or "certificate" in low or "handshake" in low:
            hint = "Errore SSL — prova a disabilitare SSL nella configurazione della connessione"
        elif "class not found" in low or "driver" in low or "jt400" in low:
            hint = "Driver JT400 non trovato — verifica che jt400.jar sia in backend/lib/"
        else:
            hint = "Porte AS400 richieste: 449, 446, 8476, 8473, 8471"
        return {"success": False, "message": f"{raw}\n\nSuggerimento: {hint}"}

def _run_query(c: dict, sql: str, limit: int) -> dict:
    pw = decrypt(c["password_encrypted"])
    sql_up = sql.strip().upper()
    is_sel = sql_up.startswith("SELECT") or sql_up.startswith("WITH")
    if is_sel and "FETCH FIRST" not in sql_up and limit > 0:
        sql = sql.rstrip(";") + f" FETCH FIRST {limit} ROWS ONLY"
    conn = _open_jdbc(c["host"], c["as400_user"], pw, c["port"], c["library"], bool(c["ssl"]), c["login_timeout"])
    cur = conn.cursor()
    try:
        cur.execute(sql)
        if cur.description:
            cols = [d[0] for d in cur.description]
            rows = [{cols[i]: (str(v) if v is not None else None) for i, v in enumerate(r)} for r in cur.fetchall()]
        else:
            cols, rows = [], []
    finally:
        cur.close(); conn.close()
    return {"rows": len(rows), "data": rows, "columns": cols}


# ── Background: avviso licenza in scadenza ────────────────────────────────────
def _check_license_expiry():
    """Controlla ogni 24h se la licenza scade entro 30 giorni e invia una email."""
    import time
    time.sleep(60)  # aspetta 1 min dopo l'avvio prima del primo check
    while True:
        try:
            db  = get_db()
            lic = get_status(db)
            if lic.get("valid") and lic.get("expires_at") and not lic.get("trial"):
                exp       = datetime.fromisoformat(lic["expires_at"])
                days_left = (exp - datetime.utcnow()).days
                if 0 < days_left <= 30:
                    # Invia avviso solo una volta per soglia (30, 14, 7, 3, 1 giorni)
                    for threshold in (30, 14, 7, 3, 1):
                        if days_left <= threshold:
                            flag_key = f"expiry_warned_{threshold}"
                            already  = db.execute(
                                "SELECT value FROM settings WHERE key=?", (flag_key,)
                            ).fetchone()
                            if not already:
                                # Recupera email utente
                                user = db.execute(
                                    "SELECT email, name FROM users LIMIT 1"
                                ).fetchone()
                                if user:
                                    send_license_expiry_warning(
                                        user["email"], user["name"],
                                        days_left, lic["expires_at"],
                                        lic.get("plan", "")
                                    )
                                db.execute(
                                    "INSERT OR REPLACE INTO settings (key,value,updated_at) VALUES (?,?,?)",
                                    (flag_key, "1", datetime.utcnow().isoformat())
                                )
                                db.commit()
                            break
            db.close()
        except Exception as exc:
            print(f"[LICENSE_CHECK] {exc}", flush=True)
        time.sleep(24 * 3600)  # controlla ogni 24 ore


threading.Thread(target=_check_license_expiry, daemon=True).start()

# ── License endpoints ─────────────────────────────────────────────────────────
@app.get("/api/license/status")
def license_status():
    db = get_db()
    status = get_status(db)
    has_account = db.execute("SELECT COUNT(*) FROM users").fetchone()[0] > 0
    db.close()
    return {**status, "has_account": has_account, "hardware_id": get_hardware_id()}

@app.post("/api/license/activate")
def license_activate(b: dict):
    key = (b.get("license_key") or "").strip().upper()
    if not key:
        raise HTTPException(400, "Chiave licenza mancante")
    db = get_db()
    try:
        data = lic_activate(key, db)
        has_account = db.execute("SELECT COUNT(*) FROM users").fetchone()[0] > 0
        db.close()
        return {**data, "has_account": has_account}
    except ValueError as e:
        db.close()
        raise HTTPException(400, str(e))

# ── Auth endpoints ────────────────────────────────────────────────────────────
class SetupBody(BaseModel):
    email: str; password: str; name: str; company: str

class LoginBody(BaseModel):
    email: str; password: str

class ChangePwdBody(BaseModel):
    current_password: str; new_password: str

class UpdateProfileBody(BaseModel):
    name: str; company: str

@app.post("/api/auth/setup")
def setup_account(b: SetupBody):
    """Prima configurazione — solo se nessun utente esiste (primo avvio)."""
    db = get_db()
    if db.execute("SELECT COUNT(*) FROM users").fetchone()[0] > 0:
        db.close()
        raise HTTPException(400, "Account già configurato")
    uid = str(uuid.uuid4())
    db.execute(
        "INSERT INTO users (id, email, password_hash, name, company, created_at) VALUES (?,?,?,?,?,?)",
        (uid, b.email, pwd_ctx.hash(b.password), b.name, b.company, datetime.utcnow().isoformat())
    )
    db.commit()
    db.close()
    send_welcome(b.email, b.name, b.company)
    return {"token": _make_token(uid), "user": {"id": uid, "email": b.email, "name": b.name, "company": b.company}}

@app.post("/api/auth/register")
def register(b: SetupBody):
    """Registrazione libera — qualsiasi email nuova può creare un account."""
    if not b.email or not b.password or not b.name:
        raise HTTPException(400, "Email, password e nome sono obbligatori")
    db = get_db()
    existing = db.execute("SELECT id FROM users WHERE email=?", (b.email.lower().strip(),)).fetchone()
    if existing:
        db.close()
        raise HTTPException(400, "Email già registrata — accedi con le tue credenziali")
    uid = str(uuid.uuid4())
    db.execute(
        "INSERT INTO users (id, email, password_hash, name, company, created_at) VALUES (?,?,?,?,?,?)",
        (uid, b.email.lower().strip(), pwd_ctx.hash(b.password), b.name, b.company, datetime.utcnow().isoformat())
    )
    db.commit()
    db.close()
    send_welcome(b.email.lower().strip(), b.name, b.company)
    return {"token": _make_token(uid), "user": {"id": uid, "email": b.email.lower().strip(), "name": b.name, "company": b.company}}

@app.post("/api/auth/login")
def login(b: LoginBody):
    db = get_db()
    row = db.execute("SELECT * FROM users WHERE email=?", (b.email,)).fetchone()
    db.close()
    if not row or not pwd_ctx.verify(b.password, row["password_hash"]):
        raise HTTPException(401, "Credenziali non valide")
    u = dict(row)
    return {"token": _make_token(u["id"]), "user": _pub(u)}

@app.get("/api/auth/me")
def me(user=Depends(_get_user)):
    return _pub(user)

@app.post("/api/auth/change-password")
def change_password(b: ChangePwdBody, user=Depends(_get_user)):
    if not pwd_ctx.verify(b.current_password, user["password_hash"]):
        raise HTTPException(400, "Password attuale non corretta")
    db = get_db()
    db.execute("UPDATE users SET password_hash=? WHERE id=?", (pwd_ctx.hash(b.new_password), user["id"]))
    db.commit(); db.close()
    return {"ok": True}

@app.put("/api/auth/profile")
def update_profile(b: UpdateProfileBody, user=Depends(_get_user)):
    db = get_db()
    db.execute("UPDATE users SET name=?, company=? WHERE id=?", (b.name, b.company, user["id"]))
    db.commit()
    row = db.execute("SELECT * FROM users WHERE id=?", (user["id"],)).fetchone()
    db.close()
    return _pub(dict(row))

@app.post("/api/auth/forgot-password")
def forgot_password(b: dict):
    email = (b.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(400, "Email obbligatoria")
    db  = get_db()
    row = db.execute("SELECT id, name FROM users WHERE LOWER(email)=?", (email,)).fetchone()
    if not row:
        db.close()
        return {"ok": True}  # risposta generica: non rivela se l'email esiste

    token   = str(uuid.uuid4()).replace("-", "")
    expires = (datetime.utcnow() + timedelta(hours=1)).isoformat()
    # Rimuovi vecchi token per questo utente
    db.execute("DELETE FROM password_reset_tokens WHERE user_id=?", (row["id"],))
    db.execute(
        "INSERT INTO password_reset_tokens (token, user_id, expires_at, used) VALUES (?,?,?,0)",
        (token, row["id"], expires)
    )
    db.commit()
    db.close()

    ok = send_password_reset(email, row["name"], token)
    if not ok:
        raise HTTPException(500, "Impossibile inviare l'email. Contatta il supporto.")
    return {"ok": True}


@app.post("/api/auth/reset-password")
def reset_password(b: dict):
    token    = (b.get("token") or "").strip()
    password = (b.get("password") or "").strip()
    if not token or not password:
        raise HTTPException(400, "Token e nuova password obbligatori")
    if len(password) < 6:
        raise HTTPException(400, "La password deve essere di almeno 6 caratteri")

    db  = get_db()
    row = db.execute(
        "SELECT * FROM password_reset_tokens WHERE token=? AND used=0", (token,)
    ).fetchone()
    if not row:
        db.close()
        raise HTTPException(400, "Link non valido o già utilizzato")
    if datetime.fromisoformat(row["expires_at"]) < datetime.utcnow():
        db.execute("DELETE FROM password_reset_tokens WHERE token=?", (token,))
        db.commit(); db.close()
        raise HTTPException(400, "Il link è scaduto. Richiedi un nuovo reset.")

    db.execute("UPDATE users SET password_hash=? WHERE id=?",
               (pwd_ctx.hash(password), row["user_id"]))
    db.execute("UPDATE password_reset_tokens SET used=1 WHERE token=?", (token,))
    db.commit(); db.close()
    return {"ok": True}

# ── Connections ───────────────────────────────────────────────────────────────
class ConnBody(BaseModel):
    name: str; host: str; user: str; password: str
    port: int = 446; library: str = "*LIBL"; description: str = ""
    ssl: bool = False; login_timeout: int = 10

def _conn_pub(row: dict) -> dict:
    return {k: v for k, v in row.items() if k != "password_encrypted"}

@app.get("/api/connections")
def list_connections(user=Depends(_get_user)):
    db = get_db()
    rows = [_conn_pub(dict(r)) for r in db.execute(
        "SELECT * FROM connections WHERE user_id=? ORDER BY name", (user["id"],)
    ).fetchall()]
    db.close()
    return rows

@app.post("/api/connections")
def create_connection(b: ConnBody, user=Depends(_get_user)):
    _require_license()
    cid = str(uuid.uuid4())
    db  = get_db()
    db.execute(
        """INSERT INTO connections
           (id,name,host,as400_user,password_encrypted,port,library,description,
            ssl,login_timeout,last_used,created_at,user_id)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (cid, b.name, b.host, b.user, encrypt(b.password),
         b.port, b.library, b.description, int(b.ssl), b.login_timeout,
         None, datetime.utcnow().isoformat(), user["id"])
    )
    db.commit()
    row = dict(db.execute("SELECT * FROM connections WHERE id=?", (cid,)).fetchone())
    db.close()
    return _conn_pub(row)

@app.put("/api/connections/{cid}")
def update_connection(cid: str, b: ConnBody, user=Depends(_get_user)):
    db = get_db()
    row = db.execute("SELECT * FROM connections WHERE id=? AND user_id=?", (cid, user["id"])).fetchone()
    if not row:
        db.close(); raise HTTPException(404, "Connessione non trovata")
    pw_enc = encrypt(b.password) if b.password else row["password_encrypted"]
    db.execute("""
        UPDATE connections SET name=?,host=?,as400_user=?,password_encrypted=?,
        port=?,library=?,description=?,ssl=?,login_timeout=? WHERE id=? AND user_id=?
    """, (b.name, b.host, b.user, pw_enc, b.port, b.library, b.description,
          int(b.ssl), b.login_timeout, cid, user["id"]))
    db.commit()
    row = dict(db.execute("SELECT * FROM connections WHERE id=?", (cid,)).fetchone())
    db.close()
    return _conn_pub(row)

@app.post("/api/connections/{cid}/test")
def test_connection(cid: str, user=Depends(_get_user)):
    db = get_db()
    row = db.execute("SELECT * FROM connections WHERE id=? AND user_id=?", (cid, user["id"])).fetchone()
    if not row:
        db.close(); raise HTTPException(404, "Connessione non trovata")
    c = dict(row)
    result = _test_jdbc(c)
    if result["success"]:
        db.execute("UPDATE connections SET last_used=? WHERE id=?", (datetime.utcnow().isoformat(), cid))
        db.commit()
    db.close()
    return result

@app.delete("/api/connections/{cid}")
def delete_connection(cid: str, user=Depends(_get_user)):
    db = get_db()
    db.execute("DELETE FROM connections WHERE id=? AND user_id=?", (cid, user["id"]))
    db.commit(); db.close()
    return {"ok": True}

# ── Import ────────────────────────────────────────────────────────────────────
@app.post("/api/import/preview")
async def import_preview(
    file: UploadFile = File(...),
    options: str = Form("{}"),
    user=Depends(_get_user),
):
    content = await file.read()
    try:
        opt    = json.loads(options) if options else {}
        result = fh_preview(content, file.filename, opt)
    except Exception as e:
        raise HTTPException(400, f"Errore lettura file: {e}")
    return result

@app.post("/api/import")
async def do_import(
    file: UploadFile = File(...),
    connection_id: str = Form(...),
    library: str = Form(...),
    table_name: str = Form(...),
    mode: str = Form("create"),
    column_mapping: str = Form("[]"),
    options: str = Form("{}"),
    user=Depends(_get_user),
):
    _require_license()
    db  = get_db()
    row = db.execute("SELECT * FROM connections WHERE id=? AND user_id=?", (connection_id, user["id"])).fetchone()
    if not row:
        db.close(); raise HTTPException(404, "Connessione non trovata")
    c       = dict(row)
    content = await file.read()
    mapping = json.loads(column_mapping) if column_mapping else []
    opt     = json.loads(options) if options else {}
    op_id   = str(uuid.uuid4())
    now     = datetime.utcnow().isoformat()
    fname   = file.filename

    db.execute(
        """INSERT INTO operations
           (id,type,filename,table_name,library,sql_query,rows_count,rows_error,
            status,error,log_data,connection_id,created_at,user_id)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (op_id, "import", fname, table_name, library,
         None, 0, 0, "running", None, None, connection_id, now, user["id"])
    )
    db.commit(); db.close()

    _pending[op_id] = {
        "status": "running", "progress": 0,
        "rows_count": 0, "rows_error": 0, "total_rows": None,
        "error": None, "log": [],
    }

    _import_start = datetime.utcnow()

    def _run():
        try:
            df, _ = fh_read(content, fname, opt)
            def open_conn():
                return _open_jdbc(
                    c["host"], c["as400_user"], decrypt(c["password_encrypted"]),
                    c["port"], c["library"], bool(c["ssl"]), c["login_timeout"]
                )
            inserted, errors = fh_import_df(df, mapping, open_conn, library, table_name, mode, op_id, _pending)
            logs = [{"row": e["row"], "type": "error", "msg": e["error"]} for e in errors]
            _pending[op_id].update({
                "status": "completed", "progress": 100,
                "rows_count": inserted, "rows_error": len(errors), "log": logs,
            })
            ddb = get_db()
            ddb.execute(
                "UPDATE operations SET status=?,rows_count=?,rows_error=?,log_data=? WHERE id=?",
                ("completed", inserted, len(errors), json.dumps(logs), op_id)
            )
            ddb.commit(); ddb.close()
            # Email di notifica import completato
            duration = (datetime.utcnow() - _import_start).total_seconds()
            send_import_done(
                user["email"], user["name"],
                fname, table_name, library,
                inserted, len(errors), duration
            )
        except Exception as ex:
            _pending[op_id].update({"status": "failed", "error": str(ex)})
            ddb = get_db()
            ddb.execute("UPDATE operations SET status=?,error=? WHERE id=?", ("failed", str(ex), op_id))
            ddb.commit(); ddb.close()

    threading.Thread(target=_run, daemon=True).start()
    return {"operation_id": op_id}

@app.get("/api/import/{op_id}/status")
def import_status(op_id: str, user=Depends(_get_user)):
    p = _pending.get(op_id)
    if p:
        return p
    db  = get_db()
    row = db.execute("SELECT * FROM operations WHERE id=?", (op_id,)).fetchone()
    db.close()
    if not row:
        raise HTTPException(404)
    r = dict(row)
    return {
        "status": r["status"], "progress": 100,
        "rows_count": r["rows_count"], "rows_error": r["rows_error"],
        "total_rows": r["rows_count"], "error": r["error"],
        "log": json.loads(r["log_data"]) if r.get("log_data") else [],
    }

# ── Export / Query ────────────────────────────────────────────────────────────
class QueryBody(BaseModel):
    connection_id: str; sql: str; limit: int = 1000

@app.post("/api/query")
def run_query(b: QueryBody, user=Depends(_get_user)):
    _require_license()
    db  = get_db()
    row = db.execute("SELECT * FROM connections WHERE id=? AND user_id=?", (b.connection_id, user["id"])).fetchone()
    if not row:
        db.close(); raise HTTPException(404, "Connessione non trovata")
    c = dict(row)
    try:
        result = _run_query(c, b.sql, b.limit)
    except Exception as e:
        db.close(); raise HTTPException(400, str(e))

    op_id = str(uuid.uuid4())
    db.execute(
        """INSERT INTO operations
           (id,type,filename,table_name,library,sql_query,rows_count,rows_error,
            status,error,log_data,connection_id,created_at,user_id)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (op_id, "export", None, None, c["library"], b.sql[:500],
         result["rows"], 0, "completed", None, None, b.connection_id,
         datetime.utcnow().isoformat(), user["id"])
    )
    db.commit(); db.close()
    return result

@app.post("/api/export/download")
async def export_download(
    connection_id: str = Form(...),
    sql: str = Form(...),
    fmt: str = Form("xlsx"),
    col_configs: str = Form("[]"),
    options: str = Form("{}"),
    send_email: str = Form("1"),
    user=Depends(_get_user),
):
    _require_license()
    db  = get_db()
    row = db.execute("SELECT * FROM connections WHERE id=? AND user_id=?", (connection_id, user["id"])).fetchone()
    if not row:
        db.close(); raise HTTPException(404, "Connessione non trovata")
    c = dict(row); db.close()

    try:
        result = _run_query(c, sql, 0)
    except Exception as e:
        raise HTTPException(400, str(e))

    df = pd.DataFrame(result["data"] or [])
    if df.empty and result.get("columns"):
        df = pd.DataFrame(columns=result["columns"])

    configs = json.loads(col_configs) if col_configs else []
    opt     = json.loads(options) if options else {}
    if configs:
        df = fh_format(df, configs)

    if fmt not in ("xlsx", "xls", "csv", "tsv", "txt", "json", "jsonl", "xml", "pdf"):
        raise HTTPException(400, f"Formato non supportato: {fmt}")

    out, mime = fh_export(df, fmt, opt)
    fname     = f"export_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.{fmt}"

    # Email con allegato (asincrona, non blocca il download)
    if send_email == "1":
        send_export_done(
            user["email"], user["name"], fmt, len(df), sql[:200],
            file_content=out if isinstance(out, bytes) else out.encode() if isinstance(out, str) else bytes(out),
            filename=fname,
        )

    return FastAPIResponse(
        content=out,
        media_type=mime,
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )

# ── Saved queries ─────────────────────────────────────────────────────────────
class SaveQueryBody(BaseModel):
    name: str; sql: str; connection_id: str = ""

@app.get("/api/saved-queries")
def list_saved(user=Depends(_get_user)):
    db   = get_db()
    rows = [dict(r) for r in db.execute(
        "SELECT * FROM saved_queries WHERE user_id=? ORDER BY name", (user["id"],)
    ).fetchall()]
    db.close()
    return rows

@app.post("/api/saved-queries")
def save_query(b: SaveQueryBody, user=Depends(_get_user)):
    qid = str(uuid.uuid4())
    db  = get_db()
    db.execute(
        "INSERT INTO saved_queries (id,name,sql_query,connection_id,created_at,user_id) VALUES (?,?,?,?,?,?)",
        (qid, b.name, b.sql, b.connection_id or None, datetime.utcnow().isoformat(), user["id"])
    )
    db.commit()
    row = dict(db.execute("SELECT * FROM saved_queries WHERE id=?", (qid,)).fetchone())
    db.close()
    return row

@app.delete("/api/saved-queries/{qid}")
def delete_query(qid: str, user=Depends(_get_user)):
    db = get_db()
    db.execute("DELETE FROM saved_queries WHERE id=? AND user_id=?", (qid, user["id"]))
    db.commit(); db.close()
    return {"ok": True}

# ── Operations ────────────────────────────────────────────────────────────────
@app.get("/api/operations")
def list_operations(user=Depends(_get_user)):
    db   = get_db()
    rows = [dict(r) for r in
            db.execute(
                "SELECT * FROM operations WHERE user_id=? ORDER BY created_at DESC LIMIT 200",
                (user["id"],)
            ).fetchall()]
    db.close()
    for r in rows:
        r["sql"] = r.pop("sql_query", None)
    return rows

# ── Settings ──────────────────────────────────────────────────────────────────
@app.get("/api/settings")
def get_settings(user=Depends(_get_user)):
    db   = get_db()
    rows = {r["key"]: r["value"] for r in db.execute("SELECT key, value FROM settings").fetchall()}
    db.close()
    return rows

@app.put("/api/settings")
def save_settings(b: dict, user=Depends(_get_user)):
    db  = get_db()
    now = datetime.utcnow().isoformat()
    for k, v in b.items():
        db.execute(
            "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?,?,?)",
            (k, str(v) if v is not None else None, now)
        )
    db.commit(); db.close()
    return {"ok": True}

@app.get("/api/db/stats")
def db_stats(user=Depends(_get_user)):
    import os
    db  = get_db()
    stats = {
        "connections": db.execute("SELECT COUNT(*) FROM connections").fetchone()[0],
        "operations":  db.execute("SELECT COUNT(*) FROM operations").fetchone()[0],
        "saved_queries": db.execute("SELECT COUNT(*) FROM saved_queries").fetchone()[0],
        "db_path":     os.path.abspath(os.path.join(os.path.dirname(__file__), "data", "ikonet.db")),
        "db_size_kb":  round(os.path.getsize(os.path.join(os.path.dirname(__file__), "data", "ikonet.db")) / 1024, 1),
    }
    db.close()
    return stats

# ── Plans (stub — gestiti dal server licenze) ──────────────────────────────────
@app.get("/api/plans")
def plans(user=Depends(_get_user)):
    db = get_db()
    lic = get_status(db); db.close()
    return {"plan": lic.get("plan"), "expires_at": lic.get("expires_at"),
            "company": lic.get("company")}

@app.get("/api/subscription")
def subscription(user=Depends(_get_user)):
    db = get_db()
    lic = get_status(db); db.close()
    return {"plan_status": "active" if lic.get("valid") else "expired",
            "plan": {"name": lic.get("plan", "—")},
            "plan_expires": lic.get("expires_at")}

# ── Serve React build (produzione) ────────────────────────────────────────────
# ── Download setup installer ──────────────────────────────────────────────────
_DOWNLOADS_DIR = os.environ.get("AS400_SETUP_DIR",
                                "/opt/as400-frontend/downloads")
_SETUP_FILENAME = "AS400Importer-Setup.exe"

@app.get("/download/info")
def download_info():
    path = os.path.join(_DOWNLOADS_DIR, _SETUP_FILENAME)
    if not os.path.isfile(path):
        raise HTTPException(404, "File non trovato")
    size_mb = round(os.path.getsize(path) / (1024 * 1024), 1)
    mtime   = datetime.utcfromtimestamp(os.path.getmtime(path)).strftime("%Y-%m-%d")
    return {"available": True, "filename": _SETUP_FILENAME,
            "size_mb": size_mb, "updated": mtime}

@app.get("/download")
def download_setup():
    path = os.path.join(_DOWNLOADS_DIR, _SETUP_FILENAME)
    if not os.path.isfile(path):
        raise HTTPException(404, "File non trovato sul server")
    return FileResponse(
        path,
        media_type="application/octet-stream",
        filename=_SETUP_FILENAME,
        headers={"Content-Disposition": f'attachment; filename="{_SETUP_FILENAME}"'},
    )

# ── Serve React SPA (produzione) ──────────────────────────────────────────────
# In frozen mode, AS400_DIST_DIR points to dist/ alongside the exe
if os.environ.get('AS400_DIST_DIR'):
    _dist = os.environ['AS400_DIST_DIR']
else:
    _dist = os.path.join(os.path.dirname(os.path.dirname(__file__)), "dist")

if os.path.isdir(_dist):
    app.mount("/assets", StaticFiles(directory=os.path.join(_dist, "assets")), name="assets")

    @app.get("/{full_path:path}")
    def spa(full_path: str):
        return FileResponse(os.path.join(_dist, "index.html"))
