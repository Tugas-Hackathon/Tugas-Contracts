import { useState, useEffect } from "react"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import {
  faKey, faCheck, faTrash, faUpRightFromSquare, faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons"
import { api } from "../lib/api"
import { Pill } from "../App"

export function SettingsPage() {
  const [state, setState] = useState<any>(null)
  const [key, setKey] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [saved, setSaved] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    try { setState(await api.settings()) }
    catch (e: any) { setError(e.message) }
  }

  async function save() {
    if (!key.trim()) return
    setBusy(true); setError(""); setSaved(false)
    try {
      await api.setOpenrouterKey(key.trim())
      setKey("")
      setSaved(true)
      await load()
    } catch (e: any) { setError(e.message) }
    finally { setBusy(false) }
  }

  async function clear() {
    if (!confirm("Remove your OpenRouter key?")) return
    try {
      await api.clearOpenrouterKey()
      setSaved(false)
      await load()
    } catch (e: any) { setError(e.message) }
  }

  const hasOwn = state?.has_own_key
  const aiWorks = hasOwn || state?.server_key_available

  return (
    <div className="max-w-2xl mx-auto px-8 py-10">
      <h2 className="text-xl font-semibold mb-1" style={{ color: "var(--text)" }}>Settings</h2>
      <p className="text-sm mb-8" style={{ color: "var(--text-dim)" }}>
        Connect your own AI key so the tutor, milestone planner and quiz generator run on your
        account.
      </p>

      {!aiWorks && state && (
        <div className="flex items-start gap-2.5 rounded-xl px-4 py-3 mb-6"
          style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.3)" }}>
          <FontAwesomeIcon icon={faTriangleExclamation} className="text-xs mt-0.5 shrink-0"
            style={{ color: "var(--amber)" }} />
          <span className="text-xs" style={{ color: "var(--amber)" }}>
            No key is set, so every AI feature will fail. Add one below to switch them on.
          </span>
        </div>
      )}

      <div className="rounded-2xl p-6"
        style={{ background: "var(--surface)", border: "1px solid var(--surface-border)" }}>
        <div className="flex items-center gap-2 mb-2">
          <FontAwesomeIcon icon={faKey} className="text-xs" style={{ color: "var(--accent-bright)" }} />
          <h3 className="text-sm font-semibold" style={{ color: "var(--text)" }}>OpenRouter API key</h3>
          {hasOwn
            ? <Pill tone="teal">connected {state.key_hint}</Pill>
            : state?.server_key_available
              ? <Pill tone="dim">using shared key</Pill>
              : <Pill tone="dim">not set</Pill>}
        </div>

        <p className="text-xs mb-5 leading-relaxed" style={{ color: "var(--text-dim)" }}>
          Tugas calls Claude and Gemini through OpenRouter. Your key stays on your own account,
          so you control the spend and see exactly what each request costs.
        </p>

        <div className="flex gap-2">
          <input type="password" value={key} onChange={e => { setKey(e.target.value); setSaved(false) }}
            onKeyDown={e => e.key === "Enter" && save()}
            placeholder="sk-or-v1-…"
            autoComplete="off" spellCheck={false}
            className="flex-1 min-w-0 rounded-xl px-4 py-2.5 text-sm font-mono outline-none"
            style={{ background: "var(--input-bg)", color: "var(--text)", border: "1px solid var(--input-border)" }} />
          <button onClick={save} disabled={busy || !key.trim()}
            className="px-5 rounded-xl text-sm font-medium text-white disabled:opacity-40 shrink-0 transition-all"
            style={{ background: "linear-gradient(135deg,#8b5cf6,#6d28d9)", boxShadow: "0 0 16px var(--accent-glow)" }}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>

        {saved && (
          <p className="flex items-center gap-1.5 text-xs mt-3" style={{ color: "var(--teal)" }}>
            <FontAwesomeIcon icon={faCheck} className="text-[10px]" />
            Saved. AI features now run on your key.
          </p>
        )}
        {error && <p className="text-xs mt-3" style={{ color: "var(--red)" }}>{error}</p>}

        <div className="flex items-center gap-4 mt-5 pt-4" style={{ borderTop: "1px solid var(--surface-border)" }}>
          <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer"
            className="text-xs hover:underline flex items-center gap-1.5"
            style={{ color: "var(--accent-bright)" }}>
            Get a key from OpenRouter
            <FontAwesomeIcon icon={faUpRightFromSquare} className="text-[9px]" />
          </a>
          {hasOwn && (
            <button onClick={clear} className="text-xs hover:underline flex items-center gap-1.5 ml-auto"
              style={{ color: "var(--text-faint)" }}
              onMouseEnter={e => (e.currentTarget.style.color = "var(--red)")}
              onMouseLeave={e => (e.currentTarget.style.color = "var(--text-faint)")}>
              <FontAwesomeIcon icon={faTrash} className="text-[9px]" />
              Remove key
            </button>
          )}
        </div>
      </div>

      <p className="text-xs mt-5 px-1 leading-relaxed" style={{ color: "var(--text-faint)" }}>
        Your key is stored against your wallet address and sent only to OpenRouter. It is never
        shown again after saving — only the last four characters, so you can tell which key is
        connected.
      </p>

    </div>
  )
}
