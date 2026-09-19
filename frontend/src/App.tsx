import { useState, useEffect, useRef } from "react"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { faWandMagicSparkles, faFileLines, faDownload, faTrash } from "@fortawesome/free-solid-svg-icons"
import { useAuth } from "./hooks/useAuth"
import { useTheme, vars } from "./contexts/theme"
import { Sidebar } from "./components/Sidebar"
import { ConnectButton } from "./components/ConnectButton"
import { ChatBox } from "./components/ChatBox"
import { BranchPage } from "./pages/BranchPage"
import { api } from "./lib/api"

export type View =
  | { type: "home" }
  | { type: "materials"; subjectId: number }
  | { type: "tutor"; subjectId: number }
  | { type: "branch"; branchId: number; subjectId: number }

export default function App() {
  const { authed } = useAuth()
  const { theme } = useTheme()
  const [view, setView] = useState<View>({ type: "home" })

  const cssVars = vars[theme] as React.CSSProperties

  if (!authed) {
    return (
      <div style={{ ...cssVars, background: "var(--main-bg)", color: "var(--main-text)", minHeight: "100vh" }}
        className="flex flex-col items-center justify-center">
        <div className="text-center mb-10">
          <div className="w-14 h-14 rounded-2xl bg-indigo-600 flex items-center justify-center mx-auto mb-5">
            <span className="text-white text-2xl font-bold">T</span>
          </div>
          <h1 className="text-4xl font-bold mb-2 tracking-tight" style={{ color: "var(--main-text)" }}>Tugas</h1>
          <p className="text-base" style={{ color: "var(--main-muted)" }}>AI-powered study OS · Anchored on BOT Chain</p>
        </div>
        <ConnectButton />
      </div>
    )
  }

  return (
    <div style={{ ...cssVars, background: "var(--main-bg)", color: "var(--main-text)" }}
      className="flex h-screen overflow-hidden">
      <Sidebar view={view} onNavigate={setView} />
      <main className="flex-1 overflow-y-auto" style={{ background: "var(--main-bg)" }}>
        <MainContent view={view} />
      </main>
    </div>
  )
}

function MainContent({ view }: { view: View }) {
  if (view.type === "home") return <Home />
  if (view.type === "materials") return <MaterialsView subjectId={view.subjectId} />
  if (view.type === "tutor") return <TutorView subjectId={view.subjectId} />
  if (view.type === "branch") return <BranchPage id={view.branchId} />
  return null
}

function Home() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-6">
      <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center mb-4">
        <FontAwesomeIcon icon={faWandMagicSparkles} className="text-xl text-indigo-500" />
      </div>
      <h2 className="text-xl font-semibold mb-2" style={{ color: "var(--main-text)" }}>What do you want to study today?</h2>
      <p className="text-sm max-w-sm" style={{ color: "var(--main-muted)" }}>
        Select a subject from the sidebar, open AI Tutor to ask questions, or open an assignment to track milestones.
      </p>
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
    <div className="max-w-2xl mx-auto px-6 py-10">
      <h2 className="text-lg font-semibold mb-1" style={{ color: "var(--main-text)" }}>Materials</h2>
      <p className="text-sm mb-6" style={{ color: "var(--main-muted)" }}>Upload notes, slides, or PDFs. The AI Tutor answers from these files.</p>
      <input type="file" ref={fileRef} onChange={upload} className="hidden"
        accept=".pdf,.pptx,.docx,.txt,.md,.png,.jpg,.jpeg" />
      <button onClick={() => fileRef.current?.click()} disabled={uploading}
        className="mb-6 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
        style={{ border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--main-text)" }}>
        {uploading ? "Uploading…" : "Upload file"}
      </button>
      <div className="space-y-2">
        {materials.map(m => (
          <div key={m.id} className="flex items-center gap-3 px-4 py-3 rounded-lg group cursor-pointer"
            style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}
            onClick={() => api.previewMaterial(m.id)}>
            <FontAwesomeIcon icon={faFileLines} className="shrink-0" style={{ color: "var(--main-muted)" }} />
            <span className="flex-1 text-sm truncate hover:underline" style={{ color: "var(--main-text)" }}>{m.filename}</span>
            <button title="Download" onClick={e => { e.stopPropagation(); api.downloadMaterial(m.id, m.filename) }}
              className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded"
              style={{ color: "var(--main-muted)" }}
              onMouseEnter={e => (e.currentTarget.style.color = "var(--main-text)")}
              onMouseLeave={e => (e.currentTarget.style.color = "var(--main-muted)")}>
              <FontAwesomeIcon icon={faDownload} className="text-xs" />
            </button>
            <button title="Delete" onClick={e => { e.stopPropagation(); remove(m.id) }}
              className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded"
              style={{ color: "var(--main-muted)" }}
              onMouseEnter={e => (e.currentTarget.style.color = "#f87171")}
              onMouseLeave={e => (e.currentTarget.style.color = "var(--main-muted)")}>
              <FontAwesomeIcon icon={faTrash} className="text-xs" />
            </button>
          </div>
        ))}
        {materials.length === 0 && !uploading && (
          <p className="text-sm text-center py-12" style={{ color: "var(--main-muted)" }}>No files yet.</p>
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
      <div className="px-6 py-4" style={{ borderBottom: "1px solid var(--card-border)" }}>
        <h2 className="text-base font-semibold" style={{ color: "var(--main-text)" }}>AI Tutor</h2>
        <p className="text-xs mt-0.5" style={{ color: "var(--main-muted)" }}>Answers from your uploaded materials</p>
      </div>
      <div className="flex-1 overflow-hidden px-6 py-4">
        {materials.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <p className="text-sm mb-2" style={{ color: "var(--main-muted)" }}>No materials uploaded yet.</p>
            <p className="text-xs" style={{ color: "var(--main-muted)", opacity: 0.6 }}>Go to Materials in the sidebar to upload your notes first.</p>
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
