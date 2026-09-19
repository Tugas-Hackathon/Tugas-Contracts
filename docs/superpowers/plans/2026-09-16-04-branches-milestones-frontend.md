# Branches, Milestones & Frontend Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** End-to-end DApp action: student creates a branch, adds a milestone draft → backend hashes it → frontend calls MetaMask → tx confirmed on BOT Chain → backend verifies receipt → UI shows explorer link.

**Architecture:**
- Backend: `branches.py` (CRUD + outline + rubric-check), `milestones.py` (CRUD + keccak256 hash + receipt verify)
- Frontend: Vite + React + TS + wagmi v2 + viem. Wallet auth, subjects list, branch view, milestone commit card with state machine.

**Tech Stack:** Python eth-account (keccak256), web3.py for receipt decode, Vite, React 18, wagmi v2, viem, @tanstack/react-query, Tailwind CSS

---

### Task 1: Backend — branches.py

**Files:**
- Create: `backend/branches.py`
- Create: `backend/tests/fixtures/llm/outline.json`
- Create: `backend/tests/fixtures/llm/rubric.json`
- Create: `backend/tests/test_branches.py`
- Modify: `backend/main.py`

- [ ] **Step 1: Create LLM fixtures**

`backend/tests/fixtures/llm/outline.json`:
```json
{
  "sections": [
    {"title": "Introduction", "points": ["Define the problem", "State objectives"]},
    {"title": "Literature Review", "points": ["Key papers", "Existing solutions"]},
    {"title": "Methodology", "points": ["Data collection", "Analysis approach"]},
    {"title": "Conclusion", "points": ["Summary", "Future work"]}
  ]
}
```

`backend/tests/fixtures/llm/rubric.json`:
```json
{
  "criteria": [
    {"name": "Clarity", "met": true, "evidence": "The draft is clear.", "suggestion": ""},
    {"name": "Depth", "met": false, "evidence": "Lacks detail.", "suggestion": "Add more analysis."}
  ]
}
```

- [ ] **Step 2: Write failing tests**

`backend/tests/test_branches.py`:
```python
import os, sys, io
os.environ.setdefault("DATA_DIR", "/tmp/tugas-test")
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
    sig = w.sign_message(encode_defunct(text=nonce)).signature.hex()
    return client.post("/auth/verify", json={"address": w.address, "signature": "0x" + sig}).json()["token"]


def _subject(token):
    return client.post("/subjects", json={"name": "DBMS"},
                       headers={"Authorization": f"Bearer {token}"}).json()["id"]


def test_create_branch():
    token = _login()
    sid = _subject(token)
    r = client.post(f"/subjects/{sid}/branches",
                    json={"kind": "assignment", "title": "ER Diagram", "due_at": 1800000000},
                    headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 201
    assert r.json()["title"] == "ER Diagram"


def test_list_branches():
    token = _login()
    sid = _subject(token)
    client.post(f"/subjects/{sid}/branches",
                json={"kind": "assignment", "title": "B1"},
                headers={"Authorization": f"Bearer {token}"})
    r = client.get(f"/subjects/{sid}/branches", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    assert any(b["title"] == "B1" for b in r.json())


def test_outline_returns_sections():
    token = _login()
    sid = _subject(token)
    r = client.post(f"/subjects/{sid}/branches",
                    json={"kind": "assignment", "title": "Report"},
                    headers={"Authorization": f"Bearer {token}"})
    bid = r.json()["id"]
    r2 = client.post(f"/branches/{bid}/outline",
                     json={"brief": "Write a report on normalisation."},
                     headers={"Authorization": f"Bearer {token}"})
    assert r2.status_code == 200
    assert "sections" in r2.json()


def test_rubric_check_returns_criteria():
    token = _login()
    sid = _subject(token)
    r = client.post(f"/subjects/{sid}/branches",
                    json={"kind": "assignment", "title": "Essay"},
                    headers={"Authorization": f"Bearer {token}"})
    bid = r.json()["id"]
    r2 = client.post(f"/branches/{bid}/rubric-check",
                     json={"draft": "This essay discusses normalisation..."},
                     headers={"Authorization": f"Bearer {token}"})
    assert r2.status_code == 200
    assert "criteria" in r2.json()
    for c in r2.json()["criteria"]:
        assert "name" in c and "met" in c
```

- [ ] **Step 3: Run — expect failure**

```bash
cd backend
uv run pytest tests/test_branches.py -v 2>&1 | head -20
```

- [ ] **Step 4: Create `backend/branches.py`**

