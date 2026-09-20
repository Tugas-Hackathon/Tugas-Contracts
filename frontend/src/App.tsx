import { useState, useEffect, useRef } from "react"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import {
  faWandMagicSparkles, faFileLines, faDownload, faTrash,
  faBell, faSliders, faRobot, faPaperclip, faLink,
} from "@fortawesome/free-solid-svg-icons"
import { useAuth } from "./hooks/useAuth"
import { useTheme, vars } from "./contexts/theme"
import { Sidebar } from "./components/Sidebar"
import { ConnectButton } from "./components/ConnectButton"
import { ChatBox } from "./components/ChatBox"
import { BranchPage } from "./pages/BranchPage"
import { WhatsAppPage } from "./pages/WhatsAppPage"
import { api } from "./lib/api"

export type View =
  | { type: "home" }
  | { type: "materials"; subjectId: number }
  | { type: "tutor"; subjectId: number }
  | { type: "branch"; branchId: number; subjectId: number }
  | { type: "whatsapp" }

export default function App() {
  const { authed } = useAuth()
  const { theme } = useTheme()
  const [view, setView] = useState<View>({ type: "home" })
  const [crumb, setCrumb] = useState("Workspace")

  const cssVars = vars[theme] as React.CSSProperties

  if (!authed) {
    return (
      <div style={{ ...cssVars, background: "var(--page-bg)", minHeight: "100vh" }}
        className="relative overflow-hidden flex flex-col items-center justify-center">
        <Glows />
        <div className="relative text-center mb-10">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6"
            style={{
              background: "linear-gradient(135deg,#8b5cf6,#6d28d9)",
              boxShadow: "0 0 50px var(--accent-glow)",
            }}>
            <span className="text-white text-2xl font-bold">T</span>
          </div>
          <h1 className="text-5xl font-bold mb-3 tracking-tight" style={{ color: "var(--text)" }}>Tugas</h1>
          <p className="text-[11px] font-mono uppercase tracking-[0.25em] mb-3" style={{ color: "var(--text-faint)" }}>
            Smart Glass OS
          </p>
          <p className="text-sm" style={{ color: "var(--text-dim)" }}>
            AI-powered study OS · Anchored on BOT Chain
          </p>
        </div>
        <div className="relative"><ConnectButton /></div>
      </div>
    )
  }

  return (
    <div style={{ ...cssVars, background: "var(--page-bg)" }}
      className="relative h-screen overflow-hidden flex gap-3 p-3">
      <Glows />
      <Sidebar view={view} onNavigate={setView} onCrumb={setCrumb} />
      <main className="relative flex-1 flex flex-col rounded-2xl overflow-hidden backdrop-blur-xl"
        style={{ background: "var(--panel)", border: "1px solid var(--panel-border)" }}>
        <TopBar crumb={crumb} />
        <div className="flex-1 overflow-y-auto">
          <MainContent view={view} onNavigate={setView} />
        </div>
        <StatusBar />
      </main>
    </div>
  )
}

function Glows() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div className="absolute rounded-full"
        style={{ width: 520, height: 520, top: -128, left: -128, background: "var(--glow-1)", filter: "blur(110px)" }} />
      <div className="absolute rounded-full"
        style={{ width: 600, height: 600, top: "33%", right: -160, background: "var(--glow-2)", filter: "blur(130px)" }} />
      <div className="absolute rounded-full"
        style={{ width: 550, height: 550, bottom: -180, left: "33%", background: "var(--glow-3)", filter: "blur(120px)" }} />
    </div>
  )
}

function TopBar({ crumb }: { crumb: string }) {
  return (
    <header className="shrink-0 flex items-center gap-4 px-5 h-[68px]"
      style={{ borderBottom: "1px solid var(--panel-border)" }}>
      <div className="flex items-center gap-2 text-[13px] font-mono">
        <span style={{ color: "var(--accent-bright)" }}>Tugas OS</span>
        <span style={{ color: "var(--text-faint)" }}>/</span>
        <span style={{ color: "var(--text)" }}>{crumb}</span>
      </div>

      <div className="flex-1" />

      <div className="flex items-center gap-2">
        <IconBtn icon={faBell} />
        <IconBtn icon={faSliders} active />
      </div>
    </header>
  )
}

function IconBtn({ icon, active = false }: { icon: typeof faBell; active?: boolean }) {
  return (
    <button className="w-9 h-9 rounded-xl flex items-center justify-center transition-colors"
      style={{
        background: active ? "var(--accent-soft)" : "var(--surface)",
        border: `1px solid ${active ? "var(--accent-border)" : "var(--surface-border)"}`,
        color: active ? "var(--accent-bright)" : "var(--text-dim)",
      }}>
      <FontAwesomeIcon icon={icon} className="text-xs" />
    </button>
  )
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-md"
      style={{ background: "var(--surface)", border: "1px solid var(--surface-border)", color: "var(--text-faint)" }}>
      {children}
    </span>
  )
}

