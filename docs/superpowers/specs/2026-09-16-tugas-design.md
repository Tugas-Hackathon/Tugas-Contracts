# Tugas — design spec

Date: 2026-09-16. Status: approved (sections 1–6 approved in session).
Hackathon: BOT Chain DApp, AI Track. Team: Python/AI-ML, no Solidity/JS
(Claude writes contract + frontend, explains key parts). Deadline: 3+ weeks →
full v2 scope. Domain: bought via Vercel Domains. Backend host: Fly.io + volume.
AI supplier: OpenRouter (single key, many models).

## 1. Product (decided earlier, not re-opened)

Student productivity OS: subject folders (knowledge base per subject) and
branches (assignment / exam / project) with an AI tutor that answers only from
the student's own materials with citations, plus a Proof-of-Learning ledger on
BOT Chain. Integrity rule: AI gets the student 80% of the way; the student
writes the 20% that is the assignment. No wholesale final-text generation, no
"humanise" feature. Every on-chain milestone carries an honest `aiAssistLevel`.

Main end-to-end DApp action: Commit milestone → MetaMask → on-chain →
card shows explorer tx link.

## 2. Network (verified live 2026-09-16)

| | Mainnet | Testnet |
|---|---|---|
| Chain ID | 677 (0x2a5) | 968 (0x3c8) |
| RPC | https://rpc.botchain.ai | https://rpc.bohr.life |
| Explorer (Blockscout) | https://scan.botchain.ai | https://scan.bohr.life |
| Currency | BOT | tBOT |
| Faucet | — (real BOT needed for gas) | https://faucet.botchain.ai/basic (10 tBOT / 24 h) |

Caveat: chain ID 968 is reused by other networks; the frontend pins RPC URL,
not chain ID alone. Source of truth: `contracts/networks.json`, copied into the
frontend at build time.

## 3. Repo layout (monorepo, `C:\Users\user\tugas`)

```
contracts/   Hardhat (TypeScript): LearningLedger.sol, test/, scripts/deploy.ts, networks.json
backend/     FastAPI, uv-managed venv, sqlite3 stdlib, files on disk under data/
frontend/    Vite + React + TypeScript + wagmi/viem, deployed to Vercel
bot/         Node WhatsApp sidecar (whatsapp-web.js), v2
seed/dbms/   real notes / slides / past-year paper for the demo subject (placeholder name)
docs/        specs, plans, pitch
```

## 4. Contract — `LearningLedger.sol`

Solidity 0.8.x pinned, no constructor args, no external deps → identical
bytecode on both networks.

```solidity
struct Commit { address student; bytes32 workHash; bytes32 contextHash;
                uint8 aiAssistLevel; uint64 timestamp; uint32 endorsements; }
Commit[] private commits;
mapping(address => uint256[]) private studentCommits;
mapping(uint256 => mapping(address => bool)) public endorsed;

function commit(bytes32 workHash, bytes32 contextHash, uint8 aiAssistLevel) external returns (uint256 id);
  // revert: aiAssistLevel > 100 ("level>100"), workHash == 0 ("zero hash")
  // emit MilestoneCommitted(student, id, workHash, contextHash, aiAssistLevel, timestamp)
function endorse(uint256 id) external;
  // revert: id >= commits.length ("no commit"), msg.sender == student ("self"),
  //         endorsed[id][msg.sender] ("already")
  // emit Endorsed(id, endorser)
function getCommit(uint256 id) external view returns (Commit memory);
function commitsOf(address student) external view returns (uint256[] memory);
function totalCommits() external view returns (uint256);
```

Nothing but hashes goes on chain. `workHash = keccak256(normalised draft
text)`, `contextHash = keccak256(brief + "\n" + rubric)`; anyone with the
stored draft can recompute and verify.

Tooling: Hardhat + hardhat-toolbox; `scripts/deploy.ts` reads `networks.json`
and `DEPLOYER_KEY` from `.env`; `hardhat-verify` configured with Blockscout
custom chains for 677 and 968. Deployed addresses written to
`contracts/deployments.json` (committed) and read by the frontend.

## 5. Backend (FastAPI, Python 3.14 via `uv`)

One module per concern, each ≤ ~300 lines.

- `db.py` — `sqlite3`, WAL mode, `schema.sql` applied at startup, one
  connection per request. Tables: users, sessions, nonces, subjects, materials,
  branches, milestones, quiz_attempts, topic_mastery, events, messages, outbox,
  runs (as in the kickoff data model; `materials.text` added for extracted
  text; `sessions(token, user_id, expires_at)`; `nonces(address, nonce,
  expires_at)`).