```python
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from db import get_db
from auth import current_user
from llm import parse, LLMDeclined

router = APIRouter()


class BranchIn(BaseModel):
    kind: str
    title: str
    due_at: Optional[int] = None
    targeted_topics: Optional[str] = None


class OutlineSection(BaseModel):
    title: str
    points: list[str]


class OutlineResult(BaseModel):
    sections: list[OutlineSection]


class RubricCriterion(BaseModel):
    name: str
    met: bool
    evidence: str
    suggestion: str


class RubricResult(BaseModel):
    criteria: list[RubricCriterion]


class OutlineBody(BaseModel):
    brief: str


class RubricBody(BaseModel):
    draft: str


def _row(r) -> dict:
    return {k: r[k] for k in r.keys()}


@router.post("/subjects/{subject_id}/branches", status_code=201)
def create_branch(subject_id: int, body: BranchIn, user: str = Depends(current_user)):
    if body.kind not in ("assignment", "exam", "project"):
        raise HTTPException(422, "kind must be assignment, exam, or project")
    with get_db() as db:
        sub = db.execute("SELECT id FROM subjects WHERE id=? AND user_id=?",
                         (subject_id, user)).fetchone()
        if not sub:
            raise HTTPException(404, "subject not found")
        cur = db.execute(
            "INSERT INTO branches(subject_id,user_id,kind,title,due_at,targeted_topics) "
            "VALUES(?,?,?,?,?,?) RETURNING id,subject_id,kind,title,due_at,created_at",
            (subject_id, user, body.kind, body.title, body.due_at, body.targeted_topics),
        )
        return _row(cur.fetchone())


@router.get("/subjects/{subject_id}/branches")
def list_branches(subject_id: int, user: str = Depends(current_user)):
    with get_db() as db:
        sub = db.execute("SELECT id FROM subjects WHERE id=? AND user_id=?",
                         (subject_id, user)).fetchone()
        if not sub:
            raise HTTPException(404, "subject not found")
        rows = db.execute(
            "SELECT id,subject_id,kind,title,due_at,created_at FROM branches "
            "WHERE subject_id=? AND user_id=? ORDER BY created_at DESC",
            (subject_id, user),
        ).fetchall()
    return [_row(r) for r in rows]


@router.get("/branches/{branch_id}")
def get_branch(branch_id: int, user: str = Depends(current_user)):
    with get_db() as db:
        row = db.execute(
            "SELECT id,subject_id,kind,title,due_at,created_at FROM branches "
            "WHERE id=? AND user_id=?", (branch_id, user)
        ).fetchone()
    if not row:
        raise HTTPException(404, "not found")
    return _row(row)


@router.post("/branches/{branch_id}/outline")
def outline(branch_id: int, body: OutlineBody, user: str = Depends(current_user)):
    with get_db() as db:
        row = db.execute("SELECT title FROM branches WHERE id=? AND user_id=?",
                         (branch_id, user)).fetchone()
    if not row:
        raise HTTPException(404, "branch not found")
    prompt = (
        f"Assignment title: {row['title']}\nBrief: {body.brief}\n\n"
        "Generate a structured outline with sections and key points."
    )
    try:
        return parse("outline", prompt, OutlineResult).model_dump()
    except LLMDeclined as e:
        raise HTTPException(502, str(e))


@router.post("/branches/{branch_id}/rubric-check")
def rubric_check(branch_id: int, body: RubricBody, user: str = Depends(current_user)):
    with get_db() as db:
        row = db.execute("SELECT title FROM branches WHERE id=? AND user_id=?",
                         (branch_id, user)).fetchone()
    if not row:
        raise HTTPException(404, "branch not found")
    prompt = (
        f"Assignment: {row['title']}\n\nStudent draft:\n{body.draft}\n\n"
        "Evaluate this draft against standard academic rubric criteria. "
        "For each criterion state if met, provide evidence, and a suggestion if not met."
    )
    try:
        return parse("rubric", prompt, RubricResult).model_dump()
    except LLMDeclined as e:
        raise HTTPException(502, str(e))
```

- [ ] **Step 5: Wire into `main.py`**

```python
from branches import router as branches_router
app.include_router(branches_router)
```

- [ ] **Step 6: Run tests — expect pass**

```bash
cd backend
uv run pytest tests/test_branches.py -v
```

Expected: 4 tests passing.

- [ ] **Step 7: Commit**

```bash
cd ..
git add backend/
git commit -m "feat(backend): branches CRUD + outline + rubric-check"
```

---

### Task 2: Backend — milestones.py (hash + receipt verify)

**Files:**
- Create: `backend/milestones.py`
- Create: `backend/tests/test_milestones.py`
- Modify: `backend/main.py`

- [ ] **Step 1: Write failing tests**

