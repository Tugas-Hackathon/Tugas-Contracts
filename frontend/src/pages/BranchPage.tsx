import { useState, useEffect, useRef } from "react"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { faWandMagicSparkles, faRotate, faFileArrowUp } from "@fortawesome/free-solid-svg-icons"
import { api } from "../lib/api"
import { MilestoneCard } from "../components/MilestoneCard"
import { ChatBox } from "../components/ChatBox"
import { Pill } from "../App"

export function BranchPage({ id }: { id: number; onBack?: () => void }) {
  const [branch, setBranch] = useState<any>(null)
  const [milestones, setMilestones] = useState<any[]>([])
  const [tab, setTab] = useState<"milestones" | "chat">("milestones")
  const [milestoneTitle, setMilestoneTitle] = useState("")
  const [brief, setBrief] = useState("")
  const [planning, setPlanning] = useState(false)
  const [planError, setPlanError] = useState("")
  const [manual, setManual] = useState(false)
  const briefFileRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  async function generatePlan() {
    if (!brief.trim()) return
    await runPlan(() => api.planBranch(id, brief.trim()))
  }

  async function generatePlanFromFile(file: File) {
    await runPlan(() => api.planBranchFile(id, file))
  }

  async function runPlan(call: () => Promise<any>) {
    setPlanning(true); setPlanError("")
    try {
      const res = await call()
      setMilestones(res.milestones)
    } catch (e: any) {
      setPlanError(e.message)
    } finally {
      setPlanning(false)
    }
  }

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

  const tabs = [
    { key: "milestones", label: "Milestones" },
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
          {milestones.length === 0 ? (
            <div className="rounded-2xl p-7"
              style={{ background: "var(--surface)", border: "1px solid var(--surface-border)" }}>
              <div className="flex items-center gap-2 mb-2">
                <FontAwesomeIcon icon={faWandMagicSparkles} style={{ color: "var(--accent-bright)" }} />
                <h3 className="text-base font-semibold" style={{ color: "var(--text)" }}>
                  Let Tugas plan this for you
                </h3>
              </div>
              <p className="text-sm mb-5" style={{ color: "var(--text-dim)" }}>
                Paste the assignment brief and Tugas breaks it into milestones — each one a
                concrete piece of work. You review them, adjust what you want, then work through.
              </p>

              <textarea value={brief} onChange={e => setBrief(e.target.value)}
                rows={5} placeholder="Paste your assignment brief or question here…"
                disabled={planning}
                className="w-full rounded-xl px-4 py-3 text-sm resize-none outline-none mb-3 disabled:opacity-60"
                style={{ background: "var(--input-bg)", color: "var(--text)", border: "1px solid var(--input-border)" }} />

              <div className="flex items-center gap-2 mb-4">
                <div className="flex-1 h-px" style={{ background: "var(--surface-border)" }} />
                <span className="text-[10px] font-mono uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
                  or upload the brief
                </span>
                <div className="flex-1 h-px" style={{ background: "var(--surface-border)" }} />
              </div>

              <input type="file" ref={briefFileRef} className="hidden"
                accept=".pdf,.docx,.txt,.md"
                onChange={e => {
                  const f = e.target.files?.[0]
                  if (f) generatePlanFromFile(f)
                  if (briefFileRef.current) briefFileRef.current.value = ""
                }} />
              <div
                onClick={() => !planning && briefFileRef.current?.click()}
                onDragOver={e => { e.preventDefault(); if (!planning) setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={e => {
                  e.preventDefault()
                  setDragging(false)
                  if (planning) return
                  const f = e.dataTransfer.files?.[0]
                  if (!f) return
                  if (!/\.(pdf|docx|txt|md)$/i.test(f.name)) {
                    setPlanError(`${f.name} isn't a PDF, Word, txt or md file.`)
                    return
                  }
                  generatePlanFromFile(f)
                }}
                className="w-full rounded-xl px-4 py-6 text-sm mb-4 text-center cursor-pointer transition-all"
                style={{
                  background: dragging ? "var(--accent-soft)" : "var(--input-bg)",
                  border: `1px dashed ${dragging ? "var(--accent-bright)" : "var(--input-border)"}`,
                  color: dragging ? "var(--accent-bright)" : "var(--text-dim)",
                  opacity: planning ? 0.5 : 1,
                }}>
                <FontAwesomeIcon icon={faFileArrowUp} className="text-base mb-2 block mx-auto" />
                {dragging ? "Drop it here" : "Drop a PDF or Word file here, or click to browse"}
              </div>

              <div className="flex items-center gap-3">
                <button onClick={generatePlan} disabled={planning || !brief.trim()}
                  className="px-5 py-2.5 rounded-xl text-sm font-medium text-white disabled:opacity-40 transition-all"
                  style={{ background: "linear-gradient(135deg,#8b5cf6,#6d28d9)", boxShadow: "0 0 18px var(--accent-glow)" }}>
                  <FontAwesomeIcon icon={planning ? faRotate : faWandMagicSparkles}
                    className={`text-xs mr-2 ${planning ? "animate-spin" : ""}`} />
                  {planning ? "Planning…" : "Generate milestones"}
                </button>
                <button onClick={() => setManual(true)} className="text-xs hover:underline"
                  style={{ color: "var(--text-dim)" }}>
                  or add them myself
                </button>
              </div>

              {planError && <p className="text-xs mt-4" style={{ color: "var(--red)" }}>{planError}</p>}
            </div>
          ) : (
            <div className="space-y-3.5">
              {milestones.map((m, i) => (
                <div key={m.id}>
                  {m.detail && (
                    <div className="flex items-start gap-2 mb-1.5 px-1">
                      <span className="text-[10px] font-mono mt-0.5 shrink-0" style={{ color: "var(--accent-bright)" }}>
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="text-xs flex-1" style={{ color: "var(--text-dim)" }}>{m.detail}</span>
                      {typeof m.day_offset === "number" && (
                        <span className="text-[10px] font-mono shrink-0" style={{ color: "var(--text-faint)" }}>
                          day {m.day_offset}
                        </span>
                      )}
                    </div>
                  )}
                  <MilestoneCard milestone={m} />
                </div>
              ))}
            </div>
          )}

          {(milestones.length > 0 || manual) && (
            <div className="flex gap-2 mt-5">
              <input value={milestoneTitle} onChange={e => setMilestoneTitle(e.target.value)}
                placeholder="Add another milestone…"
                className="flex-1 rounded-xl px-4 py-2.5 text-sm outline-none"
                style={{ background: "var(--input-bg)", color: "var(--text)", border: "1px solid var(--input-border)" }}
                onKeyDown={e => e.key === "Enter" && addMilestone()} />
              <button onClick={addMilestone}
                className="px-5 rounded-xl text-sm font-medium transition-all"
                style={{ background: "var(--surface)", border: "1px solid var(--surface-border)", color: "var(--text)" }}>
                Add
              </button>
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
