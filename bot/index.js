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
      // getChats builds a full Chat model per conversation and throws from
      // WhatsApp Web's minified internals when that shape drifts. The raw
      // store still holds what we need, so read it directly.
      console.warn("getChats failed (%s) — falling back to Store", e?.message ?? e)
      out = await s.client.pupPage.evaluate(() => {
        const chat = window.Store?.Chat
        if (!chat?.getModelsArray) throw new Error("Store.Chat unavailable")
        return chat.getModelsArray()
          .filter(c => c.id?.server === "g.us" || c.isGroup)
          .map(c => ({
            id: c.id?._serialized ?? String(c.id),
            name: c.formattedTitle || c.name || "(unnamed group)",
            participants: c.groupMetadata?.participants?.length ?? 0,
          }))
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
