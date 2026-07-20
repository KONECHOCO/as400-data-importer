
import os, sys, uuid, json, hashlib, platform, time, logging
from datetime import datetime, timezone
from typing import Optional, List, Dict
from pathlib import Path

# Setup local JRE path if present
if getattr(sys, 'frozen', False):
    app_dir = Path(sys.executable).parent
else:
    app_dir = Path(__file__).parent

local_jre_candidates = [app_dir / "jre", app_dir / "jdk"]
for candidate in local_jre_candidates:
    if candidate.exists():
        # Look for subdirectories (e.g. jdk-17.0.19+10-jre) inside extracted zip
        subdirs = [d for d in candidate.iterdir() if d.is_dir() and (d / "bin").exists()]
        if subdirs:
            os.environ["JAVA_HOME"] = str(subdirs[0])
            break
        elif (candidate / "bin").exists():
            os.environ["JAVA_HOME"] = str(candidate)
            break

import httpx
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

CLOUD_URL = os.environ.get("CLOUD_URL", "https://as400.ikonetsolutions.com/api")
LICENSE_KEY = os.environ.get("LICENSE_KEY", "")
AGENT_PORT = int(os.environ.get("AGENT_PORT", "8400"))
CONFIG_FILE = Path(os.environ.get("CONFIG_FILE", "agent_config.json"))

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("as400-agent")

def get_hardware_id() -> str:
    parts = [platform.node(), platform.machine(), platform.processor(), str(uuid.getnode())]
    return hashlib.sha256("-".join(parts).encode()).hexdigest()[:32]

HARDWARE_ID = get_hardware_id()
HOSTNAME = platform.node()

def load_config() -> dict:
    if CONFIG_FILE.exists():
        with open(CONFIG_FILE) as f:
            return json.load(f)
    return {}

def save_config(cfg: dict):
    with open(CONFIG_FILE, "w") as f:
        json.dump(cfg, f, indent=2)

config = load_config()

license_status = {"valid": False, "plan": None, "expires_at": None, "last_verified": None, "error": None}

async def verify_license_with_cloud():
    global license_status
    key = LICENSE_KEY or config.get("license_key", "")
    if not key:
        license_status["error"] = "Nessuna LICENSE_KEY configurata"
        return False
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(f"{CLOUD_URL}/license/verify", json={
                "license_key": key, "hardware_id": HARDWARE_ID, "hostname": HOSTNAME
            })
            if r.status_code == 200:
                data = r.json()
                license_status.update({"valid": True, "plan": data.get("plan"),
                    "expires_at": data.get("expires_at"),
                    "last_verified": datetime.now(timezone.utc).isoformat(),
                    "error": None, "features": data.get("features", [])})
                log.info(f"Licenza valida - Piano: {data.get('plan')}")
                return True
            else:
                err = r.json().get("detail", "Errore sconosciuto")
                license_status.update({"valid": False, "error": err,
                    "last_verified": datetime.now(timezone.utc).isoformat()})
                log.error(f"Licenza non valida: {err}")
                return False
    except Exception as e:
        license_status.update({"valid": False, "error": f"Errore cloud: {e}"})
        log.warning(f"Impossibile verificare licenza: {e}")
        return license_status.get("valid", False)

def require_valid_license():
    if not license_status["valid"]:
        raise HTTPException(status_code=403, detail=f"Licenza non valida: {license_status.get('error', 'non verificata')}")

