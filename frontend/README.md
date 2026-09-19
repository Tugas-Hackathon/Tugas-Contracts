# Tugas — Frontend

React client for **Tugas**, a student productivity OS that keeps an AI tutor honest by anchoring proof of a student's own work on-chain.

A Claude/ChatGPT-style workspace: a persistent sidebar of subjects on the left, and whatever you selected on the right. Each subject expands into its Materials, its AI Tutor, and its assignment branches.

Pairs with [Tugas-Backend](https://github.com/Tugas-Hackathon/Tugas-Backend).

---

## Stack

| | |
|---|---|
| Build | Vite |
| UI | React 19 + TypeScript |
| Wallet | wagmi v3 + viem |
| Async | TanStack Query |
| Styling | Tailwind CSS v4 + CSS custom properties |
| Icons | Font Awesome |
| Lint | Oxlint |

---

## Setup

```bash
npm install
```

Create `.env.local`:

```bash
VITE_NETWORK=testnet
VITE_LEDGER_ADDRESS=0xE2c7c1c96F45de15D2cDBb02dfF1E18f97106A76
VITE_API_URL=http://localhost:8000
```

| Variable | Purpose |
|---|---|
| `VITE_NETWORK` | `testnet` (chain 968) or `mainnet` (chain 677). Selects RPC + explorer in `lib/networks.ts`. |
| `VITE_LEDGER_ADDRESS` | Deployed LearningLedger contract. |
| `VITE_API_URL` | Backend base URL. Defaults to `http://localhost:8000`. |

> `VITE_*` values are compiled into the browser bundle and are **public by definition**. Never put a secret in one.

```bash
npm run dev      # dev server on :5173
npm run build    # typecheck + production build
npm run lint     # oxlint
npm run preview  # serve the built bundle
```

Needs the backend running and a browser wallet (MetaMask or similar) on BOT Chain.

---

## Architecture

### Navigation without a router

There's no React Router. The entire app is one `View` union in `App.tsx`:

```ts
export type View =
  | { type: "home" }
  | { type: "materials"; subjectId: number }
  | { type: "tutor"; subjectId: number }
  | { type: "branch"; branchId: number; subjectId: number }
```

`Sidebar` calls `onNavigate(view)`, `MainContent` switches on `view.type`. The sidebar marks an item active by deep-comparing its own descriptor against the current view, so highlighting can never drift out of sync with what's rendered.

The tradeoff is deliberate: no URLs, no deep linking, no back button — in exchange for zero routing config and a single source of truth for "where am I". For a workspace app where every screen lives behind a wallet login, sharing a URL was never useful.

### Theming

Light and dark are driven by **CSS custom properties**, not Tailwind's `dark:` variant.

`contexts/theme.tsx` exports a `vars` map holding a full token set per theme:

```ts
export const vars = {
  dark:  { "--sb-bg": "#171717", "--main-bg": "#1a1a1a", "--card-bg": "#252525", ... },
  light: { "--sb-bg": "#f1f3f5", "--main-bg": "#ffffff", "--card-bg": "#f9fafb", ... },
}
```

`App.tsx` spreads the active set onto the root element as inline style. Every component below reads `var(--card-bg)`, `var(--main-text)` and friends — so flipping the theme repaints the sidebar and the main pane **together**, in one state change, with no per-component conditionals.

Choice persists to `localStorage` under `tugas_theme`. Toggle lives above the wallet section in the sidebar.

Adding a themed surface means adding one token to both maps, not auditing every component.

### Auth

`hooks/useAuth.ts` wraps the wallet login and is provided app-wide from `main.tsx`:

```
1. wagmi connects the wallet          → address
2. GET  /auth/nonce?address=...       → one-time nonce string
3. signMessageAsync({ message })      → wallet prompts the user
4. POST /auth/verify                  → bearer token
5. token → localStorage "tugas_token"
```

Disconnecting the wallet clears the token and drops `authed` to false, so the session can't outlive the wallet connection. Until `authed` is true, `App.tsx` renders only the landing screen and connect button — the sidebar never mounts.

### On-chain commit

`components/MilestoneCard.tsx` runs an explicit state machine so the user always knows which step is waiting on them:

```
idle → hashing → awaiting_wallet → pending → confirmed
                       ↓                ↓
                   rejected          failed
```

1. `api.hashMilestone()` — backend returns `workHash`, `contextHash`, `aiAssistLevel`
2. `writeContractAsync()` — **the user's wallet** signs `commit()`; the site never holds a key
3. `api.anchored(txHash)` — backend independently verifies the receipt and the emitted event

Once confirmed the card links to the transaction on the block explorer.

---

## Components

| File | Role |
|---|---|
| `App.tsx` | Shell, `View` state machine, theme vars on root, auth gate |
| `components/Sidebar.tsx` | Subject list with expand/collapse, nav items, inline add subject/assignment, theme toggle, wallet |
| `components/ChatBox.tsx` | Reusable chat surface — messages, loading, errors, citation rendering |
| `components/MilestoneCard.tsx` | Draft input + on-chain commit state machine |
| `components/ConnectButton.tsx` | Connect / switch-network / sign-in / connected states (`compact` variant for the sidebar) |
| `pages/BranchPage.tsx` | Assignment view — Milestones / AI Outline / Discussion tabs |
| `contexts/theme.tsx` | Theme context + the token maps |
| `hooks/useAuth.ts` | Wallet login, token lifecycle |
| `lib/api.ts` | Typed backend client, bearer token injection |
| `lib/wagmi.ts` | wagmi config, BOT Chain definition |
| `lib/networks.ts` | Testnet/mainnet switch |

`ChatBox` is shared by two callers with different backends behind them — the AI Tutor tab sends to `/ask` (cited answers from your materials), the Discussion tab sends to `/rubric-check` (feedback against the rubric). Same component, different `onSend`.

---

## What a session looks like

1. Connect wallet → sign the nonce → you're in. No email, no password.
2. **New subject** in the sidebar.
3. Expand it → **Materials** → upload your notes or slides. The backend extracts the text; a file with no readable text is rejected rather than silently ignored.
4. **AI Tutor** → ask a question. The answer arrives with citations pointing at the exact file and chunk it came from. It's locked to your uploads — it won't answer from general knowledge.
5. **Add assignment** → open the branch.
   - *AI Outline* — paste the brief, get a structured outline.
   - *Milestones* — paste a draft, commit its hash on-chain from your own wallet.
   - *Discussion* — paste a section, get rubric-by-rubric feedback.

---

## Notes

- Materials list: click a row to preview in a new tab; hover for download and delete. Popup blockers can swallow the preview tab on first use.
- `lib/api.ts` reads the token from `localStorage` on every request, so a token added in another tab is picked up without a reload.
- Wrong network is handled explicitly — `ConnectButton` offers a one-click `switchChain` rather than failing at transaction time.
