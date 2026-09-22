import { useState, useEffect, useMemo } from "react"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { faGoogle } from "@fortawesome/free-brands-svg-icons"
import {
  faChevronLeft, faChevronRight, faDownload, faTrash, faPlus,
} from "@fortawesome/free-solid-svg-icons"
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

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
const sameDay = (a: Date, b: Date) => dayKey(a) === dayKey(b)

/** Monday-first grid covering the month, padded with neighbouring days so every
 *  row is a full week. Rows are exactly what the month needs — a fixed six
 *  leaves a dead row on a 28-day February that starts on a Monday. */
function monthGrid(year: number, month: number): Date[] {
  const lead = (new Date(year, month, 1).getDay() + 6) % 7   // JS weeks start Sunday
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const rows = Math.ceil((lead + daysInMonth) / 7)
  return Array.from({ length: rows * 7 }, (_, i) => new Date(year, month, 1 - lead + i))
}

export function CalendarPage() {
  const [items, setItems] = useState<Item[]>([])
  const [cursor, setCursor] = useState(() => new Date())
  const [selected, setSelected] = useState<Date | null>(null)
  const [title, setTitle] = useState("")
  const [time, setTime] = useState("09:00")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    try { setItems(await api.agenda()) }
    catch (e: any) { setError(e.message) }
  }

  const byDay = useMemo(() => {
    const m = new Map<string, Item[]>()
    for (const it of items) {
      const k = dayKey(new Date(it.starts_at * 1000))
      m.set(k, [...(m.get(k) ?? []), it])
    }
    return m
  }, [items])

  const cells = monthGrid(cursor.getFullYear(), cursor.getMonth())
  const today = new Date()
  const day = selected ?? today
  const dayItems = byDay.get(dayKey(day)) ?? []

  async function add() {
    if (!title.trim()) return
    const [h, min] = time.split(":").map(Number)
    const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h || 0, min || 0)
    setBusy(true); setError("")
    try {
      await api.createEvent({ title: title.trim(), starts_at: Math.floor(at.getTime() / 1000) })
      setTitle("")
      await load()
    } catch (e: any) { setError(e.message) }
    finally { setBusy(false) }
  }

  async function remove(it: Item) {
    if (it.source !== "event") return
    if (!confirm(`Delete "${it.title}"?`)) return
    try {
      await api.deleteEvent(Number(it.id.split("-")[1]))
      setItems(p => p.filter(x => x.id !== it.id))
    } catch (e: any) { setError(e.message) }
  }

  const monthLabel = cursor.toLocaleString(undefined, { month: "long", year: "numeric" })
  const shift = (n: number) => setCursor(c => new Date(c.getFullYear(), c.getMonth() + n, 1))

  return (
    <div className="max-w-3xl mx-auto px-8 py-9">
      <div className="flex items-center gap-3 mb-6">
        <h2 className="text-xl font-semibold" style={{ color: "var(--text)" }}>{monthLabel}</h2>
        <Pill tone="accent">{items.length} scheduled</Pill>
        <div className="flex-1" />
        <button onClick={() => { setCursor(new Date()); setSelected(new Date()) }}
          className="text-xs px-3 py-1.5 rounded-lg"
          style={{ background: "var(--surface)", border: "1px solid var(--surface-border)", color: "var(--text-dim)" }}>
          Today
        </button>
        <NavBtn icon={faChevronLeft} onClick={() => shift(-1)} />
        <NavBtn icon={faChevronRight} onClick={() => shift(1)} />
      </div>

      {/* Month grid */}
      <div className="rounded-2xl overflow-hidden mb-6"
        style={{ background: "var(--surface)", border: "1px solid var(--surface-border)" }}>
        <div className="grid grid-cols-7">
          {WEEKDAYS.map(w => (
            <div key={w} className="text-[10px] font-mono uppercase tracking-wider text-center py-2.5"
              style={{ color: "var(--text-faint)", borderBottom: "1px solid var(--surface-border)" }}>
              {w}
            </div>
          ))}

          {cells.map((d, i) => {
            const inMonth = d.getMonth() === cursor.getMonth()
            const isToday = sameDay(d, today)
            const isSel = selected && sameDay(d, selected)
            const dayList = byDay.get(dayKey(d)) ?? []

            return (
              <button key={i} onClick={() => setSelected(d)}
                className="relative h-[74px] p-1.5 text-left transition-colors"
                style={{
                  borderBottom: "1px solid var(--surface-border)",
                  borderRight: (i + 1) % 7 ? "1px solid var(--surface-border)" : "none",
                  background: isSel ? "var(--accent-soft)" : "transparent",
                  opacity: inMonth ? 1 : 0.32,
                }}
                onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = "var(--surface-hover)" }}
                onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = "transparent" }}>
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium"
                  style={
                    isToday
                      ? { background: "var(--accent)", color: "#fff" }
                      : { color: isSel ? "var(--accent-bright)" : "var(--text)" }
                  }>
                  {d.getDate()}
                </span>

                <div className="mt-1 space-y-0.5">
                  {dayList.slice(0, 2).map(it => (
                    <div key={it.id} className="truncate text-[9px] px-1 py-0.5 rounded"
                      style={{
                        background: it.source === "branch" ? "var(--accent-soft)" : "var(--teal-soft)",
                        color: it.source === "branch" ? "var(--accent-bright)" : "var(--teal)",
                      }}>
                      {it.title}
                    </div>
                  ))}
                  {dayList.length > 2 && (
                    <div className="text-[9px] px-1" style={{ color: "var(--text-faint)" }}>
                      +{dayList.length - 2} more
                    </div>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Selected day */}
      <div className="flex items-baseline gap-2 mb-3 px-1">
        <span className="text-sm font-semibold" style={{ color: "var(--text)" }}>
          {day.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
        </span>
        <span className="text-[10px] font-mono" style={{ color: "var(--text-faint)" }}>
          {dayItems.length === 0 ? "nothing scheduled" : `${dayItems.length} item${dayItems.length === 1 ? "" : "s"}`}
        </span>
      </div>

      <div className="space-y-2 mb-4">
        {dayItems.map(it => <Row key={it.id} item={it} onDelete={remove} />)}
      </div>

      {/* Add on the selected day */}
      <div className="flex gap-2">
        <input value={title} onChange={e => setTitle(e.target.value)}
          onKeyDown={e => e.key === "Enter" && add()}
          placeholder={`Add something on ${day.toLocaleDateString(undefined, { day: "numeric", month: "short" })}…`}
          className="flex-1 min-w-0 rounded-xl px-4 py-2.5 text-sm outline-none"
          style={{ background: "var(--input-bg)", color: "var(--text)", border: "1px solid var(--input-border)" }} />
        <input type="time" value={time} onChange={e => setTime(e.target.value)}
          className="rounded-xl px-3 py-2.5 text-sm outline-none shrink-0"
          style={{ background: "var(--input-bg)", color: "var(--text)", border: "1px solid var(--input-border)" }} />
        <button onClick={add} disabled={busy || !title.trim()}
          className="px-4 rounded-xl text-sm font-medium text-white disabled:opacity-40 shrink-0 transition-all"
          style={{ background: "linear-gradient(135deg,#8b5cf6,#6d28d9)", boxShadow: "0 0 16px var(--accent-glow)" }}>
          <FontAwesomeIcon icon={faPlus} className="text-xs" />
        </button>
      </div>

      {error && <p className="text-xs mt-3" style={{ color: "var(--red)" }}>{error}</p>}

      <p className="text-xs mt-6 px-1 leading-relaxed" style={{ color: "var(--text-faint)" }}>
        Purple entries are assignment and exam deadlines, added automatically. Teal ones you added
        yourself. Hover any item to send it to Google Calendar or download it.
      </p>
    </div>
  )
}

function NavBtn({ icon, onClick }: { icon: typeof faChevronLeft; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
      style={{ background: "var(--surface)", border: "1px solid var(--surface-border)", color: "var(--text-dim)" }}
      onMouseEnter={e => (e.currentTarget.style.background = "var(--surface-hover)")}
      onMouseLeave={e => (e.currentTarget.style.background = "var(--surface)")}>
      <FontAwesomeIcon icon={icon} className="text-[10px]" />
    </button>
  )
}

function Row({ item, onDelete }: { item: Item; onDelete: (it: Item) => void }) {
  const d = new Date(item.starts_at * 1000)
  const isDeadline = item.source === "branch"

  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl group"
      style={{ background: "var(--surface)", border: "1px solid var(--surface-border)" }}>
      <span className="text-xs font-mono shrink-0 w-11" style={{ color: "var(--text-faint)" }}>
        {d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false })}
      </span>
      <span className="w-1 h-8 rounded-full shrink-0"
        style={{ background: isDeadline ? "var(--accent)" : "var(--teal)" }} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate" style={{ color: "var(--text)" }}>{item.title}</div>
        <div className="text-xs truncate" style={{ color: "var(--text-dim)" }}>{item.subtitle}</div>
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
      {!isDeadline && (
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