export function Pill({ children, tone = "accent" }: { children: React.ReactNode; tone?: "accent" | "teal" | "dim" }) {
  const map = {
    accent: { bg: "var(--accent-soft)", bd: "var(--accent-border)", fg: "var(--accent-bright)" },
    teal:   { bg: "var(--teal-soft)",   bd: "var(--teal-border)",   fg: "var(--teal)" },
    dim:    { bg: "var(--surface)",     bd: "var(--surface-border)", fg: "var(--text-faint)" },
  }[tone]
  return (
    <span className="text-[10px] font-mono px-2 py-0.5 rounded-md whitespace-nowrap"
      style={{ background: map.bg, border: `1px solid ${map.bd}`, color: map.fg }}>
      {children}
    </span>
  )
}

function StatusBar() {
  return (
    <footer className="shrink-0 flex items-center justify-between px-5 h-11 text-[10px] font-mono uppercase tracking-wider"
      style={{ borderTop: "1px solid var(--panel-border)", color: "var(--text-faint)" }}>
      <div className="flex items-center gap-4">
        <span>System: Optical Glassphone v2.4</span>
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--teal)" }} />
          Latency: 18ms
        </span>
      </div>
      <span>Tugas Smart Kernel Online</span>
    </footer>
  )
}

function MainContent({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  if (view.type === "home") return <Home onNavigate={onNavigate} />
  if (view.type === "materials") return <MaterialsView subjectId={view.subjectId} />
  if (view.type === "tutor") return <TutorView subjectId={view.subjectId} />
  if (view.type === "branch") return <BranchPage id={view.branchId} />
  if (view.type === "whatsapp") return <WhatsAppPage />
  return null
}

function Home({ onNavigate }: { onNavigate: (v: View) => void }) {
  const [first, setFirst] = useState<any>(null)

  useEffect(() => { api.subjects().then(s => setFirst(s[0] ?? null)).catch(() => {}) }, [])

  const cards = [
    { icon: faRobot, badge: "Interactive", tone: "accent" as const, title: "AI Tutor Session",
      body: "Deep-dive into your notes with answers cited back to the exact source.",
      go: () => first && onNavigate({ type: "tutor", subjectId: first.id }) },
    { icon: faFileLines, badge: "Milestones", tone: "accent" as const, title: "Assignments",
      body: "Track milestones and anchor each draft as proof of your own work.",
      go: () => {} },
    { icon: faPaperclip, badge: "Syllabus", tone: "teal" as const, title: "Course Materials",
      body: "Lecture notes, slides and readings that ground every tutor answer.",
      go: () => first && onNavigate({ type: "materials", subjectId: first.id }) },
    { icon: faLink, badge: "Synced", tone: "teal" as const, title: "On-Chain Verification",
      body: "Proof-of-work submissions linked to your wallet on BOT Chain.",
      go: () => {} },
  ]

  return (
    <div className="flex flex-col items-center justify-center min-h-full px-6 py-14">
      <div className="w-[72px] h-[72px] rounded-2xl flex items-center justify-center mb-5"
        style={{
          background: "linear-gradient(135deg,rgba(139,92,246,0.45),rgba(109,40,217,0.25))",
          border: "1px solid var(--accent-border)",
          boxShadow: "0 0 60px var(--accent-glow)",
        }}>
        <FontAwesomeIcon icon={faWandMagicSparkles} className="text-2xl" style={{ color: "#fff" }} />
      </div>

      <div className="mb-6">
        <Pill tone="accent">● Workspace Ready</Pill>
      </div>

      <h2 className="text-4xl font-bold mb-3 text-center tracking-tight" style={{ color: "var(--text)" }}>
        What do you want to study today?
      </h2>
      <p className="text-sm text-center max-w-md mb-12" style={{ color: "var(--text-dim)" }}>
        Select a subject module, start an AI Tutor session, or open an assignment to track milestones.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 w-full max-w-2xl">
        {cards.map(c => (
          <button key={c.title} onClick={c.go}
            className="text-left rounded-2xl p-5 transition-all backdrop-blur-sm"
            style={{ background: "var(--surface)", border: "1px solid var(--surface-border)" }}
            onMouseEnter={e => {
              e.currentTarget.style.background = "var(--surface-hover)"
              e.currentTarget.style.borderColor = "var(--accent-border)"
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = "var(--surface)"
              e.currentTarget.style.borderColor = "var(--surface-border)"
            }}>
            <div className="flex items-start justify-between mb-4">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{
                  background: c.tone === "teal" ? "var(--teal-soft)" : "var(--accent-soft)",
                  border: `1px solid ${c.tone === "teal" ? "var(--teal-border)" : "var(--accent-border)"}`,
                  color: c.tone === "teal" ? "var(--teal)" : "var(--accent-bright)",
                }}>
                <FontAwesomeIcon icon={c.icon} className="text-xs" />
              </div>
              <Pill tone={c.tone}>{c.badge}</Pill>
            </div>
            <h3 className="text-[15px] font-semibold mb-1.5" style={{ color: "var(--text)" }}>{c.title}</h3>
            <p className="text-xs leading-relaxed" style={{ color: "var(--text-dim)" }}>{c.body}</p>
          </button>
        ))}
      </div>
    </div>
  )
}

