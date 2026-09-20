import { useState, useEffect, useRef } from "react"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { faWhatsapp } from "@fortawesome/free-brands-svg-icons"
import {
  faQrcode, faUsers, faRotate, faLinkSlash, faUser, faXmark, faTriangleExclamation, faDownload,
} from "@fortawesome/free-solid-svg-icons"
import { api } from "../lib/api"
import { Pill } from "../App"

type State = "idle" | "starting" | "qr" | "authenticating" | "ready" | "disconnected" | "failed"
type Link = {
  subject_id: number
  chat_id: string
  chat_name: string
  focus_sender: string | null
  focus_sender_name: string | null
}

export function WhatsAppPage() {
  const [state, setState] = useState<State>("idle")
  const [qr, setQr] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [groups, setGroups] = useState<any[] | null>(null)
  const [subjects, setSubjects] = useState<any[]>([])
  const [links, setLinks] = useState<Link[]>([])
  const [syncing, setSyncing] = useState(false)
  const [report, setReport] = useState<any[] | null>(null)
  const poll = useRef<number | null>(null)

  async function runSync() {
    setSyncing(true); setError(""); setReport(null)
    try {
      const res = await api.waSync()
      setReport(res.synced)
    } catch (e: any) { setError(e.message) }
    finally { setSyncing(false) }
  }

  useEffect(() => {
    refresh()
    api.subjects().then(setSubjects).catch(() => {})
    api.waLinks().then(setLinks).catch(() => {})
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
    setError(""); setGroups(null)
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
    setError("")
    try { setGroups(await api.waGroups()) }
    catch (e: any) { setError(e.message); setGroups([]) }
  }

  async function disconnect() {
    if (!confirm("Unlink WhatsApp from Tugas?")) return
    try {
      await api.waLogout()
      setState("idle"); setQr(null); setGroups(null); setError("")
    } catch (e: any) { setError(e.message) }
  }

  async function mapGroup(subjectId: number, group: any | null) {
    try {
      if (!group) {
        await api.waClearLink(subjectId)
        setLinks(p => p.filter(l => l.subject_id !== subjectId))
        return
      }
      const saved = await api.waSetLink(subjectId, { chat_id: group.id, chat_name: group.name })
      setLinks(p => [...p.filter(l => l.subject_id !== subjectId), saved])
    } catch (e: any) { setError(e.message) }
  }

  async function setFocus(subjectId: number, sender: { id: string; name: string } | null) {
    const link = links.find(l => l.subject_id === subjectId)
    if (!link) return
    try {
      const saved = await api.waSetLink(subjectId, {
        chat_id: link.chat_id,
        chat_name: link.chat_name,
        focus_sender: sender?.id ?? null,
        focus_sender_name: sender?.name ?? null,
      })
      setLinks(p => [...p.filter(l => l.subject_id !== subjectId), saved])
    } catch (e: any) { setError(e.message) }
  }

  const label: Record<State, string> = {
    idle: "Not linked", starting: "Starting…", qr: "Scan to link",
    authenticating: "Linking…", ready: "Linked",
    disconnected: "Disconnected", failed: "Failed",
  }

  return (
    <div className="max-w-2xl mx-auto px-8 py-10">
      <div className="flex items-center gap-3 mb-1">
        <h2 className="text-xl font-semibold" style={{ color: "var(--text)" }}>WhatsApp</h2>
        <Pill tone={state === "ready" ? "teal" : "dim"}>{label[state]}</Pill>
      </div>
      <p className="text-sm mb-8" style={{ color: "var(--text-dim)" }}>
        Optional. Link WhatsApp so Tugas can read the class groups you choose — you pick which group
        belongs to which subject, and nothing else is ever read.
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
                style={{ background: "var(--teal-soft)", border: "1px solid var(--teal-border)", color: "var(--teal)" }}>
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
          {error && <ErrorNote text={error} />}
        </div>
      )}

      {state === "ready" && (
        <div>
          <div className="rounded-2xl p-5 mb-6 flex items-center gap-3"
            style={{ background: "var(--teal-soft)", border: "1px solid var(--teal-border)" }}>
            <FontAwesomeIcon icon={faWhatsapp} className="text-xl" style={{ color: "var(--teal)" }} />
            <div className="flex-1">
              <p className="text-sm font-medium" style={{ color: "var(--text)" }}>WhatsApp linked</p>
              <p className="text-xs" style={{ color: "var(--text-dim)" }}>
                {links.length === 0
                  ? "No groups mapped yet — nothing is being read."
                  : `Reading ${links.length} mapped group${links.length === 1 ? "" : "s"}.`}
              </p>
            </div>
            <button onClick={disconnect} className="text-xs px-3 py-2 rounded-lg"
              style={{ background: "var(--surface)", border: "1px solid var(--surface-border)", color: "var(--text-dim)" }}>
              <FontAwesomeIcon icon={faLinkSlash} className="text-[10px] mr-1.5" />
              Unlink
            </button>
          </div>

          {error && <ErrorNote text={error} />}

          {/* Mapping: one row per subject */}
          <div className="flex items-center gap-2 mb-3">
            <FontAwesomeIcon icon={faUsers} className="text-xs" style={{ color: "var(--text-faint)" }} />
            <span className="text-[10px] font-mono uppercase tracking-[0.18em]" style={{ color: "var(--text-faint)" }}>
              Which group for each subject
            </span>
          </div>

          {subjects.length === 0 && (
            <p className="text-sm py-8 text-center" style={{ color: "var(--text-faint)" }}>
              Create a subject first, then map a group to it.
            </p>
          )}

          <div className="space-y-2.5">
            {subjects.map(s => (
              <SubjectRow key={s.id}
                subject={s}
                groups={groups}
                link={links.find(l => l.subject_id === s.id) ?? null}
                onMap={g => mapGroup(s.id, g)}
                onFocus={sender => setFocus(s.id, sender)} />
            ))}
          </div>

          {links.length > 0 && (
            <div className="mt-6 pt-6" style={{ borderTop: "1px solid var(--surface-border)" }}>
              <div className="flex items-center gap-3 mb-3">
                <button onClick={runSync} disabled={syncing}
                  className="px-4 py-2.5 rounded-xl text-sm font-medium text-white disabled:opacity-50 transition-all"
                  style={{ background: "linear-gradient(135deg,#8b5cf6,#6d28d9)", boxShadow: "0 0 18px var(--accent-glow)" }}>
                  <FontAwesomeIcon icon={syncing ? faRotate : faDownload}
                    className={`text-xs mr-2 ${syncing ? "animate-spin" : ""}`} />
                  {syncing ? "Reading messages…" : "Extract now"}
                </button>
                <span className="text-xs" style={{ color: "var(--text-faint)" }}>
                  Reads the last 150 messages of each mapped group
                </span>
              </div>

              {report && (
                <div className="space-y-2.5 mt-4">
                  {report.map((r: any) => (
                    <div key={r.subject_id} className="rounded-xl px-4 py-3.5"
                      style={{ background: "var(--surface)", border: "1px solid var(--surface-border)" }}>
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-sm font-medium" style={{ color: "var(--text)" }}>{r.subject}</span>
                        <Pill tone={r.kept > 0 ? "teal" : "dim"}>
                          {r.new === 0 ? "nothing new" : `${r.kept} of ${r.new} kept`}
                        </Pill>
                      </div>
                      {r.items.length === 0 ? (
                        <p className="text-xs" style={{ color: "var(--text-faint)" }}>
                          {r.new === 0 ? "No new messages since last extract." : "All new messages were chatter."}
                        </p>
                      ) : (
                        <ul className="space-y-1 mt-2">
                          {r.items.map((it: any, i: number) => (
                            <li key={i} className="flex items-start gap-2 text-xs">
                              <Pill tone={it.kind === "exam" ? "accent" : it.kind === "assignment" ? "teal" : "dim"}>
                                {it.kind}
                              </Pill>
                              <span className="flex-1" style={{ color: "var(--text-dim)" }}>
                                {it.title}
                                {it.created && <span style={{ color: "var(--teal)" }}> · created</span>}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <p className="text-xs mt-6 px-1 leading-relaxed" style={{ color: "var(--text-faint)" }}>
            Only mapped groups are read. Setting a focus person narrows it further to just that
            person's messages — useful when only the lecturer's announcements matter.
            Assignments and exams found here become branches; everything kept also feeds the AI Tutor.
          </p>
        </div>
      )}
    </div>
  )
}

function ErrorNote({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 rounded-xl px-3 py-2.5 my-4"
      style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.3)" }}>
      <FontAwesomeIcon icon={faTriangleExclamation} className="text-[11px] mt-0.5 shrink-0" style={{ color: "var(--red)" }} />
      <span className="text-xs" style={{ color: "var(--red)" }}>{text}</span>
    </div>
  )
}

function SubjectRow({ subject, groups, link, onMap, onFocus }: {
  subject: any
  groups: any[] | null
  link: Link | null
  onMap: (g: any | null) => void
  onFocus: (s: { id: string; name: string } | null) => void
}) {
  const [senders, setSenders] = useState<any[] | null>(null)
  const [pickingFocus, setPickingFocus] = useState(false)
  const [loadingSenders, setLoadingSenders] = useState(false)
  const [senderError, setSenderError] = useState("")

  async function openFocus() {
    setPickingFocus(true)
    if (senders || !link) return
    setLoadingSenders(true)
    setSenderError("")
    try { setSenders(await api.waSenders(link.chat_id)) }
    catch (e: any) { setSenderError(e.message) }
    finally { setLoadingSenders(false) }
  }

  return (
    <div className="rounded-xl px-4 py-3.5"
      style={{
        background: "var(--surface)",
        border: `1px solid ${link ? "var(--teal-border)" : "var(--surface-border)"}`,
      }}>
      <div className="flex items-center gap-3">
        <span className="flex-1 text-sm font-medium truncate" style={{ color: "var(--text)" }}>
          {subject.name}
        </span>

        <select
          value={link?.chat_id ?? ""}
          onChange={e => {
            const g = (groups ?? []).find(x => x.id === e.target.value)
            onMap(g ?? null)
          }}
          disabled={!groups}
          className="text-xs rounded-lg px-2.5 py-1.5 outline-none max-w-[190px]"
          style={{ background: "var(--input-bg)", color: "var(--text)", border: "1px solid var(--input-border)" }}>
          <option value="">{groups ? "Not linked" : "Loading groups…"}</option>
          {(groups ?? []).map(g => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>
      </div>

      {link && (
        <div className="mt-2.5 pt-2.5 flex items-center gap-2 flex-wrap"
          style={{ borderTop: "1px solid var(--surface-border)" }}>
          <FontAwesomeIcon icon={faUser} className="text-[9px]" style={{ color: "var(--text-faint)" }} />
          <span className="text-[10px] font-mono uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
            Focus
          </span>

          {link.focus_sender ? (
            <span className="flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-md"
              style={{ background: "var(--accent-soft)", border: "1px solid var(--accent-border)", color: "var(--accent-bright)" }}>
              {link.focus_sender_name}
              <button onClick={() => onFocus(null)} title="Clear focus">
                <FontAwesomeIcon icon={faXmark} className="text-[9px]" />
              </button>
            </span>
          ) : pickingFocus ? (
            loadingSenders ? (
              <span className="text-[11px]" style={{ color: "var(--text-faint)" }}>Reading recent senders…</span>
            ) : senderError ? (
              <span className="text-[11px]" style={{ color: "var(--red)" }}>{senderError}</span>
            ) : (
              <select autoFocus defaultValue=""
                onChange={e => {
                  const s = (senders ?? []).find(x => x.id === e.target.value)
                  if (s) onFocus(s)
                  setPickingFocus(false)
                }}
                className="text-[11px] rounded-lg px-2 py-1 outline-none"
                style={{ background: "var(--input-bg)", color: "var(--text)", border: "1px solid var(--input-border)" }}>
                <option value="">Pick a person…</option>
                {(senders ?? []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )
          ) : (
            <button onClick={openFocus} className="text-[11px] hover:underline" style={{ color: "var(--text-dim)" }}>
              Everyone — narrow to one person
            </button>
          )}
        </div>
      )}
    </div>
  )
}
