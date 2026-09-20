import { useState, useRef, useEffect } from "react"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { faPaperPlane, faQuoteLeft } from "@fortawesome/free-solid-svg-icons"

interface Citation {
  chunk_id: string
  quote: string
  filename?: string
  page?: number
}

interface Message {
  role: "user" | "assistant"
  text: string
  citations?: Citation[]
}

interface Props {
  onSend: (question: string) => Promise<{ answer: string; citations: Citation[] }>
  placeholder?: string
  emptyHint?: string
}

export function ChatBox({ onSend, placeholder = "Ask a question…", emptyHint }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, loading])

  async function send() {
    const q = input.trim()
    if (!q || loading) return
    setInput("")
    setError("")
    setMessages(m => [...m, { role: "user", text: q }])
    setLoading(true)
    try {
      const res = await onSend(q)
      setMessages(m => [...m, { role: "assistant", text: res.answer, citations: res.citations }])
    } catch (e: any) {
      setError(e.message)
      setMessages(m => m.slice(0, -1))
      setInput(q)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col rounded-2xl overflow-hidden backdrop-blur-sm h-full min-h-[420px]"
      style={{ background: "var(--surface)", border: "1px solid var(--surface-border)" }}>

      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
        {messages.length === 0 && (
          <p className="text-sm text-center mt-10" style={{ color: "var(--text-faint)" }}>
            {emptyHint ?? "Ask anything about your materials."}
          </p>
        )}

        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div className="max-w-md text-sm px-4 py-3"
              style={m.role === "user"
                ? {
                    background: "var(--msg-user-bg)", color: "var(--msg-user-text)",
                    borderRadius: "16px 16px 4px 16px",
                    boxShadow: "0 0 20px var(--accent-soft)",
                  }
                : {
                    background: "var(--msg-ai-bg)", color: "var(--msg-ai-text)",
                    borderRadius: "16px 16px 16px 4px",
                    border: "1px solid var(--surface-border)",
                  }}>
              <p className="whitespace-pre-wrap leading-relaxed">{m.text}</p>

              {m.citations && m.citations.length > 0 && (
                <div className="mt-3 rounded-xl px-3 py-2.5 space-y-1.5"
                  style={{ background: "var(--teal-soft)", border: "1px solid var(--teal-border)" }}>
                  <div className="flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-[0.15em]"
                    style={{ color: "var(--teal)" }}>
                    <FontAwesomeIcon icon={faQuoteLeft} className="text-[8px]" />
                    Sources
                  </div>
                  {m.citations.map((c, j) => (
                    <p key={j} className="text-[11px] leading-relaxed" style={{ color: "var(--text-dim)" }}>
                      <span className="font-mono" style={{ color: "var(--teal)" }}>[{c.chunk_id}]</span>{" "}
                      <span className="italic">"{c.quote}"</span>
                      {c.filename && <span className="ml-1" style={{ color: "var(--text-faint)" }}>— {c.filename}</span>}
                    </p>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="px-4 py-3" style={{
              background: "var(--msg-ai-bg)", borderRadius: "16px 16px 16px 4px",
              border: "1px solid var(--surface-border)",
            }}>
              <span className="text-sm italic" style={{ color: "var(--text-faint)" }}>Thinking…</span>
            </div>
          </div>
        )}

        {error && <p className="text-xs text-center" style={{ color: "var(--red)" }}>{error}</p>}
        <div ref={bottomRef} />
      </div>

      <div className="px-4 py-3.5 flex gap-2" style={{ borderTop: "1px solid var(--surface-border)" }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && !e.shiftKey && send()}
          placeholder={placeholder}
          disabled={loading}
          className="flex-1 rounded-xl px-4 py-2.5 text-sm outline-none disabled:opacity-50"
          style={{ background: "var(--input-bg)", color: "var(--text)", border: "1px solid var(--input-border)" }}
        />
        <button onClick={send} disabled={loading || !input.trim()}
          className="px-4 rounded-xl text-sm font-medium text-white disabled:opacity-40 transition-all"
          style={{ background: "linear-gradient(135deg,#8b5cf6,#6d28d9)", boxShadow: "0 0 18px var(--accent-glow)" }}>
          <FontAwesomeIcon icon={faPaperPlane} className="text-xs" />
        </button>
      </div>
    </div>
  )
}
