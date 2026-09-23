import os, re, sqlite3
from pathlib import Path
from contextlib import contextmanager

# Postgres in production, SQLite locally. One switch, because the local box
# also runs the WhatsApp sidecar and should not need a network database.
DATABASE_URL = os.getenv("DATABASE_URL", "")
IS_PG = DATABASE_URL.startswith("postgres")

_DB_PATH = Path(os.getenv("DATA_DIR", "./data")) / "tugas.db"
_SCHEMA = Path(__file__).parent / ("schema.pg.sql" if IS_PG else "schema.sql")

_QMARK = re.compile(r"\?(?=(?:[^']*'[^']*')*[^']*$)")


def _to_pg(sql: str) -> str:
    """SQLite's ? placeholders to Postgres %s, leaving any inside string
    literals alone. Translating here keeps ~80 existing queries untouched."""
    sql = _QMARK.sub("%s", sql)
    # SQLite spells this as a prefix, Postgres as a trailing clause.
    if sql.lstrip().upper().startswith("INSERT OR IGNORE"):
        sql = re.sub(r"^\s*INSERT\s+OR\s+IGNORE", "INSERT", sql, flags=re.I)
        sql = sql.rstrip().rstrip(";") + " ON CONFLICT DO NOTHING"
    return sql


if IS_PG:
    import psycopg
    from psycopg.rows import dict_row

    class _Cur:
        """Wraps a psycopg cursor so callers keep using sqlite3's shape:
        execute() returns something iterable, and rows index by column name."""

        def __init__(self, cur):
            self._c = cur

        def execute(self, sql, params=()):
            self._c.execute(_to_pg(sql), params)
            return self

        def fetchone(self):
            return self._c.fetchone()

        def fetchall(self):
            return self._c.fetchall()

        def __iter__(self):
            return iter(self._c.fetchall())

        @property
        def rowcount(self):
            return self._c.rowcount

    class _Conn:
        def __init__(self, conn):
            self._conn = conn

        def execute(self, sql, params=()):
            return _Cur(self._conn.cursor()).execute(sql, params)

        def executescript(self, sql):
            self._conn.execute(sql)

        def commit(self):
            self._conn.commit()

        def rollback(self):
            self._conn.rollback()

        def close(self):
            self._conn.close()

    def _connect():
        # Supabase's pooler expects one short-lived connection per request,
        # which is also what a serverless invocation gives us.
        return _Conn(psycopg.connect(DATABASE_URL, row_factory=dict_row, autocommit=False))

else:
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
    ("users", "openrouter_key", "TEXT"),
]


def init_db() -> None:
    conn = _connect()
    conn.executescript(_SCHEMA.read_text())

    for table, column, decl in _MIGRATIONS:
        if IS_PG:
            # Postgres has the idempotent form built in.
            conn.execute(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {column} {decl}")
        else:
            existing = {r[1] for r in conn.execute(f"PRAGMA table_info({table})")}
            if column not in existing:
                conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {decl}")

    conn.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_wa ON messages(user_id, wa_msg_id)"
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