function MaterialsView({ subjectId }: { subjectId: number }) {
  const [materials, setMaterials] = useState<any[]>([])
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { api.materials(subjectId).then(setMaterials) }, [subjectId])

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const m = await api.uploadMaterial(subjectId, file)
      setMaterials(p => [m, ...p])
    } catch (err: any) { alert(err.message) }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = "" }
  }

  async function remove(id: number) {
    if (!confirm("Delete this file?")) return
    try {
      await api.deleteMaterial(id)
      setMaterials(p => p.filter(m => m.id !== id))
    } catch (err: any) { alert(err.message) }
  }

  return (
    <div className="max-w-3xl mx-auto px-8 py-10">
      <div className="flex items-center gap-3 mb-1">
        <h2 className="text-xl font-semibold" style={{ color: "var(--text)" }}>Course Materials</h2>
        <Pill tone="teal">Syllabus</Pill>
      </div>
      <p className="text-sm mb-7" style={{ color: "var(--text-dim)" }}>
        Upload notes, slides, or PDFs. The AI Tutor answers only from these files.
      </p>

      <input type="file" ref={fileRef} onChange={upload} className="hidden"
        accept=".pdf,.pptx,.docx,.txt,.md,.png,.jpg,.jpeg" />
      <button onClick={() => fileRef.current?.click()} disabled={uploading}
        className="mb-7 px-4 py-2.5 rounded-xl text-sm font-medium disabled:opacity-50 transition-colors"
        style={{ background: "var(--accent-soft)", border: "1px solid var(--accent-border)", color: "var(--accent-bright)" }}>
        {uploading ? "Uploading…" : "Upload file"}
      </button>

      <div className="space-y-2.5">
        {materials.map(m => (
          <div key={m.id} className="flex items-center gap-3 px-4 py-3.5 rounded-xl group cursor-pointer transition-colors"
            style={{ background: "var(--surface)", border: "1px solid var(--surface-border)" }}
            onClick={() => api.previewMaterial(m.id)}
            onMouseEnter={e => (e.currentTarget.style.background = "var(--surface-hover)")}
            onMouseLeave={e => (e.currentTarget.style.background = "var(--surface)")}>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: "var(--accent-soft)", border: "1px solid var(--accent-border)", color: "var(--accent-bright)" }}>
              <FontAwesomeIcon icon={faFileLines} className="text-[11px]" />
            </div>
            <span className="flex-1 text-sm truncate" style={{ color: "var(--text)" }}>{m.filename}</span>
            <button title="Download" onClick={e => { e.stopPropagation(); api.downloadMaterial(m.id, m.filename) }}
              className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg"
              style={{ color: "var(--text-dim)" }}>
              <FontAwesomeIcon icon={faDownload} className="text-[11px]" />
            </button>
            <button title="Delete" onClick={e => { e.stopPropagation(); remove(m.id) }}
              className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg"
              style={{ color: "var(--text-dim)" }}
              onMouseEnter={e => (e.currentTarget.style.color = "var(--red)")}
              onMouseLeave={e => (e.currentTarget.style.color = "var(--text-dim)")}>
              <FontAwesomeIcon icon={faTrash} className="text-[11px]" />
            </button>
          </div>
        ))}
        {materials.length === 0 && !uploading && (
          <p className="text-sm text-center py-14" style={{ color: "var(--text-faint)" }}>No files yet.</p>
        )}
      </div>
    </div>
  )
}

function TutorView({ subjectId }: { subjectId: number }) {
  const [materials, setMaterials] = useState<any[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    api.materials(subjectId).then(m => { setMaterials(m); setLoaded(true) })
  }, [subjectId])

  if (!loaded) return null

  return (
    <div className="flex flex-col h-full">
      <div className="px-8 py-5 shrink-0" style={{ borderBottom: "1px solid var(--panel-border)" }}>
        <div className="flex items-center gap-3">
          <h2 className="text-base font-semibold" style={{ color: "var(--text)" }}>AI Tutor</h2>
          <Pill tone="accent">Ready</Pill>
        </div>
        <p className="text-xs mt-1" style={{ color: "var(--text-dim)" }}>
          Grounded in your uploaded materials — every answer cites its source
        </p>
      </div>
      <div className="flex-1 overflow-hidden px-8 py-5">
        {materials.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <p className="text-sm mb-2" style={{ color: "var(--text-dim)" }}>No materials uploaded yet.</p>
            <p className="text-xs" style={{ color: "var(--text-faint)" }}>
              Open Materials in the sidebar to upload your notes first.
            </p>
          </div>
        ) : (
          <ChatBox
            onSend={q => api.ask(subjectId, q)}
            placeholder="Ask anything about your notes…"
            emptyHint="Ask a question — the AI answers from your uploaded materials and cites the source."
          />
        )}
      </div>
    </div>
  )
}
