# Backend Skeleton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a FastAPI backend with SQLite db, EIP-191 wallet auth, subjects CRUD, and materials upload + text extraction — everything Plan 03 (tutor) needs.

**Architecture:** Single FastAPI app in `backend/`, one module per concern, sqlite3 stdlib in WAL mode, uv-managed venv. No ORM — raw SQL with parameterised queries. Auth is wallet-based (no passwords): nonce → personal_sign → verify → bearer token.

**Tech Stack:** Python 3.14, FastAPI, uv, sqlite3, eth-account, pypdf, python-pptx, python-docx, openai SDK (for llm.py), pytest

---

### Task 1: Scaffold backend project

**Files:**
- Create: `backend/pyproject.toml`
- Create: `backend/.env.example`
- Create: `backend/main.py`
- Create: `backend/db.py`
- Create: `backend/schema.sql`

- [ ] **Step 1: Init uv project**

```bash
cd backend
uv init --no-readme --python 3.14
```

Then replace the generated `pyproject.toml` with:

```toml
[project]
name = "tugas-backend"
version = "0.1.0"
requires-python = ">=3.14"
dependencies = [
    "fastapi>=0.115",
    "uvicorn[standard]>=0.30",
    "python-multipart>=0.0.9",
    "eth-account>=0.13",
    "pypdf>=4.3",
    "python-pptx>=1.0",
    "python-docx>=1.1",
    "openai>=1.40",
    "pydantic>=2.8",
    "python-dotenv>=1.0",
    "apscheduler>=3.10",
]

[project.optional-dependencies]
dev = ["pytest>=8", "httpx>=0.27", "pytest-asyncio>=0.24"]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"
```

- [ ] **Step 2: Install dependencies**

```bash
cd backend
uv sync --extra dev
```

Expected: `.venv/` created, all packages installed.

- [ ] **Step 3: Create `.env.example`**

```
OPENROUTER_API_KEY=
RPC_URL=https://rpc.bohr.life
LEDGER_ADDRESS=0xE2c7c1c96F45de15D2cDBb02dfF1E18f97106A76
SESSION_SECRET=change-me-32-chars-minimum
DATA_DIR=./data
CORS_ORIGIN=http://localhost:5173
```

- [ ] **Step 4: Create `backend/schema.sql`**

```sql
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS users (
    address TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    google_tokens_ref TEXT
);

CREATE TABLE IF NOT EXISTS nonces (
    address TEXT NOT NULL,
    nonce TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    PRIMARY KEY (address)
);

CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(address),
    expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS subjects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(address),
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS materials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_id INTEGER NOT NULL REFERENCES subjects(id),
    user_id TEXT NOT NULL REFERENCES users(address),
    filename TEXT NOT NULL,
    filepath TEXT NOT NULL,
    mime TEXT NOT NULL,
    text TEXT,
    page_count INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS branches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_id INTEGER NOT NULL REFERENCES subjects(id),
    user_id TEXT NOT NULL REFERENCES users(address),
    kind TEXT NOT NULL CHECK(kind IN ('assignment','exam','project')),
    title TEXT NOT NULL,
    due_at INTEGER,
    targeted_topics TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS milestones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    branch_id INTEGER NOT NULL REFERENCES branches(id),
    user_id TEXT NOT NULL REFERENCES users(address),
    title TEXT NOT NULL,
    draft_text TEXT,
    work_hash TEXT,
    context_hash TEXT,
    ai_assist_level INTEGER,
    chain_commit_id INTEGER,
    tx_hash TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS quiz_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    branch_id INTEGER NOT NULL REFERENCES branches(id),
    user_id TEXT NOT NULL REFERENCES users(address),
    answers TEXT NOT NULL,
    score REAL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS topic_mastery (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    branch_id INTEGER NOT NULL REFERENCES branches(id),
    user_id TEXT NOT NULL REFERENCES users(address),
    topic TEXT NOT NULL,
    mastery REAL NOT NULL DEFAULT 0.0,
    interval INTEGER NOT NULL DEFAULT 1,
    ease REAL NOT NULL DEFAULT 2.5,
    due_at INTEGER,
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(address),
    title TEXT NOT NULL,
    starts_at INTEGER NOT NULL,
    ends_at INTEGER,
    kind TEXT NOT NULL DEFAULT 'event'
);

CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(address),
    raw TEXT NOT NULL,
    sender TEXT,
    sent_at INTEGER,
    kind TEXT,
    subject_guess TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS outbox (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(address),
    branch_id INTEGER REFERENCES branches(id),
    kind TEXT NOT NULL,
    to_channel TEXT NOT NULL DEFAULT 'inapp',
    payload TEXT NOT NULL,
    scheduled_for INTEGER NOT NULL,
    sent_at INTEGER,
    UNIQUE(branch_id, kind, scheduled_for)
);

CREATE TABLE IF NOT EXISTS runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(address),
    task TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    result TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
```

