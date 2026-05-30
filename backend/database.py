import sqlite3, os

# In Windows frozen mode, AS400_DB_PATH points to %LOCALAPPDATA%\AS400ImporterPro\data\ikonet_pro.db
DB_PATH = os.environ.get('AS400_DB_PATH') or os.path.join(os.path.dirname(__file__), "data", "ikonet_pro.db")

def get_db() -> sqlite3.Connection:
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn

def init_db():
    db = get_db()
    db.executescript("""
    CREATE TABLE IF NOT EXISTS license (
        id          INTEGER PRIMARY KEY DEFAULT 1,
        license_key TEXT NOT NULL,
        plan        TEXT,
        verified_at TEXT,
        expires_at  TEXT,
        hardware_id TEXT,
        user_name   TEXT,
        company     TEXT,
        email       TEXT,
        revoked     INTEGER DEFAULT 0,
        raw_json    TEXT
    );

    CREATE TABLE IF NOT EXISTS users (
        id            TEXT PRIMARY KEY,
        email         TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        name          TEXT NOT NULL,
        company       TEXT NOT NULL,
        created_at    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS connections (
        id                 TEXT PRIMARY KEY,
        name               TEXT NOT NULL,
        host               TEXT NOT NULL,
        as400_user         TEXT NOT NULL,
        password_encrypted TEXT NOT NULL,
        port               INTEGER NOT NULL DEFAULT 446,
        library            TEXT NOT NULL DEFAULT '*LIBL',
        description        TEXT DEFAULT '',
        ssl                INTEGER NOT NULL DEFAULT 0,
        login_timeout      INTEGER NOT NULL DEFAULT 10,
        last_used          TEXT,
        created_at         TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS operations (
        id            TEXT PRIMARY KEY,
        type          TEXT NOT NULL,
        filename      TEXT,
        table_name    TEXT,
        library       TEXT,
        sql_query     TEXT,
        rows_count    INTEGER DEFAULT 0,
        rows_error    INTEGER DEFAULT 0,
        status        TEXT NOT NULL,
        error         TEXT,
        log_data      TEXT,
        connection_id TEXT,
        created_at    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS saved_queries (
        id            TEXT PRIMARY KEY,
        name          TEXT NOT NULL,
        sql_query     TEXT NOT NULL,
        connection_id TEXT,
        created_at    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS scheduled_tasks (
        id                TEXT PRIMARY KEY,
        name              TEXT NOT NULL,
        type              TEXT NOT NULL,
        connection_id     TEXT,
        cron_expression   TEXT,
        config_json       TEXT,
        enabled           INTEGER DEFAULT 1,
        last_run          TEXT,
        next_run          TEXT,
        created_at        TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
        key        TEXT PRIMARY KEY,
        value      TEXT,
        updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS password_reset_tokens (
        token      TEXT PRIMARY KEY,
        user_id    TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        used       INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS issued_licenses (
        license_key         TEXT PRIMARY KEY,
        email               TEXT NOT NULL,
        user_name           TEXT,
        company             TEXT,
        plan                TEXT NOT NULL,
        expires_at          TEXT NOT NULL,
        created_at          TEXT NOT NULL,
        revoked             INTEGER DEFAULT 0,
        hardware_id         TEXT,
        hostname            TEXT,
        activated_at        TEXT,
        last_verified_at    TEXT,
        suspicious_attempts INTEGER DEFAULT 0,
        notes               TEXT
    );
    """)
    db.commit()

    # Migrazioni colonne (idempotenti)
    for migration in [
        "ALTER TABLE operations ADD COLUMN user_id TEXT",
        "ALTER TABLE connections ADD COLUMN user_id TEXT",
        "ALTER TABLE saved_queries ADD COLUMN user_id TEXT",
        "ALTER TABLE license ADD COLUMN trial_started_at TEXT",
        "ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0",
    ]:
        try:
            db.execute(migration)
            db.commit()
        except Exception:
            pass  # colonna già presente

    db.close()
