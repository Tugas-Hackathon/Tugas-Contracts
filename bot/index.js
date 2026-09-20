import express from "express"
import qrcode from "qrcode"
import pkg from "whatsapp-web.js"

const { Client, LocalAuth } = pkg

const PORT = Number(process.env.BOT_PORT ?? 8787)
const TOKEN = process.env.BOT_TOKEN ?? ""

if (!TOKEN) {
  console.error("BOT_TOKEN is not set. Refusing to start — an unauthenticated bot exposes every linked WhatsApp account.")
  process.exit(1)
}

/** user address -> { client, state, qr, error } */
const sessions = new Map()

function session(user) {
  let s = sessions.get(user)
  if (!s) {
    s = { client: null, state: "idle", qr: null, error: null }
    sessions.set(user, s)
  }
  return s
}

function start(user) {
  const s = session(user)
  if (s.client) return s

  const client = new Client({
    authStrategy: new LocalAuth({ clientId: user, dataPath: "./.wwebjs_auth" }),
    puppeteer: { args: ["--no-sandbox", "--disable-setuid-sandbox"] },
  })

  s.client = client
  s.state = "starting"
  s.qr = null
  s.error = null

  client.on("qr", async qr => {
    s.state = "qr"
    s.qr = await qrcode.toDataURL(qr, { margin: 1, width: 280 })
  })

  client.on("authenticated", () => { s.state = "authenticating"; s.qr = null })
  client.on("ready", () => { s.state = "ready"; s.qr = null })

  client.on("auth_failure", msg => { s.state = "failed"; s.error = String(msg) })

  client.on("disconnected", reason => {
    s.state = "disconnected"
    s.error = String(reason)
    s.qr = null
    s.client = null
  })

  client.initialize().catch(e => {
    s.state = "failed"
    s.error = e?.message ?? String(e)
    s.client = null
  })

  return s
}

const app = express()
app.use(express.json())

// Only the backend may drive this service.
app.use((req, res, next) => {
  if (req.get("x-bot-token") !== TOKEN) return res.status(401).json({ error: "unauthorized" })
  next()
})

app.get("/health", (_req, res) => res.json({ ok: true, sessions: sessions.size }))

app.post("/session/:user/start", (req, res) => {
  const s = start(req.params.user)
  res.json({ state: s.state })
})

app.get("/session/:user/status", (req, res) => {
  const s = session(req.params.user)
  res.json({ state: s.state, qr: s.qr, error: s.error })
})

app.get("/session/:user/groups", async (req, res) => {
  const s = session(req.params.user)
  if (s.state !== "ready") return res.status(409).json({ error: "not linked", state: s.state })
  try {
    let out
    try {
      const chats = await s.client.getChats()
      out = chats.filter(c => c.isGroup).map(c => ({
        id: c.id?._serialized ?? String(c.id),
        name: c.name ?? "(unnamed group)",
        participants: c.participants?.length ?? 0,
      }))
    } catch (e) {
      // getChats builds a Chat model per conversation and dies on an
      // IndexedDB lookup when the in-memory store is not hydrated. WhatsApp
      // keeps the same chats on disk in IndexedDB, so read that instead —
      // getAll() needs no key and does not depend on the library's internals.
      console.warn("getChats failed (%s) — reading IndexedDB", e?.message ?? e)
      out = await s.client.pupPage.evaluate(async () => {
        const open = name => new Promise((res, rej) => {
          const r = indexedDB.open(name)
          r.onsuccess = () => res(r.result)
          r.onerror = () => rej(r.error)
        })
        const readAll = (db, store) => new Promise((res, rej) => {
          const rq = db.transaction(store, "readonly").objectStore(store).getAll()
          rq.onsuccess = () => res(rq.result)
          rq.onerror = () => rej(rq.error)
        })

        const dbs = await indexedDB.databases()
        const found = []
        const meta = new Map()   // chat id -> { subject, participants }

        for (const { name } of dbs) {
          if (!name) continue
          let db
          try { db = await open(name) } catch { continue }
          const stores = [...db.objectStoreNames]

          // Group subjects live apart from the chat rows, so collect them first.
          for (const s of stores.filter(n => /group.*metadata|metadata.*group/i.test(n))) {
            let rows = []
            try { rows = await readAll(db, s) } catch { continue }
            for (const g of rows) {
              const id = typeof g?.id === "string" ? g.id : g?.id?._serialized
              if (typeof id === "string") {
                meta.set(id, { subject: g.subject, participants: g.participants?.length ?? 0 })
              }
            }
          }

          const chatStore = stores.find(n => n.toLowerCase() === "chat")
          if (chatStore) {
            let rows = []
            try { rows = await readAll(db, chatStore) } catch { /* unreadable */ }
            for (const c of rows) {
              const id = typeof c?.id === "string" ? c.id : c?.id?._serialized
              if (typeof id !== "string" || !id.endsWith("@g.us")) continue
              const m = meta.get(id)
              found.push({
                id,
                name: c.name || c.subject || m?.subject || null,
                participants: m?.participants ?? 0,
              })
            }
          }
          db.close()
        }

        if (!found.length) throw new Error("no groups found in IndexedDB — history may still be syncing")

        // Backfill names discovered in a later database, drop duplicates,
        // and float named groups up so the list is usable.
        const byId = new Map()
        for (const g of found) {
          const prev = byId.get(g.id)
          if (!prev || (!prev.name && g.name)) byId.set(g.id, g)
        }
        return [...byId.values()]
          .map(g => ({ ...g, name: g.name || meta.get(g.id)?.subject || `Group ${g.id.slice(0, 8)}` }))
          .sort((a, b) => a.name.localeCompare(b.name))
      })
    }
    console.log(`groups: ${out.length}`)
    res.json(out)
  } catch (e) {
    console.error("groups failed:", e?.stack ?? e)
    res.status(502).json({ error: e?.message ? `groups: ${e.message}` : String(e) })
  }
})

