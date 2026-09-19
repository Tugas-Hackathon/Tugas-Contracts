import { useState, useRef, useEffect } from "react"

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
    <div className="flex flex-col rounded-xl overflow-hidden" style={{ height: "420px", border: "1px solid var(--card-border)", background: "var(--card-bg)" }}>
      {/* messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && (
          <p className="text-sm text-center mt-8" style={{ color: "var(--main-muted)" }}>
            {emptyHint ?? "Ask anything about your materials."}
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div className="max-w-xs lg:max-w-md rounded-2xl px-4 py-2 text-sm"
              style={m.role === "user"
                ? { background: "var(--msg-user-bg)", color: "var(--msg-user-text)", borderRadius: "16px 16px 4px 16px" }
                : { background: "var(--msg-ai-bg)", color: "var(--msg-ai-text)", borderRadius: "16px 16px 16px 4px" }}>
              <p className="whitespace-pre-wrap">{m.text}</p>
              {m.citations && m.citations.length > 0 && (
                <div className="mt-2 space-y-1 pt-2" style={{ borderTop: "1px solid var(--card-border)" }}>
                  {m.citations.map((c, j) => (
                    <p key={j} className="text-xs italic" style={{ color: "var(--main-muted)" }}>
                      [{c.chunk_id}] "{c.quote}"
                      {c.filename && <span className="ml-1 not-italic">— {c.filename}</span>}
                    </p>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="rounded-2xl px-4 py-2" style={{ background: "var(--msg-ai-bg)", borderRadius: "16px 16px 16px 4px" }}>
              <span className="text-sm" style={{ color: "var(--main-muted)" }}>Thinking…</span>
            </div>
          </div>
        )}
        {error && <p className="text-xs text-red-500 text-center">{error}</p>}
        <div ref={bottomRef} />
      </div>

      {/* input */}
      <div className="px-3 py-3 flex gap-2" style={{ borderTop: "1px solid var(--card-border)" }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && !e.shiftKey && send()}
          placeholder={placeholder}
          disabled={loading}
          className="flex-1 rounded-lg px-3 py-2 text-sm outline-none disabled:opacity-50"
          style={{ background: "var(--input-bg)", color: "var(--main-text)", border: "1px solid var(--input-border)" }}
        />
        <button onClick={send} disabled={loading || !input.trim()}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-40">
          Send
        </button>
      </div>
    </div>
  )
}