- `auth.py` — `GET /auth/nonce?address=` → nonce (5 min, single use);
  `POST /auth/verify {address, signature}` → verify EIP-191 personal_sign with
  `eth-account`; returns bearer token (30 days). Wallet address = user id.
- `materials.py` — `POST /subjects/{id}/materials` multipart. Allow-list:
  pdf, pptx, docx, txt, md, png, jpg, jpeg. 25 MB cap. Stored as
  `data/files/{user}/{subject}/{uuid}{ext}`. Text extraction: pypdf,
  python-pptx, python-docx; images → vision model via `llm.parse(task="ocr")`.
  Empty extraction → 422 with message. Text stored on the row, split into
  numbered chunks (`M{material_id} p{page}`) on read.
- `llm.py` — `openai` SDK with `base_url=https://openrouter.ai/api/v1`.
  `chat(task, messages) -> str` and `parse(task, prompt, schema: type[BaseModel])
  -> BaseModel` using JSON-schema `response_format`. Routing table
  `TASK_MODELS = {task: [primary_slug, fallback_slug, ...]}`; per-task env
  override `LLM_MODEL_<TASK>`. Pydantic validation failure → one retry with the
  error appended → 502. Timeout 60 s, 2 SDK retries. Refusal / empty content →
  `LLMDeclined` → 502 "the model declined". Tasks: tutor, rubric, outline,
  extract, ocr, quiz, plan, ideas. Initial slugs (revise at build time from
  OpenRouter's catalogue): tutor/rubric/outline → `anthropic/claude-opus-5`;
  extract/ocr → Gemini Flash; quiz/plan/ideas → OpenAI GPT. `LLM_FIXTURES=1`
  serves recorded responses from `backend/tests/fixtures/llm/` for offline runs.
  `# ponytail:` whole-subject text is sent per call; add retrieval when a
  subject exceeds the model context.
- `tutor.py` — `POST /subjects/{id}/ask {question}` → builds chunk context →
  `parse(task="tutor")` with schema `{answer, citations:[{chunk_id, quote}]}` →
  drops citations whose `chunk_id` is not in the context → returns answer,
  citations, and the resolved material title + page for each.
- `branches.py` — CRUD `branches`. Assignment: `POST /branches/{id}/outline`,
  `POST /branches/{id}/rubric-check {draft}` → `{criteria:[{name, met,
  evidence, suggestion}]}`. Exam: `POST /study-plan` (backwards from
  `due_at`, topics from `targeted_topics` or extracted from past papers),
  `POST /quiz` (n questions with answer + source chunk), `POST /quiz/attempt
  {answers}` → score per topic → `mastery.update`. Project: `POST /ideas`
  (reads all subjects), `POST /roadmap` (14 weeks).
- `milestones.py` — CRUD under a branch. `POST /milestones/{id}/hash {draft}`
  → stores draft text, returns `{workHash, contextHash, aiAssistLevel}`.
  `POST /milestones/{id}/anchored {txHash}` → `eth_getTransactionReceipt` via
  the configured RPC, decodes `MilestoneCommitted`, checks hashes and student
  address match, stores `chain_commit_id` + `tx_hash`; mismatch → 400.
- `calendar.py` — `GET /agenda` (events + branch deadlines), `GET
  /events/{id}.ics`, `GET /events/{id}/gcal-link`. `gcal.py` (v2): OAuth
  (Google Cloud project in Testing mode, scope `calendar.events`), tokens in
  `users.google_tokens_ref` → `data/tokens/{user}.json`, refresh on expiry,
  failure → `reconnect_needed` flag shown in Settings; `.ics` path always works.
- `intake.py` (v2) — `POST /intake/whatsapp` (.txt export). Parser handles
  Android and iOS formats; optional TF-IDF + LogisticRegression pre-filter;
  `parse(task="extract")` per lecturer message → `{kind: announcement|
  assignment|exam_topics|material|noise, subject, title, due_at, topics}` →
  writes `messages`, creates branches/materials, returns a filing report.
- `mastery.py` — pure: `ema(prev, score, alpha=0.3)`, `sm2(card, quality)`.
- `scheduler.py` — APScheduler (BackgroundScheduler): nightly job scans
  branches/events → inserts `outbox` rows (unique index `(branch_id, kind,
  scheduled_for)` → idempotent). `GET /notifications` reads `outbox` where
  `to='inapp'`. v2: WhatsApp rows consumed by the Node bot.
- `bot/` (v2) — whatsapp-web.js on a throwaway number, writes incoming
  messages to the same SQLite `messages` table, polls `outbox` for
  `to='whatsapp'`. Export upload remains the demo-day fallback.

Config via `.env` (never committed): `OPENROUTER_API_KEY`, `RPC_URL`,
`LEDGER_ADDRESS`, `SESSION_SECRET`, `DATA_DIR`, `GOOGLE_CLIENT_*`.
CORS restricted to the frontend origin. Deployed on Fly.io with a volume
mounted at `DATA_DIR`, custom subdomain `api.<domain>`.

## 6. Frontend (Vite + React + TS + wagmi/viem, Vercel)

Routes: `/` Dashboard+Agenda · `/subjects`, `/subjects/:id` · `/branches/:id`
(assignment | exam | project view) · `/tutor/:subjectId` · `/ledger` ·
`/settings`.

Wallet: `injected()` connector only. Chain definition built from the shared
networks JSON; `VITE_NETWORK=testnet|mainnet` selects at build time.
"Switch to BOT Chain" → `wallet_addEthereumChain` then `switchChain`; commit
button disabled on wrong network. Login: connect → `GET /auth/nonce` →
`signMessage` → `POST /auth/verify` → token in memory + localStorage.

Commit state machine on the milestone card:
`idle → hashing → awaiting_wallet → pending(txHash) → confirmed(explorerLink)`
with `rejected` (wallet code 4001, "cancelled") and `failed` (revert / RPC
error, short reason) both retryable. After `confirmed`, POST `/anchored`.

Ledger page reads `commitsOf(address)` + `getCommit` directly via viem
(works with backend down); shows work/context hashes, level, timestamp,
endorsements, explorer links; v2 adds an Endorse button for teammates.

Style: light editorial layout, one accent colour, monospace for hashes and
addresses, no dark mode in v1. No "answered by model" badge (decided).

## 7. Error handling (summary of decisions)

- Uploads: allow-list, size cap, UUID filenames, 422 on empty extraction.
- LLM: schema-constrained output, Pydantic validation, one corrective retry,
  502 with readable message; per-task fallback chain; timeouts and SDK retries.
- Chain: wrong network blocked before wallet; 4001 → cancelled; revert/RPC →
  failed with reason; server receipt check rejects mismatching tx hashes.
- Auth: single-use expiring nonces, 30-day tokens, 401 → reconnect.
- OAuth: refresh; failure → reconnect flag; `.ics` fallback always available.
- Scheduler: `outbox` unique index makes re-runs no-ops.

## 8. Testing plan

- Contract (Hardhat, TS): commit stores + emits, ids increment, level>100
  reverts, zero hash reverts, endorse ok + count + event, self-endorse reverts,
  double endorse reverts, unknown id reverts, `commitsOf` lists per student.
- Backend (pytest, in-memory SQLite, `LLM_FIXTURES=1`): auth signature with a
  local key + nonce reuse/expiry; upload validation; citation validator; hash
  computation matches viem `keccak256`; `.ics` output; `ema` and `sm2`; intake
  fixtures for Android + iOS exports and ~100 labelled messages with
  precision/recall on filing (target ≥ 0.9 on deadline extraction); receipt
  verifier against a local Hardhat node; scheduler idempotency (run twice, one
  row).
- Frontend (Vitest): commit state machine, chain-switch helper. One Playwright
  smoke test against local Hardhat + backend with a MetaMask stand-in:
  connect → login → upload → ask → commit → explorer link.
- Quiz generation: manual spot-check list in `docs/quiz-checks.md`.

## 9. Build order (v1 checkpoint after step 6)

1. Contract + tests + testnet deploy + verify.
2. Backend skeleton: db, auth, subjects, materials upload, extraction.
3. Tutor with validated citations over the seed subject.
4. Assignment branch → outline → rubric check → milestones → commit via
   MetaMask (frontend), explorer link, receipt check.
5. Agenda + `.ics` + Google Calendar link.
6. Exam branch: study plan + quiz from the past-year paper. ← v1 demo works.
7. WhatsApp export intake.
8. Google Calendar API sync.
9. Mastery + adaptive plan + spaced repetition.
10. Live WhatsApp bot + outbound reminders.
11. Group assignments + endorse UI.
12. FYP advisor on seeded two-year history.
13. Mainnet deploy + Vercel domain + Fly.io backend + pitch deck.
14. If time remains: whiteboard OCR polish, Drive sync, Telegram.

## 10. Out of scope (v3 pitch only)

LMS connectors, lecturer dashboard, university certificates, employer
portfolios, supervisor marketplace, pricing.