`backend/tests/test_milestones.py`:
```python
import os, sys, io
os.environ.setdefault("DATA_DIR", "/tmp/tugas-test")
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
    sig = w.sign_message(encode_defunct(text=nonce)).signature.hex()
    return client.post("/auth/verify", json={"address": w.address, "signature": "0x" + sig}).json()["token"]


def _branch(token):
    sid = client.post("/subjects", json={"name": "DBMS"},
                      headers={"Authorization": f"Bearer {token}"}).json()["id"]
    return client.post(f"/subjects/{sid}/branches",
                       json={"kind": "assignment", "title": "ER Diagram"},
                       headers={"Authorization": f"Bearer {token}"}).json()["id"]


def test_create_milestone():
    token = _login()
    bid = _branch(token)
    r = client.post(f"/branches/{bid}/milestones",
                    json={"title": "Draft 1"},
                    headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 201
    assert r.json()["title"] == "Draft 1"


def test_hash_returns_hashes():
    token = _login()
    bid = _branch(token)
    r = client.post(f"/branches/{bid}/milestones",
                    json={"title": "Draft 1"},
                    headers={"Authorization": f"Bearer {token}"})
    mid = r.json()["id"]
    r2 = client.post(f"/milestones/{mid}/hash",
                     json={"draft": "My assignment draft text.", "brief": "Write about ER.", "rubric": "Must have diagrams."},
                     headers={"Authorization": f"Bearer {token}"})
    assert r2.status_code == 200
    data = r2.json()
    assert data["workHash"].startswith("0x")
    assert data["contextHash"].startswith("0x")
    assert 0 <= data["aiAssistLevel"] <= 100


def test_hash_is_deterministic():
    token = _login()
    bid = _branch(token)
    mid = client.post(f"/branches/{bid}/milestones",
                      json={"title": "D"},
                      headers={"Authorization": f"Bearer {token}"}).json()["id"]
    body = {"draft": "Same draft.", "brief": "Brief.", "rubric": "Rubric."}
    r1 = client.post(f"/milestones/{mid}/hash", json=body,
                     headers={"Authorization": f"Bearer {token}"})
    r2 = client.post(f"/milestones/{mid}/hash", json=body,
                     headers={"Authorization": f"Bearer {token}"})
    assert r1.json()["workHash"] == r2.json()["workHash"]
    assert r1.json()["contextHash"] == r2.json()["contextHash"]


def test_list_milestones():
    token = _login()
    bid = _branch(token)
    client.post(f"/branches/{bid}/milestones", json={"title": "M1"},
                headers={"Authorization": f"Bearer {token}"})
    r = client.get(f"/branches/{bid}/milestones",
                   headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    assert len(r.json()) >= 1
```

- [ ] **Step 2: Run — expect failure**

```bash
cd backend
uv run pytest tests/test_milestones.py -v 2>&1 | head -20
```

- [ ] **Step 3: Create `backend/milestones.py`**