- [ ] **Step 5: Create `backend/db.py`**

```python
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


def init_db() -> None:
    conn = _connect()
    conn.executescript(_SCHEMA.read_text())
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
```

- [ ] **Step 6: Create `backend/main.py`**

```python
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os
from db import init_db

app = FastAPI(title="Tugas API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("CORS_ORIGIN", "http://localhost:5173")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def startup():
    init_db()

@app.get("/health")
def health():
    return {"ok": True}
```

- [ ] **Step 7: Smoke-run the server**

```bash
cd backend
uv run uvicorn main:app --reload --port 8000
```

Expected: server starts, visit http://localhost:8000/health → `{"ok":true}`. Stop with Ctrl+C.

- [ ] **Step 8: Commit**

```bash
cd ..
git add backend/
git commit -m "feat(backend): scaffold FastAPI + SQLite schema + uv project"
```

---

### Task 2: Wallet auth (nonce + EIP-191 verify + bearer token)

**Files:**
- Create: `backend/auth.py`
- Create: `backend/tests/test_auth.py`
- Modify: `backend/main.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/__init__.py` (empty).

Create `backend/tests/test_auth.py`:

```python
import os, sys, time, secrets
os.environ.setdefault("DATA_DIR", "/tmp/tugas-test")
os.environ.setdefault("SESSION_SECRET", "test-secret-32-chars-padding-here")
sys.path.insert(0, str(__import__("pathlib").Path(__file__).parent.parent))

from eth_account import Account
from eth_account.messages import encode_defunct
import pytest
from fastapi.testclient import TestClient
from main import app
from db import init_db

init_db()
client = TestClient(app)

WALLET = Account.create()


def test_nonce_returns_string():
    r = client.get(f"/auth/nonce?address={WALLET.address}")
    assert r.status_code == 200
    data = r.json()
    assert "nonce" in data
    assert len(data["nonce"]) > 10


def test_verify_returns_token():
    r = client.get(f"/auth/nonce?address={WALLET.address}")
    nonce = r.json()["nonce"]
    msg = encode_defunct(text=nonce)
    sig = WALLET.sign_message(msg).signature.hex()
    r2 = client.post("/auth/verify", json={"address": WALLET.address, "signature": "0x" + sig})
    assert r2.status_code == 200
    assert "token" in r2.json()


def test_nonce_single_use():
    r = client.get(f"/auth/nonce?address={WALLET.address}")
    nonce = r.json()["nonce"]
    msg = encode_defunct(text=nonce)
    sig = WALLET.sign_message(msg).signature.hex()
    client.post("/auth/verify", json={"address": WALLET.address, "signature": "0x" + sig})
    # second verify with same nonce must fail
    r3 = client.post("/auth/verify", json={"address": WALLET.address, "signature": "0x" + sig})
    assert r3.status_code == 401


def test_wrong_signature_rejected():
    r = client.get(f"/auth/nonce?address={WALLET.address}")
    nonce = r.json()["nonce"]
    other = Account.create()
    msg = encode_defunct(text=nonce)
    sig = other.sign_message(msg).signature.hex()
    r2 = client.post("/auth/verify", json={"address": WALLET.address, "signature": "0x" + sig})
    assert r2.status_code == 401
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd backend
uv run pytest tests/test_auth.py -v 2>&1 | head -30
```

