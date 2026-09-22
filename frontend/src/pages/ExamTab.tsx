import { useState, useEffect, useRef } from "react"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import {
  faFileArrowUp, faRotate, faWandMagicSparkles, faCheck, faXmark, faBookOpen,
} from "@fortawesome/free-solid-svg-icons"
import { api } from "../lib/api"
import { Pill } from "../App"

type Question = { n: number; topic: string; question: string; options: string[] }
type Result = { n: number; correct: boolean; chosen: number; answer_index: number; explanation: string }

export function ExamTab({ id }: { id: number }) {
  const [plan, setPlan] = useState<any[]>([])
  const [questions, setQuestions] = useState<Question[]>([])
  const [answers, setAnswers] = useState<Record<number, number>>({})
  const [results, setResults] = useState<Result[] | null>(null)
  const [score, setScore] = useState<{ correct: number; total: number } | null>(null)
  const [mastery, setMastery] = useState<any[]>([])
  const [paper, setPaper] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    api.quiz(id).then(q => {
      setPlan(q.study_plan ?? [])
      setQuestions(q.questions ?? [])
    }).catch(() => {})
  }, [id])

  async function run(call: () => Promise<any>) {
    setBusy(true); setError(""); setResults(null); setScore(null)
    try {
      const q = await call()
      setPlan(q.study_plan ?? [])
      setQuestions(q.questions ?? [])
      setAnswers({})
    } catch (e: any) { setError(e.message) }
    finally { setBusy(false) }
  }

  async function submit() {
    const ordered = questions.map(q => answers[q.n] ?? -1)
    setBusy(true); setError("")
    try {
      const res = await api.submitQuiz(id, ordered)
      setResults(res.results)
      setScore({ correct: res.correct, total: res.total })
      setMastery(res.mastery ?? [])
    } catch (e: any) { setError(e.message) }
    finally { setBusy(false) }
  }

  const answered = questions.filter(q => answers[q.n] !== undefined).length

  // No quiz yet — take the paper in.
  if (questions.length === 0) {
    return (
      <div className="rounded-2xl p-7"
        style={{ background: "var(--surface)", border: "1px solid var(--surface-border)" }}>
        <div className="flex items-center gap-2 mb-2">
          <FontAwesomeIcon icon={faBookOpen} style={{ color: "var(--accent-bright)" }} />
          <h3 className="text-base font-semibold" style={{ color: "var(--text)" }}>
            Revise from a past-year paper
          </h3>
        </div>
        <p className="text-sm mb-5" style={{ color: "var(--text-dim)" }}>
          Drop in last year's paper or a topic list. Tugas works out what to revise and builds a
          practice quiz that tests the same understanding — reworded, so memorising answers
          won't help you.
        </p>

        <textarea value={paper} onChange={e => setPaper(e.target.value)} rows={5} disabled={busy}
          placeholder="Paste the paper or list your exam topics…"
          className="w-full rounded-xl px-4 py-3 text-sm resize-none outline-none mb-3 disabled:opacity-60"
          style={{ background: "var(--input-bg)", color: "var(--text)", border: "1px solid var(--input-border)" }} />

        <div className="flex items-center gap-2 mb-4">
          <div className="flex-1 h-px" style={{ background: "var(--surface-border)" }} />
          <span className="text-[10px] font-mono uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
            or upload the paper
          </span>
          <div className="flex-1 h-px" style={{ background: "var(--surface-border)" }} />
        </div>

        <input type="file" ref={fileRef} className="hidden" accept=".pdf,.docx,.txt,.md"
          onChange={e => {
            const f = e.target.files?.[0]
            if (f) run(() => api.makeQuizFile(id, f))
            if (fileRef.current) fileRef.current.value = ""
          }} />
        <div
          onClick={() => !busy && fileRef.current?.click()}
          onDragOver={e => { e.preventDefault(); if (!busy) setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => {
            e.preventDefault(); setDragging(false)
            if (busy) return
            const f = e.dataTransfer.files?.[0]
            if (!f) return
            if (!/\.(pdf|docx|txt|md)$/i.test(f.name)) {
              setError(`${f.name} isn't a PDF, Word, txt or md file.`)
              return
            }
            run(() => api.makeQuizFile(id, f))
          }}
          className="w-full rounded-xl px-4 py-6 text-sm mb-4 text-center cursor-pointer transition-all"
          style={{
            background: dragging ? "var(--accent-soft)" : "var(--input-bg)",
            border: `1px dashed ${dragging ? "var(--accent-bright)" : "var(--input-border)"}`,
            color: dragging ? "var(--accent-bright)" : "var(--text-dim)",
            opacity: busy ? 0.5 : 1,
          }}>
          <FontAwesomeIcon icon={faFileArrowUp} className="text-base mb-2 block mx-auto" />
          {dragging ? "Drop it here" : "Drop the paper here, or click to browse"}
        </div>

        <button onClick={() => run(() => api.makeQuiz(id, paper.trim()))}
          disabled={busy || !paper.trim()}
          className="px-5 py-2.5 rounded-xl text-sm font-medium text-white disabled:opacity-40 transition-all"
          style={{ background: "linear-gradient(135deg,#8b5cf6,#6d28d9)", boxShadow: "0 0 18px var(--accent-glow)" }}>
          <FontAwesomeIcon icon={busy ? faRotate : faWandMagicSparkles}
            className={`text-xs mr-2 ${busy ? "animate-spin" : ""}`} />
          {busy ? "Building…" : "Build study plan & quiz"}
        </button>

        {error && <p className="text-xs mt-4" style={{ color: "var(--red)" }}>{error}</p>}
      </div>
    )
  }

  return (
    <div className="space-y-7">
      {plan.length > 0 && (
        <div className="rounded-2xl p-5"
          style={{ background: "var(--surface)", border: "1px solid var(--surface-border)" }}>
          <div className="flex items-center gap-2 mb-4">
            <h3 className="text-sm font-semibold" style={{ color: "var(--text)" }}>Study plan</h3>
            <Pill tone="teal">{plan.length} topics</Pill>
          </div>
          <ol className="space-y-3">
            {plan.map((s: any, i: number) => (
              <li key={i} className="flex gap-3">
                <span className="shrink-0 w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-mono"
                  style={{ background: "var(--accent-soft)", border: "1px solid var(--accent-border)", color: "var(--accent-bright)" }}>
                  {i + 1}
                </span>
                <div className="flex-1">
                  <div className="text-sm font-medium" style={{ color: "var(--text)" }}>{s.topic}</div>
                  <div className="text-xs mt-0.5" style={{ color: "var(--text-dim)" }}>{s.why}</div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div>
        <div className="flex items-center gap-2 mb-4">
          <h3 className="text-sm font-semibold" style={{ color: "var(--text)" }}>Practice quiz</h3>
          {score
            ? <Pill tone={score.correct / score.total >= 0.7 ? "teal" : "accent"}>
                {score.correct} / {score.total}
              </Pill>
            : <Pill tone="dim">{answered} of {questions.length} answered</Pill>}
        </div>

        <div className="space-y-4">
          {questions.map(q => {
            const r = results?.find(x => x.n === q.n)
            return (
              <div key={q.n} className="rounded-2xl p-5"
                style={{
                  background: "var(--surface)",
                  border: `1px solid ${r ? (r.correct ? "var(--teal-border)" : "rgba(248,113,113,0.35)") : "var(--surface-border)"}`,
                }}>
                <div className="flex items-start gap-2 mb-3">
                  <Pill tone="dim">{q.topic}</Pill>
                  {r && (
                    <FontAwesomeIcon icon={r.correct ? faCheck : faXmark} className="text-xs mt-1"
                      style={{ color: r.correct ? "var(--teal)" : "var(--red)" }} />
                  )}
                </div>
                <p className="text-sm mb-3" style={{ color: "var(--text)" }}>{q.question}</p>

                <div className="space-y-1.5">
                  {q.options.map((opt, oi) => {
                    const chosen = answers[q.n] === oi
                    const isAnswer = r && oi === r.answer_index
                    const wrongPick = r && chosen && !r.correct
                    return (
                      <button key={oi} disabled={!!results}
                        onClick={() => setAnswers(a => ({ ...a, [q.n]: oi }))}
                        className="w-full flex items-center gap-2.5 text-left text-xs rounded-lg px-3 py-2.5 transition-all disabled:cursor-default"
                        style={{
                          background: isAnswer ? "var(--teal-soft)"
                            : wrongPick ? "rgba(248,113,113,0.1)"
                            : chosen ? "var(--accent-soft)" : "var(--input-bg)",
                          border: `1px solid ${isAnswer ? "var(--teal-border)"
                            : wrongPick ? "rgba(248,113,113,0.35)"
                            : chosen ? "var(--accent-border)" : "var(--input-border)"}`,
                          color: isAnswer ? "var(--teal)" : wrongPick ? "var(--red)" : "var(--text)",
                        }}>
                        <span className="w-4 h-4 rounded-full shrink-0 flex items-center justify-center text-[9px] font-mono"
                          style={{ border: "1px solid currentColor", opacity: chosen || isAnswer ? 1 : 0.4 }}>
                          {"ABCD"[oi]}
                        </span>
                        <span className="flex-1">{opt}</span>
                      </button>
                    )
                  })}
                </div>

                {r && (
                  <p className="text-xs mt-3 pt-3" style={{ borderTop: "1px solid var(--surface-border)", color: "var(--text-dim)" }}>
                    {r.explanation}
                  </p>
                )}
              </div>
            )
          })}
        </div>

        {error && <p className="text-xs mt-4" style={{ color: "var(--red)" }}>{error}</p>}

        {!results ? (
          <button onClick={submit} disabled={busy || answered === 0}
            className="mt-5 px-5 py-2.5 rounded-xl text-sm font-medium text-white disabled:opacity-40 transition-all"
            style={{ background: "linear-gradient(135deg,#8b5cf6,#6d28d9)", boxShadow: "0 0 18px var(--accent-glow)" }}>
            {busy ? "Marking…" : answered < questions.length
              ? `Submit (${questions.length - answered} unanswered)`
              : "Submit answers"}
          </button>
        ) : (
          <div className="mt-6 rounded-2xl p-5"
            style={{ background: "var(--surface)", border: "1px solid var(--surface-border)" }}>
            <h4 className="text-sm font-semibold mb-1" style={{ color: "var(--text)" }}>Where you stand</h4>
            <p className="text-xs mb-4" style={{ color: "var(--text-dim)" }}>
              Weakest topics first — revise from the top.
            </p>
            <div className="space-y-2">
              {mastery.map((m: any) => (
                <div key={m.topic} className="flex items-center gap-3">
                  <span className="text-xs flex-1 truncate" style={{ color: "var(--text)" }}>{m.topic}</span>
                  <div className="w-32 h-1.5 rounded-full overflow-hidden shrink-0" style={{ background: "var(--input-bg)" }}>
                    <div className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.round(m.mastery * 100)}%`,
                        background: m.mastery >= 0.7 ? "var(--teal)" : m.mastery >= 0.4 ? "var(--amber)" : "var(--red)",
                      }} />
                  </div>
                  <span className="text-[10px] font-mono w-9 text-right shrink-0" style={{ color: "var(--text-faint)" }}>
                    {Math.round(m.mastery * 100)}%
                  </span>
                </div>
              ))}
            </div>
            <button onClick={() => { setResults(null); setScore(null); setAnswers({}) }}
              className="mt-5 text-xs hover:underline" style={{ color: "var(--accent-bright)" }}>
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