```python
import os, re
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from eth_account._utils.legacy_transactions import serializable_unsigned_transaction_from_dict
from eth_utils import keccak
import json, urllib.request
from db import get_db
from auth import current_user

router = APIRouter()

RPC_URL = os.getenv("RPC_URL", "https://rpc.bohr.life")
LEDGER_ADDRESS = os.getenv("LEDGER_ADDRESS", "").lower()

# MilestoneCommitted(address indexed student, uint256 indexed id,
#   bytes32 workHash, bytes32 contextHash, uint8 aiAssistLevel, uint64 timestamp)
MILESTONE_COMMITTED_TOPIC = "0x" + keccak(
    b"MilestoneCommitted(address,uint256,bytes32,bytes32,uint8,uint64)"
).hex()


class MilestoneIn(BaseModel):
    title: str


class HashBody(BaseModel):
    draft: str
    brief: str
    rubric: str
    ai_assist_level: Optional[int] = 60


class AnchoredBody(BaseModel):
    tx_hash: str


def _normalise(text: str) -> str:
    return re.sub(r"\s+", " ", text.strip().lower())


def _keccak_hex(text: str) -> str:
    return "0x" + keccak(text.encode()).hex()


def _rpc(method: str, params: list) -> dict:
    payload = json.dumps({"jsonrpc": "2.0", "method": method, "params": params, "id": 1}).encode()
    req = urllib.request.Request(RPC_URL, data=payload,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read())


def _row(r) -> dict:
    return {k: r[k] for k in r.keys()}


@router.post("/branches/{branch_id}/milestones", status_code=201)
def create_milestone(branch_id: int, body: MilestoneIn, user: str = Depends(current_user)):
    with get_db() as db:
        br = db.execute("SELECT id FROM branches WHERE id=? AND user_id=?",
                        (branch_id, user)).fetchone()
        if not br:
            raise HTTPException(404, "branch not found")
        cur = db.execute(
            "INSERT INTO milestones(branch_id,user_id,title) VALUES(?,?,?) "
            "RETURNING id,branch_id,title,work_hash,context_hash,ai_assist_level,chain_commit_id,tx_hash,created_at",
            (branch_id, user, body.title),
        )
        return _row(cur.fetchone())


@router.get("/branches/{branch_id}/milestones")
def list_milestones(branch_id: int, user: str = Depends(current_user)):
    with get_db() as db:
        br = db.execute("SELECT id FROM branches WHERE id=? AND user_id=?",
                        (branch_id, user)).fetchone()
        if not br:
            raise HTTPException(404, "branch not found")
        rows = db.execute(
            "SELECT id,branch_id,title,work_hash,context_hash,ai_assist_level,"
            "chain_commit_id,tx_hash,created_at FROM milestones "
            "WHERE branch_id=? AND user_id=? ORDER BY created_at",
            (branch_id, user),
        ).fetchall()
    return [_row(r) for r in rows]


@router.post("/milestones/{milestone_id}/hash")
def compute_hash(milestone_id: int, body: HashBody, user: str = Depends(current_user)):
    with get_db() as db:
        ms = db.execute("SELECT id FROM milestones WHERE id=? AND user_id=?",
                        (milestone_id, user)).fetchone()
        if not ms:
            raise HTTPException(404, "milestone not found")

    work_hash = _keccak_hex(_normalise(body.draft))
    context_hash = _keccak_hex(body.brief + "\n" + body.rubric)
    level = max(0, min(100, body.ai_assist_level or 60))

    with get_db() as db:
        db.execute(
            "UPDATE milestones SET draft_text=?,work_hash=?,context_hash=?,ai_assist_level=? WHERE id=?",
            (body.draft, work_hash, context_hash, level, milestone_id),
        )

    return {"workHash": work_hash, "contextHash": context_hash, "aiAssistLevel": level}


@router.post("/milestones/{milestone_id}/anchored")
def anchored(milestone_id: int, body: AnchoredBody, user: str = Depends(current_user)):
    with get_db() as db:
        ms = db.execute(
            "SELECT work_hash,context_hash,ai_assist_level FROM milestones WHERE id=? AND user_id=?",
            (milestone_id, user),
        ).fetchone()
    if not ms:
        raise HTTPException(404, "milestone not found")
    if not ms["work_hash"]:
        raise HTTPException(400, "call /hash first")

    try:
        result = _rpc("eth_getTransactionReceipt", [body.tx_hash])
    except Exception as e:
        raise HTTPException(502, f"RPC error: {e}")

    receipt = result.get("result")
    if not receipt:
        raise HTTPException(400, "tx not found or not confirmed yet")
    if receipt.get("status") != "0x1":
        raise HTTPException(400, "tx reverted")

    # find MilestoneCommitted log
    log = next(
        (l for l in receipt.get("logs", [])
         if l.get("address", "").lower() == LEDGER_ADDRESS
         and l["topics"][0].lower() == MILESTONE_COMMITTED_TOPIC.lower()),
        None,
    )
    if not log:
        raise HTTPException(400, "MilestoneCommitted event not found in tx")

    # decode non-indexed data: workHash(bytes32), contextHash(bytes32), aiAssistLevel(uint8), timestamp(uint64)
    data = bytes.fromhex(log["data"][2:])
    on_chain_work = "0x" + data[0:32].hex()
    on_chain_ctx = "0x" + data[32:64].hex()
    chain_commit_id = int(log["topics"][2], 16)

    if on_chain_work.lower() != ms["work_hash"].lower():
        raise HTTPException(400, "workHash mismatch")
    if on_chain_ctx.lower() != ms["context_hash"].lower():
        raise HTTPException(400, "contextHash mismatch")

    with get_db() as db:
        db.execute(
            "UPDATE milestones SET chain_commit_id=?,tx_hash=? WHERE id=?",
            (chain_commit_id, body.tx_hash, milestone_id),
        )

    return {"chain_commit_id": chain_commit_id, "tx_hash": body.tx_hash}
```

- [ ] **Step 4: Wire into `main.py`**

```python
from milestones import router as milestones_router
app.include_router(milestones_router)
```

- [ ] **Step 5: Run tests — expect pass**

```bash
cd backend
uv run pytest tests/test_milestones.py -v
```

Expected: 4 tests passing.

- [ ] **Step 6: Run all tests**

```bash
cd backend
uv run pytest tests/ -v
```

Expected: 24 passing.

- [ ] **Step 7: Commit**

```bash
cd ..
git add backend/
git commit -m "feat(backend): milestones — keccak256 hash + on-chain receipt verify"
```

---

### Task 3: Frontend scaffold (Vite + React + wagmi)

**Files:**
- Create: `frontend/` (Vite project)
- Create: `frontend/src/lib/networks.ts`
- Create: `frontend/src/lib/api.ts`
- Create: `frontend/src/lib/wagmi.ts`

- [ ] **Step 1: Scaffold Vite project**

```bash
cd C:\Users\user\tugas
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
npm install wagmi viem @tanstack/react-query
npm install -D tailwindcss @tailwindcss/vite
```

- [ ] **Step 2: Configure Tailwind**

Replace `frontend/src/index.css` content:
```css
@import "tailwindcss";
```

Add to `frontend/vite.config.ts`:
```ts
import tailwindcss from '@tailwindcss/vite'
// add tailwindcss() to plugins array
```

- [ ] **Step 3: Create `frontend/src/lib/networks.ts`**

```ts
export const NETWORK = import.meta.env.VITE_NETWORK === "mainnet"
  ? {
      id: 677,
      name: "BOT Chain",
      rpc: "https://rpc.botchain.ai",
      explorer: "https://scan.botchain.ai",
      symbol: "BOT",
    }
  : {
      id: 968,
      name: "BOT Chain Testnet",
      rpc: "https://rpc.bohr.life",
      explorer: "https://scan.bohr.life",
      symbol: "tBOT",
    }

export const LEDGER_ADDRESS = import.meta.env.VITE_LEDGER_ADDRESS as `0x${string}`
```