Expected: ImportError or 404 — auth routes don't exist yet.

- [ ] **Step 3: Create `backend/auth.py`**

```python
import secrets, time, os
from fastapi import APIRouter, HTTPException, Depends, Header
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from eth_account import Account
from eth_account.messages import encode_defunct
from db import get_db

router = APIRouter(prefix="/auth")
bearer = HTTPBearer()

NONCE_TTL = 300      # 5 minutes
TOKEN_TTL = 2592000  # 30 days


def _make_nonce() -> str:
    return f"Sign in to Tugas: {secrets.token_hex(16)}"


class VerifyBody(BaseModel):
    address: str
    signature: str


@router.get("/nonce")
def get_nonce(address: str):
    address = address.lower()
    nonce = _make_nonce()
    expires = int(time.time()) + NONCE_TTL
    with get_db() as db:
        db.execute(
            "INSERT INTO nonces(address,nonce,expires_at) VALUES(?,?,?) "
            "ON CONFLICT(address) DO UPDATE SET nonce=excluded.nonce, expires_at=excluded.expires_at",
            (address, nonce, expires),
        )
    return {"nonce": nonce}


@router.post("/verify")
def verify(body: VerifyBody):
    address = body.address.lower()
    with get_db() as db:
        row = db.execute(
            "SELECT nonce, expires_at FROM nonces WHERE address=?", (address,)
        ).fetchone()
        if not row:
            raise HTTPException(401, "no nonce")
        if int(time.time()) > row["expires_at"]:
            db.execute("DELETE FROM nonces WHERE address=?", (address,))
            raise HTTPException(401, "nonce expired")

        # verify signature
        try:
            msg = encode_defunct(text=row["nonce"])
            recovered = Account.recover_message(msg, signature=body.signature).lower()
        except Exception:
            raise HTTPException(401, "bad signature")
        if recovered != address:
            raise HTTPException(401, "signer mismatch")

        # consume nonce
        db.execute("DELETE FROM nonces WHERE address=?", (address,))

        # upsert user
        db.execute(
            "INSERT INTO users(address) VALUES(?) ON CONFLICT DO NOTHING", (address,)
        )

        # create token
        token = secrets.token_urlsafe(32)
        expires = int(time.time()) + TOKEN_TTL
        db.execute(
            "INSERT INTO sessions(token,user_id,expires_at) VALUES(?,?,?)",
            (token, address, expires),
        )
    return {"token": token, "address": address}


def current_user(credentials: HTTPAuthorizationCredentials = Depends(bearer)) -> str:
    token = credentials.credentials
    with get_db() as db:
        row = db.execute(
            "SELECT user_id, expires_at FROM sessions WHERE token=?", (token,)
        ).fetchone()
    if not row or int(time.time()) > row["expires_at"]:
        raise HTTPException(401, "invalid token")
    return row["user_id"]
```

- [ ] **Step 4: Wire auth router into `main.py`**

Add after the existing imports and before `@app.on_event`:

```python
from auth import router as auth_router
app.include_router(auth_router)
```

- [ ] **Step 5: Run tests — expect pass**

```bash
cd backend
uv run pytest tests/test_auth.py -v
```

Expected: 4 tests passing.

- [ ] **Step 6: Commit**

```bash
cd ..
git add backend/
git commit -m "feat(backend): EIP-191 wallet auth — nonce, verify, bearer token"
```

---

### Task 3: Subjects CRUD

**Files:**
- Create: `backend/subjects.py`
- Create: `backend/tests/test_subjects.py`
- Modify: `backend/main.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_subjects.py`:

