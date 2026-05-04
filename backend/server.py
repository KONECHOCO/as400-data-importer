from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, APIRouter, HTTPException, Depends, BackgroundTasks, UploadFile, File, Form
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from starlette.middleware.cors import CORSMiddleware
from starlette.staticfiles import StaticFiles
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta, timedelta
import bcrypt
import jwt
import secrets
from bson import ObjectId
import paypalrestsdk
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail
import resend
import asyncio
import json

# ── LOGGING ──────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

ROOT_DIR = Path(__file__).parent

# ── MONGODB ──────────────────────────────────────────────────
mongo_url = os.environ['MONGO_URL']
client_db = AsyncIOMotorClient(mongo_url)
db = client_db[os.environ.get('DB_NAME', 'as400importer')]

# ── JWT ──────────────────────────────────────────────────────
JWT_SECRET = os.environ.get("JWT_SECRET", secrets.token_hex(32))
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24

# ── EMAIL (Resend) ───────────────────────────────────────────
RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
SENDGRID_API_KEY = os.environ.get("SENDGRID_API_KEY", "")
SENDER_EMAIL = os.environ.get("SENDER_EMAIL", "AS400 Importer <noreply@ikonetsolutions.com>")
if RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY

# ── PAYPAL ────────────────────────────────────────────────────
PAYPAL_CLIENT_ID  = os.environ.get("PAYPAL_CLIENT_ID", "sb")
PAYPAL_SECRET     = os.environ.get("PAYPAL_SECRET", "sb")
PAYPAL_MODE       = os.environ.get("PAYPAL_MODE", "sandbox")
FRONTEND_URL      = os.environ.get("FRONTEND_URL", "https://as400.ikonetsolutions.com")

paypalrestsdk.configure({
    "mode": PAYPAL_MODE,
    "client_id": PAYPAL_CLIENT_ID,
    "client_secret": PAYPAL_SECRET
})

# ── PIANI ABBONAMENTO ─────────────────────────────────────────
PLANS = {
    "starter": {
        "id": "starter",
        "name": "Starter",
        "price": 29.00,
        "currency": "EUR",
        "interval": "month",
        "description": "Per piccole aziende",
        "features": [
            "1 connessione AS/400",
            "Import fino a 50.000 righe/mese",
            "Export CSV ed Excel",
            "1 utente",
            "Support email"
        ],
        "limits": {
            "connections": 1,
            "users": 1,
            "rows_per_month": 50000,
            "export_formats": ["csv", "xlsx"],
            "saved_queries": 10,
            "history_days": 30
        }
    },
    "business": {
        "id": "business",
        "name": "Business",
        "price": 79.00,
        "currency": "EUR",
        "interval": "month",
        "description": "Per aziende in crescita",
        "popular": True,
        "features": [
            "3 connessioni AS/400",
            "Import illimitato",
            "Export CSV, Excel, XML, JSON",
            "5 utenti",
            "Saved queries illimitate",
            "Storico 90 giorni",
            "Support prioritario"
        ],
        "limits": {
            "connections": 3,
            "users": 5,
            "rows_per_month": -1,
            "export_formats": ["csv", "xlsx", "xml", "json"],
            "saved_queries": -1,
            "history_days": 90
        }
    },
    "enterprise": {
        "id": "enterprise",
        "name": "Enterprise",
        "price": 199.00,
        "currency": "EUR",
        "interval": "month",
        "description": "Per grandi organizzazioni",
        "features": [
            "Connessioni illimitate",
            "Utenti illimitati",
            "Tutte le funzionalità",
            "Storico illimitato",
            "API REST dedicata",
            "SLA garantito",
            "Support dedicato"
        ],
        "limits": {
            "connections": -1,
            "users": -1,
            "rows_per_month": -1,
            "export_formats": ["csv", "xlsx", "xml", "json"],
            "saved_queries": -1,
            "history_days": -1
        }
    }
}

# ── APP ───────────────────────────────────────────────────────
app = FastAPI(title="AS400 Data Importer API", version="2.0.0")
api_router = APIRouter(prefix="/api")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

security = HTTPBearer()

# ══════════════════════════════════════════════════════════════
#  MODELS
# ══════════════════════════════════════════════════════════════

class UserRegister(BaseModel):
    email: EmailStr
    password: str
    name: str
    company: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    company: str
    role: str
    plan: str
    plan_status: str
    plan_expires: Optional[datetime]
    trial_ends: Optional[datetime]
    is_active: bool
    created_at: datetime

class AS400Connection(BaseModel):
    name: str
    host: str
    user: str
    password: str
    port: int = 446
    library: str = "*LIBL"
    description: Optional[str] = None

class AS400ConnectionResponse(BaseModel):
    id: str
    name: str
    host: str
    user: str
    port: int
    library: str
    description: Optional[str]
    created_at: datetime
    last_used: Optional[datetime]

class ImportRequest(BaseModel):
    connection_id: str
    library: str
    table_name: str
    mode: str  # create, insert, update
    field_config: Optional[List[Dict]] = None

class QueryRequest(BaseModel):
    connection_id: str
    sql: str
    limit: Optional[int] = 1000

class SavedQuery(BaseModel):
    name: str
    sql: str
    connection_id: Optional[str] = None
    tags: Optional[str] = ""