app = FastAPI(title="AS400 Agent - Ikonet Solutions", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

operations: Dict[str, dict] = {}

class AS400Connection(BaseModel):
    host: str
    user: str
    password: str
    port: int = 23

class ImportRequest(BaseModel):
    connection: AS400Connection
    library: str
    table_name: str
    mode: str
    file_path: str
    field_config: Optional[List[Dict]] = None

class QueryRequest(BaseModel):
    connection: AS400Connection
    sql: str
    limit: Optional[int] = 1000

class ActivateRequest(BaseModel):
    license_key: str

@app.get("/")
async def root():
    return {"service": "AS400 Agent", "version": "1.0.0", "vendor": "Ikonet Solutions",
            "hardware_id": HARDWARE_ID, "hostname": HOSTNAME, "license": license_status}

@app.get("/health")
async def health():
    return {"status": "ok" if license_status["valid"] else "unlicensed",
            "license_valid": license_status["valid"],
            "license_plan": license_status.get("plan"),
            "license_expires": license_status.get("expires_at"),
            "last_verified": license_status.get("last_verified")}

@app.post("/activate")
async def activate(req: ActivateRequest):
    global config, LICENSE_KEY
    config["license_key"] = req.license_key
    save_config(config)
    LICENSE_KEY = req.license_key
    ok = await verify_license_with_cloud()
    if not ok:
        raise HTTPException(status_code=403, detail=license_status.get("error", "Licenza non valida"))
    return {"message": "Licenza attivata!", "plan": license_status.get("plan"), "expires_at": license_status.get("expires_at")}

@app.post("/test-connection")
async def test_connection(conn: AS400Connection):
    require_valid_license()
    return _test_as400_connection(conn.host, conn.user, conn.password)

@app.post("/import")
async def import_data(req: ImportRequest, background_tasks: BackgroundTasks):
    require_valid_license()
    op_id = str(uuid.uuid4())
    operations[op_id] = {"id": op_id, "status": "pending", "created_at": datetime.now(timezone.utc).isoformat()}
    background_tasks.add_task(_run_import, op_id, req)
    return {"operation_id": op_id, "status": "pending", "message": "Import avviato"}

@app.get("/import/{op_id}")
async def get_import_status(op_id: str):
    op = operations.get(op_id)
    if not op:
        raise HTTPException(status_code=404, detail="Operazione non trovata")
    return op

@app.post("/query")
async def run_query(req: QueryRequest):
    require_valid_license()
    return _run_as400_query(req.connection, req.sql, req.limit)

def _get_jar_path() -> str:
    candidates = [Path(__file__).parent / "lib" / "jt400.jar", Path("lib/jt400.jar")]
    for p in candidates:
        if p.exists():
            return str(p)
    raise FileNotFoundError("jt400.jar non trovato")

def _open_as400_connection(host: str, user: str, password: str):
    import jaydebeapi
    jar_path = _get_jar_path()
    u = str(user).upper() if user else ""
    p = str(password) if password is not None else ""
    return jaydebeapi.connect(
        "com.ibm.as400.access.AS400JDBCDriver",
        f"jdbc:as400://{host}/;naming=system;errors=full;",
        [u, p], jar_path)

def _test_as400_connection(host: str, user: str, password: str) -> dict:
    try:
        conn = _open_as400_connection(host, user, password)
        cursor = conn.cursor()
        cursor.execute("SELECT CURRENT_DATE FROM sysibm.sysdummy1")
        row = cursor.fetchone()
        cursor.close(); conn.close()
        return {"success": True, "message": f"Connessione riuscita - Data AS400: {row[0]}"}
    except Exception as e:
        return {"success": False, "error": str(e)}

def _run_as400_query(conn_obj: AS400Connection, sql: str, limit: Optional[int]) -> dict:
    try:
        conn = _open_as400_connection(conn_obj.host, conn_obj.user, conn_obj.password)
        cursor = conn.cursor()
        cursor.execute(sql)
        columns = [d[0] for d in cursor.description] if cursor.description else []
        if limit is not None and limit > 0:
            rows = cursor.fetchmany(limit)
        else:
            rows = cursor.fetchall()
        cursor.close(); conn.close()
        return {"success": True, "columns": columns, "rows": [list(r) for r in rows], "count": len(rows)}
    except Exception as e:
        return {"success": False, "error": str(e)}

async def _run_import(op_id: str, req: ImportRequest):
    import asyncio
    operations[op_id]["status"] = "running"
    operations[op_id]["started_at"] = datetime.now(timezone.utc).isoformat()
    try:
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, _sync_import, req)
        operations[op_id].update({"status": "completed" if result["success"] else "failed",
            "result": result, "completed_at": datetime.now(timezone.utc).isoformat()})
    except Exception as e:
        operations[op_id].update({"status": "failed", "error": str(e),
            "completed_at": datetime.now(timezone.utc).isoformat()})