- [ ] **Step 4: Create `frontend/.env.local`**

```
VITE_NETWORK=testnet
VITE_LEDGER_ADDRESS=0xE2c7c1c96F45de15D2cDBb02dfF1E18f97106A76
VITE_API_URL=http://localhost:8000
```

- [ ] **Step 5: Create `frontend/src/lib/wagmi.ts`**

```ts
import { createConfig, http } from "wagmi"
import { injected } from "wagmi/connectors"
import { defineChain } from "viem"
import { NETWORK } from "./networks"

export const botChain = defineChain({
  id: NETWORK.id,
  name: NETWORK.name,
  nativeCurrency: { name: NETWORK.symbol, symbol: NETWORK.symbol, decimals: 18 },
  rpcUrls: { default: { http: [NETWORK.rpc] } },
  blockExplorers: { default: { name: "Blockscout", url: NETWORK.explorer } },
})

export const wagmiConfig = createConfig({
  chains: [botChain],
  connectors: [injected()],
  transports: { [NETWORK.id]: http(NETWORK.rpc) },
})
```

- [ ] **Step 6: Create `frontend/src/lib/api.ts`**

```ts
const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000"

function token() {
  return localStorage.getItem("tugas_token") ?? ""
}

async function req(method: string, path: string, body?: unknown) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token()}`,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!r.ok) throw new Error(await r.text())
  if (r.status === 204) return null
  return r.json()
}

export const api = {
  get: (path: string) => req("GET", path),
  post: (path: string, body?: unknown) => req("POST", path, body),
  delete: (path: string) => req("DELETE", path),

  // auth
  nonce: (address: string) => req("GET", `/auth/nonce?address=${address}`),
  verify: (address: string, signature: string) =>
    req("POST", "/auth/verify", { address, signature }),

  // subjects
  subjects: () => req("GET", "/subjects"),
  createSubject: (name: string) => req("POST", "/subjects", { name }),
  subject: (id: number) => req("GET", `/subjects/${id}`),

  // materials
  materials: (sid: number) => req("GET", `/subjects/${sid}/materials`),
  uploadMaterial: async (sid: number, file: File) => {
    const fd = new FormData()
    fd.append("file", file)
    const r = await fetch(`${BASE}/subjects/${sid}/materials`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token()}` },
      body: fd,
    })
    if (!r.ok) throw new Error(await r.text())
    return r.json()
  },

  // branches
  branches: (sid: number) => req("GET", `/subjects/${sid}/branches`),
  createBranch: (sid: number, data: { kind: string; title: string; due_at?: number }) =>
    req("POST", `/subjects/${sid}/branches`, data),
  branch: (id: number) => req("GET", `/branches/${id}`),
  outline: (bid: number, brief: string) =>
    req("POST", `/branches/${bid}/outline`, { brief }),
  rubricCheck: (bid: number, draft: string) =>
    req("POST", `/branches/${bid}/rubric-check`, { draft }),

  // milestones
  milestones: (bid: number) => req("GET", `/branches/${bid}/milestones`),
  createMilestone: (bid: number, title: string) =>
    req("POST", `/branches/${bid}/milestones`, { title }),
  hashMilestone: (
    mid: number,
    draft: string,
    brief: string,
    rubric: string,
    ai_assist_level: number,
  ) => req("POST", `/milestones/${mid}/hash`, { draft, brief, rubric, ai_assist_level }),
  anchored: (mid: number, tx_hash: string) =>
    req("POST", `/milestones/${mid}/anchored`, { tx_hash }),

  // tutor
  ask: (sid: number, question: string) =>
    req("POST", `/subjects/${sid}/ask`, { question }),
}
```

- [ ] **Step 7: Commit**

```bash
cd ..
git add frontend/
git commit -m "feat(frontend): Vite + React + wagmi scaffold, api client, network config"
```

---

### Task 4: Wallet auth + main layout

**Files:**
- Modify: `frontend/src/main.tsx`
- Create: `frontend/src/App.tsx`
- Create: `frontend/src/hooks/useAuth.ts`
- Create: `frontend/src/components/ConnectButton.tsx`
- Create: `frontend/src/components/Layout.tsx`

- [ ] **Step 1: Update `frontend/src/main.tsx`**

```tsx
import React from "react"
import ReactDOM from "react-dom/client"
import { WagmiProvider } from "wagmi"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { wagmiConfig } from "./lib/wagmi"
import App from "./App"
import "./index.css"

const queryClient = new QueryClient()

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>,
)
```

- [ ] **Step 2: Create `frontend/src/hooks/useAuth.ts`**

```ts
import { useAccount, useSignMessage } from "wagmi"
import { useState, useEffect } from "react"
import { api } from "../lib/api"

export function useAuth() {
  const { address, isConnected } = useAccount()
  const { signMessageAsync } = useSignMessage()
  const [authed, setAuthed] = useState(!!localStorage.getItem("tugas_token"))

  useEffect(() => {
    if (!isConnected) {
      localStorage.removeItem("tugas_token")
      setAuthed(false)
    }
  }, [isConnected])

  async function login() {
    if (!address) return
    const { nonce } = await api.nonce(address)
    const signature = await signMessageAsync({ message: nonce })
    const { token } = await api.verify(address, signature)
    localStorage.setItem("tugas_token", token)
    setAuthed(true)
  }

  return { address, isConnected, authed, login }
}
```

- [ ] **Step 3: Create `frontend/src/components/ConnectButton.tsx`**

```tsx
import { useConnect, useDisconnect, useAccount, useChainId, useSwitchChain } from "wagmi"
import { useAuth } from "../hooks/useAuth"
import { NETWORK } from "../lib/networks"

export function ConnectButton() {
  const { isConnected } = useAccount()
  const chainId = useChainId()
  const { connect, connectors } = useConnect()
  const { disconnect } = useDisconnect()
  const { authed, login, address } = useAuth()
  const { switchChain } = useSwitchChain()

  const wrongNetwork = isConnected && chainId !== NETWORK.id

  if (!isConnected) {
    return (
      <button
        onClick={() => connect({ connector: connectors[0] })}
        className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
      >
        Connect Wallet
      </button>
    )
  }

  if (wrongNetwork) {
    return (
      <button
        onClick={() => switchChain({ chainId: NETWORK.id })}
        className="px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600"
      >
        Switch to {NETWORK.name}
      </button>
    )
  }

  if (!authed) {
    return (
      <button
        onClick={login}
        className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700"
      >
        Sign in
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500 font-mono">
        {address?.slice(0, 6)}…{address?.slice(-4)}
      </span>
      <button
        onClick={() => { disconnect(); localStorage.removeItem("tugas_token") }}
        className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50"
      >
        Disconnect
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Create `frontend/src/components/Layout.tsx`**

```tsx
import { ConnectButton } from "./ConnectButton"

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <span className="text-lg font-semibold text-gray-900">Tugas</span>
        <ConnectButton />
      </header>
      <main className="max-w-4xl mx-auto px-6 py-8">{children}</main>
    </div>
  )
}
```

- [ ] **Step 5: Create `frontend/src/App.tsx`**

```tsx
import { useAuth } from "./hooks/useAuth"
import { Layout } from "./components/Layout"
import { SubjectsPage } from "./pages/SubjectsPage"

