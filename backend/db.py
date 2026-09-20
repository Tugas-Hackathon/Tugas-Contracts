import sqlite3
from pathlib import Path
from contextlib import contextmanager
import os

_DB_PATH = Path(os.getenv("DATA_DIR", "./data")) / "tugas.db"
_SCHEMA = Path(__file__).parent / "schema.sql"


def _connect() -> sqlite3.Connection:
    _DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(_DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


# (table, column, definition) — applied only when the column is absent, since
# CREATE TABLE IF NOT EXISTS silently skips tables that already exist.
_MIGRATIONS = [
    ("messages", "wa_msg_id", "TEXT"),
    ("messages", "sender_name", "TEXT"),
]


def init_db() -> None:
    conn = _connect()
    conn.executescript(_SCHEMA.read_text())
    for table, column, decl in _MIGRATIONS:
        existing = {r[1] for r in conn.execute(f"PRAGMA table_info({table})")}
        if column not in existing:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {decl}")
    conn.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_wa "
        "ON messages(user_id, wa_msg_id)"
    )
    conn.commit()
    conn.close()


@contextmanager
def get_db():
    conn = _connect()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
