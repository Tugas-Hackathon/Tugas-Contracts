# Kickoff prompt — Tugas, student productivity OS (BOT Chain DApp hackathon, AI Track)

Paste everything below into a new Claude Code session opened in `C:\Users\user\tugas`.

---

I am a Malaysian university student joining a hackathon with a hard requirement: **build a DApp on BOT Chain (EVM)** with (1) a Solidity smart contract deployed on BOT Chain **testnet and mainnet**, and (2) a frontend website on a **live domain** that connects via **MetaMask** and performs **at least one main action end-to-end** against that contract. The idea is flexible. Two optional tracks: **AI Track (AI + on-chain logging)** and **RWA Track (real-world records on-chain)**. Their examples are beginner toys (chatbot that mints Q&A pairs, zodiac collectible, time capsule, expense logger). We enter the **AI Track** with a real product.

In previous sessions we already brainstormed and **decided** the project and its scope. Do not re-open these decisions — continue from them. My team is AI/ML (Python). Solidity/JS experience: unknown — ask me first thing.

## The product: Tugas — a student productivity OS

**Positioning:** every subject, assignment, exam and project in one place, with an AI that knows *your* notes — and a Proof-of-Learning ledger you own.

**Main target: student productivity.** Not "AI writes your homework."

### Core concept: subject folders and branches

- **Subject folder** = the knowledge base for one subject: slides, notes, past-year papers, lecturer tips, whiteboard photos. The AI answers only from what is inside the folder, with citations.
- **Branch** = any goal with a deadline, living inside a subject folder:

| Branch type | Created when | Inputs | AI does |
|---|---|---|---|
| **Assignment** | a brief arrives (WhatsApp, typed, or uploaded) | brief, rubric, notes | outline, concept explainers from the student's notes, rubric check on the student's draft, milestone reminders |
| **Exam** | exam date entered or detected | lecturer's targeted topics (if given — via WhatsApp or typed by the student), past-year papers, notes, slides | study plan backwards from the exam date, practice questions generated from past papers + notes (with citations), mock quiz, weak-topic tracking from quiz history, flashcards / spaced repetition |
| **Project / FYP** | the student says "FYP time" | every subject folder from past years | project ideas matched to what the student actually learned, 14-week roadmap, week-by-week guidance |

### Integrity rule (decided — non-negotiable, and it is the pitch)

**AI gets the student 80% of the way; the student writes the 20% that is the assignment.** The tutor builds outlines, explains from the student's own notes, critiques drafts against the rubric, generates practice questions. It never writes the final submission text wholesale and has no "humanise to evade detection" feature. Every on-chain milestone records an honest `aiAssistLevel`. This turns AI use into a transparent, verifiable disclosure lecturers can trust.

### Intake (all optional — a student can feed the system everything by hand)

- **Manual upload:** PDF, PPTX, DOCX, images (whiteboard photos), typed notes. Default path.
- **WhatsApp export upload:** class-group `.txt` export → AI files lecturer messages: announcements → subject, "assignment 2 due 30 Sept" → assignment branch with deadline, targeted exam topics → exam branch, shared PDFs → subject materials.
- **Live WhatsApp bot (v2):** linked-device bot via `whatsapp-web.js` on a throwaway number (unofficial; ToS risk). The Node bot writes incoming messages into SQLite and polls an `outbox` table to send reminders — SQLite is the queue; Python never touches WhatsApp directly. Export upload remains the fallback on demo day.

### Calendar

- **In-app agenda:** deadlines, exams, scheduled study sessions.
- **Google Calendar:** lazy path first — an "Add to Google Calendar" link / `.ics` per event (zero OAuth). Then **v2: Google Calendar API sync** via OAuth with the Google Cloud project in *Testing* mode (up to 100 test users, no app verification needed for the demo); scope `calendar.events`; tokens stored server-side per user, never committed.

### Reminders (recurring automation)

Due-date nudges, "new notes filed under DBMS," "exam in 10 days — 4/7 topics covered," study-session prompts. In-app first, WhatsApp/Telegram via the bot in v2. Humanised tone. APScheduler; `outbox` unique on `(branch_id, kind, date)` so nothing double-fires.

### Proof-of-Learning ledger — the DApp part (decided)

One small contract, **`LearningLedger.sol`** (~60 lines, no external deps required):

- `commit(bytes32 workHash, bytes32 contextHash, uint8 aiAssistLevel) returns (uint256 id)` — student anchors a milestone: hash of their draft + hash of the brief/branch context + honest AI-assist level (0–100). Emits `MilestoneCommitted(student, id, workHash, contextHash, aiAssistLevel, timestamp)`.
- `endorse(uint256 id)` — a teammate (different wallet) endorses a contribution on a group assignment; cannot endorse your own; one endorsement per wallet per commit. Emits `Endorsed(id, endorser)`.
- View: `getCommit(id)`, `commitsOf(student)`.
- **No money, no escrow.** Notes, drafts, names never touch the chain — only hashes (privacy answer for judges). Anyone can recompute a hash from the stored draft to verify.
- **Main end-to-end action for the rules:** *Commit milestone → MetaMask → on-chain → card shows tx link on the explorer.*
- Tooling: **Hardhat** (TypeScript); unit tests for every path and revert; deploy scripts for testnet and mainnet; verify on the explorer if supported; same bytecode on both networks.
- Login: wallet-based — sign a nonce with MetaMask, server issues a session. Wallet address = user id. No passwords.

### Stack (decided)