```python
import os, sys
os.environ.setdefault("DATA_DIR", "/tmp/tugas-test")
os.environ.setdefault("SESSION_SECRET", "test-secret-32-chars-padding-here")
sys.path.insert(0, str(__import__("pathlib").Path(__file__).parent.parent))

from eth_account import Account
from eth_account.messages import encode_defunct
from fastapi.testclient import TestClient
from main import app
from db import init_db

init_db()
client = TestClient(app)


def _login() -> str:
    wallet = Account.create()
    r = client.get(f"/auth/nonce?address={wallet.address}")
    nonce = r.json()["nonce"]
    msg = encode_defunct(text=nonce)
    sig = wallet.sign_message(msg).signature.hex()
    r2 = client.post("/auth/verify", json={"address": wallet.address, "signature": "0x" + sig})
    return r2.json()["token"]


def test_create_subject():
    token = _login()
    r = client.post("/subjects", json={"name": "Database Systems"},
                    headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 201
    assert r.json()["name"] == "Database Systems"


def test_list_subjects():
    token = _login()
    client.post("/subjects", json={"name": "Algorithms"},
                headers={"Authorization": f"Bearer {token}"})
    r = client.get("/subjects", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    names = [s["name"] for s in r.json()]
    assert "Algorithms" in names


def test_get_subject():
    token = _login()
    r = client.post("/subjects", json={"name": "OS"},
                    headers={"Authorization": f"Bearer {token}"})
    sid = r.json()["id"]
    r2 = client.get(f"/subjects/{sid}", headers={"Authorization": f"Bearer {token}"})
    assert r2.status_code == 200
    assert r2.json()["id"] == sid


def test_delete_subject():
    token = _login()
    r = client.post("/subjects", json={"name": "ToDelete"},
                    headers={"Authorization": f"Bearer {token}"})
    sid = r.json()["id"]
    r2 = client.delete(f"/subjects/{sid}", headers={"Authorization": f"Bearer {token}"})
    assert r2.status_code == 204
    r3 = client.get(f"/subjects/{sid}", headers={"Authorization": f"Bearer {token}"})
    assert r3.status_code == 404


def test_cannot_access_other_users_subject():
    token1 = _login()
    token2 = _login()
    r = client.post("/subjects", json={"name": "Private"},
                    headers={"Authorization": f"Bearer {token1}"})
    sid = r.json()["id"]
    r2 = client.get(f"/subjects/{sid}", headers={"Authorization": f"Bearer {token2}"})
    assert r2.status_code == 404
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd backend
uv run pytest tests/test_subjects.py -v 2>&1 | head -20
```

Expected: 404 on POST /subjects.

- [ ] **Step 3: Create `backend/subjects.py`**

```python
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from db import get_db
from auth import current_user

router = APIRouter(prefix="/subjects")


class SubjectIn(BaseModel):
    name: str


def _row_to_dict(row) -> dict:
    return {"id": row["id"], "name": row["name"], "created_at": row["created_at"]}


@router.post("", status_code=201)
def create_subject(body: SubjectIn, user: str = Depends(current_user)):
    with get_db() as db:
        cur = db.execute(
            "INSERT INTO subjects(user_id, name) VALUES(?,?) RETURNING id,name,created_at",
            (user, body.name),
        )
        return _row_to_dict(cur.fetchone())


@router.get("")
def list_subjects(user: str = Depends(current_user)):
    with get_db() as db:
        rows = db.execute(
            "SELECT id,name,created_at FROM subjects WHERE user_id=? ORDER BY created_at DESC",
            (user,),
        ).fetchall()
    return [_row_to_dict(r) for r in rows]


@router.get("/{subject_id}")
def get_subject(subject_id: int, user: str = Depends(current_user)):
    with get_db() as db:
        row = db.execute(
            "SELECT id,name,created_at FROM subjects WHERE id=? AND user_id=?",
            (subject_id, user),
        ).fetchone()
    if not row:
        raise HTTPException(404, "not found")
    return _row_to_dict(row)


@router.delete("/{subject_id}", status_code=204)
def delete_subject(subject_id: int, user: str = Depends(current_user)):
    with get_db() as db:
        cur = db.execute(
            "DELETE FROM subjects WHERE id=? AND user_id=?", (subject_id, user)
        )
    if cur.rowcount == 0:
        raise HTTPException(404, "not found")
```

