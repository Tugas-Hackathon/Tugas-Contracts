import { useState, useEffect, useRef } from "react"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { faWhatsapp } from "@fortawesome/free-brands-svg-icons"
import { faQrcode, faUsers, faRotate, faLinkSlash } from "@fortawesome/free-solid-svg-icons"
import { api } from "../lib/api"
import { Pill } from "../App"

type State = "idle" | "starting" | "qr" | "authenticating" | "ready" | "disconnected" | "failed"

export function WhatsAppPage() {
  const [state, setState] = useState<State>("idle")
  const [qr, setQr] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [groups, setGroups] = useState<any[] | null>(null)
  const poll = useRef<number | null>(null)

  useEffect(() => {
    refresh()
    return stopPolling
  }, [])

  function stopPolling() {
    if (poll.current) { clearInterval(poll.current); poll.current = null }
  }

  async function refresh() {
    try {
      const s = await api.waStatus()
      apply(s)
      if (s.state === "ready") loadGroups()
    } catch (e: any) { setError(e.message) }
  }

  function apply(s: any) {
    setState(s.state)
    setQr(s.qr ?? null)
    if (s.error) setError(s.error)
    if (s.state === "ready" || s.state === "failed") stopPolling()
  }

  async function connect() {
    setError("")
    setGroups(null)
    try {
      await api.waStart()
      setState("starting")
      stopPolling()
      poll.current = window.setInterval(async () => {
        try {
          const s = await api.waStatus()
          apply(s)
          if (s.state === "ready") loadGroups()
        } catch { /* keep polling */ }
      }, 2000)
    } catch (e: any) { setError(e.message); setState("failed") }
  }

  async function loadGroups() {
    try { setGroups(await api.waGroups()) }
    catch (e: any) { setError(e.message) }
  }

  async function disconnect() {
    if (!confirm("Unlink WhatsApp from Tugas?")) return
    try {
      await api.waLogout()
      setState("idle"); setQr(null); setGroups(null); setError("")
    } catch (e: any) { setError(e.message) }
  }

  const label: Record<State, string> = {
    idle: "Not linked",
    starting: "Starting…",
    qr: "Scan to link",
    authenticating: "Linking…",
    ready: "Linked",
    disconnected: "Disconnected",
    failed: "Failed",
  }

  return (
    <div className="max-w-2xl mx-auto px-8 py-10">
      <div className="flex items-center gap-3 mb-1">
        <h2 className="text-xl font-semibold" style={{ color: "var(--text)" }}>WhatsApp</h2>
        <Pill tone={state === "ready" ? "teal" : "dim"}>{label[state]}</Pill>
      </div>
      <p className="text-sm mb-8" style={{ color: "var(--text-dim)" }}>
        Optional. Link WhatsApp so Tugas can read the class groups you choose — you pick which
        group belongs to which subject, and nothing else is ever read.
      </p>

      {state !== "ready" && (
        <div className="rounded-2xl p-8 flex flex-col items-center text-center"
          style={{ background: "var(--surface)", border: "1px solid var(--surface-border)" }}>

          {qr ? (
            <>
              <div className="p-3 rounded-2xl mb-5" style={{ background: "#fff" }}>
                <img src={qr} alt="WhatsApp QR code" width={240} height={240} />
              </div>
              <p className="text-sm mb-1.5" style={{ color: "var(--text)" }}>Scan with your phone</p>
              <p className="text-xs max-w-xs" style={{ color: "var(--text-dim)" }}>
                WhatsApp → Settings → Linked devices → Link a device
              </p>
            </>
          ) : (
            <>
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
                style={{
                  background: "var(--teal-soft)", border: "1px solid var(--teal-border)",
                  color: "var(--teal)",
                }}>
                <FontAwesomeIcon icon={state === "starting" || state === "authenticating" ? faRotate : faWhatsapp}
                  className={`text-2xl ${state === "starting" || state === "authenticating" ? "animate-spin" : ""}`} />
              </div>
              <p className="text-sm mb-6 max-w-sm" style={{ color: "var(--text-dim)" }}>
                {state === "starting" || state === "authenticating"
                  ? "Waiting for WhatsApp…"
                  : "Connect to pull assignment and exam announcements out of your class groups automatically."}
              </p>
              {state !== "starting" && state !== "authenticating" && (
                <button onClick={connect}
                  className="px-5 py-2.5 rounded-xl text-sm font-medium text-white transition-all"
                  style={{ background: "linear-gradient(135deg,#2dd4bf,#0d9488)", boxShadow: "0 0 20px rgba(45,212,191,0.35)" }}>
                  <FontAwesomeIcon icon={faQrcode} className="text-xs mr-2" />
                  Show QR code
                </button>
              )}
            </>
          )}

          {error && <p className="text-xs mt-5" style={{ color: "var(--red)" }}>{error}</p>}
        </div>
      )}

      {state === "ready" && (
        <div>
          <div className="rounded-2xl p-5 mb-5 flex items-center gap-3"
            style={{ background: "var(--teal-soft)", border: "1px solid var(--teal-border)" }}>
            <FontAwesomeIcon icon={faWhatsapp} className="text-xl" style={{ color: "var(--teal)" }} />
            <div className="flex-1">
              <p className="text-sm font-medium" style={{ color: "var(--text)" }}>WhatsApp linked</p>
              <p className="text-xs" style={{ color: "var(--text-dim)" }}>
                Tugas can see your groups. It reads none of them until you map one to a subject.
              </p>
            </div>
            <button onClick={disconnect}
              className="text-xs px-3 py-2 rounded-lg transition-colors"
              style={{ background: "var(--surface)", border: "1px solid var(--surface-border)", color: "var(--text-dim)" }}>
              <FontAwesomeIcon icon={faLinkSlash} className="text-[10px] mr-1.5" />
              Unlink
            </button>
          </div>

          <div className="flex items-center gap-2 mb-3">
            <FontAwesomeIcon icon={faUsers} className="text-xs" style={{ color: "var(--text-faint)" }} />
            <span className="text-[10px] font-mono uppercase tracking-[0.18em]" style={{ color: "var(--text-faint)" }}>
              Your groups
            </span>
            <span className="text-[10px] font-mono" style={{ color: "var(--text-faint)" }}>
              {groups ? `${groups.length} found` : "loading…"}
            </span>
          </div>

          <div className="space-y-2">
            {(groups ?? []).map(g => (
              <div key={g.id} className="flex items-center gap-3 px-4 py-3 rounded-xl"
                style={{ background: "var(--surface)", border: "1px solid var(--surface-border)" }}>
                <span className="flex-1 text-sm truncate" style={{ color: "var(--text)" }}>{g.name}</span>
                <span className="text-[10px] font-mono" style={{ color: "var(--text-faint)" }}>
                  {g.participants} members
                </span>
              </div>
            ))}
            {groups?.length === 0 && (
              <p className="text-sm text-center py-10" style={{ color: "var(--text-faint)" }}>No groups found.</p>
            )}
          </div>

          <p className="text-xs mt-6 px-1" style={{ color: "var(--text-faint)" }}>
            Next: map a group to each subject, and optionally pick whose messages to follow.
          </p>
        </div>
      )}
    </div>
  )
}
