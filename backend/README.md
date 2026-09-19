# Tugas — Backend

FastAPI service behind **Tugas**, a student productivity OS that keeps an AI tutor honest by anchoring proof of a student's own work on-chain.

The backend does four jobs:

1. **Wallet-based auth** — no passwords, no email. A wallet signature is the login.
2. **Material ingestion** — students upload notes/slides/PDFs; the server extracts the text.
3. **Grounded AI** — every tutor answer must cite a chunk of the student's own uploaded material, and the server throws away citations that don't resolve.
4. **Proof-of-learning** — hash a draft, let the student sign the transaction in their own wallet, then verify the on-chain receipt actually matches the hash the server computed.

Pairs with [Tugas-Frontend](https://github.com/Tugas-Hackathon/Tugas-Frontend).

---

## Why it's built this way

**The AI can't quietly make things up.** `/ask` doesn't send the question to a general-purpose model. It chunks the student's uploaded materials, labels each chunk (`M1p2` = material 1, chunk 2), and demands the model return citations by chunk ID plus an exact quote. The server then filters the response against the set of IDs it actually issued — a hallucinated citation is dropped before it ever reaches the browser. The student sees which file and page an answer came from.

**The server never holds a private key.** The backend computes hashes and verifies receipts. It never signs. The student's wallet signs the `commit()` transaction, so the on-chain record is provably theirs and the server can't forge one.

**Verification is adversarial, not trusting.** `/anchored` doesn't take the client's word that a transaction succeeded. It fetches the receipt over JSON-RPC, checks status, finds the `MilestoneCommitted` log emitted by the expected contract address, decodes the `workHash`/`contextHash` out of the log data, and compares them against what the server computed earlier. Any mismatch is a 400.

---

## Stack

| | |
|---|---|
| Framework | FastAPI + Uvicorn |
| Python | 3.14+ (managed with [uv](https://docs.astral.sh/uv/)) |
| Database | SQLite (WAL mode, foreign keys on) — stdlib `sqlite3`, no ORM |
| Wallet auth | `eth-account` (EIP-191 `personal_sign`) |
| AI | OpenRouter via the OpenAI-compatible SDK |
| Text extraction | `pypdf`, `python-pptx`, `python-docx` |
| Chain reads | `urllib` JSON-RPC — no web3 dependency |
| Tests | pytest + `httpx` |

---

## Setup

```bash
uv sync --extra dev
```

Copy the env template and fill it in:

```bash
cp .env.example .env
```

| Variable | Purpose | Default |
|---|---|---|
| `OPENROUTER_API_KEY` | OpenRouter key. Required for `/ask`, `/outline`, `/rubric-check`. | — |
| `RPC_URL` | JSON-RPC endpoint used to verify receipts. | `https://rpc.bohr.life` |
| `LEDGER_ADDRESS` | LearningLedger contract. Logs from any other address are ignored. | — |
| `DATA_DIR` | Where `tugas.db` and uploaded files live. | `./data` |
| `CORS_ORIGIN` | Allowed browser origin. | `http://localhost:5173` |

> `SESSION_SECRET` appears in `.env.example` but nothing reads it — session tokens are random (`secrets.token_urlsafe`), not signed. Safe to ignore or remove.

Run it:

```bash
uv run uvicorn main:app --reload
```

Interactive API docs at `http://localhost:8000/docs`.

---

## Authentication

No passwords exist anywhere in this system. **The wallet address is the user ID.**

```
1. GET  /auth/nonce?address=0xabc...
        → server stores a single-use nonce (5 min TTL), returns it

2. Browser signs that exact string with personal_sign

3. POST /auth/verify { address, signature }
        → server recovers the signer from the signature
        → recovered address must equal the claimed address
        → nonce is deleted (single use — a replay gets 401)
        → returns a bearer token (30 day TTL)

4. Every later request: Authorization: Bearer <token>
```

Every query is scoped by `user_id`, so one student can never read another's subjects, materials, branches or milestones — a wrong-owner lookup returns 404, not 403, so the API doesn't leak whether a row exists.

---

## Proof-of-learning flow

This is the part that makes Tugas more than another AI chat wrapper.

```
  ┌────────────────────────────────────────────────────────────┐
  │ 1. POST /milestones/{id}/hash                              │
  │    { draft, brief, rubric, ai_assist_level }               │
  │                                                            │
  │    workHash    = keccak256(normalise(draft))               │
  │                  normalise = lowercase, collapse whitespace│
  │    contextHash = keccak256(brief + "\n" + rubric)          │
  │                                                            │
  │    Stored server-side. Returned to the browser.            │
  └────────────────────────────────────────────────────────────┘
                              ↓
  ┌────────────────────────────────────────────────────────────┐
  │ 2. Student's wallet calls LearningLedger.commit(            │
  │       workHash, contextHash, aiAssistLevel )               │
  │    The server is not involved. The student signs.          │
  └────────────────────────────────────────────────────────────┘
                              ↓
  ┌────────────────────────────────────────────────────────────┐
  │ 3. POST /milestones/{id}/anchored { tx_hash }              │
  │                                                            │
  │    eth_getTransactionReceipt(tx_hash)                      │
  │    ├─ status must be 0x1              else 400 "reverted"  │
  │    ├─ find MilestoneCommitted log from LEDGER_ADDRESS      │
  │    ├─ decode workHash / contextHash from log data          │
  │    └─ both must match what step 1 computed                 │
  │                                                            │
  │    Only then are chain_commit_id + tx_hash saved.          │
  └────────────────────────────────────────────────────────────┘
```

The draft text itself never goes on-chain — only its hash. The student can later prove *"this exact draft existed at this timestamp, and I declared I used AI for N% of it"* without publishing their coursework.

`ai_assist_level` is self-declared (0–100, clamped server-side). It's a disclosure mechanism, not a detector.

---

## API reference

All routes except `/health` and `/auth/*` require `Authorization: Bearer <token>`.

### Auth

| Method | Path | Body | Returns |
|---|---|---|---|
| `GET` | `/auth/nonce?address=` | — | `{ nonce }` |
| `POST` | `/auth/verify` | `{ address, signature }` | `{ token, address }` |

### Subjects

| Method | Path | Body | Returns |
|---|---|---|---|
| `POST` | `/subjects` | `{ name }` | `201` `{ id, name, created_at }` |
| `GET` | `/subjects` | — | `[{ id, name, created_at }]` |
| `GET` | `/subjects/{id}` | — | `{ id, name, created_at }` |
| `DELETE` | `/subjects/{id}` | — | `204` |

### Materials

| Method | Path | Body | Returns |
|---|---|---|---|
| `POST` | `/subjects/{id}/materials` | multipart `file` | `201` `{ id, filename, mime, page_count, created_at }` |
| `GET` | `/subjects/{id}/materials` | — | `[{ id, filename, mime, page_count, created_at }]` |
| `GET` | `/materials/{id}/download` | — | the file |
| `DELETE` | `/materials/{id}` | — | `204` (removes row **and** file on disk) |

Accepted: `.pdf` `.pptx` `.docx` `.txt` `.md` `.png` `.jpg` `.jpeg`. Max 25 MB.

A file that yields no extractable text is **rejected with 422 and deleted** — an unreadable file would silently poison every tutor answer for that subject, so it never gets stored. Images go through a vision model for OCR.

### AI Tutor

| Method | Path | Body | Returns |
|---|---|---|---|
| `POST` | `/subjects/{id}/ask` | `{ question }` | `{ answer, citations: [{ chunk_id, quote, filename, page }] }` |

Returns `422` if the subject has no materials yet. Citations the server didn't issue are stripped from the response.

### Branches (assignments / exams / projects)

| Method | Path | Body | Returns |
|---|---|---|---|
| `POST` | `/subjects/{id}/branches` | `{ kind, title, due_at?, targeted_topics? }` | `201` branch |
| `GET` | `/subjects/{id}/branches` | — | `[branch]` |
| `GET` | `/branches/{id}` | — | branch |
| `POST` | `/branches/{id}/outline` | `{ brief }` | `{ sections: [{ title, points[] }] }` |
| `POST` | `/branches/{id}/rubric-check` | `{ draft }` | `{ criteria: [{ name, met, evidence, suggestion }] }` |

`kind` is constrained by the schema to `assignment`, `exam` or `project`.

### Milestones

| Method | Path | Body | Returns |
|---|---|---|---|
| `POST` | `/branches/{id}/milestones` | `{ title }` | `201` milestone |
| `GET` | `/branches/{id}/milestones` | — | `[milestone]` |
| `POST` | `/milestones/{id}/hash` | `{ draft, brief, rubric, ai_assist_level }` | `{ workHash, contextHash, aiAssistLevel }` |
| `POST` | `/milestones/{id}/anchored` | `{ tx_hash }` | `{ chain_commit_id, tx_hash }` |

---

## AI layer

`llm.py` is a thin wrapper over OpenRouter with two entry points:

- `chat(task, messages)` → raw string
- `parse(task, prompt, schema)` → validated Pydantic model, using JSON-schema structured output

Models are chosen per *task*, not per call site, so swapping a model is a one-line change:

```python
TASK_MODELS = {
    "tutor":   ["anthropic/claude-opus-5", ...],
    "rubric":  ["anthropic/claude-opus-5", ...],
    "outline": ["anthropic/claude-opus-5", ...],
    "ocr":     ["google/gemini-flash-1.5", ...],
}
```

Override any task at runtime with `LLM_MODEL_<TASK>` (e.g. `LLM_MODEL_TUTOR=openai/gpt-4o`).

If the model returns JSON that fails validation, `parse` feeds the validation error back and retries **once**. A second failure raises `LLMDeclined`, which surfaces as a `502` — the API never returns half-parsed AI output.

### Testing without burning credits

Set `LLM_FIXTURES=1` and every model call is served from `tests/fixtures/llm/<task>.json` instead of the network:

```bash
LLM_FIXTURES=1 uv run pytest
```

This is how CI runs — deterministic, free, and no API key needed.

---

## Data model

`schema.sql`, applied on startup by `init_db()`.

**Live tables:** `users`, `nonces`, `sessions`, `subjects`, `materials`, `branches`, `milestones`

**Reserved for planned features** (created but not yet written to): `quiz_attempts`, `topic_mastery` (spaced repetition), `events` (calendar), `messages`, `outbox` (reminders), `runs`

Every user-owned table carries a `user_id` referencing `users(address)`.

---

## Tests

```bash
LLM_FIXTURES=1 uv run pytest -v
```

Covers auth (signature recovery, nonce replay, expiry), subjects, materials (upload, type rejection, text extraction), the tutor's citation filtering, branches, and milestone hashing plus receipt verification.

---

## Project layout

```
main.py          app wiring, CORS, router registration
db.py            sqlite connection + transactional get_db() contextmanager
schema.sql       full schema, applied at startup
auth.py          nonce / verify / current_user dependency
subjects.py      subject CRUD
materials.py     upload, text extraction, download, delete
tutor.py         chunking + grounded ask with citation validation
branches.py      branches, AI outline, rubric check
milestones.py    keccak hashing + on-chain receipt verification
llm.py           OpenRouter wrapper, task routing, fixtures
tests/           pytest suite
```

---

## Deployed contract

`LearningLedger` on **BOT Chain Testnet** (chain ID `968`)

- Address: [`0xE2c7c1c96F45de15D2cDBb02dfF1E18f97106A76`](https://scan.bohr.life/address/0xE2c7c1c96F45de15D2cDBb02dfF1E18f97106A76)
- RPC: `https://rpc.bohr.life`
- Explorer: `https://scan.bohr.life`

---

## Security notes

- `.env` is gitignored and must never be committed. `.env.example` holds placeholders only.
- Nonces are single-use with a 5-minute TTL; session tokens expire after 30 days.
- Uploads are extension-allowlisted and size-capped before anything touches disk.
- Every data query is scoped by the authenticated `user_id`.
- The server never handles a private key.