export default function App() {
  const { authed } = useAuth()

  return (
    <Layout>
      {authed ? (
        <SubjectsPage />
      ) : (
        <div className="text-center py-20">
          <h1 className="text-3xl font-bold text-gray-900 mb-3">Tugas</h1>
          <p className="text-gray-500 mb-8">Your AI-powered study OS on BOT Chain</p>
          <p className="text-sm text-gray-400">Connect your wallet to get started</p>
        </div>
      )}
    </Layout>
  )
}
```

- [ ] **Step 6: Commit**

```bash
git add frontend/
git commit -m "feat(frontend): wallet auth flow — connect, sign, bearer token"
```

---

### Task 5: Subjects + milestone commit card

**Files:**
- Create: `frontend/src/pages/SubjectsPage.tsx`
- Create: `frontend/src/pages/SubjectPage.tsx`
- Create: `frontend/src/pages/BranchPage.tsx`
- Create: `frontend/src/components/MilestoneCard.tsx`

- [ ] **Step 1: Create `frontend/src/pages/SubjectsPage.tsx`**

```tsx
import { useState, useEffect } from "react"
import { api } from "../lib/api"
import { SubjectPage } from "./SubjectPage"

export function SubjectsPage() {
  const [subjects, setSubjects] = useState<any[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [name, setName] = useState("")

  useEffect(() => { api.subjects().then(setSubjects) }, [])

  async function create() {
    if (!name.trim()) return
    const s = await api.createSubject(name.trim())
    setSubjects(p => [s, ...p])
    setName("")
  }

  if (selected) return <SubjectPage id={selected} onBack={() => setSelected(null)} />

  return (
    <div>
      <h2 className="text-xl font-semibold mb-6">Subjects</h2>
      <div className="flex gap-2 mb-6">
        <input value={name} onChange={e => setName(e.target.value)}
          placeholder="New subject name…"
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
          onKeyDown={e => e.key === "Enter" && create()} />
        <button onClick={create}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
          Add
        </button>
      </div>
      <div className="space-y-2">
        {subjects.map(s => (
          <button key={s.id} onClick={() => setSelected(s.id)}
            className="w-full text-left p-4 bg-white border border-gray-200 rounded-lg hover:border-indigo-300 transition-colors">
            <span className="font-medium text-gray-900">{s.name}</span>
          </button>
        ))}
        {subjects.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-8">No subjects yet. Add one above.</p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create `frontend/src/pages/SubjectPage.tsx`**

```tsx
import { useState, useEffect, useRef } from "react"
import { api } from "../lib/api"
import { BranchPage } from "./BranchPage"

export function SubjectPage({ id, onBack }: { id: number; onBack: () => void }) {
  const [subject, setSubject] = useState<any>(null)
  const [branches, setBranches] = useState<any[]>([])
  const [materials, setMaterials] = useState<any[]>([])
  const [selectedBranch, setSelectedBranch] = useState<number | null>(null)
  const [branchTitle, setBranchTitle] = useState("")
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    api.subject(id).then(setSubject)
    api.branches(id).then(setBranches)
    api.materials(id).then(setMaterials)
  }, [id])

  async function uploadFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const m = await api.uploadMaterial(id, file)
      setMaterials(p => [m, ...p])
    } catch (err: any) {
      alert(err.message)
    } finally {
      setUploading(false)
    }
  }

  async function createBranch() {
    if (!branchTitle.trim()) return
    const b = await api.createBranch(id, { kind: "assignment", title: branchTitle.trim() })
    setBranches(p => [b, ...p])
    setBranchTitle("")
  }

  if (selectedBranch)
    return <BranchPage id={selectedBranch} subjectId={id} onBack={() => setSelectedBranch(null)} />

  return (
    <div>
      <button onClick={onBack} className="text-sm text-indigo-600 mb-4 hover:underline">← Back</button>
      <h2 className="text-xl font-semibold mb-6">{subject?.name ?? "…"}</h2>

      <section className="mb-8">
        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">Materials</h3>
        <div className="flex gap-2 mb-3">
          <input type="file" ref={fileRef} onChange={uploadFile} className="hidden"
            accept=".pdf,.pptx,.docx,.txt,.md,.png,.jpg,.jpeg" />
          <button onClick={() => fileRef.current?.click()} disabled={uploading}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50">
            {uploading ? "Uploading…" : "Upload file"}
          </button>
        </div>
        <div className="space-y-1">
          {materials.map(m => (
            <div key={m.id} className="text-sm text-gray-700 bg-white border border-gray-100 px-3 py-2 rounded">
              {m.filename}
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">Branches</h3>
        <div className="flex gap-2 mb-3">
          <input value={branchTitle} onChange={e => setBranchTitle(e.target.value)}
            placeholder="New branch title…"
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
            onKeyDown={e => e.key === "Enter" && createBranch()} />
          <button onClick={createBranch}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
            Add
          </button>
        </div>
        <div className="space-y-2">
          {branches.map(b => (
            <button key={b.id} onClick={() => setSelectedBranch(b.id)}
              className="w-full text-left p-4 bg-white border border-gray-200 rounded-lg hover:border-indigo-300 transition-colors">
              <div className="font-medium text-gray-900">{b.title}</div>
              <div className="text-xs text-gray-400 mt-0.5 capitalize">{b.kind}</div>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
```

- [ ] **Step 3: Create `frontend/src/components/MilestoneCard.tsx`**

This is the core DApp action component.

```tsx
import { useState } from "react"
import { useWriteContract, useWaitForTransactionReceipt, useChainId } from "wagmi"
import { api } from "../lib/api"
import { NETWORK, LEDGER_ADDRESS } from "../lib/networks"
import LEDGER_ABI from "../../../contracts/abi/LearningLedger.json"

type CommitState =
  | { status: "idle" }
  | { status: "hashing" }
  | { status: "awaiting_wallet"; workHash: `0x${string}`; contextHash: `0x${string}`; level: number }
  | { status: "pending"; txHash: `0x${string}` }
  | { status: "confirmed"; txHash: string; explorerLink: string }
  | { status: "rejected" }
  | { status: "failed"; reason: string }

export function MilestoneCard({ milestone, onAnchored }: { milestone: any; onAnchored: () => void }) {
  const [draft, setDraft] = useState(milestone.draft_text ?? "")
  const [brief, setBrief] = useState("")
  const [rubric, setRubric] = useState("")
  const [aiLevel, setAiLevel] = useState(60)
  const [state, setState] = useState<CommitState>({ status: "idle" })
  const chainId = useChainId()

  const { writeContractAsync } = useWriteContract()
  const { data: receipt } = useWaitForTransactionReceipt({
    hash: state.status === "pending" ? state.txHash : undefined,
  })

  // when receipt arrives, notify backend
  if (receipt && state.status === "pending") {
    const txHash = state.txHash
    setState({ status: "confirmed", txHash, explorerLink: `${NETWORK.explorer}/tx/${txHash}` })
    api.anchored(milestone.id, txHash).then(onAnchored).catch(console.error)
  }

  const wrongNetwork = chainId !== NETWORK.id
  const alreadyCommitted = !!milestone.tx_hash

  async function commit() {
    if (wrongNetwork || !draft.trim()) return
    setState({ status: "hashing" })
    try {
      const { workHash, contextHash, aiAssistLevel } = await api.hashMilestone(
        milestone.id, draft, brief, rubric, aiLevel,
      )
      setState({ status: "awaiting_wallet", workHash, contextHash, level: aiAssistLevel })

      const txHash = await writeContractAsync({
        address: LEDGER_ADDRESS,
        abi: LEDGER_ABI,
        functionName: "commit",
        args: [workHash as `0x${string}`, contextHash as `0x${string}`, aiAssistLevel],
        chainId: NETWORK.id,
      })
      setState({ status: "pending", txHash })
    } catch (err: any) {
      if (err?.code === 4001 || err?.message?.includes("rejected")) {
        setState({ status: "rejected" })
      } else {
        setState({ status: "failed", reason: err?.message ?? "unknown error" })
      }
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-gray-900">{milestone.title}</h3>
        {alreadyCommitted && (
          <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">Committed</span>
        )}
      </div>

      {alreadyCommitted ? (
        <div className="text-xs font-mono text-gray-400 break-all">
          <a href={`${NETWORK.explorer}/tx/${milestone.tx_hash}`} target="_blank" rel="noreferrer"
            className="text-indigo-600 hover:underline">
            View on Explorer →
          </a>
        </div>
      ) : (
        <>
          <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={5}
            placeholder="Write your draft here…"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-indigo-400" />

          <div className="grid grid-cols-2 gap-3">
            <input value={brief} onChange={e => setBrief(e.target.value)}
              placeholder="Assignment brief…"
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            <input value={rubric} onChange={e => setRubric(e.target.value)}
              placeholder="Rubric / marking criteria…"
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>

          <div className="flex items-center gap-3">
            <label className="text-xs text-gray-500">AI assist level: {aiLevel}%</label>
            <input type="range" min={0} max={100} value={aiLevel}
              onChange={e => setAiLevel(+e.target.value)} className="flex-1" />
          </div>

          {state.status === "idle" && (
            <button onClick={commit} disabled={wrongNetwork || !draft.trim()}
              className="w-full py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-40">
              {wrongNetwork ? `Switch to ${NETWORK.name}` : "Commit to BOT Chain"}
            </button>
          )}
          {state.status === "hashing" && (
            <div className="text-center text-sm text-gray-500 py-2">Computing hash…</div>
          )}
          {state.status === "awaiting_wallet" && (
            <div className="text-center text-sm text-gray-500 py-2">Confirm in MetaMask…</div>
          )}
          {state.status === "pending" && (
            <div className="text-center text-sm text-gray-500 py-2">
              Waiting for confirmation…
              <span className="block font-mono text-xs text-gray-400 mt-1">{state.txHash}</span>
            </div>
          )}
          {state.status === "confirmed" && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm">
              <div className="text-green-700 font-medium mb-1">Committed on-chain</div>
              <a href={state.explorerLink} target="_blank" rel="noreferrer"
                className="text-indigo-600 text-xs font-mono hover:underline break-all">
                {state.explorerLink} →
              </a>
            </div>
          )}
          {(state.status === "rejected" || state.status === "failed") && (
            <div className="flex items-center justify-between bg-red-50 border border-red-200 rounded-lg p-3">
              <span className="text-sm text-red-700">
                {state.status === "rejected" ? "Cancelled in wallet" : `Failed: ${state.reason}`}
              </span>
              <button onClick={() => setState({ status: "idle" })}
                className="text-xs text-red-600 hover:underline">Retry</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Create `frontend/src/pages/BranchPage.tsx`**

```tsx
import { useState, useEffect } from "react"
import { api } from "../lib/api"
import { MilestoneCard } from "../components/MilestoneCard"

export function BranchPage({ id, subjectId, onBack }: { id: number; subjectId: number; onBack: () => void }) {
  const [branch, setBranch] = useState<any>(null)
  const [milestones, setMilestones] = useState<any[]>([])
  const [newTitle, setNewTitle] = useState("")

  function reload() {
    api.branch(id).then(setBranch)
    api.milestones(id).then(setMilestones)
  }

  useEffect(() => { reload() }, [id])

  async function addMilestone() {
    if (!newTitle.trim()) return
    const m = await api.createMilestone(id, newTitle.trim())
    setMilestones(p => [...p, m])
    setNewTitle("")
  }

  return (
    <div>
      <button onClick={onBack} className="text-sm text-indigo-600 mb-4 hover:underline">← Back</button>
      <h2 className="text-xl font-semibold mb-1">{branch?.title ?? "…"}</h2>
      <p className="text-sm text-gray-400 mb-6 capitalize">{branch?.kind}</p>

      <div className="space-y-4">
        {milestones.map(m => (
          <MilestoneCard key={m.id} milestone={m} onAnchored={reload} />
        ))}
      </div>

      <div className="flex gap-2 mt-6">
        <input value={newTitle} onChange={e => setNewTitle(e.target.value)}
          placeholder="New milestone title…"
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
          onKeyDown={e => e.key === "Enter" && addMilestone()} />
        <button onClick={addMilestone}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
          Add
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Build and verify**

```bash
cd frontend
npm run build
```

Expected: build succeeds with no type errors.

- [ ] **Step 6: Commit**

```bash
cd ..
git add frontend/
git commit -m "feat(frontend): subjects, branches, milestone commit → BOT Chain + explorer link"
```
