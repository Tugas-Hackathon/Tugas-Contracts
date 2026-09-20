import { useState, useEffect } from "react"
import { api } from "../lib/api"
import { MilestoneCard } from "../components/MilestoneCard"
import { ChatBox } from "../components/ChatBox"
import { Pill } from "../App"

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
      setOutline(await api.outline(id, brief.trim()))
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
    <div className="max-w-3xl mx-auto px-8 py-9">
      <div className="flex items-center gap-3 mb-1">
        <h2 className="text-xl font-semibold" style={{ color: "var(--text)" }}>{branch?.title ?? "…"}</h2>
        {branch?.kind && <Pill tone="accent">{branch.kind}</Pill>}
      </div>
      <p className="text-xs font-mono mb-6" style={{ color: "var(--text-faint)" }}>
        {milestones.length} milestone{milestones.length === 1 ? "" : "s"} · {milestones.filter(m => m.tx_hash).length} anchored
      </p>

      {/* Glass tab bar */}
      <div className="inline-flex gap-1 p-1 rounded-xl mb-7"
        style={{ background: "var(--surface)", border: "1px solid var(--surface-border)" }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className="px-4 py-2 text-xs font-medium rounded-lg transition-all"
            style={tab === t.key
              ? {
                  background: "var(--accent-soft)", color: "var(--accent-bright)",
                  border: "1px solid var(--accent-border)", boxShadow: "0 0 14px var(--accent-soft)",
                }
              : { color: "var(--text-dim)", border: "1px solid transparent" }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "milestones" && (
        <div>
          <div className="flex gap-2 mb-5">
            <input value={milestoneTitle} onChange={e => setMilestoneTitle(e.target.value)}
              placeholder="New milestone…"
              className="flex-1 rounded-xl px-4 py-2.5 text-sm outline-none"
              style={{ background: "var(--input-bg)", color: "var(--text)", border: "1px solid var(--input-border)" }}
              onKeyDown={e => e.key === "Enter" && addMilestone()} />
            <button onClick={addMilestone}
              className="px-5 rounded-xl text-sm font-medium text-white transition-all"
              style={{ background: "linear-gradient(135deg,#8b5cf6,#6d28d9)", boxShadow: "0 0 18px var(--accent-glow)" }}>
              Add
            </button>
          </div>
          <div className="space-y-3.5">
            {milestones.map(m => <MilestoneCard key={m.id} milestone={m} />)}
            {milestones.length === 0 && (
              <p className="text-sm text-center py-12" style={{ color: "var(--text-faint)" }}>No milestones yet.</p>
            )}
          </div>
        </div>
      )}

      {tab === "outline" && (
        <div>
          <label className="block text-[10px] font-mono uppercase tracking-[0.15em] mb-2"
            style={{ color: "var(--text-faint)" }}>
            Assignment brief
          </label>
          <textarea value={brief} onChange={e => setBrief(e.target.value)}
            rows={4} placeholder="Paste your assignment instructions here…"
            className="w-full rounded-xl px-4 py-3 text-sm resize-none outline-none"
            style={{ background: "var(--input-bg)", color: "var(--text)", border: "1px solid var(--input-border)" }} />
          <button onClick={generateOutline} disabled={loadingOutline || !brief.trim()}
            className="mt-3 px-5 py-2.5 rounded-xl text-sm font-medium text-white disabled:opacity-40 transition-all"
            style={{ background: "linear-gradient(135deg,#8b5cf6,#6d28d9)", boxShadow: "0 0 18px var(--accent-glow)" }}>
            {loadingOutline ? "Generating…" : "Generate outline"}
          </button>

          {outline && (
            <div className="mt-6 rounded-2xl p-5"
              style={{ background: "var(--surface)", border: "1px solid var(--surface-border)" }}>
              <div className="flex items-center gap-2 mb-4">
                <h3 className="text-sm font-semibold" style={{ color: "var(--text)" }}>Suggested outline</h3>
                <Pill tone="teal">AI</Pill>
              </div>
              <ol className="space-y-4">
                {outline.sections?.map((s: any, i: number) => (
                  <li key={i} className="flex gap-3">
                    <span className="shrink-0 w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-mono"
                      style={{
                        background: "var(--accent-soft)", border: "1px solid var(--accent-border)",
                        color: "var(--accent-bright)",
                      }}>
                      {i + 1}
                    </span>
                    <div className="flex-1">
                      <div className="font-medium text-sm mb-1" style={{ color: "var(--text)" }}>{s.title}</div>
                      <ul className="space-y-1">
                        {s.points?.map((p: string, j: number) => (
                          <li key={j} className="text-xs leading-relaxed" style={{ color: "var(--text-dim)" }}>· {p}</li>
                        ))}
                      </ul>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}

      {tab === "chat" && (
        <div className="h-[460px]">
          <ChatBox
            onSend={async question => {
              const res = await api.rubricCheck(id, question)
              const criteria = res.criteria ?? []
              const answer = criteria.map((c: any) =>
                `${c.met ? "PASS" : "GAP"} — ${c.name}: ${c.evidence}${c.suggestion ? " → " + c.suggestion : ""}`
              ).join("\n\n") || "No feedback generated."
              return { answer, citations: [] }
            }}
            placeholder="Paste a draft or ask for feedback…"
            emptyHint="Paste a section of your draft — the AI checks it against the rubric."
          />
        </div>
      )}
    </div>
  )
}