class SubscriptionCreate(BaseModel):
    plan_id: str

class PayPalCaptureRequest(BaseModel):
    payment_id: str
    payer_id: str
    plan_id: str

# ══════════════════════════════════════════════════════════════
#  AUTH HELPERS
# ══════════════════════════════════════════════════════════════

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())

def create_token(user_id: str, email: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="Utente non trovato")
        if not user.get("is_active", True):
            raise HTTPException(status_code=401, detail="Account disabilitato")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token scaduto")
    except Exception:
        raise HTTPException(status_code=401, detail="Token non valido")

async def require_active_plan(user = Depends(get_current_user)):
    """Verifica che l'utente abbia un piano attivo o trial"""
    plan_status = user.get("plan_status", "trial")
    if plan_status == "expired":
        raise HTTPException(status_code=403, detail="Abbonamento scaduto. Rinnova il piano per continuare.")
    if plan_status == "cancelled":
        raise HTTPException(status_code=403, detail="Abbonamento cancellato.")
    return user

def check_plan_limit(user: dict, limit_key: str, current_count: int = 0) -> bool:
    """Controlla se l'utente ha raggiunto il limite del piano"""
    plan_id = user.get("plan", "starter")
    plan = PLANS.get(plan_id, PLANS["starter"])
    limit = plan["limits"].get(limit_key, 0)
    if limit == -1:  # illimitato
        return True
    return current_count < limit

# ══════════════════════════════════════════════════════════════
#  AUTH ENDPOINTS
# ══════════════════════════════════════════════════════════════