- [ ] **Step 4: Wire subjects router into `main.py`**

Add after auth router line:

```python
from subjects import router as subjects_router
app.include_router(subjects_router)
```

- [ ] **Step 5: Run tests — expect pass**

```bash
cd backend
uv run pytest tests/test_subjects.py -v
```

Expected: 5 tests passing.

- [ ] **Step 6: Commit**

```bash
cd ..
git add backend/
git commit -m "feat(backend): subjects CRUD with per-user isolation"
```

---

### Task 4: LLM routing (llm.py)

**Files:**
- Create: `backend/llm.py`
- Create: `backend/tests/fixtures/llm/` (empty dir + .gitkeep)

- [ ] **Step 1: Create `backend/llm.py`**

```python
import os, json
from pathlib import Path
from typing import Any, TypeVar
from pydantic import BaseModel
from openai import OpenAI

T = TypeVar("T", bound=BaseModel)

TASK_MODELS: dict[str, list[str]] = {
    "tutor":   ["anthropic/claude-opus-5", "anthropic/claude-sonnet-5"],
    "rubric":  ["anthropic/claude-opus-5", "anthropic/claude-sonnet-5"],
    "outline": ["anthropic/claude-opus-5", "anthropic/claude-sonnet-5"],
    "extract": ["google/gemini-flash-1.5", "google/gemini-pro-1.5"],
    "ocr":     ["google/gemini-flash-1.5", "google/gemini-pro-1.5"],
    "quiz":    ["openai/gpt-4o", "openai/gpt-4o-mini"],
    "plan":    ["openai/gpt-4o", "openai/gpt-4o-mini"],
    "ideas":   ["openai/gpt-4o", "openai/gpt-4o-mini"],
}

_FIXTURES_DIR = Path(__file__).parent / "tests" / "fixtures" / "llm"
_USE_FIXTURES = os.getenv("LLM_FIXTURES") == "1"

_client = OpenAI(
    api_key=os.getenv("OPENROUTER_API_KEY", ""),
    base_url="https://openrouter.ai/api/v1",
)


class LLMDeclined(Exception):
    pass


def _model_for(task: str) -> str:
    env_override = os.getenv(f"LLM_MODEL_{task.upper()}")
    if env_override:
        return env_override
    return TASK_MODELS.get(task, ["openai/gpt-4o"])[0]


def chat(task: str, messages: list[dict]) -> str:
    if _USE_FIXTURES:
        fixture = _FIXTURES_DIR / f"{task}.txt"
        if fixture.exists():
            return fixture.read_text()
        raise FileNotFoundError(f"fixture missing: {fixture}")

    model = _model_for(task)
    resp = _client.chat.completions.create(
        model=model,
        messages=messages,
        timeout=60,
        max_retries=2,
    )
    content = resp.choices[0].message.content if resp.choices else None
    if not content:
        raise LLMDeclined("model returned empty content")
    return content


def parse(task: str, prompt: str, schema: type[T]) -> T:
    if _USE_FIXTURES:
        fixture = _FIXTURES_DIR / f"{task}.json"
        if fixture.exists():
            return schema.model_validate_json(fixture.read_text())
        raise FileNotFoundError(f"fixture missing: {fixture}")

    model = _model_for(task)
    schema_json = schema.model_json_schema()

    def _call(messages):
        return _client.chat.completions.create(
            model=model,
            messages=messages,
            response_format={"type": "json_schema", "json_schema": {"name": schema.__name__, "schema": schema_json, "strict": True}},
            timeout=60,
            max_retries=2,
        )

    messages = [{"role": "user", "content": prompt}]
    resp = _call(messages)
    content = resp.choices[0].message.content if resp.choices else None
    if not content:
        raise LLMDeclined("model returned empty content")

    try:
        return schema.model_validate_json(content)
    except Exception as e:
        # one corrective retry
        messages.append({"role": "assistant", "content": content})
        messages.append({"role": "user", "content": f"Your response failed validation: {e}. Reply with valid JSON only."})
        resp2 = _call(messages)
        content2 = resp2.choices[0].message.content if resp2.choices else None
        if not content2:
            raise LLMDeclined("model declined on retry")
        return schema.model_validate_json(content2)
```