- **Frontend:** Vite + React + wagmi/viem (MetaMask, network switch to BOT Chain), hosted on **Vercel** (custom domain if I have one). Pages: Dashboard/Agenda · Subjects (folders + files) · Branch view (assignment / exam / project) · Tutor chat with citations · Ledger (on-chain portfolio) · Settings (WhatsApp, Google Calendar).
- **Backend:** **FastAPI** (Python) + **SQLite** (stdlib `sqlite3`) + files on disk + **APScheduler**. Node sidecar only for the WhatsApp bot.
- **AI:** **Claude Opus 5** (`claude-opus-5`) via the official `anthropic` Python SDK. PDFs/notes go in as `document` content blocks with `citations: {enabled: true}`; upload once via the Files API and reference by `file_id`; `cache_control` on the per-subject document set (1M context — no vector DB). Extraction (briefs, deadlines, targeted topics, filing decisions) and quiz generation via `client.messages.parse()` with Pydantic. **Before writing any Anthropic SDK code, invoke the `claude-api` skill** and follow it (adaptive thinking, no prefill, `output_config`, current model IDs, refusal stop reason).
- **ML (honest, small):** weak-topic mastery per topic from quiz results (exponential moving average / simple Bayesian update), spaced-repetition scheduler (SM-2), and — only if API cost matters — a TF-IDF + LogisticRegression pre-filter for WhatsApp messages.
- **Google:** `google-api-python-client` for Calendar sync (v2).

### Data model (SQLite)

`users(id, wallet_address, google_tokens_ref)` · `subjects(id, user_id, name, code, semester)` · `materials(id, subject_id, kind, path, title, uploaded_at, source: manual|whatsapp, claude_file_id)` · `branches(id, subject_id, type: assignment|exam|project, title, due_at, status, brief, rubric, targeted_topics)` · `milestones(id, branch_id, title, due_at, done_at, work_hash, ai_assist_level, chain_commit_id, tx_hash)` · `quiz_attempts(id, branch_id, topic, score, at)` · `topic_mastery(branch_id, topic, mastery)` · `events(id, user_id, branch_id, title, at, kind, gcal_event_id)` · `messages(id, user_id, group_name, ts, sender, text, filed_to_subject_id, filed_as)` · `outbox(id, user_id, to, body, kind, scheduled_for, sent_at)` · `runs(user_id, last_msg_id, ran_at, status)`.

## Scope: build to v2, in v1 order

**Sequencing rule:** build in this order so a working demo exists at every step. The v1 checkpoint is reached after step 6; everything after is v2.

1. `LearningLedger.sol` + Hardhat tests + **testnet deploy** — de-risk the hard requirement first.
2. Backend skeleton: wallet login, subjects, manual upload, file store.
3. Tutor chat with citations over one subject folder (real notes I will provide).
4. Assignment branch: brief → outline → rubric check → milestones → **Commit milestone via MetaMask** (frontend flow, explorer link).
5. Calendar: in-app agenda + "Add to Google Calendar" / `.ics`.
6. Exam branch: study plan + practice quiz from a past-year paper. **← v1 checkpoint: full 3-minute demo works.**
7. WhatsApp export intake → auto-filing into subjects/branches.
8. Google Calendar API sync (OAuth, testing mode).
9. Quiz history → weak-topic mastery → adaptive study plan; flashcards / spaced repetition.
10. Live WhatsApp bot (Node sidecar) + reminders out via WhatsApp.
11. Group assignments: task split + `endorse` on-chain.
12. FYP advisor on 2 years of seeded subject history.
13. Mainnet deploy + live domain + pitch deck.
14. Only if time remains: whiteboard OCR, Drive sync, Telegram.

## Demo script (3 minutes)

1. Problem (20s): students juggle 6 subjects across WhatsApp groups, LMS, Drive and paper — nothing knows everything they have.
2. Upload notes + a past-year paper for one subject → tutor answers a question citing the exact slide.
3. WhatsApp export → "Assignment 2 due 30 Sept" becomes a branch with deadline; agenda updates; "Add to Google Calendar."
4. Assignment branch → outline from notes → paste my draft → rubric check → **Commit milestone** → MetaMask → tx link. Ledger page shows the portfolio.
5. Exam branch → study plan + practice quiz from the past paper → weak topic flagged.
6. FYP advisor → 3 project ideas matched to two years of subjects → roadmap.
7. Close: AI gets you 80% of the way; the chain proves you did the rest.

## Roadmap for the pitch (v3 — do not build)

LMS connectors (Moodle/Canvas), lecturer dashboard for AI-assist disclosures, university-issued certificates on the same ledger, employer-verifiable portfolios, FYP supervisor marketplace, freemium (RM 9/month pro; university licences).

## Working style

Ponytail mode: shortest working diff, stdlib and native first, no speculative abstractions, one runnable check per non-trivial module. Skills and rules from my global config apply (brainstorming → spec → writing-plans → TDD).

## What to do first in this session

1. Ask me these, then proceed: **BOT Chain docs** (RPC URL, chain ID, explorer, testnet faucet; does mainnet gas cost real money and do organisers provide it?); **team size and Solidity/JS level**; **deadline** (this decides how far past the v1 checkpoint we get); **domain** (own one, or is a Vercel subdomain accepted?); whether I have real notes/past papers for one subject to seed the demo.
2. Finish the design: per-module interfaces, error handling (upload validation, Pydantic validation of LLM output, refusal stop reason, SDK retries, tx rejected/failed states in the UI, OAuth token expiry), testing plan (Hardhat tests for every transition and revert; fixtures for WhatsApp export formats; extraction and filing eval on ~100 labelled messages; quiz-generation spot checks; scheduler idempotency; one end-to-end smoke test). Get my approval per section.
3. Write the spec to `docs/superpowers/specs/YYYY-MM-DD-tugas-design.md`, `git init` this folder, commit.
4. Invoke the `writing-plans` skill and implement with TDD in the build order above.
