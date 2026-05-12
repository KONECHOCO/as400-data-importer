import uuid, hashlib, platform, json
from datetime import datetime, timedelta
import requests

VERIFY_URL = "https://as400.ikonetsolutions.com/api/license/verify"
CACHE_DAYS = 7

def get_hardware_id() -> str:
    raw = f"{uuid.getnode()}-{platform.node()}-{platform.machine()}"
    return hashlib.sha256(raw.encode()).hexdigest()[:32].upper()

def _row(db) -> dict | None:
    row = db.execute("SELECT * FROM license WHERE id=1").fetchone()
    return dict(row) if row else None

def get_status(db) -> dict:
    """Restituisce lo stato attuale della licenza dalla cache locale.
    Nessun trial automatico — l'utente deve inserire una chiave."""
    row = _row(db)

    # Nessuna chiave salvata: richiedi attivazione
    if not row or not row.get("license_key"):
        return {"activated": False, "valid": False, "needs_key": True}

    # Licenza revocata
    if row.get("revoked"):
        return {"activated": True, "valid": False, "reason": "revocata"}

    # Licenza scaduta (controllata localmente sull'expires_at del VPS)
    if row.get("expires_at"):
        exp = datetime.fromisoformat(row["expires_at"])
        if datetime.utcnow() > exp:
            is_trial = row.get("plan") == "trial"
            return {
                "activated": True, "valid": False,
                "trial_expired": is_trial,
                "reason": "scaduta",
                "expires_at": row["expires_at"],
            }

    verified_at = datetime.fromisoformat(row["verified_at"]) if row.get("verified_at") else None
    cache_ok    = verified_at and (datetime.utcnow() - verified_at) < timedelta(days=CACHE_DAYS)

    result = {
        "activated": True, "valid": True, "cache_ok": cache_ok,
        "plan": row.get("plan"), "expires_at": row.get("expires_at"),
        "company": row.get("company"), "email": row.get("email"),
        "user_name": row.get("user_name"), "hardware_id": row.get("hardware_id"),
        "license_key": row.get("license_key"),
    }

    # Chiave trial: aggiungi giorni rimanenti per la UI
    if row.get("plan") == "trial" and row.get("expires_at"):
        exp       = datetime.fromisoformat(row["expires_at"])
        days_left = max(0, (exp - datetime.utcnow()).days)
        result["trial_active"]    = True
        result["trial_days_left"] = days_left

    return result


def activate(license_key: str, db) -> dict:
    hw_id = get_hardware_id()
    # Preserva trial_started_at
    existing  = _row(db)
    trial_ts  = existing.get("trial_started_at") if existing else None

    try:
        resp = requests.post(
            VERIFY_URL,
            json={"license_key": license_key, "hardware_id": hw_id,
                  "hostname": platform.node()},
            timeout=10,
        )
        data = resp.json()
        if resp.status_code != 200 or not data.get("valid"):
            raw = data.get("detail") or data.get("message") or "Licenza non valida"
            raise ValueError(raw if isinstance(raw, str) else
                             "; ".join(e.get("msg", str(e)) for e in raw))
    except requests.RequestException as e:
        cached = _row(db)
        if cached and cached.get("license_key") == license_key:
            verified_at = datetime.fromisoformat(cached["verified_at"]) if cached.get("verified_at") else None
            if verified_at and (datetime.utcnow() - verified_at) < timedelta(days=CACHE_DAYS):
                return {"valid": True, "offline": True, **cached}
        raise ValueError(f"Nessuna connessione al server licenze: {e}")

    db.execute("""
        INSERT OR REPLACE INTO license
            (id, license_key, plan, verified_at, expires_at, hardware_id,
             user_name, company, email, revoked, raw_json, trial_started_at)
        VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
    """, (
        license_key, data.get("plan"), datetime.utcnow().isoformat(),
        data.get("expires_at"), hw_id, data.get("user_name"),
        data.get("company"), data.get("email"), json.dumps(data), trial_ts,
    ))
    db.commit()
    return data


def refresh(db):
    row = _row(db)
    if not row or not row.get("license_key"):
        return
    try:
        activate(row["license_key"], db)
    except Exception:
        pass