- [ ] **Step 2: Create fixtures dir**

```bash
mkdir -p backend/tests/fixtures/llm
touch backend/tests/fixtures/llm/.gitkeep
```

- [ ] **Step 3: Commit**

```bash
cd ..
git add backend/
git commit -m "feat(backend): llm.py — OpenRouter routing with fixture support"
```

---

### Task 5: Materials upload + text extraction

**Files:**
- Create: `backend/materials.py`
- Create: `backend/tests/test_materials.py`
- Modify: `backend/main.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_materials.py`:

```python
import os, sys, io
os.environ.setdefault("DATA_DIR", "/tmp/tugas-test")
os.environ.setdefault("SESSION_SECRET", "test-secret-32-chars-padding-here")
os.environ.setdefault("LLM_FIXTURES", "1")
sys.path.insert(0, str(__import__("pathlib").Path(__file__).parent.parent))

from eth_account import Account
from eth_account.messages import encode_defunct
from fastapi.testclient import TestClient
from main import app
from db import init_db

init_db()
client = TestClient(app)


def _login():
    w = Account.create()
    r = client.get(f"/auth/nonce?address={w.address}")
    nonce = r.json()["nonce"]
    sig = w.sign_message(__import__("eth_account.messages", fromlist=["encode_defunct"]).encode_defunct(text=nonce)).signature.hex()
    return client.post("/auth/verify", json={"address": w.address, "signature": "0x" + sig}).json()["token"]


def _subject(token):
    return client.post("/subjects", json={"name": "Test"}, headers={"Authorization": f"Bearer {token}"}).json()["id"]


def test_upload_txt():
    token = _login()
    sid = _subject(token)
    content = b"Hello world. This is a test material."
    r = client.post(
        f"/subjects/{sid}/materials",
        files={"file": ("notes.txt", io.BytesIO(content), "text/plain")},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 201
    data = r.json()
    assert data["filename"] == "notes.txt"
    assert "id" in data


def test_upload_disallowed_ext():
    token = _login()
    sid = _subject(token)
    r = client.post(
        f"/subjects/{sid}/materials",
        files={"file": ("evil.exe", io.BytesIO(b"MZ"), "application/octet-stream")},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 422


def test_list_materials():
    token = _login()
    sid = _subject(token)
    client.post(
        f"/subjects/{sid}/materials",
        files={"file": ("a.txt", io.BytesIO(b"some text"), "text/plain")},
        headers={"Authorization": f"Bearer {token}"},
    )
    r = client.get(f"/subjects/{sid}/materials", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    assert len(r.json()) >= 1
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd backend
uv run pytest tests/test_materials.py -v 2>&1 | head -20
```

Expected: 404 on POST /subjects/{id}/materials.

- [ ] **Step 3: Create `backend/materials.py`**