def smart_read_df(source, ext="csv"):
    import pandas as pd
    import io
    import csv

    ext = str(ext).lower().lstrip(".")
    if ext in ["xlsx", "xls"]:
        if isinstance(source, bytes):
            return pd.read_excel(io.BytesIO(source))
        return pd.read_excel(source)
    elif ext == "xml":
        if isinstance(source, bytes):
            return pd.read_xml(io.BytesIO(source))
        return pd.read_xml(source)

    if isinstance(source, bytes):
        content_bytes = source
    else:
        with open(source, "rb") as f:
            content_bytes = f.read()

    text_sample = None
    encoding_used = "utf-8-sig"
    for enc in ["utf-8-sig", "utf-8", "latin-1"]:
        try:
            text_sample = content_bytes[:100000].decode(enc)
            encoding_used = enc
            break
        except UnicodeDecodeError:
            continue
    if text_sample is None:
        text_sample = content_bytes[:100000].decode("latin-1", errors="replace")
        encoding_used = "latin-1"

    sample_lines = [line for line in text_sample.splitlines()[:30] if line.strip()]
    delims = ['|', ';', '\t', ',', ':']
    counts = {d: [line.count(d) for line in sample_lines] for d in delims}

    best_delim = ','
    best_score = 0
    for d, line_counts in counts.items():
        if not line_counts:
            continue
        avg_c = sum(line_counts) / len(line_counts)
        if avg_c > 0:
            consistent = len(set(line_counts)) == 1
            score = avg_c * (10 if consistent else 1)
            if score > best_score:
                best_score = score
                best_delim = d

    header = 0
    try:
        sample_for_sniffer = "\n".join(sample_lines)
        if not csv.Sniffer().has_header(sample_for_sniffer):
            header = None
    except Exception:
        header = None

    df = pd.read_csv(
        io.BytesIO(content_bytes),
        sep=best_delim,
        header=header,
        encoding=encoding_used,
        dtype=str,
        on_bad_lines="skip"
    )

    if header is None:
        df.columns = [f"COL_{i+1}" for i in range(len(df.columns))]

    return df

def _sync_import(req: ImportRequest) -> dict:
    import pandas as pd
    file_path = Path(req.file_path)
    if not file_path.exists():
        return {"success": False, "error": f"File non trovato: {req.file_path}"}
    ext = file_path.suffix.lower().lstrip(".")
    if ext not in ["xlsx", "xls", "csv", "txt", "xml"]:
        return {"success": False, "error": f"Formato non supportato: .{ext}"}
    try:
        df = smart_read_df(file_path, ext)
    except Exception as read_err:
        return {"success": False, "error": f"Errore lettura file: {read_err}"}
    if df.empty:
        return {"success": False, "error": "File vuoto"}
    if req.field_config:
        columns = [fc["as400_name"] for fc in req.field_config]
        orig_cols = [fc["original"] for fc in req.field_config]
        data_rows = [tuple(row) for row in df[orig_cols].values]
        sql_types = {fc["as400_name"]: fc.get("sql_type", "VARCHAR(500)") for fc in req.field_config}
    else:
        columns = list(df.columns)
        data_rows = [tuple(row) for row in df.values]
        sql_types = {col: "VARCHAR(500)" for col in columns}
    try:
        conn = _open_as400_connection(req.connection.host, req.connection.user, req.connection.password)
        cursor = conn.cursor()
        inserted = 0
        errors = []
        if req.mode == "create":
            cols_sql = ", ".join([f"{col} {sql_types.get(col, 'VARCHAR(500)')}" for col in columns])
            try:
                cursor.execute(f"CREATE TABLE {req.library}.{req.table_name} ({cols_sql})")
                conn.commit()
            except Exception as e:
                if "already exists" not in str(e).lower() and "sql0601" not in str(e).lower():
                    raise Exception(f"Errore creazione tabella: {e}")
        if req.mode in ["create", "insert"]:
            cols_str = ", ".join(columns)
            placeholders = ", ".join(["?" for _ in columns])
            sql = f"INSERT INTO {req.library}.{req.table_name} ({cols_str}) VALUES ({placeholders})"
            for i in range(0, len(data_rows), 500):
                batch = data_rows[i:i+500]
                batch_vals = []
                for row in batch:
                    vals = [None if (v is None or (isinstance(v, float) and v != v)) else v for v in row]
                    batch_vals.append(vals)
                try:
                    cursor.executemany(sql, batch_vals)
                    inserted += len(batch)
                except Exception as batch_err:
                    log.warning(f"Batch insert fallito, fallback a riga singola: {batch_err}")
                    for vals in batch_vals:
                        try:
                            cursor.execute(sql, vals)
                            inserted += 1
                        except Exception as row_err:
                            errors.append(str(row_err))
                conn.commit()
        cursor.close(); conn.close()
        if errors and inserted == 0:
            return {"success": False, "error": errors[0], "errors": errors[:5]}
        return {"success": True, "inserted": inserted, "total": len(data_rows), "warnings": errors[:3]}
    except Exception as e:
        import traceback
        return {"success": False, "error": str(e), "detail": traceback.format_exc()}

def get_ws_url() -> str:
    key = LICENSE_KEY or config.get("license_key", "")
    base = CLOUD_URL.replace("https://", "wss://").replace("http://", "ws://")
    if base.endswith("/api"):
        return f"{base}/ws/agent?license_key={key}"
    elif base.endswith("/api/"):
        return f"{base}ws/agent?license_key={key}"
    else:
        return f"{base}/api/ws/agent?license_key={key}"