app.get("/session/:user/senders", async (req, res) => {
  const s = session(req.params.user)
  const chatId = req.query.chat_id
  if (s.state !== "ready") return res.status(409).json({ error: "not linked", state: s.state })
  if (!chatId) return res.status(422).json({ error: "chat_id required" })
  try {
    const chat = await s.client.getChatById(String(chatId))
    const msgs = await chat.fetchMessages({ limit: 150 })
    const seen = new Map()
    for (const m of msgs) {
      const id = m.author ?? m.from
      if (!id || seen.has(id)) continue
      const contact = await m.getContact()
      seen.set(id, contact.pushname || contact.name || id.split("@")[0])
    }
    res.json([...seen].map(([id, name]) => ({ id, name })))
  } catch (e) {
    res.status(502).json({ error: e?.message ?? String(e) })
  }
})

app.get("/session/:user/messages", async (req, res) => {
  const s = session(req.params.user)
  const chatId = req.query.chat_id
  const limit = Math.min(Number(req.query.limit ?? 100), 300)
  if (s.state !== "ready") return res.status(409).json({ error: "not linked", state: s.state })
  if (!chatId) return res.status(422).json({ error: "chat_id required" })
  try {
    const chat = await s.client.getChatById(String(chatId))
    const msgs = await chat.fetchMessages({ limit })
    const out = []
    for (const m of msgs) {
      if (!m.body) continue
      const senderId = m.author ?? m.from
      let senderName = senderId
      try {
        const c = await m.getContact()
        senderName = c.pushname || c.name || String(senderId).split("@")[0]
      } catch { /* contact unavailable */ }
      out.push({
        id: m.id._serialized,
        body: m.body,
        sender_id: senderId,
        sender_name: senderName,
        timestamp: m.timestamp,
        from_me: m.fromMe,
      })
    }
    res.json(out)
  } catch (e) {
    res.status(502).json({ error: e?.message ?? String(e) })
  }
})

app.get("/session/:user/debug", async (req, res) => {
  const s = session(req.params.user)
  if (s.state !== "ready") return res.status(409).json({ error: "not linked", state: s.state })
  try {
    const frames = []
    for (const f of s.client.pupPage.frames()) {
      let probe
      try {
        probe = await f.evaluate(async () => {
          const out = {
            hasStore: typeof window.Store !== "undefined",
            hasWWebJS: typeof window.WWebJS !== "undefined",
          }
          try {
            const chats = await window.WWebJS.getChats()
            out.wwebjsGetChats = `ok, ${chats.length} chats`
          } catch (e) {
            out.wwebjsGetChats = `THREW: ${e?.message ?? e}`
          }
          try {
            const raw = window.Store?.Chat?.getModelsArray?.()
            out.rawModels = raw ? `${raw.length} models` : "Store.Chat missing"
          } catch (e) {
            out.rawModels = `THREW: ${e?.message ?? e}`
          }
          return out
        })
      } catch (e) {
        probe = { evalError: e?.message ?? String(e) }
      }
      frames.push({ url: f.url().slice(0, 80), name: f.name(), ...probe })
    }
    res.json({ frameCount: frames.length, frames })
  } catch (e) {
    res.status(502).json({ error: e?.message ?? String(e) })
  }
})

app.post("/session/:user/logout", async (req, res) => {
  const s = session(req.params.user)
  try {
    if (s.client) await s.client.logout()
  } catch { /* already gone */ }
  sessions.delete(req.params.user)
  res.status(204).end()
})

app.listen(PORT, "127.0.0.1", () => {
  console.log(`tugas-bot on http://127.0.0.1:${PORT} (localhost only)`)
})