```python
import os, uuid, mimetypes
from pathlib import Path
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from db import get_db
from auth import current_user

router = APIRouter()

ALLOWED_EXTS = {".pdf", ".pptx", ".docx", ".txt", ".md", ".png", ".jpg", ".jpeg"}
MAX_BYTES = 25 * 1024 * 1024  # 25 MB
DATA_DIR = Path(os.getenv("DATA_DIR", "./data"))


def _extract_text(path: Path, ext: str) -> tuple[str, int]:
    """Returns (text, page_count). Raises ValueError if empty."""
    if ext in {".txt", ".md"}:
        text = path.read_text(errors="replace")
        return text, 1

    if ext == ".pdf":
        from pypdf import PdfReader
        reader = PdfReader(path)
        pages = [p.extract_text() or "" for p in reader.pages]
        text = "\n".join(pages)
        return text, len(pages)

    if ext == ".pptx":
        from pptx import Presentation
        prs = Presentation(path)
        slides = []
        for slide in prs.slides:
            slide_text = " ".join(
                shape.text for shape in slide.shapes if shape.has_text_frame
            )
            slides.append(slide_text)
        return "\n".join(slides), len(slides)

    if ext == ".docx":
        from docx import Document
        doc = Document(path)
        text = "\n".join(p.text for p in doc.paragraphs)
        return text, 1

    if ext in {".png", ".jpg", ".jpeg"}:
        # ponytail: OCR via vision model — requires OPENROUTER_API_KEY
        from llm import parse, LLMDeclined
        from pydantic import BaseModel

        class OCRResult(BaseModel):
            text: str

        try:
            result = parse("ocr", f"Extract all text from this image. File: {path.name}", OCRResult)
            return result.text, 1
        except (LLMDeclined, FileNotFoundError):
            return "", 1

    return "", 1


@router.post("/subjects/{subject_id}/materials", status_code=201)
async def upload_material(
    subject_id: int,
    file: UploadFile = File(...),
    user: str = Depends(current_user),
):
    # check subject ownership
    with get_db() as db:
        row = db.execute(
            "SELECT id FROM subjects WHERE id=? AND user_id=?", (subject_id, user)
        ).fetchone()
    if not row:
        raise HTTPException(404, "subject not found")

    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_EXTS:
        raise HTTPException(422, f"file type not allowed: {ext}")

    data = await file.read()
    if len(data) > MAX_BYTES:
        raise HTTPException(422, "file too large (max 25 MB)")

    # save file
    dest_dir = DATA_DIR / "files" / user / str(subject_id)
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / f"{uuid.uuid4()}{ext}"
    dest.write_bytes(data)

    # extract text
    try:
        text, pages = _extract_text(dest, ext)
    except Exception:
        text, pages = "", 0

    if not text.strip():
        dest.unlink(missing_ok=True)
        raise HTTPException(422, "could not extract any text from this file")

    mime = file.content_type or mimetypes.guess_type(file.filename or "")[0] or "application/octet-stream"

    with get_db() as db:
        cur = db.execute(
            "INSERT INTO materials(subject_id,user_id,filename,filepath,mime,text,page_count) "
            "VALUES(?,?,?,?,?,?,?) RETURNING id,filename,mime,page_count,created_at",
            (subject_id, user, file.filename, str(dest), mime, text, pages),
        )
        mat = cur.fetchone()

    return {
        "id": mat["id"],
        "filename": mat["filename"],
        "mime": mat["mime"],
        "page_count": mat["page_count"],
        "created_at": mat["created_at"],
    }


@router.get("/subjects/{subject_id}/materials")
def list_materials(subject_id: int, user: str = Depends(current_user)):
    with get_db() as db:
        row = db.execute(
            "SELECT id FROM subjects WHERE id=? AND user_id=?", (subject_id, user)
        ).fetchone()
        if not row:
            raise HTTPException(404, "subject not found")
        rows = db.execute(
            "SELECT id,filename,mime,page_count,created_at FROM materials "
            "WHERE subject_id=? AND user_id=? ORDER BY created_at DESC",
            (subject_id, user),
        ).fetchall()
    return [dict(r) for r in rows]
```

- [ ] **Step 4: Wire materials router into `main.py`**

```python
from materials import router as materials_router
app.include_router(materials_router)
```

- [ ] **Step 5: Run tests — expect pass**

```bash
cd backend
uv run pytest tests/test_materials.py -v
```

Expected: 3 tests passing.

- [ ] **Step 6: Run all tests**

```bash
cd backend
uv run pytest tests/ -v
```

Expected: all tests passing (auth + subjects + materials).

- [ ] **Step 7: Commit**

```bash
cd ..
git add backend/
git commit -m "feat(backend): materials upload + text extraction (pdf, pptx, docx, txt)"
```
