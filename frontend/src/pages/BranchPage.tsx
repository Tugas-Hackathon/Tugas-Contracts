import { useState, useEffect } from "react"
import { api } from "../lib/api"
import { MilestoneCard } from "../components/MilestoneCard"
import { ChatBox } from "../components/ChatBox"

export function BranchPage({ id }: { id: number; onBack?: () => void }) {
  const [branch, setBranch] = useState<any>(null)
  const [milestones, setMilestones] = useState<any[]>([])
  const [tab, setTab] = useState<"milestones" | "outline" | "chat">("milestones")
  const [milestoneTitle, setMilestoneTitle] = useState("")
  const [outline, setOutline] = useState<any>(null)
  const [brief, setBrief] = useState("")
  const [loadingOutline, setLoadingOutline] = useState(false)

  useEffect(() => {
    api.branch(id).then(setBranch)
    api.milestones(id).then(setMilestones)
  }, [id])

  async function addMilestone() {
    if (!milestoneTitle.trim()) return
    const m = await api.createMilestone(id, milestoneTitle.trim())
    setMilestones(p => [...p, m])
    setMilestoneTitle("")
  }

  async function generateOutline() {
    if (!brief.trim()) return
    setLoadingOutline(true)
    try {
      const res = await api.outline(id, brief.trim())
      setOutline(res)
    } catch (e: any) {
      alert(e.message)
    } finally {
      setLoadingOutline(false)
    }
  }

  const tabs = [
    { key: "milestones", label: "Milestones" },
    { key: "outline", label: "AI Outline" },
    { key: "chat", label: "Discussion" },
  ] as const

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <h2 className="text-xl font-semibold mb-1" style={{ color: "var(--main-text)" }}>{branch?.title ?? "…"}</h2>
      <p className="text-xs mb-4 capitalize" style={{ color: "var(--main-muted)" }}>{branch?.kind}</p>

      {/* tab bar */}
      <div className="flex gap-1 mb-6" style={{ borderBottom: "1px solid var(--card-border)" }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className="px-4 py-2 text-sm font-medium rounded-t-lg transition-colors -mb-px"
            style={tab === t.key
              ? { color: "#6366f1", borderBottom: "2px solid #6366f1", background: "transparent" }
              : { color: "var(--main-muted)", background: "transparent" }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Milestones tab */}
      {tab === "milestones" && (
        <div>
          <div className="flex gap-2 mb-4">
            <input value={milestoneTitle} onChange={e => setMilestoneTitle(e.target.value)}
              placeholder="New milestone…"
              className="flex-1 rounded-lg px-3 py-2 text-sm outline-none"
              style={{ background: "var(--input-bg)", color: "var(--main-text)", border: "1px solid var(--input-border)" }}
              onKeyDown={e => e.key === "Enter" && addMilestone()} />
            <button onClick={addMilestone}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
              Add
            </button>
          </div>
          <div className="space-y-3">
            {milestones.map(m => (
              <MilestoneCard key={m.id} milestone={m} />
            ))}
            {milestones.length === 0 && (
              <p className="text-sm text-center py-8" style={{ color: "var(--main-muted)" }}>No milestones yet.</p>
            )}
          </div>
        </div>
      )}

      {/* AI Outline tab */}
      {tab === "outline" && (
        <div>
          <div className="mb-4">
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--main-muted)" }}>Assignment brief</label>
            <textarea value={brief} onChange={e => setBrief(e.target.value)}
              rows={3} placeholder="Paste your assignment instructions here…"
              className="w-full rounded-lg px-3 py-2 text-sm resize-none outline-none"
              style={{ background: "var(--input-bg)", color: "var(--main-text)", border: "1px solid var(--input-border)" }} />
            <button onClick={generateOutline} disabled={loadingOutline || !brief.trim()}
              className="mt-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-40">
              {loadingOutline ? "Generating…" : "Generate outline"}
            </button>
          </div>
          {outline && (
            <div className="rounded-xl p-4" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}>
              <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--main-text)" }}>Suggested outline</h3>
              <ol className="space-y-3">
                {outline.sections?.map((s: any, i: number) => (
                  <li key={i}>
                    <div className="font-medium text-sm" style={{ color: "var(--main-text)" }}>{i + 1}. {s.title}</div>
                    <ul className="mt-1 ml-4 space-y-0.5">
                      {s.points?.map((p: string, j: number) => (
                        <li key={j} className="text-xs list-disc" style={{ color: "var(--main-muted)" }}>{p}</li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}

      {/* Discussion chat tab */}
      {tab === "chat" && (
        <ChatBox
          onSend={async (question) => {
            const res = await api.rubricCheck(id, question)
            const criteria = res.criteria ?? []
            const answer = criteria.map((c: any) =>
              `**${c.name}**: ${c.met ? "✓" : "✗"} ${c.evidence}${c.suggestion ? " — " + c.suggestion : ""}`
            ).join("\n\n") || "No feedback generated."
            return { answer, citations: [] }
          }}
          placeholder="Paste a draft or ask for feedback on your work…"
          emptyHint="Describe your draft or paste a section — the AI will check it against the rubric."
        />
      )}
    </div>
  )
}
