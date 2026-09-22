import { useState, useEffect } from "react"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { faGoogle } from "@fortawesome/free-brands-svg-icons"
import { faCalendarPlus, faDownload, faTrash, faClock } from "@fortawesome/free-solid-svg-icons"
import { api } from "../lib/api"
import { Pill } from "../App"

type Item = {
  id: string
  source: "event" | "branch"
  title: string
  subtitle: string
  starts_at: number
  ends_at: number | null
  gcal_url: string
}

const DAY = 86400

export function CalendarPage() {
  const [items, setItems] = useState<Item[]>([])
  const [title, setTitle] = useState("")
  const [when, setWhen] = useState("")
  const [error, setError] = useState("")
  const [adding, setAdding] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    try { setItems(await api.agenda()) }
    catch (e: any) { setError(e.message) }
  }

  async function add() {
    if (!title.trim() || !when) return
    setAdding(true); setError("")
    try {
      // datetime-local has no zone, so the browser's own offset is the intent.
      await api.createEvent({ title: title.trim(), starts_at: Math.floor(new Date(when).getTime() / 1000) })
      setTitle(""); setWhen("")
      await load()
    } catch (e: any) { setError(e.message) }
    finally { setAdding(false) }
  }

  async function remove(it: Item) {
    if (it.source !== "event") return
    if (!confirm(`Delete "${it.title}"?`)) return
    try {
      await api.deleteEvent(Number(it.id.split("-")[1]))
      setItems(p => p.filter(x => x.id !== it.id))
    } catch (e: any) { setError(e.message) }
  }

  const now = Date.now() / 1000
  const upcoming = items.filter(i => i.starts_at >= now - DAY)
  const past = items.filter(i => i.starts_at < now - DAY)

  return (
    <div className="max-w-2xl mx-auto px-8 py-10">
      <div className="flex items-center gap-3 mb-1">
        <h2 className="text-xl font-semibold" style={{ color: "var(--text)" }}>Calendar</h2>
        <Pill tone="accent">{upcoming.length} upcoming</Pill>
      </div>
      <p className="text-sm mb-7" style={{ color: "var(--text-dim)" }}>
        Assignment and exam deadlines appear here automatically. Add anything to Google Calendar
        in one click, or download it for Apple Calendar and Outlook.
      </p>

      {/* Add an event */}
      <div className="rounded-2xl p-4 mb-7"
        style={{ background: "var(--surface)", border: "1px solid var(--surface-border)" }}>
        <div className="flex flex-col sm:flex-row gap-2">
          <input value={title} onChange={e => setTitle(e.target.value)}
            placeholder="Class test, presentation, study session…"
            onKeyDown={e => e.key === "Enter" && add()}
            className="flex-1 min-w-0 rounded-xl px-3 py-2.5 text-sm outline-none"
            style={{ background: "var(--input-bg)", color: "var(--text)", border: "1px solid var(--input-border)" }} />
          <input type="datetime-local" value={when} onChange={e => setWhen(e.target.value)}
            className="rounded-xl px-3 py-2.5 text-sm outline-none shrink-0"
            style={{ background: "var(--input-bg)", color: "var(--text)", border: "1px solid var(--input-border)" }} />
          <button onClick={add} disabled={adding || !title.trim() || !when}
            className="px-4 py-2.5 rounded-xl text-sm font-medium text-white disabled:opacity-40 shrink-0 transition-all"
            style={{ background: "linear-gradient(135deg,#8b5cf6,#6d28d9)", boxShadow: "0 0 16px var(--accent-glow)" }}>
            <FontAwesomeIcon icon={faCalendarPlus} className="text-xs mr-2" />
            Add
          </button>
        </div>
        {error && <p className="text-xs mt-3" style={{ color: "var(--red)" }}>{error}</p>}
      </div>

      <Section label="Upcoming" items={upcoming} onDelete={remove} empty="Nothing scheduled yet." />
      {past.length > 0 && <Section label="Past" items={past} onDelete={remove} dim />}
    </div>
  )
}

function Section({ label, items, onDelete, empty, dim }: {
  label: string
  items: Item[]
  onDelete: (it: Item) => void
  empty?: string
  dim?: boolean
}) {
  return (
    <div className="mb-7">
      <div className="text-[10px] font-mono uppercase tracking-[0.18em] mb-3 px-1"
        style={{ color: "var(--text-faint)" }}>
        {label}
      </div>
      {items.length === 0 && empty && (
        <p className="text-sm text-center py-10" style={{ color: "var(--text-faint)" }}>{empty}</p>
      )}
      <div className="space-y-2.5">
        {items.map(it => <Row key={it.id} item={it} onDelete={onDelete} dim={dim} />)}
      </div>
    </div>
  )
}

function Row({ item, onDelete, dim }: { item: Item; onDelete: (it: Item) => void; dim?: boolean }) {
  const d = new Date(item.starts_at * 1000)
  const days = Math.ceil((item.starts_at - Date.now() / 1000) / DAY)
  const isDeadline = item.source === "branch"

  const countdown =
    days < 0 ? `${Math.abs(days)}d ago` :
    days === 0 ? "today" :
    days === 1 ? "tomorrow" : `in ${days}d`

  return (
    <div className="flex items-center gap-3 px-4 py-3.5 rounded-xl group"
      style={{
        background: "var(--surface)",
        border: `1px solid ${isDeadline && days >= 0 && days <= 3 ? "var(--accent-border)" : "var(--surface-border)"}`,
        opacity: dim ? 0.55 : 1,
      }}>
      <div className="w-11 shrink-0 text-center">
        <div className="text-[9px] font-mono uppercase" style={{ color: "var(--text-faint)" }}>
          {d.toLocaleString(undefined, { month: "short" })}
        </div>
        <div className="text-base font-semibold leading-tight" style={{ color: "var(--text)" }}>
          {d.getDate()}
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate" style={{ color: "var(--text)" }}>{item.title}</div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs truncate" style={{ color: "var(--text-dim)" }}>{item.subtitle}</span>
          <span className="text-[10px] font-mono shrink-0"
            style={{ color: days >= 0 && days <= 3 ? "var(--amber)" : "var(--text-faint)" }}>
            <FontAwesomeIcon icon={faClock} className="text-[8px] mr-1" />
            {countdown}
          </span>
        </div>
      </div>

      <a href={item.gcal_url} target="_blank" rel="noreferrer" title="Add to Google Calendar"
        className="opacity-0 group-hover:opacity-100 transition-opacity p-2 rounded-lg shrink-0"
        style={{ color: "var(--text-dim)" }}>
        <FontAwesomeIcon icon={faGoogle} className="text-xs" />
      </a>
      <button onClick={() => api.downloadIcs(item.id)} title="Download .ics"
        className="opacity-0 group-hover:opacity-100 transition-opacity p-2 rounded-lg shrink-0"
        style={{ color: "var(--text-dim)" }}>
        <FontAwesomeIcon icon={faDownload} className="text-xs" />
      </button>
      {item.source === "event" && (
        <button onClick={() => onDelete(item)} title="Delete"
          className="opacity-0 group-hover:opacity-100 transition-opacity p-2 rounded-lg shrink-0"
          style={{ color: "var(--text-dim)" }}
          onMouseEnter={e => (e.currentTarget.style.color = "var(--red)")}
          onMouseLeave={e => (e.currentTarget.style.color = "var(--text-dim)")}>
          <FontAwesomeIcon icon={faTrash} className="text-xs" />
        </button>
      )}
    </div>
  )
}
