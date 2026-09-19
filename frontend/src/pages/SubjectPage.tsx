import { useState, useEffect, useRef } from "react"
import { api } from "../lib/api"
import { BranchPage } from "./BranchPage"
import { ChatBox } from "../components/ChatBox"

export function SubjectPage({ id, onBack }: { id: number; onBack: () => void }) {
  const [subject, setSubject] = useState<any>(null)
  const [branches, setBranches] = useState<any[]>([])
  const [materials, setMaterials] = useState<any[]>([])
  const [selectedBranch, setSelectedBranch] = useState<number | null>(null)
  const [branchTitle, setBranchTitle] = useState("")
  const [uploading, setUploading] = useState(false)
  const [tab, setTab] = useState<"materials" | "chat" | "branches">("materials")
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    api.subject(id).then(setSubject)
    api.branches(id).then(setBranches)
    api.materials(id).then(setMaterials)
  }, [id])

  async function uploadFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const m = await api.uploadMaterial(id, file)
      setMaterials(p => [m, ...p])
    } catch (err: any) {
      alert(err.message)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  async function createBranch() {
    if (!branchTitle.trim()) return
    const b = await api.createBranch(id, { kind: "assignment", title: branchTitle.trim() })
    setBranches(p => [b, ...p])
    setBranchTitle("")
  }

  if (selectedBranch)
    return <BranchPage id={selectedBranch} onBack={() => setSelectedBranch(null)} />

  const tabs = [
    { key: "materials", label: "Materials" },
    { key: "chat", label: "AI Tutor" },
    { key: "branches", label: `Branches (${branches.length})` },
  ] as const

  return (
    <div>
      <button onClick={onBack} className="text-sm text-indigo-600 mb-4 hover:underline">← Back</button>
      <h2 className="text-xl font-semibold mb-4">{subject?.name ?? "…"}</h2>

      {/* tab bar */}
      <div className="flex gap-1 border-b border-gray-200 mb-6">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              tab === t.key
                ? "bg-white border border-b-white border-gray-200 text-indigo-600 -mb-px"
                : "text-gray-500 hover:text-gray-700"
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Materials tab */}
      {tab === "materials" && (
        <div>
          <div className="flex gap-2 mb-4">
            <input type="file" ref={fileRef} onChange={uploadFile} className="hidden"
              accept=".pdf,.pptx,.docx,.txt,.md,.png,.jpg,.jpeg" />
            <button onClick={() => fileRef.current?.click()} disabled={uploading}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50">
              {uploading ? "Uploading…" : "Upload file"}
            </button>
          </div>
          <div className="space-y-1">
            {materials.map(m => (
              <div key={m.id} className="flex items-center gap-2 text-sm text-gray-700 bg-white border border-gray-100 px-3 py-2 rounded">
                <span className="text-gray-400">📄</span>
                <span>{m.filename}</span>
              </div>
            ))}
            {materials.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-8">No materials yet. Upload notes, slides, or PDFs above.</p>
            )}
          </div>
        </div>
      )}

      {/* AI Tutor chat tab */}
      {tab === "chat" && (
        <div>
          {materials.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <p className="text-sm">Upload materials first, then the AI tutor can answer questions from them.</p>
              <button onClick={() => setTab("materials")}
                className="mt-3 text-sm text-indigo-600 hover:underline">
                Go to Materials →
              </button>
            </div>
          ) : (
            <ChatBox
              onSend={q => api.ask(id, q)}
              placeholder="Ask about your notes or slides…"
              emptyHint="Ask anything — the AI answers from your uploaded materials and cites the source."
            />
          )}
        </div>
      )}

      {/* Branches tab */}
      {tab === "branches" && (
        <div>
          <div className="flex gap-2 mb-4">
            <input value={branchTitle} onChange={e => setBranchTitle(e.target.value)}
              placeholder="New branch title…"
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
              onKeyDown={e => e.key === "Enter" && createBranch()} />
            <button onClick={createBranch}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
              Add
            </button>
          </div>
          <div className="space-y-2">
            {branches.map(b => (
              <button key={b.id} onClick={() => setSelectedBranch(b.id)}
                className="w-full text-left p-4 bg-white border border-gray-200 rounded-lg hover:border-indigo-300 transition-colors">
                <div className="font-medium text-gray-900">{b.title}</div>
                <div className="text-xs text-gray-400 mt-0.5 capitalize">{b.kind}</div>
              </button>
            ))}
            {branches.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-8">No branches yet. Add one above.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