async def _ws_loop():
    import asyncio
    import websockets
    import json
    
    while True:
        key = LICENSE_KEY or config.get("license_key", "")
        if not key:
            log.warning("Nessuna chiave di licenza configurata. In attesa di attivazione...")
            await asyncio.sleep(10)
            continue
            
        ws_url = get_ws_url()
        log.info(f"Connessione al canale WebSocket del Cloud: {ws_url.split('?')[0]}")
        try:
            async with websockets.connect(ws_url, ping_interval=20, ping_timeout=20, max_size=500 * 1024 * 1024) as ws:
                log.info("Connessione WebSocket stabilita con il Cloud!")
                while True:
                    msg_str = await ws.recv()
                    msg = json.loads(msg_str)
                    action = msg.get("action")
                    req_id = msg.get("request_id")
                    req_data = msg.get("data", {})
                    
                    log.info(f"Ricevuto comando [{action}] - ID: {req_id}")
                    asyncio.create_task(_handle_ws_command(ws, action, req_id, req_data))
        except Exception as e:
            log.warning(f"Errore WebSocket o disconnessione: {e}. Riconnessione tra 5 secondi...")
            await asyncio.sleep(5)

async def _handle_ws_command(ws, action: str, req_id: str, req_data: dict):
    import json
    import base64
    import tempfile
    
    response = {"request_id": req_id, "success": False}
    try:
        if action == "test-connection":
            host = req_data.get("host")
            user = req_data.get("user")
            password = req_data.get("password")
            res = _test_as400_connection(host, user, password)
            response.update(res)
            
        elif action == "query":
            conn_data = req_data.get("connection", {})
            conn_obj = AS400Connection(
                host=conn_data.get("host"),
                user=conn_data.get("user"),
                password=conn_data.get("password"),
                port=conn_data.get("port", 23)
            )
            sql = req_data.get("sql")
            limit = req_data.get("limit", 1000)
            res = _run_as400_query(conn_obj, sql, limit)
            response.update(res)
            
        elif action == "import":
            conn_data = req_data.get("connection", {})
            conn_obj = AS400Connection(
                host=conn_data.get("host"),
                user=conn_data.get("user"),
                password=conn_data.get("password"),
                port=conn_data.get("port", 23)
            )
            file_ext = req_data.get("file_ext", "csv")
            
            # Ottieni i bytes del file (via HTTP download o base64)
            if req_data.get("file_url"):
                import requests
                log.info(f"Scaricamento file dal Cloud: {req_data['file_url']}")
                r = requests.get(req_data["file_url"], timeout=300)
                if r.status_code != 200:
                    raise Exception(f"Impossibile scaricare il file dal Cloud (HTTP {r.status_code})")
                file_bytes = r.content
            elif req_data.get("file_content_b64"):
                file_bytes = base64.b64decode(req_data["file_content_b64"])
            else:
                raise Exception("Nessun contenuto file fornito")

            # Scrivi il file temporaneo
            with tempfile.NamedTemporaryFile(delete=False, suffix=f".{file_ext}") as tmp:
                tmp.write(file_bytes)
                tmp_path = tmp.name
                
            req = ImportRequest(
                connection=conn_obj,
                library=req_data.get("library"),
                table_name=req_data.get("table_name"),
                mode=req_data.get("mode"),
                file_path=tmp_path,
                field_config=req_data.get("field_config")
            )
            
            loop = asyncio.get_running_loop()
            res = await loop.run_in_executor(None, _sync_import, req)
            
            try:
                import os
                os.unlink(tmp_path)
            except:
                pass
                
            response.update(res)
        else:
            response["error"] = f"Azione sconosciuta: {action}"
    except Exception as e:
        response["error"] = str(e)
        
    try:
        await ws.send(json.dumps(response))
    except Exception as e:
        log.error(f"Impossibile inviare risposta al WebSocket: {e}")

@app.on_event("startup")
async def startup():
    import asyncio
    log.info(f"AS400 Agent avviato su porta {AGENT_PORT}")
    log.info(f"Hardware ID: {HARDWARE_ID}")
    await verify_license_with_cloud()
    asyncio.create_task(_license_loop())
    asyncio.create_task(_ws_loop())

async def _license_loop():
    import asyncio
    while True:
        await asyncio.sleep(3600)
        await verify_license_with_cloud()

if __name__ == "__main__":
    try:
        uvicorn.run(app, host="0.0.0.0", port=AGENT_PORT, reload=False)
    except Exception as e:
        uvicorn.run(app, host="0.0.0.0", port=AGENT_PORT + 1, reload=False)

