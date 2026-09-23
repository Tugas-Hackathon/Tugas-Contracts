# Tugas — deployment guide

Everything needed to put Tugas online with **Supabase** (database + file storage)
and **Vercel** (API + web app). Both free tiers are enough.

Budget about 30 minutes.

---

## What Tugas is

A study workspace that keeps AI honest. The tutor answers only from a student's
own uploaded notes and cites the exact source. Each draft of an assignment is
hashed and anchored on BOT Chain from the student's own wallet, building a
timestamped record of genuine progress — the coursework itself never leaves
their machine, only the hash goes public.

---

## What runs where

```
  Vercel  ──  frontend/     React app                     free
  Vercel  ──  backend/      FastAPI                       free
Supabase  ──  Postgres      all data                      free
Supabase  ──  Storage       uploaded PDFs, slides         free
BOT Chain ──  contracts/    LearningLedger (deployed)     done
  laptop  ──  backend/bot/  WhatsApp sidecar              see below
```

**The WhatsApp sidecar cannot run on Vercel.** It drives a real Chromium
browser and holds a session open for hours; Vercel kills a function after
60 seconds. Run it locally when demonstrating that feature. Everything else
works fully deployed.

---

## Before you start

- A [Supabase](https://supabase.com) account
- A [Vercel](https://vercel.com) account
- Access to this repository

---

## Step 1 — Supabase

### 1.1 Create the project

New project → pick a region near your users (Singapore for Malaysia) → set a
database password and keep it somewhere safe.

Wait for provisioning to finish before continuing.

### 1.2 Create the tables

**SQL Editor** → **New query** → paste the entire contents of
[`backend/schema.pg.sql`](backend/schema.pg.sql) → **Run**.

You should see `Success. No rows returned`. Check **Table Editor** — there
should be 15 tables including `users`, `subjects`, `materials` and `milestones`.

### 1.3 Create the storage bucket

**Storage** → **New bucket**

- Name: `materials`
- **Public: off.** Files are served through the API, which checks the
  requester owns them. A public bucket would let anyone with a URL read any
  student's coursework.

### 1.4 Collect three values

**Settings → Database → Connection string → URI**, and switch the mode
selector to **Session pooler**:

```
postgresql://postgres.xxxx:[PASSWORD]@aws-0-region.pooler.supabase.com:6543/postgres
```

> ⚠️ **The port must be 6543, not 5432.** 5432 is a direct connection.
> Each serverless request opens a new one, and Postgres runs out of
> connections within minutes of real traffic. This is the most common way
> this deployment fails.

Replace `[PASSWORD]` with the password from step 1.1.

**Settings → API**:
- **Project URL** → `https://xxxx.supabase.co`
- **`service_role` key** → the long secret one

> The `service_role` key bypasses row-level security. It belongs only in
> Vercel's server-side environment variables. Never put it in the frontend,
> never commit it — anything prefixed `VITE_` is compiled into the browser
> bundle and is public.

---

## Step 2 — Backend on Vercel

**Add New → Project** → import this repository.

| Setting | Value |
|---|---|
| Root Directory | `backend` |
| Framework Preset | Other |

Add these environment variables:

| Name | Value |
|---|---|
| `DATABASE_URL` | the pooler string from 1.4 |
| `SUPABASE_URL` | `https://xxxx.supabase.co` |
| `SUPABASE_SERVICE_KEY` | the `service_role` key |
| `SUPABASE_BUCKET` | `materials` |
| `RPC_URL` | `https://rpc.bohr.life` |
| `LEDGER_ADDRESS` | `0xE2c7c1c96F45de15D2cDBb02dfF1E18f97106A76` |
| `CORS_ORIGIN` | leave blank for now — filled in at step 4 |

Deploy. When it finishes, open `https://your-api.vercel.app/health` — it
should return `{"ok":true}`.

Note the URL.

---

## Step 3 — Frontend on Vercel

**Add New → Project** → import the **same repository again**.

| Setting | Value |
|---|---|
| Root Directory | `frontend` |
| Framework Preset | Vite |

Environment variables:

| Name | Value |
|---|---|
| `VITE_API_URL` | the backend URL from step 2 |
| `VITE_NETWORK` | `testnet` |
| `VITE_LEDGER_ADDRESS` | `0xE2c7c1c96F45de15D2cDBb02dfF1E18f97106A76` |

Deploy, and note this URL too.

---

## Step 4 — Connect the two

Go back to the **backend** project → Settings → Environment Variables → set:

```
CORS_ORIGIN = https://your-frontend.vercel.app
```

No trailing slash. It must match the frontend origin character for character,
or the browser blocks every request and the app looks completely broken while
the API is actually healthy.

**Redeploy the backend** — Vercel does not apply environment changes to an
existing deployment.

---

## Step 5 — Check it works

Open the frontend URL and:

1. **Connect Wallet** and sign in — proves auth and the database write path
2. **New subject** — proves Postgres
3. **Materials → upload a PDF** — proves Supabase Storage
4. **Click the file** — proves storage reads
5. **Settings → paste an OpenRouter key** → open **AI Tutor** and ask something

If all five work, the deployment is sound.

---

## About AI features

Tugas calls Claude and Gemini through [OpenRouter](https://openrouter.ai).
There is **no shared key and none is needed** — each student adds their own
under **Settings**, billed to their own account.

To provide one centrally instead, set `OPENROUTER_API_KEY` on the backend
project and it becomes the fallback for anyone without their own.

Without any key the app still runs; only tutor, milestone planning and quiz
generation are unavailable, and they say so rather than failing silently.

---

## WhatsApp (optional, local only)

```bash
cd backend/bot
npm install                       # pulls Chromium, a few hundred MB
BOT_TOKEN=$(openssl rand -hex 32) npm start
```

Put the same `BOT_TOKEN` in the backend's environment. Point the frontend at
`http://localhost:8000` while using it.

`.wwebjs_auth/` holds a logged-in WhatsApp session. Treat it like a password —
anyone who copies that folder can read and send as that person.

---

## Local development

```bash
# backend — SQLite, no Supabase needed
cd backend && uv sync --extra dev && uv run uvicorn main:app --reload

# frontend
cd frontend && npm install && npm run dev
```

Leave `DATABASE_URL` unset locally. The backend then uses SQLite and the local
filesystem, so no cloud account is required to develop.

---

## Troubleshooting

**Every request fails with a CORS error**
`CORS_ORIGIN` does not exactly match the frontend URL, or the backend was not
redeployed after changing it. Check for a trailing slash and `http` vs `https`.

**`too many connections` / `remaining connection slots are reserved`**
You used port 5432. Switch to the pooler on 6543 and redeploy.

**Uploads fail with `upload failed`**
The bucket name does not match `SUPABASE_BUCKET`, or the key used is the
`anon` key rather than `service_role`.

**`could not extract any text from this file`**
Working as intended. The file has no readable text — often a scanned PDF.
Such a file would silently poison every tutor answer for that subject, so it
is rejected rather than stored.

**AI features return 402**
No OpenRouter key — the student's, or the server's. Add one in Settings.

**`relation "users" does not exist`**
`schema.pg.sql` was never run, or was run against a different project.

---

## Repositories

| | |
|---|---|
| [Tugas-Backend](https://github.com/Tugas-Hackathon/Tugas-Backend) | API and WhatsApp sidecar |
| [Tugas-Frontend](https://github.com/Tugas-Hackathon/Tugas-Frontend) | React client |
| [Tugas-Contracts](https://github.com/Tugas-Hackathon/Tugas-Contracts) | LearningLedger, Hardhat |

**Deployed contract:** [`0xE2c7c1c96F45de15D2cDBb02dfF1E18f97106A76`](https://scan.bohr.life/address/0xE2c7c1c96F45de15D2cDBb02dfF1E18f97106A76)
on BOT Chain Testnet (chain `968`).