@api_router.post("/auth/register")
async def register(data: UserRegister, background_tasks: BackgroundTasks):
    # Verifica email già usata
    existing = await db.users.find_one({"email": data.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email già registrata")

    # Crea utente con trial 14 giorni
    user_id = str(uuid.uuid4())
    trial_ends = datetime.now(timezone.utc) + timedelta(days=14)
    user = {
        "_id": ObjectId(),
        "id": user_id,
        "email": data.email.lower(),
        "password": hash_password(data.password),
        "name": data.name,
        "company": data.company,
        "role": "admin",
        "plan": "starter",
        "plan_status": "trial",  # trial, active, expired, cancelled
        "plan_expires": None,
        "trial_ends": trial_ends,
        "is_active": True,
        "created_at": datetime.now(timezone.utc)
    }
    await db.users.insert_one(user)

    # Email di benvenuto
    background_tasks.add_task(send_welcome_email, data.email, data.name, trial_ends)

    token = create_token(str(user["_id"]), user["email"], user["role"])
    return {
        "token": token,
        "user": {
            "id": str(user["_id"]),
            "email": user["email"],
            "name": user["name"],
            "company": user["company"],
            "role": user["role"],
            "plan": user["plan"],
            "plan_status": user["plan_status"],
            "trial_ends": user["trial_ends"].isoformat()
        },
        "message": f"Benvenuto! Hai 14 giorni di prova gratuita."
    }

@api_router.post("/auth/login")
async def login(data: UserLogin):
    user = await db.users.find_one({"email": data.email.lower()})
    if not user or not verify_password(data.password, user["password"]):
        raise HTTPException(status_code=401, detail="Email o password non corretti")
    if not user.get("is_active", True):
        raise HTTPException(status_code=401, detail="Account disabilitato")

    # Controlla se trial è scaduto
    trial_ends = user.get("trial_ends")
    if user.get("plan_status") == "trial" and trial_ends:
        if datetime.now(timezone.utc) > trial_ends.replace(tzinfo=timezone.utc):
            await db.users.update_one(
                {"_id": user["_id"]},
                {"$set": {"plan_status": "expired"}}
            )
            user["plan_status"] = "expired"

    token = create_token(str(user["_id"]), user["email"], user["role"])
    return {
        "token": token,
        "user": {
            "id": str(user["_id"]),
            "email": user["email"],
            "name": user["name"],
            "company": user.get("company", ""),
            "role": user["role"],
            "plan": user.get("plan", "starter"),
            "plan_status": user.get("plan_status", "trial"),
            "trial_ends": user.get("trial_ends", "").isoformat() if user.get("trial_ends") else None,
            "plan_expires": user.get("plan_expires", "").isoformat() if user.get("plan_expires") else None
        }
    }

@api_router.get("/auth/me")
async def get_me(user = Depends(get_current_user)):
    return {
        "id": str(user["_id"]),
        "email": user["email"],
        "name": user["name"],
        "company": user.get("company", ""),
        "role": user["role"],
        "plan": user.get("plan", "starter"),
        "plan_status": user.get("plan_status", "trial"),
        "trial_ends": user.get("trial_ends", "").isoformat() if user.get("trial_ends") else None,
        "plan_expires": user.get("plan_expires", "").isoformat() if user.get("plan_expires") else None,
        "is_admin": user.get("is_admin", False)
    }

@api_router.post("/auth/change-password")
async def change_password(data: dict, user = Depends(get_current_user)):
    old_pwd = data.get("old_password", "")
    new_pwd = data.get("new_password", "")
    if not verify_password(old_pwd, user["password"]):
        raise HTTPException(status_code=400, detail="Password attuale non corretta")
    await db.users.update_one(
        {"_id": user["_id"]},
        {"$set": {"password": hash_password(new_pwd)}}
    )
    return {"message": "Password aggiornata"}

# ══════════════════════════════════════════════════════════════
#  AS400 CONNECTIONS
# ══════════════════════════════════════════════════════════════

@api_router.get("/connections")
async def get_connections(user = Depends(require_active_plan)):
    conns = await db.connections.find(
        {"user_id": str(user["_id"]), "is_deleted": {"$ne": True}}
    ).to_list(100)
    return [{
        "id": str(c["_id"]),
        "name": c["name"],
        "host": c["host"],
        "user": c["user"],
        "port": c.get("port", 446),
        "library": c.get("library", "*LIBL"),
        "description": c.get("description"),
        "created_at": c["created_at"].isoformat(),
        "last_used": c.get("last_used", "").isoformat() if c.get("last_used") else None
    } for c in conns]

@api_router.post("/connections")
async def create_connection(data: AS400Connection, user = Depends(require_active_plan)):
    # Controlla limite connessioni del piano
    count = await db.connections.count_documents(
        {"user_id": str(user["_id"]), "is_deleted": {"$ne": True}}
    )
    if not check_plan_limit(user, "connections", count):
        plan = PLANS.get(user.get("plan", "starter"))
        max_conn = plan["limits"]["connections"]
        raise HTTPException(
            status_code=403,
            detail=f"Limite connessioni raggiunto ({max_conn}). Aggiorna il piano."
        )

    # Cripta la password
    import base64
    encrypted_pwd = base64.b64encode(data.password.encode()).decode()

    conn = {
        "user_id": str(user["_id"]),
        "name": data.name,
        "host": data.host,
        "user": data.user,
        "password_enc": encrypted_pwd,
        "port": data.port,
        "library": data.library,
        "description": data.description,
        "created_at": datetime.now(timezone.utc),
        "last_used": None,
        "is_deleted": False
    }
    result = await db.connections.insert_one(conn)
    return {"id": str(result.inserted_id), "message": "Connessione creata"}

@api_router.delete("/connections/{conn_id}")
async def delete_connection(conn_id: str, user = Depends(get_current_user)):
    await db.connections.update_one(
        {"_id": ObjectId(conn_id), "user_id": str(user["_id"])},
        {"$set": {"is_deleted": True}}
    )
    return {"message": "Connessione eliminata"}

@api_router.post("/connections/{conn_id}/test")
async def test_connection(conn_id: str, user = Depends(require_active_plan)):
    conn = await db.connections.find_one(
        {"_id": ObjectId(conn_id), "user_id": str(user["_id"])}
    )
    if not conn:
        raise HTTPException(status_code=404, detail="Connessione non trovata")

    try:
        import base64
        password = base64.b64decode(conn["password_enc"]).decode()
        result = await asyncio.get_event_loop().run_in_executor(
            None, _test_as400_connection, conn["host"], conn["user"], password
        )
        if result["success"]:
            await db.connections.update_one(
                {"_id": conn["_id"]},
                {"$set": {"last_used": datetime.now(timezone.utc)}}
            )
        return result
    except Exception as e:
        return {"success": False, "message": str(e)}

def _test_as400_connection(host: str, user: str, password: str) -> dict:
    """Test connessione AS/400 sincrona (eseguita in thread)"""
    try:
        import jaydebeapi
        jar_path = os.path.join(ROOT_DIR, "lib", "jt400.jar")
        url = (f"jdbc:as400://{host};"
               f"user={user};password={password};"
               f"prompt=false;secure=false")
        conn = jaydebeapi.connect(
            "com.ibm.as400.access.AS400JDBCDriver",
            url, [user, password], jar_path
        )
        conn.close()
        return {"success": True, "message": "Connessione riuscita"}
    except Exception as e:
        return {"success": False, "message": str(e)}

# ══════════════════════════════════════════════════════════════
#  IMPORT
# ══════════════════════════════════════════════════════════════

@api_router.post("/import")
async def import_data(
    file: UploadFile = File(...),
    connection_id: str = Form(...),
    library: str = Form(...),
    table_name: str = Form(...),
    mode: str = Form(...),
    field_config: Optional[str] = Form(None),
    user = Depends(require_active_plan),
    background_tasks: BackgroundTasks = BackgroundTasks()
):
    import json
    request = ImportRequest(
        connection_id=connection_id,
        library=library,
        table_name=table_name,
        mode=mode,
        field_config=json.loads(field_config) if field_config else None
    )
    # Controlla limite righe mensili
    plan_id = user.get("plan", "starter")
    plan = PLANS.get(plan_id, PLANS["starter"])
    max_rows = plan["limits"]["rows_per_month"]

    if max_rows != -1:
        # Conta righe importate questo mese
        month_start = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0)
        rows_this_month = await db.operations.aggregate([
            {"$match": {
                "user_id": str(user["_id"]),
                "type": "import",
                "created_at": {"$gte": month_start}
            }},
            {"$group": {"_id": None, "total": {"$sum": "$rows_count"}}}
        ]).to_list(1)
        current_rows = rows_this_month[0]["total"] if rows_this_month else 0
        if current_rows >= max_rows:
            raise HTTPException(
                status_code=403,
                detail=f"Limite righe mensile raggiunto ({max_rows:,}). Aggiorna il piano."
            )

    # Leggi file
    content = await file.read()
    filename = file.filename
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "csv"

    # Log operazione
    op_id = str(uuid.uuid4())
    await db.operations.insert_one({
        "id": op_id,
        "user_id": str(user["_id"]),
        "type": "import",
        "status": "pending",
        "filename": filename,
        "connection_id": request.connection_id,
        "library": request.library,
        "table_name": request.table_name,
        "mode": request.mode,
        "rows_count": 0,
        "created_at": datetime.now(timezone.utc)
    })

    # Esegui import in background
    background_tasks.add_task(
        _run_import, op_id, content, ext, request, user, plan
    )

    return {"operation_id": op_id, "message": "Import avviato", "status": "pending"}

async def _run_import(op_id, content, ext, request, user, plan):
    """Esegue l'import in background"""
    try:
        import pandas as pd
        import io

        # Leggi dataframe
        if ext in ["xlsx", "xls"]:
            df = pd.read_excel(io.BytesIO(content))
        elif ext == "xml":
            df = pd.read_xml(io.BytesIO(content))
        else:
            df = pd.read_csv(io.BytesIO(content), encoding="utf-8-sig")

        rows = len(df)

        # Aggiorna contatore
        await db.operations.update_one(
            {"id": op_id},
            {"$set": {"rows_count": rows, "status": "running"}}
        )

        # Ottieni connessione
        conn_doc = await db.connections.find_one({"_id": ObjectId(request.connection_id)})
        if not conn_doc:
            raise Exception("Connessione non trovata")

        import base64
        password = base64.b64decode(conn_doc["password_enc"]).decode()

        # Import AS/400 in thread
        result = await asyncio.get_event_loop().run_in_executor(
            None, _sync_import,
            conn_doc["host"], conn_doc["user"], password,
            request.library, request.table_name, request.mode,
            df, request.field_config
        )

        await db.operations.update_one(
            {"id": op_id},
            {"$set": {
                "status": "completed" if result["success"] else "failed",
                "result": result,
                "error": result.get("error") if not result["success"] else None,
                "completed_at": datetime.now(timezone.utc)
            }}
        )

    except Exception as e:
        await db.operations.update_one(
            {"id": op_id},
            {"$set": {"status": "failed", "error": str(e)}}
        )

def _sync_import(host, user, password, library, table_name, mode, df, field_config):
    """Import AS/400 sincrono"""
    try:
        import jaydebeapi
        jar_path = os.path.join(ROOT_DIR, "lib", "jt400.jar")
        url = (f"jdbc:as400://{host};user={user};password={password};"
               f"prompt=false;secure=false")
        conn = jaydebeapi.connect(
            "com.ibm.as400.access.AS400JDBCDriver",
            url, [user, password], jar_path
        )
        cursor = conn.cursor()

        # Prepara colonne
        if field_config:
            columns = [fc["as400_name"] for fc in field_config]
            orig_cols = [fc["original"] for fc in field_config]
            data_rows = [tuple(row) for row in df[orig_cols].values]
            sql_types = {fc["as400_name"]: fc["sql_type"] for fc in field_config}
        else:
            columns = list(df.columns)
            data_rows = [tuple(row) for row in df.values]
            sql_types = {col: "VARCHAR(500)" for col in columns}

        # Crea tabella se necessario
        if mode == "create":
            cols_sql = ", ".join([f"{col} {sql_types.get(col, 'VARCHAR(500)')}" for col in columns])
            try:
                cursor.execute(f"CREATE TABLE {library}.{table_name} ({cols_sql})")
                conn.commit()
            except Exception as create_err:
                err_msg = str(create_err).lower()
                if "already exists" not in err_msg and "sql0601" not in err_msg and "duplicate" not in err_msg:
                    raise Exception(f"Errore creazione tabella {library}.{table_name}: {create_err}")

        # Insert/Update
        inserted = 0
        errors = []
        if mode in ["create", "insert"]:
            cols_str = ", ".join(columns)
            placeholders = ", ".join(["?" for _ in columns])
            sql = f"INSERT INTO {library}.{table_name} ({cols_str}) VALUES ({placeholders})"
            for i in range(0, len(data_rows), 500):
                batch = data_rows[i:i+500]
                for row in batch:
                    vals = [None if (v is None or (isinstance(v, float) and v != v)) else v for v in row]
                    try:
                        cursor.execute(sql, vals)
                        inserted += 1
                    except Exception as row_err:
                        errors.append(str(row_err))
                conn.commit()

        cursor.close()
        conn.close()
        if errors:
            return {"success": False, "error": f"Errore import: {errors[0]}", "inserted": inserted, "total": len(data_rows), "errors": errors[:5]}
        return {"success": True, "inserted": inserted, "total": len(data_rows)}

    except Exception as e:
        import traceback
        return {"success": False, "error": str(e), "detail": traceback.format_exc()}
@api_router.get("/import/{op_id}/status")
async def get_import_status(op_id: str, user = Depends(get_current_user)):
    op = await db.operations.find_one({"id": op_id, "user_id": str(user["_id"])})
    if not op:
        raise HTTPException(status_code=404, detail="Operazione non trovata")
    return {
        "id": op["id"],
        "status": op["status"],
        "rows_count": op.get("rows_count", 0),
        "result": op.get("result"),
        "error": op.get("error"),
        "created_at": op["created_at"].isoformat()
    }

# ══════════════════════════════════════════════════════════════
#  EXPORT / QUERY
# ══════════════════════════════════════════════════════════════

@api_router.post("/query")
async def execute_query(data: QueryRequest, user = Depends(require_active_plan)):
    conn_doc = await db.connections.find_one(
        {"_id": ObjectId(data.connection_id), "user_id": str(user["_id"])}
    )
    if not conn_doc:
        raise HTTPException(status_code=404, detail="Connessione non trovata")

    # Controlla formato export nel piano
    import base64
    password = base64.b64decode(conn_doc["password_enc"]).decode()

    try:
        result = await asyncio.get_event_loop().run_in_executor(
            None, _sync_query, conn_doc["host"], conn_doc["user"], password, data.sql, data.limit
        )

        # Log operazione export
        await db.operations.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": str(user["_id"]),
            "type": "export",
            "status": "completed",
            "sql": data.sql,
            "rows_count": len(result),
            "created_at": datetime.now(timezone.utc)
        })

        return {"data": result, "rows": len(result)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

def _sync_query(host, user, password, sql, limit):
    """Esegue query AS/400 sincrona"""
    import jaydebeapi
    jar_path = os.path.join(ROOT_DIR, "lib", "jt400.jar")
    url = (f"jdbc:as400://{host};user={user};password={password};"
           f"prompt=false;secure=false")
    conn = jaydebeapi.connect(
        "com.ibm.as400.access.AS400JDBCDriver",
        url, [user, password], jar_path
    )
    cursor = conn.cursor()

    # Aggiungi FETCH FIRST se non presente
    if limit and "FETCH FIRST" not in sql.upper():
        sql = f"{sql} FETCH FIRST {limit} ROWS ONLY"

    cursor.execute(sql)
    columns = [desc[0] for desc in cursor.description]
    rows = cursor.fetchall()
    cursor.close()
    conn.close()

    return [dict(zip(columns, [str(v) if v is not None else "" for v in row])) for row in rows]

# ══════════════════════════════════════════════════════════════
#  SAVED QUERIES
# ══════════════════════════════════════════════════════════════

@api_router.get("/saved-queries")
async def get_saved_queries(user = Depends(get_current_user)):
    queries = await db.saved_queries.find(
        {"user_id": str(user["_id"])}
    ).sort("created_at", -1).to_list(200)
    return [{
        "id": str(q["_id"]),
        "name": q["name"],
        "sql": q["sql"],
        "tags": q.get("tags", ""),
        "uses": q.get("uses", 0),
        "created_at": q["created_at"].isoformat()
    } for q in queries]

@api_router.post("/saved-queries")
async def save_query(data: SavedQuery, user = Depends(require_active_plan)):
    # Controlla limite saved queries
    count = await db.saved_queries.count_documents({"user_id": str(user["_id"])})
    if not check_plan_limit(user, "saved_queries", count):
        raise HTTPException(status_code=403, detail="Limite saved queries raggiunto. Aggiorna il piano.")

    result = await db.saved_queries.insert_one({
        "user_id": str(user["_id"]),
        "name": data.name,
        "sql": data.sql,
        "tags": data.tags,
        "uses": 0,
        "created_at": datetime.now(timezone.utc)
    })
    return {"id": str(result.inserted_id), "message": "Query salvata"}

@api_router.delete("/saved-queries/{query_id}")
async def delete_saved_query(query_id: str, user = Depends(get_current_user)):
    await db.saved_queries.delete_one({"_id": ObjectId(query_id), "user_id": str(user["_id"])})
    return {"message": "Query eliminata"}

# ══════════════════════════════════════════════════════════════
#  STORICO OPERAZIONI
# ══════════════════════════════════════════════════════════════

@api_router.get("/operations")
async def get_operations(user = Depends(get_current_user)):
    plan_id = user.get("plan", "starter")
    plan = PLANS.get(plan_id, PLANS["starter"])
    history_days = plan["limits"]["history_days"]

    query = {"user_id": str(user["_id"])}
    if history_days != -1:
        cutoff = datetime.now(timezone.utc) - timedelta(days=history_days)
        query["created_at"] = {"$gte": cutoff}

    ops = await db.operations.find(query).sort("created_at", -1).limit(100).to_list(100)
    return [{
        "id": op.get("id"),
        "type": op["type"],
        "status": op["status"],
        "filename": op.get("filename"),
        "sql": op.get("sql"),
        "rows_count": op.get("rows_count", 0),
        "library": op.get("library"),
        "table_name": op.get("table_name"),
        "created_at": op["created_at"].isoformat()
    } for op in ops]

# ══════════════════════════════════════════════════════════════
#  PIANI E ABBONAMENTI
# ══════════════════════════════════════════════════════════════

@api_router.get("/plans")
async def get_plans():
    return {"plans": list(PLANS.values()), "paypal_client_id": PAYPAL_CLIENT_ID}

@api_router.get("/subscription")
async def get_subscription(user = Depends(get_current_user)):
    plan_id = user.get("plan", "starter")
    plan = PLANS.get(plan_id, PLANS["starter"])
    return {
        "plan": plan,
        "plan_status": user.get("plan_status", "trial"),
        "plan_expires": user.get("plan_expires", "").isoformat() if user.get("plan_expires") else None,
        "trial_ends": user.get("trial_ends", "").isoformat() if user.get("trial_ends") else None,
    }

@api_router.post("/subscription/create-payment")
async def create_subscription_payment(data: SubscriptionCreate, user = Depends(get_current_user)):
    plan = PLANS.get(data.plan_id)
    if not plan:
        raise HTTPException(status_code=400, detail="Piano non valido")

    payment = paypalrestsdk.Payment({
        "intent": "sale",
        "payer": {"payment_method": "paypal"},
        "redirect_urls": {
            "return_url": f"{FRONTEND_URL}/payment/success?plan={data.plan_id}",
            "cancel_url": f"{FRONTEND_URL}/payment/cancel"
        },
        "transactions": [{
            "amount": {
                "total": f"{plan['price']:.2f}",
                "currency": plan["currency"]
            },
            "description": f"AS400 Importer — Piano {plan['name']} ({plan['interval']})"
        }]
    })

    if payment.create():
        approval_url = next(l["href"] for l in payment.links if l["rel"] == "approval_url")
        return {"payment_id": payment.id, "approval_url": approval_url}
    else:
        raise HTTPException(status_code=500, detail=f"Errore PayPal: {payment.error}")

@api_router.post("/subscription/capture-payment")
async def capture_subscription_payment(
    data: PayPalCaptureRequest,
    user = Depends(get_current_user),
    background_tasks: BackgroundTasks = BackgroundTasks()
):
    plan = PLANS.get(data.plan_id)
    if not plan:
        raise HTTPException(status_code=400, detail="Piano non valido")

    payment = paypalrestsdk.Payment.find(data.payment_id)
    if payment.execute({"payer_id": data.payer_id}):
        # Aggiorna abbonamento utente (30 giorni)
        expires = datetime.now(timezone.utc) + timedelta(days=30)
        await db.users.update_one(
            {"_id": user["_id"]},
            {"$set": {
                "plan": data.plan_id,
                "plan_status": "active",
                "plan_expires": expires,
                "trial_ends": None
            }}
        )

        # Salva transazione
        await db.transactions.insert_one({
            "user_id": str(user["_id"]),
            "payment_id": data.payment_id,
            "plan_id": data.plan_id,
            "amount": plan["price"],
            "currency": plan["currency"],
            "status": "completed",
            "created_at": datetime.now(timezone.utc)
        })

        # Email conferma
        background_tasks.add_task(
            send_subscription_email, user["email"], user["name"], plan, expires
        )

        return {"success": True, "message": f"Piano {plan['name']} attivato!", "expires": expires.isoformat()}
    else:
        raise HTTPException(status_code=500, detail=f"Errore cattura PayPal: {payment.error}")

# ══════════════════════════════════════════════════════════════
#  EMAIL HELPERS
# ══════════════════════════════════════════════════════════════

async def send_welcome_email(email: str, name: str, trial_ends: datetime):
    if not SENDGRID_API_KEY:
        return
    try:
        from sendgrid import SendGridAPIClient
        from sendgrid.helpers.mail import Mail
        sg = SendGridAPIClient(SENDGRID_API_KEY)
        msg = Mail(
            from_email="supporto@ikonetsolutions.com",
            to_emails=email,
            subject="Benvenuto su AS400 Data Importer — 14 giorni gratis!",
            html_content=f"""<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:40px;background:#0f1117;border-radius:12px;">
<h1 style="color:#4f9cf9;text-align:center;">Benvenuto, {name}! 👋</h1>
<p style="color:#9ca3af;">Il tuo periodo di prova gratuita è attivo fino al <strong style="color:#fff;">{trial_ends.strftime('%d/%m/%Y')}</strong>.</p>
<div style="text-align:center;margin:30px 0;">
<a href="{FRONTEND_URL}" style="background:#4f9cf9;color:white;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:700;">Inizia ora →</a>
</div>
<p style="color:#4b5563;font-size:12px;text-align:center;">© 2026 Ikonet Solutions</p>
</div>"""
        )
        sg.send(msg)
        logger.info(f"Welcome email inviata a {email}")
    except Exception as e:
        logger.error(f"Errore welcome email: {e}")


async def send_subscription_email(email: str, name: str, plan: dict, expires: datetime):
    if not SENDGRID_API_KEY:
        return
    try:
        from sendgrid import SendGridAPIClient
        from sendgrid.helpers.mail import Mail
        sg = SendGridAPIClient(SENDGRID_API_KEY)
        msg = Mail(
            from_email="supporto@ikonetsolutions.com",
            to_emails=email,
            subject=f"Piano {plan['name']} attivato — AS400 Data Importer",
            html_content=f"""<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:40px;background:#0f1117;border-radius:12px;">
<h1 style="color:#22c55e;text-align:center;">🎉 Abbonamento Attivato!</h1>
<p style="color:#9ca3af;">Grazie <strong style="color:#fff;">{name}</strong>! Piano <strong style="color:#22c55e;">{plan['name']}</strong> attivato.</p>
<p style="color:#9ca3af;">💰 {plan['price']:.2f} {plan['currency']}/mese — Scade il {expires.strftime('%d/%m/%Y')}</p>
<div style="text-align:center;margin:30px 0;">
<a href="{FRONTEND_URL}/dashboard" style="background:#22c55e;color:white;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:700;">Vai alla Dashboard →</a>
</div>
<p style="color:#4b5563;font-size:12px;text-align:center;">© 2026 Ikonet Solutions</p>
</div>"""
        )
        sg.send(msg)
        logger.info(f"Subscription email inviata a {email}")
    except Exception as e:
        logger.error(f"Errore subscription email: {e}")


async def health():
    return {"status": "ok", "service": "AS400 Data Importer API", "version": "2.0.0"}


@api_router.post("/auth/forgot-password")
async def forgot_password(data: dict, background_tasks: BackgroundTasks):
    email = data.get("email", "").lower()
    user = await db.users.find_one({"email": email})
    if user and RESEND_API_KEY:
        token = secrets.token_urlsafe(32)
        await db.users.update_one(
            {"_id": user["_id"]},
            {"$set": {"reset_token": token, "reset_expires": datetime.now(timezone.utc) + timedelta(hours=2)}}
        )
        reset_url = f"{FRONTEND_URL}/reset-password?token={token}"
        background_tasks.add_task(send_reset_email, email, user["name"], reset_url)
    # Rispondi sempre OK per sicurezza
    return {"message": "Se l'email esiste, riceverai le istruzioni"}

async def send_reset_email(email: str, name: str, reset_url: str):
    if not SENDGRID_API_KEY:
        logger.warning("SENDGRID_API_KEY non configurata")
        return
    try:
        from sendgrid import SendGridAPIClient
        from sendgrid.helpers.mail import Mail
        sg = SendGridAPIClient(SENDGRID_API_KEY)
        message = Mail(
            from_email="supporto@ikonetsolutions.com",
            to_emails=email,
            subject="Reset password — AS400 Data Importer",
            html_content=f"""<h2>Ciao {name}!</h2>
            <p>Hai richiesto il reset della password per AS400 Data Importer.</p>
            <br>
            <a href="{reset_url}" style="background:#4f9cf9;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;">Reset Password</a>
            <br><br>
            <p style="color:#666;font-size:12px;">Il link scade tra 2 ore.</p>
            <p>2026 Ikonet Solutions</p>"""
        )
        sg.send(message)
        logger.info(f"Reset email inviata a {email}")
    except Exception as e:
        logger.error(f"Errore reset email SendGrid: {e}")



@api_router.post("/auth/reset-password")
async def reset_password(data: dict):
    token = data.get("token", "")
    password = data.get("password", "")
    logger.info(f"Reset attempt with token: {token[:20]}...")
    if not token or not password:
        raise HTTPException(status_code=400, detail="Token e password richiesti")
    user = await db.users.find_one({"reset_token": token})
    logger.info(f"User found: {user is not None}")
    if not user:
        raise HTTPException(status_code=400, detail="Token non valido o scaduto")
    expires = user.get("reset_expires")
    if expires and datetime.now(timezone.utc) > expires.replace(tzinfo=timezone.utc):
        raise HTTPException(status_code=400, detail="Token scaduto")
    await db.users.update_one(
        {"_id": user["_id"]},
        {"$set": {"password": __import__("bcrypt").hashpw(password.encode(), __import__("bcrypt").gensalt()).decode()},
         "$unset": {"reset_token": "", "reset_expires": ""}}
    )
    return {"message": "Password aggiornata con successo"}


@api_router.get("/admin/send-trial-reminders")
async def send_trial_reminders(user = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    reminder_date = now + timedelta(days=7)
    users = await db.users.find({
        "plan_status": "trial",
        "trial_ends": {"$gte": now, "$lte": reminder_date},
        "trial_reminder_sent": {"$ne": True}
    }).to_list(100)
    sent = 0
    for u in users:
        days_left = max(1, (u["trial_ends"].replace(tzinfo=timezone.utc) - now).days)
        if SENDGRID_API_KEY:
            try:
                from sendgrid import SendGridAPIClient
                from sendgrid.helpers.mail import Mail
                sg = SendGridAPIClient(SENDGRID_API_KEY)
                msg = Mail(
                    from_email="supporto@ikonetsolutions.com",
                    to_emails=u["email"],
                    subject=f"Il tuo trial scade tra {days_left} giorni — AS400 Data Importer",
                    html_content=f"""<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:40px;background:#0f1117;border-radius:12px;">
<h1 style="color:#f59e0b;text-align:center;">⏰ Trial in scadenza!</h1>
<p style="color:#9ca3af;">Ciao <strong style="color:#fff;">{u['name']}</strong>, il tuo trial scade tra <strong style="color:#f59e0b;">{days_left} giorni</strong>.</p>
<div style="text-align:center;margin:30px 0;">
<a href="{FRONTEND_URL}/plans" style="background:#4f9cf9;color:white;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:700;">Scegli il piano →</a>
</div>
<p style="color:#4b5563;font-size:12px;text-align:center;">© 2026 Ikonet Solutions</p>
</div>"""
                )
                sg.send(msg)
                sent += 1
            except Exception as e:
                logger.error(f"Errore trial reminder: {e}")
        await db.users.update_one({"_id": u["_id"]}, {"$set": {"trial_reminder_sent": True}})
    return {"sent": sent}

app.include_router(api_router)

# Serve frontend statico
if os.path.exists("/app/frontend/build"):
    app.mount("/", StaticFiles(directory="/app/frontend/build", html=True), name="frontend")

# Forgot password endpoint (aggiunto)


# ══════════════════════════════════════════════════════════════
#  LICENSE MANAGEMENT
# ══════════════════════════════════════════════════════════════

def generate_license_key(customer_id: str) -> str:
    import hashlib, hmac as _hmac
    LICENSE_SECRET = os.environ.get("LICENSE_SECRET", "ikonet-license-secret-2024")
    raw = f"{customer_id}-{secrets.token_hex(8)}"
    h = _hmac.new(LICENSE_SECRET.encode(), raw.encode(), hashlib.sha256).hexdigest()[:12].upper()
    return f"IKONET-{h[0:4]}-{h[4:8]}-{h[8:12]}"

class LicenseActivateRequest(BaseModel):
    license_key: str
    hardware_id: str
    hostname: str
    ip: Optional[str] = None

class LicenseIssueRequest(BaseModel):
    user_id: str
    plan: str
    expires_days: int = 365
    max_connections: int = 1
    notes: Optional[str] = ""

@api_router.post("/license/verify")
async def verify_license(req: LicenseActivateRequest):
    lic = await db.licenses.find_one({"license_key": req.license_key})
    if not lic:
        raise HTTPException(status_code=404, detail="Licenza non trovata")
    now = datetime.now(timezone.utc)
    expires_at = lic.get("expires_at")
    if expires_at and expires_at.replace(tzinfo=timezone.utc) < now:
        raise HTTPException(status_code=403, detail="Licenza scaduta")
    if lic.get("revoked"):
        raise HTTPException(status_code=403, detail="Licenza revocata")
    registered_hw = lic.get("hardware_id")
    if not registered_hw:
        await db.licenses.update_one(
            {"license_key": req.license_key},
            {"$set": {"hardware_id": req.hardware_id, "hostname": req.hostname,
                      "first_activated": now, "last_seen": now, "ip": req.ip}}
        )
    elif registered_hw != req.hardware_id:
        await db.licenses.update_one(
            {"license_key": req.license_key},
            {"$inc": {"suspicious_attempts": 1}, "$set": {"last_seen": now}}
        )
        raise HTTPException(status_code=403, detail="Licenza gia attivata su un altro dispositivo")
    else:
        await db.licenses.update_one(
            {"license_key": req.license_key},
            {"$set": {"last_seen": now, "hostname": req.hostname}}
        )
    return {
        "valid": True,
        "plan": lic.get("plan", "starter"),
        "expires_at": lic.get("expires_at").isoformat() if lic.get("expires_at") else None,
        "max_connections": lic.get("max_connections", 1),
        "customer": lic.get("customer_name", ""),
        "features": lic.get("features", ["import", "export"])
    }

@api_router.get("/admin/licenses")
async def list_licenses(user=Depends(get_current_user)):
    if not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Accesso negato")
    licenses = await db.licenses.find().sort("created_at", -1).to_list(200)
    for l in licenses:
        l["_id"] = str(l["_id"])
    return licenses

@api_router.post("/admin/licenses")
async def create_license(req: LicenseIssueRequest, user=Depends(get_current_user)):
    if not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Accesso negato")
    key = generate_license_key(req.user_id)
    expires_at = datetime.now(timezone.utc) + timedelta(days=req.expires_days)
    doc = {
        "license_key": key,
        "user_id": req.user_id,
        "plan": req.plan,
        "expires_at": expires_at,
        "max_connections": req.max_connections,
        "notes": req.notes,
        "revoked": False,
        "hardware_id": None,
        "hostname": None,
        "suspicious_attempts": 0,
        "features": ["import", "export", "query"],
        "created_at": datetime.now(timezone.utc)
    }
    await db.licenses.insert_one(doc)
    doc["_id"] = str(doc["_id"])
    return {"license_key": key, "expires_at": expires_at.isoformat(), **doc}

@api_router.post("/admin/licenses/{license_key}/revoke")
async def revoke_license(license_key: str, user=Depends(get_current_user)):
    if not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Accesso negato")
    result = await db.licenses.update_one(
        {"license_key": license_key},
        {"$set": {"revoked": True, "revoked_at": datetime.now(timezone.utc)}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Licenza non trovata")
    return {"message": "Licenza revocata"}

@api_router.post("/admin/licenses/{license_key}/reset-hardware")
async def reset_hardware(license_key: str, user=Depends(get_current_user)):
    if not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Accesso negato")
    await db.licenses.update_one(
        {"license_key": license_key},
        {"$set": {"hardware_id": None, "hostname": None, "suspicious_attempts": 0}}
    )
    return {"message": "Hardware reset eseguito"}
