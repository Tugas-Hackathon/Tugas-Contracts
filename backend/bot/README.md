# Tugas — WhatsApp sidecar

A small Node service that holds each student's WhatsApp Web session and exposes
it to the Python backend over localhost.

It exists as a separate process because `whatsapp-web.js` is Node-only and
drives a real Chromium instance — neither of which FastAPI can host in-process.

## Why it isn't optional plumbing

Malaysian coursework is coordinated in class WhatsApp groups. Deadlines,
venue changes and exam scope are announced there and then buried under
hundreds of messages. This service is how Tugas reads the groups a student
explicitly maps to a subject — and only those.

## Running it

```bash
npm install          # pulls Chromium via Puppeteer, a few hundred MB
npm start
```

Requires `BOT_TOKEN` — the same value the backend has in its `.env`:

```bash
BOT_PORT=8787
BOT_TOKEN=<64 hex chars, e.g. openssl rand -hex 32>
```

**It refuses to start without `BOT_TOKEN`.** An unauthenticated port here would
expose every linked WhatsApp account to anything on the machine, so failing
loudly beats defaulting to insecure. It binds `127.0.0.1` only; the browser
never reaches it, `backend/whatsapp.py` proxies every call under the caller's
session.

## Endpoints

All require the `x-bot-token` header.

| | |
|---|---|
| `POST /session/:user/start` | Begin auth; emits a QR |
| `GET /session/:user/status` | `qr` / `authenticating` / `ready` / `disconnected` |
| `GET /session/:user/groups` | The user's groups, with member counts |
| `GET /session/:user/senders?chat_id=` | Recent senders, for the focus-person picker |
| `GET /session/:user/messages?chat_id=&limit=` | Recent messages |
| `GET /session/:user/debug` | IndexedDB structure dump, for when WhatsApp shifts underneath us |
| `POST /session/:user/logout` | Unlink |

## The IndexedDB fallback

`client.getChats()` throws a bare `r` from WhatsApp Web's minified internals
whenever its in-memory store isn't hydrated, and recent `whatsapp-web.js` no
longer exposes `window.Store` to work around it.

WhatsApp keeps the same chats on disk in IndexedDB, so `/groups` falls back to
reading that directly. `getAll()` takes no key — which is exactly the argument
whose absence caused the original failure. Group subjects live in a separate
`group-metadata` store from the chat rows and carry the member count as
`size`, not a participants array; `participant` holds the real roster keyed by
`groupId` and is preferred where present.

This reads WhatsApp's private on-disk format, so it can break when they change
it. `/session/:user/debug` dumps the live schema, which is how `size` was found
after guessing at field names failed.

## Sessions are credentials

`.wwebjs_auth/session-<address>/` is a logged-in WhatsApp. Anyone who copies
that folder reads and sends as that person, no QR needed. It is gitignored —
never commit it, never bake it into an image, never copy it between machines.

Hosting this for other people means holding their live WhatsApp sessions. Fine
for a local demo; think hard before doing it for real users.
